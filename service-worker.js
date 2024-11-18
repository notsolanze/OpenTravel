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

self.addEventListener('backgroundfetchsuccess', (event) => {
  const bgFetch = event.registration;
  event.waitUntil(async function() {
    // Get the cache
    const cache = await caches.open(CACHE_NAME);
    const alarmSettings = await cache.match('/alarm-settings');
    if (alarmSettings) {
      const settings = await alarmSettings.json();
      const records = await bgFetch.matchAll();
      const promises = records.map(async (record) => {
        const response = await record.responseReady;
        const position = await response.json();
        await checkAlarmCondition(position, settings);
      });
      await Promise.all(promises);
    }
  }());
});

async function checkAlarmCondition(position, settings) {
  const distance = calculateDistance(position, settings.destination);
  
  if (distance <= settings.radius) {
    self.registration.showNotification('OpenTravel Alarm', {
      body: 'You have reached your destination!',
      icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
      vibrate: [200, 100, 200]
    });
    
    // Notify the main thread to play alarm sound
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'PLAY_ALARM'
      });
    });
  } else {
    // Send a location update to the main thread
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'LOCATION_UPDATE',
        position: position
      });
    });

    // Show a notification with the current distance
    if (settings.enableNotifications) {
      self.registration.showNotification('OpenTravel Distance Update', {
        body: `Current distance: ${Math.round(distance)} meters`,
        icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
        tag: 'distance-update', // This ensures we don't spam notifications
        renotify: true // This allows the notification to update instead of creating a new one
      });
    }
  }

  // Schedule the next update
  setTimeout(() => {
    self.registration.backgroundFetch.fetch(
      'location-update',
      ['/update-location'],
      {
        title: 'Location Update',
        icons: [{
          sizes: '192x192',
          src: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
          type: 'image/png',
        }],
        downloadTotal: 0,
      }
    );
  }, settings.updateInterval * 60 * 1000); // Convert minutes to milliseconds
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
