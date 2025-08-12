const CACHE_NAME = 'hololive-summary-cache-v1-1754992172843';
const ASSETS_TO_CACHE = [
  '/live-stream-summarizer/',
  '/live-stream-summarizer/index.html',
  '/live-stream-summarizer/css/style.css',
  '/live-stream-summarizer/js/main.js',
  '/live-stream-summarizer/js/utils.js',
  '/live-stream-summarizer/data/summaries.json',
  '/live-stream-summarizer/images/character.png',
  '/live-stream-summarizer/images/ogp.png',
  '/live-stream-summarizer/images/favicon.png',
  '/live-stream-summarizer/manifest.json'
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
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // キャッシュにヒットした場合、キャッシュから返す
        if (response) {
          return response;
        }

        // キャッシュにない場合、ネットワークからフェッチする
        return fetch(event.request).then(
          response => {
            // レスポンスが有効かチェック
            if(!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // レスポンスをクローンして、片方をキャッシュに保存、もう片方をブラウザに返す
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
  );
});
