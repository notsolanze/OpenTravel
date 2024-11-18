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

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
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
    badge: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 'alarm'
    },
    actions: [
      { action: 'open', title: 'Open App' },
      { action: 'close', title: 'Close' }
    ],
    tag: 'opentravel-update',
    renotify: true
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'open') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'START_BACKGROUND_UPDATES') {
    startBackgroundUpdates(event.data.settings);
  }
});

function startBackgroundUpdates(settings) {
  setInterval(() => {
    checkAlarmCondition(settings);
  }, settings.updateInterval * 60 * 1000); // Convert minutes to milliseconds
}

async function checkAlarmCondition(settings) {
  const cache = await caches.open(CACHE_NAME);
  const alarmSettings = await cache.match('/alarm-settings');
  if (alarmSettings) {
    const savedSettings = await alarmSettings.json();
    const position = await getCurrentPosition();
    const distance = calculateDistance(position, savedSettings.destination);
    
    if (distance <= savedSettings.radius) {
      self.registration.showNotification('OpenTravel Alarm', {
        body: 'You have reached your destination!',
        icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
        badge: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
        vibrate: [200, 100, 200],
        tag: 'opentravel-alarm',
        renotify: true
      });
    } else {
      const eta = calculateETA(distance);
      const progress = calculateProgress(distance, savedSettings.radius);
      
      self.registration.showNotification('OpenTravel Update', {
        body: `${formatDistance(distance)} from destination\nETA: ${eta}`,
        icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
        badge: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
        tag: 'opentravel-update',
        renotify: true,
        actions: [
          { action: 'open', title: 'View Map' }
        ],
        data: {
          progress: progress,
          timestamp: new Date().getTime()
        }
      });
    }

    // Send update to the main thread
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'LOCATION_UPDATE',
          position: position
        });
      });
    });
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

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distance in meters
}

function formatDistance(meters) {
  return meters > 1000 
    ? `${(meters/1000).toFixed(1)} km` 
    : `${Math.round(meters)} m`;
}

function calculateETA(distance) {
  // Assuming average speed of 30 km/h for demonstration
  const timeInMinutes = (distance / 1000) / (30 / 60);
  const now = new Date();
  now.setMinutes(now.getMinutes() + timeInMinutes);
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function calculateProgress(currentDistance, targetRadius) {
  // Convert to a percentage where 100% is at the destination
  return Math.min(100, Math.max(0, 100 - (currentDistance / targetRadius * 100)));
}
