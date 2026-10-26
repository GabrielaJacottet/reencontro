# Reencontro

Achou um animal na rua? Tire uma foto e o app mostra os pets desaparecidos mais parecidos. A comparação acontece no próprio celular, sem enviar fotos para a internet.

## Como publicar no GitHub Pages (grátis)

1. Entre em github.com e crie um repositório **público** chamado `reencontro` (Add a README pode deixar marcado).
2. No repositório, clique em **Add file > Upload files**. Arraste **o conteúdo desta pasta**: `index.html`, `modelo-worker.js`, `sw.js`, `LEIA-ME.md` e a pasta `modelo` inteira. Clique em **Commit changes**.
3. Vá em **Settings > Pages**. Em "Branch", escolha `main` e `/ (root)`, clique em **Save**.
4. Em 1 ou 2 minutos o app estará em `https://SEU-USUARIO.github.io/reencontro/`.
5. Abra o link no celular. Na primeira vez que tocar em "Encontrei um animal", permita a câmera.

## Como testar

1. Toque em **Perdi meu pet**, escolha 3 ou 4 fotos do seu pet na galeria, preencha o nome e o WhatsApp e salve.
2. Se quiser, cadastre também outros animais (de amigos, por exemplo) para ver se o app não confunde.
3. Toque em **Encontrei um animal** e aponte a câmera para o seu pet. O app mostra os mais parecidos, com a porcentagem.

## Como funciona

- `modelo/`: rede neural DarkNet Reference (projeto ml5.js, licença MIT), com os pesos compactados em 8 bits (6 MB). Ela gera uma "impressão visual" de cada foto.
- `modelo-worker.js`: roda a rede em segundo plano, no celular.
- `index.html`: telas, câmera e comparação. Cada pet vale pela foto cadastrada mais parecida com a foto nova.
- A porcentagem é uma escala calibrada com testes em fotos reais. A partir de "Parecido" o app sugere avisar o tutor pelo WhatsApp.
- `sw.js`: deixa o app funcionando mesmo sem internet depois da primeira vez.

## Limitações deste protótipo

- Os cadastros ficam salvos **só no celular** onde foram feitos. Para várias pessoas compartilharem a mesma lista, o próximo passo é um banco de dados online.
- Animais muito parecidos (dois vira-latas caramelo, por exemplo) podem ter porcentagens próximas. Por isso o app mostra os 3 mais parecidos e pede para conferir as fotos.
