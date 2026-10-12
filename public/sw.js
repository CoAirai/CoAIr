self.addEventListener("push", (event) => {
    let payload = { title: "COAir", body: "", href: "/workspace" };
    try {
        if (event.data) payload = { ...payload, ...event.data.json() };
    } catch (_error) {
        /* keep the fallback copy */
    }
    event.waitUntil(
        self.registration.showNotification(payload.title || "COAir", {
            body: payload.body || "",
            data: { href: payload.href || "/workspace" },
        })
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const href = (event.notification.data && event.notification.data.href) || "/workspace";
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
            for (const windowClient of windows) {
                if (windowClient.url.includes(self.location.origin) && "focus" in windowClient) {
                    windowClient.navigate(href);
                    return windowClient.focus();
                }
            }
            return self.clients.openWindow(href);
        })
    );
});
