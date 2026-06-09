// Voltage service worker — installable PWA + offline app shell.
// Strategy: network-first for the app shell (always latest when online, cached fallback offline);
// cache-first for static assets (icons, CDN); Supabase API/auth/storage calls are never intercepted
// (the offline write-queue, built separately, handles those when disconnected).
const CACHE = 'voltage-v1';
const SHELL = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch { return; }
  // never touch Supabase (data, auth, storage) — let it hit the network / fail for the app to handle
  if (url.hostname.endsWith('supabase.co')) return;
  // app shell: network-first, fall back to cached shell when offline
  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('index.html')) {
    e.respondWith(
      fetch(req).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put('/index.html', cp)); return r; })
        .catch(() => caches.match('/index.html').then((m) => m || caches.match('/')))
    );
    return;
  }
  // static assets: cache-first
  e.respondWith(
    caches.match(req).then((r) => r || fetch(req).then((rr) => { const cp = rr.clone(); if (rr.ok) caches.open(CACHE).then((c) => c.put(req, cp)); return rr; }))
      .catch(() => caches.match(req))
  );
});
