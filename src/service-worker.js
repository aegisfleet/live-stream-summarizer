const CACHE_NAME = 'hololive-summary-cache-v1-1757148699026';
const SITE_URL = 'https://aegisfleet.github.io/live-stream-summarizer/';
const ASSETS_TO_CACHE = [
  './',
  'index.html',
  'en/index.html',
  'css/style.css',
  'js/main.js',
  'js/detail-page.js',
  'js/utils.js',
  'js/bookmark-manager.js',
  'js/bookmark-storage.js',
  'js/bookmark-migration.js',
  'js/bookmark-accessibility.js',
  'js/notification-system.js',
  'data/summaries.json',
  'images/character.png',
  'images/ogp.png',
  'images/favicon.png',
  'manifest.json'
];

// install イベント: アセットをキャッシュに保存する
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching app shell');
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// activate イベント: 古いキャッシュを削除する
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache');
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker: Claiming clients');
      return self.clients.claim();
    })
  );
});

// fetch イベント: ネットワークリクエストを横取りし、キャッシュまたはネットワークから応答する
self.addEventListener('fetch', event => {
  // GETリクエスト以外、また同一オリジンでないリクエストは無視する
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // キャッシュ優先戦略
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // キャッシュがあればそれを返す
        if (cachedResponse) {
          return cachedResponse;
        }

        // キャッシュになければネットワークにリクエストし、レスポンスをキャッシュに保存する
        return fetch(event.request).then(
          networkResponse => {
            // レスポンスが有効かチェック
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }

            // レスポンスをクローンしてキャッシュに保存
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return networkResponse;
          }
        ).catch(error => {
          console.error('Service Worker: Fetch failed:', error);
          throw error;
        });
      })
  );
});

self.addEventListener('push', event => {
    console.log('[Service Worker] Push Received.');
    let data = {};
    try {
        if (event.data) {
            const dataText = event.data.text();
            // Log received data for debugging
            console.log(`[Service Worker] Push had this data: "${dataText}"`);
            data = JSON.parse(dataText);
        }
    } catch (e) {
        console.error('[Service Worker] Failed to parse push data:', e);
    }

    const title = data.title || '新しい要約が追加されました';
    const body = data.body || 'サイトで最新の情報を確認しましょう！';
    const icon = data.icon || '/live-stream-summarizer/images/favicon.png';
    const url = data.url || SITE_URL;

    const options = {
        body: body,
        icon: icon,
        badge: '/live-stream-summarizer/images/favicon.png',
        data: {
            url: url
        }
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});


self.addEventListener('notificationclick', event => {
    console.log('[Service Worker] Notification click Received.');

    event.notification.close();

    const urlToOpen = event.notification.data.url || SITE_URL;

    event.waitUntil(
        clients.matchAll({
            type: "window"
        }).then(clientList => {
            for (const client of clientList) {
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
