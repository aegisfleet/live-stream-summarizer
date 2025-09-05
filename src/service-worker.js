const CACHE_NAME = 'hololive-summary-cache-v1-1757096474928';
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
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // キャッシュがあればそれを返す
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then(
          networkResponse => {
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            return networkResponse;
          }
        );
      })
  );
});

// push イベント: サーバーからのプッシュ通知を受け取ったときの処理
self.addEventListener('push', event => {
  console.log('Service Worker: Push Received.');

  const notificationTitle = 'サイトが更新されました';
  const notificationOptions = {
    body: '新しいライブ配信の要約が追加されました。タップして確認します。',
    icon: 'images/favicon.png',
    badge: 'images/favicon.png',
    data: {
      url: self.location.origin
    }
  };

  event.waitUntil(
    self.registration.showNotification(notificationTitle, notificationOptions)
  );
});

// notificationclick イベント: 通知がクリックされたときの処理
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const urlToOpen = event.notification.data.url || self.location.origin;

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(clientList => {
      if (clientList.length > 0) {
        let client = clientList[0];
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            client = clientList[i];
          }
        }
        return client.focus().then(c => c.navigate(urlToOpen));
      }
      return clients.openWindow(urlToOpen);
    })
  );
});