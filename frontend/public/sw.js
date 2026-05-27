const CACHE_NAME = "mock-stock-v1";
const STATIC_ASSETS = [
  "/",
  "/dashboard",
  "/trade",
  "/ranking",
  "/portfolio",
  "/icon-192.png",
  "/icon-512.png",
];

// 설치: static assets 캐싱
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// 활성화: 오래된 캐시 삭제
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// fetch: network-first (API), cache-first (static)
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API 요청은 네트워크 우선, 실패 시 캐시
  if (url.hostname.includes("railway.app") || url.pathname.startsWith("/api")) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // 정적 자산은 캐시 우선
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && request.method === "GET") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});

// 푸시 알림 (향후 확장용)
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "모의주식", {
      body: data.body ?? "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    })
  );
});
