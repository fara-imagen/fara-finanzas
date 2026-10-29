/* FÁRA Finanzas · service worker: guarda una copia de la app en el teléfono para que abra sin internet. */
const VERSION = 'fara-finanzas-1.8.0';
const ARCHIVOS = [
  './', 'index.html', 'styles.css', 'app.js', 'personal.js', 'reservas.js', 'manifest.webmanifest',
  'icons/logo.svg', 'icons/logo-negativo.svg', 'icons/simbolo.svg', 'icons/simbolo-alt.svg', 'icons/favicon-32.png', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  // cache: 'reload' evita guardar una copia vieja que el navegador tenga en memoria
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // cotización y respaldo: siempre en vivo, nunca desde la copia
  if (url.hostname.endsWith('dolarapi.com') || url.hostname.endsWith('google.com') || url.hostname.endsWith('googleusercontent.com')) return;

  const esPropio = url.origin === self.location.origin;
  const esFuente = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!esPropio && !esFuente) return;

  // Responde con la copia guardada al instante y, si hay internet, la actualiza por detrás.
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const guardada = await cache.match(req, { ignoreSearch: esPropio });
    const red = fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (guardada) { e.waitUntil(red); return guardada; }
    const res = await red;
    if (res) return res;
    if (req.mode === 'navigate') return cache.match('index.html');
    return new Response('', { status: 504 });
  }));
});
