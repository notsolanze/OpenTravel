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

let alarmSettings = null;
let hasStarted = false;
let hasReached = false;

function showNotification(type) {
  console.log('Service worker attempting to show notification:', type);
  
  // Close any existing notifications first
  self.registration.getNotifications().then(notifications => {
    notifications.forEach(notification => notification.close());
  });

  let title, body, options;

  if (type === 'start') {
    title = 'Journey Started';
    body = 'Your trip has begun. Stay safe!';
    options = {
      body,
      icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
      tag: 'opentravel-journey',
      renotify: false,
      requireInteraction: true,
      silent: false
    };
  } else {
    title = 'Destination Reached';
    body = 'You have arrived at your destination!';
    options = {
      body,
      icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
      tag: 'opentravel-journey',
      requireInteraction: true,
      vibrate: [200, 100, 200]
    };
  }

  self.registration.showNotification(title, options)
    .then(() => console.log('Service worker: Notification shown successfully'))
    .catch(error => console.error('Service worker: Error showing notification:', error));
}

function startJourney() {
  console.log('Starting journey function called');
  if (!alarmSettings || hasStarted) {
    console.log('Journey not started: alarmSettings not set or journey already started');
    return;
  }
  
  console.log('Starting journey:', alarmSettings);
  
  // Send the start notification
  showNotification('start');
  hasStarted = true;

  // Start checking location
  setInterval(() => {
    checkLocation();
  }, alarmSettings.updateInterval * 1000);
}

async function checkLocation() {
  if (!alarmSettings || hasReached) return;

  try {
    const position = await getCurrentPosition();
    const distance = calculateDistance(
      position.coords, 
      {latitude: alarmSettings.destination[0], longitude: alarmSettings.destination[1]}
    );
    
    // Only send notification when destination is reached
    if (distance <= alarmSettings.radius && !hasReached) {
      showNotification('end');
      hasReached = true;
      self.registration.unregister();
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
  const R = 6371e3;
  const φ1 = point1.latitude * Math.PI/180;
  const φ2 = point2.latitude * Math.PI/180;
  const Δφ = (point2.latitude - point1.latitude) * Math.PI/180;
  const Δλ = (point2.longitude - point1.longitude) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

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

self.addEventListener('message', (event) => {
  console.log('Service worker received message:', event.data);
  if (event.data && event.data.type === 'START_JOURNEY') {
    // Reset flags when starting new journey
    hasStarted = false;
    hasReached = false;
    alarmSettings = event.data.settings;
    startJourney();
  }
});

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

console.log('Service worker file loaded');
