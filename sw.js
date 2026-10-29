/* Guarda o app no aparelho. Com internet, a página e os scripts vêm sempre na versão mais nova. */
const CACHE = 'reencontro-v16'; // mude a cada publicação para os celulares trocarem o cache
const FILES = ['./', 'index.html', 'modelo-worker.js'];
// cache: 'reload' / 'no-cache' ignoram o cache HTTP do GitHub Pages (até 10 min)
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // modelo (~35 MB): baixa uma vez, quando o app pede, e guarda
  if (u.pathname.includes('/modelo/')) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(r => { if (r.status === 200) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; })));
    return;
  }
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; }).catch(() => caches.match(e.request)));
});
