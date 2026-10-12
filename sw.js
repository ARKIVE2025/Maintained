/* MaintainLog service worker: offline cache + due-date notifications */
const CACHE = 'maintainlog-v2';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];
const DB_NAME = 'MaintainLogDB';
// [stage, offset ms from due time]
const STAGES = [['day', -86400000], ['hour', -3600000], ['due', 0], ['late', 86400000]];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;
    e.respondWith(
        caches.match(e.request, { ignoreSearch: true }).then((hit) => {
            const net = fetch(e.request).then((res) => {
                if (res && (res.ok || res.type === 'opaque')) {
                    const cp = res.clone();
                    caches.open(CACHE).then((c) => c.put(e.request, cp));
                }
                return res;
            }).catch(() => hit || (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined));
            return hit || net;
        })
    );
});

/* ---------- IndexedDB helpers ---------- */
const p = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
function openDb() {
    return new Promise((res, rej) => {
        const r = indexedDB.open(DB_NAME);
        r.onsuccess = () => { r.result.onversionchange = () => r.result.close(); res(r.result); };
        r.onerror = () => rej(r.error);
    });
}
async function withLogs(fn) {
    const db = await openDb();
    try {
        if (!db.objectStoreNames.contains('logs')) return;
        return await fn(db);
    } finally { db.close(); }
}
const store = (db, mode) => db.transaction('logs', mode).objectStore('logs');

/* ---------- Notifications ---------- */
function stageText(stage, log, now) {
    const due = new Date(log.dueAt).getTime();
    const kind = log.type === 'makeready' ? 'Make Ready' : 'Task';
    let head;
    if (stage === 'day') head = `${kind} due tomorrow`;
    else if (stage === 'hour') head = `${kind} due within 1 hour`;
    else if (stage === 'due') head = now - due > 300000 ? `${kind} overdue` : `${kind} due now`;
    else head = `${kind} still overdue`;
    const t = log.task || '';
    return [head, `Apt ${log.apartment}: ${t.substring(0, 80)}${t.length > 80 ? '...' : ''}`];
}

async function notify(title, body, log, force) {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (!force && wins.some((c) => c.visibilityState === 'visible')) {
        wins.forEach((c) => c.postMessage({ type: 'toast', body: `${title}: ${body}` }));
        return;
    }
    return self.registration.showNotification(title, {
        body,
        tag: log ? 'log-' + log.id : 'maintainlog-test',
        renotify: true,
        icon: 'icon-192.png',
        badge: 'icon-192.png',
        vibrate: [100, 50, 100],
        requireInteraction: !!log,
        actions: log ? [{ action: 'done', title: 'Mark done' }, { action: 'snooze', title: 'Snooze 1h' }] : [],
        data: { id: log ? log.id : null }
    });
}

async function checkDue() {
    if (self.Notification && Notification.permission !== 'granted') return;
    await withLogs(async (db) => {
        const logs = await p(store(db, 'readonly').getAll());
        const now = Date.now();
        for (const log of logs) {
            if (!log.dueAt || log.status !== 'active') continue;
            const due = new Date(log.dueAt).getTime();
            const passed = STAGES.filter(([, off]) => due + off <= now);
            if (!passed.length) continue;
            const keys = passed.map(([s]) => `${log.dueAt}|${s}`);
            const done = log.notified || [];
            const latest = keys[keys.length - 1];
            if (done.includes(latest)) continue;
            log.notified = Array.from(new Set(done.concat(keys)));
            await p(store(db, 'readwrite').put(log));
            const [head, body] = stageText(passed[passed.length - 1][0], log, now);
            await notify(head, body, log, false);
        }
    });
}

self.addEventListener('message', (e) => {
    const d = e.data || {};
    if (d.type === 'check') e.waitUntil(checkDue());
    if (d.type === 'test') e.waitUntil(notify('MaintainLog', 'Notifications are working', null, true));
});

self.addEventListener('periodicsync', (e) => {
    if (e.tag === 'maintainlog-due') e.waitUntil(checkDue());
});

self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    const id = (e.notification.data || {}).id;
    const act = e.action;
    e.waitUntil((async () => {
        const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        if (id && (act === 'done' || act === 'snooze')) {
            await withLogs(async (db) => {
                const log = await p(store(db, 'readonly').get(id));
                if (!log) return;
                const now = Date.now();
                if (act === 'done') {
                    log.status = 'completed';
                } else {
                    log.dueAt = new Date(now + 3600000).toISOString();
                    const due = new Date(log.dueAt).getTime();
                    log.notified = STAGES.filter(([, off]) => due + off <= now + 1000).map(([s]) => `${log.dueAt}|${s}`);
                }
                log.updatedAt = new Date().toISOString();
                await p(store(db, 'readwrite').put(log));
            });
            wins.forEach((c) => c.postMessage({ type: 'refresh' }));
            return;
        }
        if (wins.length) return wins[0].focus();
        return self.clients.openWindow('./');
    })());
});
