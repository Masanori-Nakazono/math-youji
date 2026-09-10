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

const VERSION = 'e41c24f00ce5';
const CACHE   = 'kazu-no-bouken-' + VERSION;
/* Every name the app itself is served under. Pages publishes the one file twice
   (index.html and kazu-no-bouken.html), and a name missing here was only cached
   once it had been opened — so after the next deploy's worker cleared the old
   cache, that name could not open offline until it had been visited online again. */
const PAGES   = ['./kazu-no-bouken.html', './index.html', './'];
const SHELL   = PAGES.concat(['./manifest.webmanifest',
                 './icon-180.png', './icon-192.png', './icon-512.png']);

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

/* Offline, and this exact URL was never stored. A page load is always the app —
   there is only one page — so answer it with whichever copy of the app is here,
   rather than a blank error screen on a start URL the worker happens not to know. */
function offlineAnswer(req){
  if (req.mode !== 'navigate') return Response.error();
  return caches.open(CACHE)
    .then(c => PAGES.reduce((p, u) => p.then(r => r || c.match(u)), Promise.resolve(null)))
    .then(r => r || Response.error(), () => Response.error());
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let stored = Promise.resolve();
  const network = fetch(req).then(res => {
    // opaque responses are the Google Fonts files; worth keeping too
    if (res && (res.ok || res.type === 'opaque')){
      const copy = res.clone();
      stored = caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
    }
    return res;
  });
  // the refreshed copy is written after the page has its answer: keep the worker
  // alive until it lands, or iOS may stop it half-way
  if (e.waitUntil) e.waitUntil(network.then(() => stored, () => {}));
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit =>
      hit || network.catch(() => offlineAnswer(req)))   // cache first, network refreshes it behind us
  );
});
