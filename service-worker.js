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

let journeyState = null;

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'START_JOURNEY') {
    journeyState = event.data.settings;
    journeyState.startTime = new Date();
    startJourney();
  }
});

function startJourney() {
  if (journeyState) {
    const estimatedTime = calculateEstimatedTime();
    sendStatusNotification('start', estimatedTime);
    
    // Simulate journey end after estimated time
    setTimeout(() => {
      sendStatusNotification('end');
      journeyState = null;
    }, estimatedTime.getTime() - Date.now());
  }
}

function sendStatusNotification(type, estimatedTime) {
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
    options.body = `Arrival by ${formatTime(estimatedTime)}`;
  } else if (type === 'end') {
    options.body = 'You have reached your destination!';
    options.vibrate = [200, 100, 200];
  }

  self.registration.showNotification(title, options);
}

function calculateEstimatedTime() {
  const speed = 50; // assumed average speed in km/h
  const timeInHours = journeyState.initialDistance / (speed * 1000);
  const timeInMs = timeInHours * 60 * 60 * 1000;
  
  return new Date(journeyState.startTime.getTime() + timeInMs);
}

function formatTime(date) {
  return date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'open') {
    clients.openWindow('/');
  }
});
