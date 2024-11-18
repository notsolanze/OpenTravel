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
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.error('Cache opening failed:', error);
      })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request).catch(() => {
          // If both cache and network fail, you might want to show an offline page
          return new Response("You are offline and the resource is not cached.");
        });
      })
  );
});

self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
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

async function checkAlarmCondition() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const alarmSettingsResponse = await cache.match('/alarm-settings');
    if (alarmSettingsResponse) {
      const alarmSettings = await alarmSettingsResponse.json();
      await updateLocationNotification(alarmSettings.destination);

      const position = await getCurrentPosition();
      const distance = calculateDistance(position.coords, alarmSettings.destination);

      if (distance <= alarmSettings.radius) {
        await self.registration.showNotification('OpenTravel Alarm', {
          body: 'You have reached your destination!',
          icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
          badge: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
          vibrate: [200, 100, 200],
          tag: 'opentravel-alarm',
          renotify: true
        });
      }
    }
  } catch (error) {
    console.error('Error in checkAlarmCondition:', error);
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
  const φ1 = position1.latitude * Math.PI/180;
  const φ2 = position2[0] * Math.PI/180;
  const Δφ = (position2[0] - position1.latitude) * Math.PI/180;
  const Δλ = (position2[1] - position1.longitude) * Math.PI/180;

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

let notificationInterval;

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'START_LOCATION_UPDATES') {
    startLocationUpdates(event.data.destination);
  } else if (event.data && event.data.type === 'STOP_LOCATION_UPDATES') {
    stopLocationUpdates();
  } else if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function startLocationUpdates(destination) {
  if (notificationInterval) {
    clearInterval(notificationInterval);
  }

  notificationInterval = setInterval(() => {
    updateLocationNotification(destination);
  }, 60000); // Update every minute

  // Immediately show the first notification
  updateLocationNotification(destination);
}

function stopLocationUpdates() {
  if (notificationInterval) {
    clearInterval(notificationInterval);
  }
}

async function updateLocationNotification(destination) {
  try {
    const position = await getCurrentPosition();
    const distance = calculateDistance(position.coords, destination);
    const formattedDistance = formatDistance(distance);

    await self.registration.showNotification('OpenTravel Update', {
      body: `Current distance to destination: ${formattedDistance}`,
      icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
      badge: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
      tag: 'opentravel-location-update',
      renotify: true,
      silent: true // This makes the notification update silently
    });
  } catch (error) {
    console.error('Error updating location notification:', error);
  }
}
