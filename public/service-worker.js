self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("retirement-countdown-v2").then((cache) =>
      cache.addAll([
        "/",
        "/index.html",
        "/manifest.webmanifest",
        "/icon.svg",
      ]),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request)),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const client = clients.find((item) => "focus" in item);
      if (client) return client.focus();
      if (self.clients.openWindow) return self.clients.openWindow("/index.html");
      return undefined;
    }),
  );
});
