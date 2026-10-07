// Runtime auto-caching service worker.
// No APP_SHELL array, no manual file list — every same-origin page is cached
// automatically the first time it's visited, so new tools work offline with
// zero edits to this file. CACHE_NAME is static; individual entries are
// managed (and can be individually cleared) via the message API below.

const CACHE_NAME = 'mylab-cache-v2';

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin !== location.origin) return;

  // Network-first for the index shell and pages.json, so the page list and
  // add/sync logic always see the latest data when online.
  if(url.pathname.endsWith('/index.html') || url.pathname.endsWith('/pages.json') || url.pathname === new URL('./', location.href).pathname){
    e.respondWith(networkFirst(req));
    return;
  }

  // Cache-first (with a background revalidate) for individual tool pages.
  e.respondWith(cacheFirst(req));
});

async function networkFirst(req){
  try{
    const res = await fetch(req);
    if(res && res.ok){
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, res.clone());
    }
    return res;
  }catch(e){
    const cached = await caches.match(req);
    if(cached) return cached;
    throw e;
  }
}

async function cacheFirst(req){
  const cached = await caches.match(req);
  if(cached){
    fetch(req).then(res => {
      if(res && res.ok) caches.open(CACHE_NAME).then(c => c.put(req, res));
    }).catch(() => {});
    return cached;
  }
  const res = await fetch(req);
  if(res && res.ok){
    const cache = await caches.open(CACHE_NAME);
    cache.put(req, res.clone());
  }
  return res;
}

// Lets a page ask for a single cached entry to be dropped (e.g. after editing
// that page's content) without clearing everything else, plus a full-clear
// escape hatch.
self.addEventListener('message', event => {
  const data = event.data || {};
  if(data.type === 'CLEAR_ONE' && data.url){
    event.waitUntil(
      caches.open(CACHE_NAME)
        .then(cache => cache.delete(data.url))
        .then(ok => { if(event.source) event.source.postMessage({ type: 'CLEAR_ONE_RESULT', url: data.url, ok }); })
    );
  }
  if(data.type === 'CLEAR_ALL'){
    event.waitUntil(
      caches.delete(CACHE_NAME)
        .then(ok => { if(event.source) event.source.postMessage({ type: 'CLEAR_ALL_RESULT', ok }); })
    );
  }
});
