/* ============================================================
   SERVICE WORKER — уведомления, офлайн, отложить
   ============================================================ */

const таймеры = new Map();

// ===== Установка =====
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open('напоминания-v1').then(c =>
      c.addAll([
        '/', '/index.html', '/style.css', '/app.js', '/manifest.json'
      ]).catch(() => {})
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

// ===== Офлайн-кэш =====
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});

// ===== Сообщения от app.js =====
self.addEventListener('message', e => {
  const data = e.data;
  if (!data) return;

  if (data.тип === 'ЗАПЛАНИРОВАТЬ') {
    запланировать(data.напоминание, data.задержка);
  }
  if (data.тип === 'ОТМЕНИТЬ') {
    if (таймеры.has(data.id)) {
      clearTimeout(таймеры.get(data.id));
      таймеры.delete(data.id);
    }
  }
});

function запланировать(н, задержка) {
  if (таймеры.has(н.id)) clearTimeout(таймеры.get(н.id));

  const t = setTimeout(async () => {
    try {
      await self.registration.showNotification(н.текст, {
        body: н.подтекст || '',
        tag: н.id,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        requireInteraction: true,
        vibrate: [200, 100, 200],
        data: н,
        actions: [
          { action: 'отложить30',   title: '30 мин' },
          { action: 'отложить80',   title: '80 мин' },
          { action: 'отложить60',   title: '1 час' },
          { action: 'отложить1440', title: '1 день' }
        ]
      });
    } catch (e) {
      console.warn('Уведомление не показано:', e);
    }
    таймеры.delete(н.id);
  }, задержка);

  таймеры.set(н.id, t);
}

// ===== Клик по уведомлению =====
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const action = e.action;

  if (action && action.startsWith('отложить')) {
    const минуты = parseInt(action.replace('отложить', ''));
    const н = e.notification.data || {};
    запланировать(
      { ...н, id: (н.id || 'n') + '-отложено-' + Date.now() },
      минуты * 60 * 1000
    );
    return;
  }

  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      if (clients.length) return clients[0].focus();
      return self.clients.openWindow('/');
    })
  );
});
