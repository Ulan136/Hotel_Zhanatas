// MEDINA — service worker. БАМПАТЬ CACHE при изменении оболочки/статики (v1→v2…).
const CACHE = 'medina-v1';
const SHELL = [
  '/', '/admin', '/guard', '/guest', '/report',
  '/icons/admin-192.png', '/icons/guard-192.png', '/icons/guest-192.png', '/icons/report-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                    // мутации не трогаем
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;     // сторонние — как есть
  if (url.pathname.startsWith('/api/')) return;        // API — всегда из сети (свежие данные)

  // Оболочка/статика: network-first, офлайн — из кэша.
  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) {
        const copy = fresh.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return fresh;
    } catch {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const shell = await caches.match('/') || await caches.match('/admin');
        if (shell) return shell;
      }
      throw new Error('offline: not cached');
    }
  })());
});

// ── Web-push (необязательно) ─────────────────────────────────
self.addEventListener('push', (e) => {
  const data = (() => { try { return e.data ? e.data.json() : {}; } catch { return {}; } })();
  e.waitUntil(self.registration.showNotification(data.title || '🔔 MEDINA', {
    body: data.body || 'Новое событие',
    icon: '/icons/admin-192.png',
    badge: '/icons/admin-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/admin' },
    actions: [{ action: 'view', title: '👁 Открыть' }, { action: 'close', title: '✕ Закрыть' }],
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  if (e.action === 'close') return;
  const target = (e.notification.data && e.notification.data.url) || '/admin';
  e.waitUntil((async () => {
    const cs = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of cs) { if ('focus' in c) { await c.focus(); try { await c.navigate(target); } catch {} return; } }
    await clients.openWindow(target);
  })());
});
