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
let notificationSent = { start: false, near: false };

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'START_JOURNEY') {
    alarmSettings = event.data.settings;
    notificationSent = { start: false, near: false };
    startJourney();
  }
});

function startJourney() {
  if (alarmSettings) {
    console.log('Starting journey with settings:', alarmSettings);
    sendStatusNotification('start')
      .then(() => {
        notificationSent.start = true;
        setInterval(() => {
          checkLocation();
        }, alarmSettings.updateInterval * 1000);
      });
  } else {
    console.error('No alarm settings available');
  }
}

async function checkLocation() {
  try {
    console.log('Checking location...');
    const position = await getCurrentPosition();
    const distance = calculateDistance(
      position.coords, 
      {latitude: alarmSettings.destination[0], longitude: alarmSettings.destination[1]}
    );
    
    console.log('Current distance:', distance);
    
    if (distance <= 300 && !notificationSent.near) {
      console.log('Within 300 meters, sending notification');
      await sendStatusNotification('near');
      notificationSent.near = true;
    }
    
    if (distance <= alarmSettings.radius) {
      console.log('Destination reached, unregistering service worker');
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

function sendStatusNotification(type) {
  const title = 'OpenTravel';
  const options = {
    icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
    badge: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
    tag: 'opentravel-status',
    renotify: true,
    requireInteraction: true,
    actions: [{ action: 'open', title: 'View' }],
    timestamp: Date.now()
  };

  if (type === 'start') {
    options.body = 'Your journey has started!';
  } else if (type === 'near') {
    options.body = 'You are within 300 meters of your destination!';
    options.vibrate = [200, 100, 200];
  }

  console.log('Sending notification:', type);
  return self.registration.showNotification(title, options)
    .then(() => {
      console.log('Notification sent successfully:', type);
    })
    .catch((error) => {
      console.error('Error sending notification:', error);
    });
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

console.log('Modified service worker loaded');
