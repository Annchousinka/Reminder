// Service Worker — работает, даже когда сайт закрыт

const таймеры = new Map();

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// Кэш для офлайн-работы
const КЭШ = 'напоминания-v1';
const ФАЙЛЫ = ['/', '/index.html', '/style.css', '/app.js', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(КЭШ).then(c => c.addAll(ФАЙЛЫ).catch(() => {}))
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});

// Планирование уведомления
self.addEventListener('message', e => {
  const data = e.data;
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
    await self.registration.showNotification(н.текст, {
      body: н.подтекст || '',
      tag: н.id,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      requireInteraction: true,
      vibrate: [200, 100, 200],
      data: н,
      actions: [
        { action: 'отложить30', title: '30 мин' },
        { action: 'отложить80', title: '80 мин' },
        { action: 'отложить60', title: '1 час' },
        { action: 'отложить1440', title: '1 день' }
      ]
    });
    таймеры.delete(н.id);
  }, задержка);

  таймеры.set(н.id, t);
}

// Клик по кнопке "Отложить"
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const action = e.action;

  if (action.startsWith('отложить')) {
    const минуты = parseInt(action.replace('отложить', ''));
    const н = e.notification.data;
    запланировать(
      { ...н, id: н.id + '-отложено-' + Date.now() },
      минуты * 60 * 1000
    );
    return;
  }

  // Обычный клик — открыть приложение
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      if (clients.length) return clients[0].focus();
      return self.clients.openWindow('/');
    })
  );
});
