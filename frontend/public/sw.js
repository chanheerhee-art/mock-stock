const CACHE_NAME = "mock-stock-v2";
// 아이콘 등 잘 안 바뀌는 자산만 미리 캐싱 (HTML 페이지는 캐싱하지 않음 — 항상 최신 받기)
const STATIC_ASSETS = [
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

// fetch 전략
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // GET 외(POST 등)는 그냥 통과
  if (request.method !== "GET") return;

  // API 요청은 네트워크 우선, 실패 시 캐시
  if (url.hostname.includes("railway.app") || url.pathname.startsWith("/api")) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  // HTML 문서(페이지 내비게이션)는 항상 네트워크 우선 → 새 배포 즉시 반영
  // (오프라인일 때만 캐시 폴백)
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // 해시가 박힌 정적 자산(_next/static 등)은 캐시 우선 (불변)
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
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
