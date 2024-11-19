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
let hasStartNotificationSent = false;
let hasEndNotificationSent = false;

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
  if (event.data && event.data.type === 'START_JOURNEY') {
    alarmSettings = event.data.settings;
    hasStartNotificationSent = false;
    hasEndNotificationSent = false;
    startJourney();
  }
});

function startJourney() {
  if (alarmSettings && !hasStartNotificationSent) {
    const estimatedTime = calculateEstimatedTime();
    // Send initial notification
    sendNotification('start', {
      title: 'Journey Started',
      body: `Estimated arrival by ${formatTime(estimatedTime.end)}`,
      progress: 0
    });
    hasStartNotificationSent = true;
    
    // Start location checking
    setInterval(() => {
      checkLocation();
    }, alarmSettings.updateInterval * 1000);
  }
}

async function checkLocation() {
  if (hasEndNotificationSent) return;

  try {
    const position = await getCurrentPosition();
    const distance = calculateDistance(
      position.coords, 
      {latitude: alarmSettings.destination[0], longitude: alarmSettings.destination[1]}
    );
    
    // Only send notification when near destination
    if (distance <= alarmSettings.radius && !hasEndNotificationSent) {
      sendNotification('end', {
        title: 'Destination Reached',
        body: 'You have arrived at your destination!',
        progress: 100
      });
      hasEndNotificationSent = true;
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

function sendNotification(type, { title, body, progress }) {
  const options = {
    icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
    badge: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
    tag: 'opentravel-journey',
    renotify: true,
    requireInteraction: true,
    actions: [{ action: 'open', title: 'View' }],
    timestamp: Date.now(),
    body: body,
    data: { type, progress }
  };

  // Add vibration for destination reached
  if (type === 'end') {
    options.vibrate = [200, 100, 200];
  }

  // Create progress bar using emoji blocks
  const progressBlocks = 10;
  const filledBlocks = Math.round((progress / 100) * progressBlocks);
  const progressBar = '▓'.repeat(filledBlocks) + '░'.repeat(progressBlocks - filledBlocks);
  options.body = `${body}\n${progressBar} ${Math.round(progress)}%`;

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
