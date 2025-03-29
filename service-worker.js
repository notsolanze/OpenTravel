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
  'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3',
  '/splash-screen.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
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
  // Claim any clients immediately
  event.waitUntil(clients.claim());
});

// Active journey tracking
let journeyData = null;
let notificationTag = 'opentravel-journey';
let initialDistance = 0;
let lastNotificationTime = 0;
const MIN_UPDATE_INTERVAL = 5000; // Minimum 5 seconds between notification updates

// Listen for messages from the main app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'START_JOURNEY') {
    // Store journey data
    journeyData = event.data.journeyData;
    initialDistance = journeyData.initialDistance;
    lastNotificationTime = Date.now();
    
    // Start the journey with initial notification
    startJourney();
  } else if (event.data && event.data.type === 'UPDATE_LOCATION') {
    // Update the notification with new location data
    if (journeyData) {
      const currentTime = Date.now();
      // Only update notification if enough time has passed since last update
      if (currentTime - lastNotificationTime > MIN_UPDATE_INTERVAL) {
        updateJourneyProgress(event.data.location, event.data.distance);
        lastNotificationTime = currentTime;
      }
    }
  } else if (event.data && event.data.type === 'STOP_JOURNEY') {
    // Clear journey data
    journeyData = null;
    // Close any active notifications
    self.registration.getNotifications({ tag: notificationTag })
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
  
  // Create the notification options
  const options = {
    body: `${formattedTime} to ${destinationName}`,
    icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
    badge: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
    tag: notificationTag,
    renotify: false,
    requireInteraction: true,
    actions: [
      {
        action: 'view',
        title: 'View'
      },
      {
        action: 'cancel',
        title: 'Cancel'
      }
    ],
    // This is where we store data for our notification
    data: {
      progress: 0,
      destinationName,
      timestamp: Date.now(),
      initialDistance: initialDistance
    }
  };
  
  // Show the notification
  self.registration.showNotification('OpenTravel', options);
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
  
  // Get all existing notifications
  self.registration.getNotifications({ tag: notificationTag })
    .then(notifications => {
      // Close existing notifications
      notifications.forEach(notification => notification.close());
      
      // Create new notification options
      const options = {
        body: message,
        icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
        badge: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
        tag: notificationTag,
        renotify: true,
        requireInteraction: true,
        actions: [
          {
            action: 'view',
            title: 'View'
          },
          {
            action: 'cancel',
            title: 'Cancel'
          }
        ],
        data: {
          progress: progress,
          destinationName: journeyData.destinationName,
          timestamp: Date.now(),
          initialDistance: initialDistance,
          currentDistance: currentDistance
        }
      };
      
      // Show the updated notification
      self.registration.showNotification('OpenTravel', options);
      
      // If we've reached the destination (within 10 meters), send arrival notification
      if (currentDistance <= 10) {
        // Show arrival notification with different tag to ensure it appears as a new notification
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
      }
    });
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

// Handle push events (for web push notifications)
self.addEventListener('push', (event) => {
  if (event.data) {
    try {
      const data = event.data.json();
      const options = {
        body: data.body || 'Update from OpenTravel',
        icon: data.icon || 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
        badge: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
        data: data.data || {},
        actions: data.actions || []
      };
      
      event.waitUntil(
        self.registration.showNotification(data.title || 'OpenTravel', options)
      );
    } catch (error) {
      console.error('Error processing push notification:', error);
    }
  }
});

// Handle periodic sync for background updates
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'opentravel-update' && journeyData) {
    event.waitUntil(
      // Get the latest location and update the notification
      new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            const distance = calculateDistance(
              { latitude, longitude },
              { latitude: journeyData.destination[0], longitude: journeyData.destination[1] }
            );
            updateJourneyProgress({ latitude, longitude }, distance);
            resolve();
          },
          (error) => {
            console.error('Error getting location in periodic sync:', error);
            resolve();
          },
          {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 5000
          }
        );
      })
    );
  }
});

// Calculate distance between two points
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
