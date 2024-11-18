const CACHE_NAME = 'opentravel-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/leaflet@1.7.1/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.7.1/dist/leaflet.js',
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap',
  'https://unpkg.com/lucide@latest',
  'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
  'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3',
  'https://assets.mixkit.co/active_storage/sfx/2569/2569-preview.mp3',
  'https://assets.mixkit.co/active_storage/sfx/2570/2570-preview.mp3',
  'https://assets.mixkit.co/active_storage/sfx/2908/2908-preview.mp3',
  'https://assets.mixkit.co/active_storage/sfx/2910/2910-preview.mp3',
  'https://assets.mixkit.co/active_storage/sfx/2573/2573-preview.mp3',
  'https://assets.mixkit.co/active_storage/sfx/2574/2574-preview.mp3',
  'https://assets.mixkit.co/active_storage/sfx/2575/2575-preview.mp3'
];

let alarmSettings = null;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
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
        return fetch(event.request).then(
          (response) => {
            if(!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'START_BACKGROUND_UPDATES') {
    alarmSettings = event.data.settings;
    startBackgroundUpdates();
  } else if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function startBackgroundUpdates() {
  if (alarmSettings) {
    setInterval(() => {
      checkLocation();
    }, alarmSettings.updateInterval * 60 * 1000); // Convert minutes to milliseconds
  }
}

async function checkLocation() {
  try {
    const position = await getCurrentPosition();
    const distance = calculateDistance(position.coords, {latitude: alarmSettings.destination[0], longitude: alarmSettings.destination[1]});
    sendDistanceNotification(distance);
  } catch (error) {
    console.error('Error checking location:', error);
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

function calculateDistance(point1, point2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = point1.latitude * Math.PI/180;
  const φ2 = point2.latitude * Math.PI/180;
  const Δφ = (point2.latitude - point1.latitude) * Math.PI/180;
  const Δλ = (point2.longitude - point1.longitude) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distance in meters
}

function sendDistanceNotification(distance) {
  const formattedDistance = formatDistance(distance);
  const title = 'OpenTravel Distance Update';
  const options = {
    body: `Current distance to destination: ${formattedDistance}`,
    icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
    badge: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
    tag: 'distance-update',
    renotify: true
  };

  self.registration.showNotification(title, options);
}

function formatDistance(meters) {
  return meters > 1000 
    ? `${(meters/1000).toFixed(1)} km` 
    : `${Math.round(meters)} m`;
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('https://open-travel-psi.vercel.app/')
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'alarm-sync') {
    event.waitUntil(checkLocation());
  }
});

self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const title = data.title || 'OpenTravel Update';
    const options = {
      body: data.body || 'New update from OpenTravel',
      icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
      badge: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
      vibrate: [200, 100, 200],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: '2'
      }
    };

    event.waitUntil(self.registration.showNotification(title, options));
  }
});
