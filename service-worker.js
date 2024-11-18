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

let journeySettings = null;
let notificationId = 'opentravel-journey';

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'START_JOURNEY') {
    journeySettings = event.data.settings;
    startJourney();
  } else if (event.data && event.data.type === 'UPDATE_PROGRESS') {
    updateProgress(event.data.progress, event.data.distance);
  } else if (event.data && event.data.type === 'STOP_JOURNEY') {
    stopJourney();
  }
});

function startJourney() {
  if (journeySettings) {
    const estimatedTime = calculateEstimatedTime();
    sendNotification('Journey Started', `Estimated arrival by ${formatTime(estimatedTime.end)}`, 0);
  }
}

function updateProgress(progress, distanceText) {
  if (journeySettings) {
    self.registration.getNotifications({ tag: notificationId }).then(notifications => {
      if (notifications.length > 0) {
        const notification = notifications[0];
        notification.close();
        sendNotification('OpenTravel Progress', distanceText, progress);
      }
    });
  }
}

function stopJourney() {
  sendNotification('Journey Completed', 'You have reached your destination!', 100);
  journeySettings = null;
}

function sendNotification(title, body, progress) {
  const options = {
    body: body,
    icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
    badge: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
    tag: notificationId,
    renotify: true,
    silent: progress > 0 && progress < 100, // Silent updates for progress
    data: { progress: progress }
  };

  if (progress > 0 && progress < 100) {
    options.actions = [
      { action: 'view', title: 'View Map' }
    ];
  }

  self.registration.showNotification(title, options);
}

function calculateEstimatedTime() {
  const now = new Date();
  const speed = 50; // assumed average speed in km/h
  const distance = journeySettings.initialDistance;
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

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'view') {
    event.waitUntil(clients.openWindow('/'));
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'alarm-sync') {
    event.waitUntil(checkLocation());
  }
});
