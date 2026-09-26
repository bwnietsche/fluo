// Service worker: abre offline e rápido. Dados nunca são cacheados aqui (só arquivos do app).
const V = "fluo-v8";
const FILES = ["./", "index.html", "styles.css", "app.js", "controls.js", "store.js", "config.js", "manifest.webmanifest", "icon.svg"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.hostname.endsWith("supabase.co")) return; // API sempre online
  // rede primeiro (pega atualizações), cache se offline
  e.respondWith(fetch(e.request).then(r => { if (r.ok || r.type === "opaque") { const cp = r.clone(); caches.open(V).then(c => c.put(e.request, cp)); } return r; }).catch(() => caches.match(e.request)));
});
