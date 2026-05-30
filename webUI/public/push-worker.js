self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Priddyspaces", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "Priddyspaces";
  const options = {
    body: payload.body || "You have a new notification.",
    data: payload.data || {},
    icon: "/favicon.ico",
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const linkUrl = event.notification.data?.link_url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(linkUrl);
          return client.focus();
        }
      }
      return clients.openWindow(linkUrl);
    })
  );
});
