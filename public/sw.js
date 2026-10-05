// CloudFrame service worker: offline cache for the frame
const V = 'pf-v1.2', PH = 'pf-photos';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('pf-v') && k !== V) await caches.delete(k);
  await clients.claim();
})()));

async function netFirst(r, timeout) {
  const c = await caches.open(V);
  try {
    let n;
    if (timeout) { const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeout); try { n = await fetch(r, { signal: ac.signal }); } finally { clearTimeout(t); } }
    else n = await fetch(r);
    if (n.ok && !n.redirected) c.put(r, n.clone());
    return n;
  } catch (err) {
    const h = await c.match(r);
    if (h) return h;
    throw err;
  }
}
async function photo(r) { // photos never change per id, so cache-first
  const c = await caches.open(PH), h = await c.match(r);
  if (h) return h;
  const n = await fetch(r);
  if (n.ok) c.put(r, n.clone());
  return n;
}
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url), p = u.pathname;
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  if (/^\/api\/photo\/[0-9a-f-]{36}$/.test(p)) return e.respondWith(photo(r));
  if (/^\/api\/(photos|settings|albums|me)$/.test(p)) return e.respondWith(netFirst(r, 6000));
  if (r.mode === 'navigate' && p === '/') return e.respondWith(netFirst(r));
});

let busy = false;
async function sync(ids) { // drop photos no longer shown, pre-download the rest
  if (busy) return; busy = true;
  try {
    const c = await caches.open(PH), want = new Set(ids.map(i => '/api/photo/' + i));
    for (const k of await c.keys()) if (!want.has(new URL(k.url).pathname)) await c.delete(k);
    for (const p of want) if (!(await c.match(p))) { try { const n = await fetch(p); if (n.ok) await c.put(p, n); } catch { break; } }
  } finally { busy = false; }
}
self.addEventListener('message', e => { const d = e.data || {}; if (d.type === 'sync' && Array.isArray(d.ids)) e.waitUntil(sync(d.ids)); });
