/* かずのぼうけん — offline shell.

   The app is one self-contained HTML file, so keeping it offline is a few lines.
   Without them the route the README recommends — Safari → 共有 → ホーム画面に追加
   from GitHub Pages — cannot open with no network, because iOS falls back to the
   HTTP cache and lets it go stale. That is exactly the moment (a car, a train,
   someone else's house) when an iPad is most likely to be handed to a child.

   Stale-while-revalidate: open instantly from the cache, refresh in the
   background, so a deploy is picked up the next time the app is launched.
   Registering also makes iPadOS treat the site as installed, which makes it much
   less likely to throw away the localStorage the records live in. */
'use strict';

const VERSION = 'bb944bbba0f9';
const CACHE   = 'kazu-no-bouken-' + VERSION;
const SHELL   = ['./', './index.html', './manifest.webmanifest',
                 './icon-180.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // added one at a time: a single missing entry (the app hosted under a
      // different filename, say) must not leave the child with no offline app
      .then(c => Promise.all(SHELL.map(u =>
        c.add(new Request(u, { cache: 'reload' })).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      const fresh = fetch(req).then(res => {
        // opaque responses are the Google Fonts files; worth keeping too
        if (res && (res.ok || res.type === 'opaque')){
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit || Response.error());
      return hit || fresh;          // cache first, network refreshes it behind us
    })
  );
});
