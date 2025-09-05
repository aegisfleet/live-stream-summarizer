const CACHE_NAME = 'hololive-summary-cache-v1-1757099022713';
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

// activate イベント: 古いキャッシュを削除し、定期同期待ち受けを登録する
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(async (cacheNames) => {
      await Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache');
            return caches.delete(cacheName);
          }
        })
      );

      // Periodic Background Syncを登録
      try {
        const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
        if (status.state === 'granted') {
          await self.registration.periodicSync.register('update-check', {
            minInterval: 3 * 60 * 60 * 1000, // 3時間
          });
          console.log('Service Worker: Periodic background sync registered.');
        } else {
          console.log('Service Worker: Periodic background sync is not granted.');
        }
      } catch (e) {
        console.error(`Service Worker: Periodic background sync failed: ${e}`);
      }

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

// periodicsync イベント: 定期的に実行される処理
self.addEventListener('periodicsync', event => {
  if (event.tag === 'update-check') {
    console.log('Service Worker: Performing periodic update check.');
    event.waitUntil(checkForUpdates());
  }
});

// 更新をチェックし、必要であれば通知を出す関数
async function checkForUpdates() {
  try {
    const cache = await caches.open(CACHE_NAME);
    
    // サーバーから最新のsummaries.jsonを直接取得
    const networkResponse = await fetch('data/summaries.json', { cache: 'no-store' });
    if (!networkResponse.ok) {
      throw new Error('Failed to fetch latest data.');
    }
    const networkData = await networkResponse.json();
    const networkDataString = JSON.stringify(networkData);

    // キャッシュ内のsummaries.jsonを取得
    const cachedResponse = await cache.match('data/summaries.json');
    let isUpdateAvailable = false;

    if (!cachedResponse) {
      isUpdateAvailable = true;
    } else {
      const cachedData = await cachedResponse.json();
      const cachedDataString = JSON.stringify(cachedData);
      if (networkDataString !== cachedDataString) {
        isUpdateAvailable = true;
      }
    }

    if (isUpdateAvailable) {
      console.log('Service Worker: Update available. Caching new data and notifying user.');
      // 新しいデータをキャッシュに保存
      await cache.put('data/summaries.json', new Response(networkDataString));

      // 通知を表示
      await self.registration.showNotification('サイトが更新されました', {
        body: '新しいライブ配信の要約が追加されました。タップして確認します。',
        icon: 'images/favicon.png',
        badge: 'images/favicon.png', // Androidで表示されるバッジ
        data: {
          url: self.location.origin // 通知をクリックしたときに開くURL
        }
      });
    } else {
      console.log('Service Worker: No new updates found.');
    }
  } catch (error) {
    console.error('Service Worker: Error during update check:', error);
  }
}

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