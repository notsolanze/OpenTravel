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

let journeyState = {
  active: false,
  startTime: null,
  destination: null,
  initialDistance: null,
  radius: null,
  updateInterval: 30
};

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'START_JOURNEY') {
    journeyState = {
      active: true,
      startTime: new Date(),
      destination: event.data.settings.destination,
      initialDistance: event.data.settings.initialDistance,
      radius: event.data.settings.radius,
      updateInterval: event.data.settings.updateInterval || 30
    };
    
    showJourneyNotification('start');
    startJourneyUpdates();
  }
});

function startJourneyUpdates() {
  if (journeyState.active) {
    setInterval(() => {
      if (journeyState.active) {
        updateJourneyProgress();
      }
    }, journeyState.updateInterval * 1000);
  }
}

function updateJourneyProgress() {
  // Simulating progress update
  const progress = Math.min(100, (Date.now() - journeyState.startTime) / (30 * 60 * 1000) * 100);
  const remainingDistance = Math.max(0, journeyState.initialDistance * (1 - progress / 100));

  if (progress < 100) {
    showJourneyNotification('progress', progress, remainingDistance);
  } else {
    showJourneyNotification('end');
    journeyState.active = false;
  }
}

function showJourneyNotification(type, progress = 0, remainingDistance = 0) {
  const title = 'OpenTravel';
  const options = {
    icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
    badge: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
    tag: 'opentravel-journey',
    renotify: true,
    requireInteraction: true,
    actions: [{ action: 'open', title: 'View' }],
    data: { type, progress }
  };

  let body = '';
  let silent = false;

  if (type === 'start') {
    const estimatedTime = calculateEstimatedTime();
    body = `Journey started. Estimated arrival by ${formatTime(estimatedTime)}`;
  } else if (type === 'progress') {
    body = `${formatDistance(remainingDistance)} to destination`;
    silent = true;
  } else if (type === 'end') {
    body = 'You have reached your destination!';
    options.vibrate = [200, 100, 200];
  }

  options.body = body;
  options.silent = silent;

  self.registration.showNotification(title, options);
}

function calculateEstimatedTime() {
  if (!journeyState.active) return null;
  
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
