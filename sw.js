/* Emotion 26 — service worker.
   Cache-first for the app shell so the schedule works with no signal at all,
   which is the normal state of affairs at a festival. */

/* The cache is named after the app version in js/data.js, so bumping that one
   constant both tells people what they're running and retires the old cache.
   Two places to remember would eventually disagree. */
importScripts('js/data.js');
var CACHE = 'emotion26-v' + FESTIVAL.version;

/* Cache-first is right for code and images, but it meant a schedule change
   didn't reach anyone until their SECOND visit — the first one served the old
   copy and only then refreshed it. These paths go to the network first and fall
   back to the cache, so an edit lands immediately when there's signal and the
   app still works when there isn't. */
function networkFirstPath(url) {
  return url.pathname.endsWith('/') ||
         url.pathname.endsWith('.html') ||
         url.pathname.endsWith('/js/data.js');
}

var NET_TIMEOUT = 3500;   // bad signal shouldn't hang the page waiting

/* Ignore the query string when looking in the cache. The "check for updates"
   button reloads with a ?r=... cache-buster, and ?now=... is used for testing;
   without this, either one would leave the page uncacheable and break offline.
   Nothing here varies by query, so this is always the right match. */
var MATCH = { ignoreSearch: true };
var SHELL = [
  './',
  'index.html',
  'css/app.css',
  'js/data.js',
  'js/qr.js',
  'js/app.js',
  'manifest.webmanifest',
  'assets/icon.svg',
  'assets/icon-180.png',
  'assets/icon-192.png',
  'assets/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
      .catch(function () { /* one missing asset shouldn't block install */ })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  /* noStore bypasses the browser's own HTTP cache. Without it, "network
     first" is a lie: the fetch is quietly answered from the HTTP cache and a
     published change can sit unseen for as long as the browser's heuristic
     freshness lasts. Only used for the handful of paths that must be current. */
  function fromNetwork(req, noStore) {
    var hit = noStore
      ? fetch(req.url, { cache: 'no-store', credentials: 'same-origin' })
      : fetch(req);
    return hit.then(function (res) {
      if (res && res.status === 200) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    });
  }

  if (networkFirstPath(url)) {
    e.respondWith(
      new Promise(function (resolve) {
        var settled = false;
        var done = function (r) { if (!settled && r) { settled = true; resolve(r); } };

        // Whichever answers first wins; the cache is the safety net.
        var timer = setTimeout(function () {
          caches.match(e.request, MATCH).then(done);
        }, NET_TIMEOUT);

        fromNetwork(e.request, true).then(function (res) {
          clearTimeout(timer);
          done(res);
        }).catch(function () {
          clearTimeout(timer);
          caches.match(e.request, MATCH).then(function (hit) {
            done(hit || new Response('Offline and not cached yet.', {
              status: 503, headers: { 'Content-Type': 'text/plain' }
            }));
          });
        });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(e.request, MATCH).then(function (hit) {
      // Serve from cache immediately, then quietly refresh it for next time.
      var net = fromNetwork(e.request).catch(function () { return hit; });
      return hit || net;
    })
  );
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ('focus' in list[i]) return list[i].focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});
