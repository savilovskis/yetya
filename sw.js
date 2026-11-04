// Service worker Йети: офлайн-оболочка приложения и клики по уведомлениям.
// При изменении файлов приложения увеличь номер версии — старый кэш удалится.
const CACHE = "yetya-v3";
const SHELL = ["./", "index.html", "style.css", "app.js", "config.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Сначала сеть (чтобы обновления приходили сразу), при офлайне — кэш.
// Запросы к Supabase и CDN не трогаем.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("index.html")))
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const chatId = (e.notification.tag || "").replace(/^chat-/, "");
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) { c.postMessage({ openChat: chatId }); return c.focus(); }
      }
      return self.clients.openWindow("./");
    })
  );
});
