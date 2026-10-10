// Runtime auto-caching service worker.
// No APP_SHELL array, no manual file list — every same-origin page is cached
// automatically the first time it's visited, so new tools work offline with
// zero edits to this file. Individual entries are managed (and can be
// individually cleared) via the message API below.

const CACHE_PREFIX = 'mylab-cache-';
const CACHE_NAME = 'mylab-cache-v4';

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const currentCache = await caches.open(CACHE_NAME);
    const names = await caches.keys();
    const oldCaches = names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME);
    for(const name of oldCaches){
      const oldCache = await caches.open(name);
      for(const request of await oldCache.keys()){
        if(!await currentCache.match(request)){
          const response = await oldCache.match(request);
          if(response) await currentCache.put(request, response);
        }
      }
    }
    await Promise.all(oldCaches.map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin !== location.origin) return;

  // Always request page HTML from the network first so deployed changes appear
  // immediately when online, while retaining the cached page for offline use.
  const acceptsHtml = (req.headers.get('accept') || '').includes('text/html');
  if(req.mode === 'navigate' || acceptsHtml ||
     url.pathname.endsWith('/index.html') ||
     url.pathname.endsWith('/pages.json') ||
     url.pathname === new URL('./', location.href).pathname){
    e.respondWith(networkFirst(req));
    return;
  }

  // Cache-first with a background revalidate for same-origin assets.
  e.respondWith(cacheFirst(req));
});

async function networkFirst(req){
  try{
    const res = await fetch(req);
    if(res && res.ok){
      const cache = await caches.open(CACHE_NAME);
      await cache.put(req, res.clone());
    }
    return res;
  }catch(e){
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if(cached) return cached;
    throw e;
  }
}

async function cacheFirst(req){
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  if(cached){
    fetch(req).then(async res => {
      if(res && res.ok) await cache.put(req, res);
    }).catch(() => {});
    return cached;
  }
  const res = await fetch(req);
  if(res && res.ok){
    await cache.put(req, res.clone());
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
