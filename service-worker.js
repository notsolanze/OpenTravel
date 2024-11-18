const CACHE_NAME = 'opentravel-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/leaflet@1.7.1/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.7.1/dist/leaflet.js',
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap',
  'https://unpkg.com/lucide@latest',
  'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
  'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => response || fetch(event.request))
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'alarm-sync') {
    event.waitUntil(checkAlarmCondition());
  }
});

self.addEventListener('push', (event) => {
  const data = event.data.json();
  const options = {
    body: data.body,
    icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 'alarm'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});

async function checkAlarmCondition() {
  const cache = await caches.open(CACHE_NAME);
  const alarmSettings = await cache.match('/alarm-settings');
  if (alarmSettings) {
    const settings = await alarmSettings.json();
    const currentPosition = await getCurrentPosition();
    const distance = calculateDistance(currentPosition, settings.destination);
    
    if (distance <= settings.radius) {
      self.registration.showNotification('OpenTravel Alarm', {
        body: 'You have reached your destination!',
        icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
        vibrate: [200, 100, 200]
      });
      
      // Play alarm sound
      const clients = await self.clients.matchAll();
      clients.forEach(client => {
        client.postMessage({
          type: 'PLAY_ALARM'
        });
      });
    }
  }
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 5000
    });
  });
}

function calculateDistance(position1, position2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = position1.coords.latitude * Math.PI/180;
  const φ2 = position2[0] * Math.PI/180;
  const Δφ = (position2[0] - position1.coords.latitude) * Math.PI/180;
  const Δλ = (position2[1] - position1.coords.longitude) * Math.PI/180;

  const a = Math.sin(Δφ/2)  Math.sin(Δφ/2) +
            Math.cos(φ1)  Math.cos(φ2) 
            Math.sin(Δλ/2)  Math.sin(Δλ/2);
  const c = 2  Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R  c; // Distance in meters
}
