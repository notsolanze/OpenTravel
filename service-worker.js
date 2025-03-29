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

// Active journey tracking
let journeyData = null;
let activeNotificationTag = 'opentravel-journey';
let initialDistance = 0;

// Listen for messages from the main app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'START_JOURNEY') {
    // Store journey data
    journeyData = event.data.journeyData;
    initialDistance = journeyData.initialDistance;
    
    // Start the journey with initial notification
    startJourney();
  } else if (event.data && event.data.type === 'UPDATE_LOCATION') {
    // Update the notification with new location data
    if (journeyData) {
      updateJourneyProgress(event.data.location, event.data.distance);
    }
  } else if (event.data && event.data.type === 'STOP_JOURNEY') {
    // Clear journey data
    journeyData = null;
    // Close any active notifications
    self.registration.getNotifications({ tag: activeNotificationTag })
      .then(notifications => {
        notifications.forEach(notification => notification.close());
      });
  }
});

// Start journey and show initial notification
function startJourney() {
  if (!journeyData) return;
  
  const { destinationName, estimatedTime } = journeyData;
  
  // Format the estimated arrival time
  const arrivalTime = new Date(estimatedTime);
  const formattedTime = arrivalTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  
  // Show the initial notification
  self.registration.showNotification('OpenTravel', {
    body: `${formattedTime} to ${destinationName}`,
    icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
    badge: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
    tag: activeNotificationTag,
    renotify: false,
    requireInteraction: true,
    silent: true,
    data: {
      progress: 0,
      destinationName,
      timestamp: Date.now()
    },
    actions: [
      {
        action: 'view',
        title: 'View'
      },
      {
        action: 'cancel',
        title: 'Cancel'
      }
    ]
  });
}

// Update journey progress
function updateJourneyProgress(location, currentDistance) {
  if (!journeyData) return;
  
  // Calculate progress percentage (0-100)
  const progress = Math.min(100, Math.max(0, 
    ((initialDistance - currentDistance) / initialDistance) * 100
  ));
  
  // Calculate remaining time in minutes
  const speed = journeyData.speed || 5; // meters per second (walking speed)
  const remainingTimeSeconds = currentDistance / speed;
  const remainingMinutes = Math.ceil(remainingTimeSeconds / 60);
  
  // Format the message based on remaining time
  let message;
  if (remainingMinutes <= 1) {
    message = `Almost there!`;
  } else {
    message = `${remainingMinutes} min to ${journeyData.destinationName}`;
  }
  
  // Only update notification if we have an active one
  self.registration.getNotifications({ tag: activeNotificationTag })
    .then(notifications => {
      if (notifications.length > 0) {
        // Close the existing notification
        notifications.forEach(notification => notification.close());
        
        // Show updated notification with progress
        self.registration.showNotification('OpenTravel', {
          body: message,
          icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
          badge: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
          tag: activeNotificationTag,
          renotify: false,
          requireInteraction: true,
          silent: true,
          data: {
            progress: progress,
            destinationName: journeyData.destinationName,
            timestamp: Date.now()
          },
          actions: [
            {
              action: 'view',
              title: 'View'
            },
            {
              action: 'cancel',
              title: 'Cancel'
            }
          ]
        });
      }
    });
  
  // If we've reached the destination (within 10 meters), send arrival notification
  if (currentDistance <= 10) {
    self.registration.getNotifications({ tag: activeNotificationTag })
      .then(notifications => {
        notifications.forEach(notification => notification.close());
        
        // Show arrival notification
        self.registration.showNotification('Destination Reached!', {
          body: `You have arrived at ${journeyData.destinationName}`,
          icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
          badge: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
          tag: 'opentravel-arrival',
          vibrate: [200, 100, 200, 100, 200],
          requireInteraction: true,
          data: {
            destinationName: journeyData.destinationName,
            timestamp: Date.now()
          }
        });
        
        // Clear journey data
        journeyData = null;
      });
  }
}

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'cancel') {
    // Clear journey data
    journeyData = null;
    
    // Inform the main app that the journey was canceled
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'JOURNEY_CANCELED'
        });
      });
    });
  } else {
    // Open the app when notification is clicked
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(clientList => {
        // If a window client is already open, focus it
        for (const client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise, open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow('/');
        }
      })
    );
  }
});
