self.addEventListener('push', event => {
  const fallback = {
    title: 'Mindoist',
    body: 'You have a task reminder.',
    url: '/',
    icon: '/favicon.svg',
  };
  let data = fallback;
  try {
    data = event.data ? event.data.json() : fallback;
  } catch {
    data = fallback;
  }

  event.waitUntil(
    self.registration.showNotification(data.title || fallback.title, {
      body: data.body || fallback.body,
      icon: data.icon || fallback.icon,
      tag: data.tag,
      data: { url: data.url || fallback.url },
    }),
  );
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = allClients.find(client => 'focus' in client && new URL(client.url).origin === self.location.origin);
    if (existing) {
      if ('navigate' in existing) await existing.navigate(url);
      await existing.focus();
      return;
    }
    await clients.openWindow(url);
  })());
});
