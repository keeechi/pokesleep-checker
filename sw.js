// sw.js (最小構成：オンライン透過 + install時に即時アクティベート)
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { clients.claim(); });
// fetchハンドラを持つと installable 判定が安定（ここでは素通し）
self.addEventListener('fetch', () => {});
