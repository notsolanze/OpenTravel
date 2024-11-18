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
    }, alarmSettings.updateInterval * 1000); // Convert seconds to milliseconds
  }
}

async function checkLocation() {
  try {
    const position = await getCurrentPosition();
    const distance = calculateDistance(
      position.coords, 
      {latitude: alarmSettings.destination[0], longitude: alarmSettings.destination[1]}
    );
    
    if (distance <= alarmSettings.radius) {
      sendStatusNotification('end');
    }
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

function calculateProgress(currentDistance) {
  const totalDistance = alarmSettings.initialDistance || currentDistance;
  return Math.max(0, Math.min(100, ((totalDistance - currentDistance) / totalDistance) * 100));
}

function sendStatusNotification(type) {
  const title = 'OpenTravel';
  const options = {
    icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
    badge: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
    tag: 'opentravel-status',
    silent: true,
    data: { type },
    actions: [{ action: 'open', title: 'View' }],
    timestamp: Date.now()
  };

  if (type === 'start') {
    const estimatedTime = calculateEstimatedTime();
    options.body = `Arrival by ${formatTime(estimatedTime.end)}`;
    options.requireInteraction = true;
  } else if (type === 'end') {
    options.body = 'You have reached your destination!';
    options.requireInteraction = true;
    options.vibrate = [200, 100, 200];
    options.silent = false;
  }

  self.registration.showNotification(title, options);
}

function calculateEstimatedTime() {
  const now = new Date();
  const speed = 50; // assumed average speed in km/h
  const distance = alarmSettings.initialDistance;
  const timeInHours = distance / (speed * 1000); // convert distance to km
  const timeInMs = timeInHours * 60 * 60 * 1000;
  
  return {
    start: now,
    end: new Date(now.getTime() + timeInMs)
  };
}

function formatTime(date) {
  return date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
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

self.addEventListener('sync', (event) => {
  if (event.tag === 'alarm-sync') {
    event.waitUntil(checkLocation());
  }
});
