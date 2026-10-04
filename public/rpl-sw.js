/* RPL offline service worker — scope /rpl/ ONLY. Plain worker, no imports. */

var RPL_CACHE = 'rpl-precache-v1';
var PRECACHE_URLS = ['/rpl/declare', '/rpl/status', '/rpl'];
var DB_NAME = 'rpl-offline';
var STORE_NAME = 'rpl-pending-declarations';
var SYNC_TAG = 'rpl-sync';

function openDb() {
  return new Promise(function (resolve, reject) {
    var req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = function () {
      var db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'localId' });
      }
    };
    req.onsuccess = function () {
      resolve(req.result);
    };
    req.onerror = function () {
      reject(req.error);
    };
  });
}

function storeRecord(record) {
  return openDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE_NAME, 'readwrite');
      var store = tx.objectStore(STORE_NAME);
      var putReq = store.put(record);
      putReq.onsuccess = function () {};
      putReq.onerror = function () {};
      tx.oncomplete = function () {
        db.close();
        resolve();
      };
      tx.onerror = function () {
        db.close();
        reject(tx.error);
      };
      tx.onabort = function () {
        db.close();
        reject(tx.error);
      };
    });
  });
}

function getAllRecords() {
  return openDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE_NAME, 'readonly');
      var store = tx.objectStore(STORE_NAME);
      var getReq = store.getAll();
      getReq.onsuccess = function () {
        db.close();
        resolve(getReq.result || []);
      };
      getReq.onerror = function () {
        db.close();
        reject(getReq.error);
      };
    });
  });
}

function deleteRecord(id) {
  return openDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE_NAME, 'readwrite');
      var store = tx.objectStore(STORE_NAME);
      store.delete(id);
      tx.oncomplete = function () {
        db.close();
        resolve();
      };
      tx.onerror = function () {
        db.close();
        reject(tx.error);
      };
      tx.onabort = function () {
        db.close();
        reject(tx.error);
      };
    });
  });
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(RPL_CACHE).then(function (cache) {
      return Promise.all(
        PRECACHE_URLS.map(function (url) {
          return fetch(url)
            .then(function (res) {
              if (res && res.ok) {
                return cache.put(url, res);
              }
            })
            .catch(function () {});
        })
      );
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', function (event) {
  // Scope: /rpl/ pages only, plus the same-origin RPL API calls those pages make.
  // (A scoped SW intercepts all fetches from pages it controls; the path check
  // below only opts out of non-RPL traffic.)
  var pathname = new URL(event.request.url).pathname;
  if (pathname !== '/rpl-sw.js' && !pathname.startsWith('/rpl/') && pathname !== '/rpl' && !pathname.startsWith('/api/rpl')) return;
  var url = new URL(event.request.url);

  // Cache-first for precached navigations.
  if (event.request.method === 'GET' && event.request.mode === 'navigate') {
    if (PRECACHE_URLS.indexOf(url.pathname) !== -1) {
      event.respondWith(
        caches.match(event.request).then(function (cached) {
          if (cached) return cached;
          return fetch(event.request).then(function (res) {
            if (res && res.ok) {
              var copy = res.clone();
              caches.open(RPL_CACHE).then(function (cache) {
                cache.put(event.request, copy);
              });
            }
            return res;
          });
        })
      );
      return;
    }
  }

  // Network-first with cache fallback for GET /api/rpl/status/*.
  // (Reachable when the SW controls /rpl pages issuing same-origin API reads;
  // scope isolation above keeps all non-/rpl navigations untouched.)
  if (event.request.method === 'GET' && url.pathname.startsWith('/api/rpl/status/')) {
    event.respondWith(
      fetch(event.request)
        .then(function (res) {
          if (res && res.ok) {
            var copy = res.clone();
            caches.open(RPL_CACHE).then(function (cache) {
              cache.put(event.request, copy);
            });
          }
          return res;
        })
        .catch(function () {
          return caches.match(event.request);
        })
    );
    return;
  }

  // Offline queue for POST /api/rpl/declare when the network throws.
  if (event.request.method === 'POST' && url.pathname === '/api/rpl/declare') {
    event.respondWith(
      fetch(event.request.clone()).catch(function () {
        var clone = event.request.clone();
        return clone
          .json()
          .catch(function () {
            return {};
          })
          .then(function (body) {
            var record = Object.assign({}, body, {
              localId:
                self.crypto && self.crypto.randomUUID
                  ? self.crypto.randomUUID()
                  : String(Date.now()) + '-' + Math.random().toString(16).slice(2),
              savedAt: Date.now(),
            });
            return storeRecord(record).then(function () {
              return new Response(JSON.stringify({ queued: true }), {
                status: 202,
                headers: { 'Content-Type': 'application/json' },
              });
            });
          });
      })
    );
    return;
  }
});

self.addEventListener('sync', function (event) {
  if (event.tag !== SYNC_TAG) return;
  event.waitUntil(
    getAllRecords().then(function (records) {
      return Promise.all(
        records.map(function (record) {
          return fetch('/api/rpl/declare', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(record),
          })
            .then(function (res) {
              if (res && res.ok) {
                return deleteRecord(record.localId);
              }
            })
            .catch(function () {});
        })
      );
    })
  );
});
