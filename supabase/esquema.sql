-- Reencontro: banco do teste entre pessoas. Rode inteiro, uma vez, no SQL Editor do Supabase.
-- Todo mundo entra com login anônimo (papel "authenticated"); quem não entrou ainda (anon) só lê.

create extension if not exists vector with schema extensions;

-- ============ TABELAS ============
create table public.pets (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid() references auth.users on delete cascade,
  tipo text not null check (tipo in ('perdido', 'encontrado')),
  nome text check (char_length(nome) <= 40),
  especie text check (char_length(especie) <= 20),
  bairro text check (char_length(bairro) <= 60),
  data date,
  descricao text check (char_length(descricao) <= 500),
  contato text check (char_length(contato) <= 40),
  zap text check (zap ~ '^[0-9]{10,11}$'),
  recompensa integer not null default 0 check (recompensa between 0 and 1000000),
  reencontrado timestamptz,          -- voltou para casa: sai das comparações
  arquivado timestamptz,             -- parou de procurar
  oculto boolean not null default false, -- moderação: só você muda (pelo painel)
  criado timestamptz not null default now()
);

create table public.fotos (
  id uuid primary key default gen_random_uuid(),
  pet uuid not null references public.pets on delete cascade,
  dono uuid not null default auth.uid() references auth.users on delete cascade,
  ordem smallint not null default 0,
  foto text not null,                -- caminho no Storage (bucket "fotos"), até 1080 px
  thumb text not null,               -- caminho no Storage, 320 px
  emb extensions.vector(384),        -- vetor DINOv2 calculado no celular
  v smallint not null                -- VERSAO do modelo que gerou o vetor
);

-- avistamentos: quem encontrou registra; só o tutor e quem registrou veem (tem WhatsApp e localização)
create table public.avistamentos (
  id uuid primary key default gen_random_uuid(),
  pet uuid not null references public.pets on delete cascade,
  autor uuid not null default auth.uid() references auth.users on delete cascade,
  quando timestamptz not null default now(),
  thumb text,
  pct smallint check (pct between 0 and 100),
  texto text check (char_length(texto) <= 300),
  nome text check (char_length(nome) <= 40),
  zap text check (zap ~ '^[0-9]{10,11}$'),
  lat double precision,
  lng double precision
);

create table public.denuncias (
  id uuid primary key default gen_random_uuid(),
  pet uuid not null references public.pets on delete cascade,
  autor uuid not null default auth.uid() references auth.users on delete cascade,
  motivo text check (char_length(motivo) <= 200),
  criado timestamptz not null default now(),
  unique (pet, autor)
);

create index on public.fotos (pet);
create index on public.avistamentos (pet);
create index on public.pets (dono);

-- ============ REGRAS DE ACESSO (RLS) ============
alter table public.pets enable row level security;
alter table public.fotos enable row level security;
alter table public.avistamentos enable row level security;
alter table public.denuncias enable row level security;

-- pets: todos veem os não ocultos; o dono vê os seus e só ele cria, edita e apaga
create policy "ver anúncios" on public.pets for select to anon, authenticated
  using (not oculto or dono = (select auth.uid()));
create policy "criar o próprio anúncio" on public.pets for insert to authenticated
  with check (dono = (select auth.uid()) and not oculto);
create policy "editar o próprio anúncio" on public.pets for update to authenticated
  using (dono = (select auth.uid())) with check (dono = (select auth.uid()));
create policy "apagar o próprio anúncio" on public.pets for delete to authenticated
  using (dono = (select auth.uid()));
-- o dono não consegue mexer em "oculto" nem trocar o dono
revoke update on public.pets from anon, authenticated;
grant update (tipo, nome, especie, bairro, data, descricao, contato, zap, recompensa, reencontrado, arquivado)
  on public.pets to authenticated;

-- fotos: seguem a visibilidade do anúncio; só o dono do anúncio mexe
create policy "ver fotos" on public.fotos for select to anon, authenticated
  using (exists (select 1 from public.pets p where p.id = pet));
create policy "criar fotos no próprio anúncio" on public.fotos for insert to authenticated
  with check (dono = (select auth.uid()) and exists (select 1 from public.pets p where p.id = pet and p.dono = (select auth.uid())));
create policy "editar as próprias fotos" on public.fotos for update to authenticated
  using (dono = (select auth.uid())) with check (dono = (select auth.uid()));
create policy "apagar as próprias fotos" on public.fotos for delete to authenticated
  using (dono = (select auth.uid()));

-- avistamentos: o tutor do anúncio e quem registrou
create policy "ver avistamentos" on public.avistamentos for select to authenticated
  using (autor = (select auth.uid()) or exists (select 1 from public.pets p where p.id = pet and p.dono = (select auth.uid())));
create policy "registrar avistamento" on public.avistamentos for insert to authenticated
  with check (autor = (select auth.uid()) and exists (select 1 from public.pets p where p.id = pet and not p.oculto));
create policy "completar o próprio avistamento" on public.avistamentos for update to authenticated
  using (autor = (select auth.uid())) with check (autor = (select auth.uid()));
create policy "apagar avistamento" on public.avistamentos for delete to authenticated
  using (autor = (select auth.uid()) or exists (select 1 from public.pets p where p.id = pet and p.dono = (select auth.uid())));

-- denúncias: qualquer um denuncia; ninguém lê pelo app (você vê no painel)
create policy "denunciar" on public.denuncias for insert to authenticated
  with check (autor = (select auth.uid()));

-- ============ LIMITES ============
create function public.limite_pets() returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.pets where dono = new.dono and arquivado is null and reencontrado is null) >= 5 then
    raise exception 'limite_anuncios';
  end if;
  return new;
end $$;
create trigger limite_pets before insert on public.pets for each row execute function public.limite_pets();

create function public.limite_fotos() returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.fotos where pet = new.pet) >= 6 then raise exception 'limite_fotos'; end if;
  return new;
end $$;
create trigger limite_fotos before insert on public.fotos for each row execute function public.limite_fotos();

create function public.limite_avistamentos() returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.avistamentos where autor = new.autor and quando > now() - interval '1 day') >= 30 then
    raise exception 'limite_avistamentos';
  end if;
  return new;
end $$;
create trigger limite_avistamentos before insert on public.avistamentos for each row execute function public.limite_avistamentos();

-- 3 denúncias de pessoas diferentes ocultam o anúncio até você revisar (no painel: pets → oculto)
create function public.contar_denuncias() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.denuncias where pet = new.pet) >= 3 then
    update public.pets set oculto = true where id = new.pet;
  end if;
  return new;
end $$;
create trigger contar_denuncias after insert on public.denuncias for each row execute function public.contar_denuncias();

-- ============ FOTOS (STORAGE) ============
-- leitura pública pelo link; cada pessoa só grava e apaga na própria pasta (<id do usuário>/...)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 2097152, array['image/jpeg', 'image/webp']);

create policy "subir na própria pasta" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid()::text));
-- apagar exige poder "ver" o arquivo pela API (o link público não basta)
create policy "ver a própria pasta" on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "apagar da própria pasta" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid()::text));
