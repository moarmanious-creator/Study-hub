// Student Hub service worker: shows notifications (phones require one) and opens the Hub when
// a notification is tapped. It deliberately caches nothing, so the Hub is always up to date.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const hub = all.find((c) => c.url.startsWith(self.registration.scope));
    if (hub) { await hub.focus(); return; }
    await self.clients.openWindow(self.registration.scope);
  })());
});
