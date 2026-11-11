const APP_URL = "/AI/messages.html";

self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; }
    catch { data = { body: event.data?.text() || "You received a new notification." }; }

    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const activeMessagesPage = windows.some(client =>
      client.url.includes("/AI/messages.html") && client.focused
    );
    if (activeMessagesPage) return;

    const title = data.title || "AI Tutor";
    const options = {
      body: data.body || "You have a new update.",
      icon: "/AI/favicon.ico",
      badge: "/AI/favicon.ico",
      tag: data.tag || "ai-tutor-notification",
      renotify: true,
      data: { url: data.url || APP_URL }
    };
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || APP_URL, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin + "/AI/")) {
        await client.focus();
        if ("navigate" in client) await client.navigate(targetUrl);
        return;
      }
    }
    await self.clients.openWindow(targetUrl);
  })());
});
