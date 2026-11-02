// Service Worker für das Dashboard (Web-App am Homescreen + Push-Benachrichtigungen).
// Fängt keine Seitenaufrufe ab und speichert nichts zwischen.

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  var title = data.title || 'flexo.kapital';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || 'Neue Aktivität im Dashboard.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'flexo',
    data: { url: data.url || '/dashboard#leads' }
  }));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/dashboard#leads';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].url.indexOf('/dashboard') !== -1 && 'focus' in list[i]) {
        list[i].navigate(url).catch(function () {});
        return list[i].focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
