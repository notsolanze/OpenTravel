const CACHE_NAME = 'opentravel-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/leaflet@1.7.1/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.7.1/dist/leaflet.js',
  '//fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap',
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

let alarmSettings = null;

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'START_BACKGROUND_UPDATES') {
    alarmSettings = event.data.settings;
    startBackgroundUpdates();
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
    const distance = calculateDistance(position.coords, alarmSettings.destination);
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
  if (event.action === 'open') {
    clients.openWindow('/');
  }
});
