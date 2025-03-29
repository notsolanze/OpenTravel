const CACHE_NAME = 'opentravel-cache-v1';
const urlsToCache = [
  './',
  './index.html',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/leaflet@1.7.1/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.7.1/dist/leaflet.js',
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap',
  'https://unpkg.com/lucide@latest',
  'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
  'https://cdn-icons-png.flaticon.com/512/10473/10473293.png',
  'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing Service Worker...', event);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell');
        // Use Promise.allSettled instead of Promise.all to handle failed fetches
        return Promise.allSettled(
          urlsToCache.map(url => 
            fetch(url)
              .then(response => {
                if (!response.ok) {
                  throw new Error(`Failed to fetch ${url}`);
                }
                return cache.put(url, response);
              })
              .catch(error => {
                console.warn(`[Service Worker] Failed to cache: ${url}`, error);
                // Continue despite the error
                return Promise.resolve();
              })
          )
        );
      })
  );
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating Service Worker...', event);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache', cacheName);
            return caches.delete(cacheName);
          }
          return Promise.resolve();
        })
      );
    })
  );
  // Claim any clients immediately
  event.waitUntil(clients.claim());
  console.log('[Service Worker] Service Worker activated');
});

// Fetch event - serve from cache if available
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin) && 
      !event.request.url.startsWith('https://cdn') && 
      !event.request.url.startsWith('https://unpkg') && 
      !event.request.url.startsWith('https://fonts') && 
      !event.request.url.startsWith('https://assets.mixkit')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached response if found
        if (response) {
          return response;
        }
        
        // Clone the request because it's a one-time use stream
        const fetchRequest = event.request.clone();
        
        return fetch(fetchRequest)
          .then(response => {
            // Check if we received a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Clone the response because it's a one-time use stream
            const responseToCache = response.clone();
            
            caches.open(CACHE_NAME)
              .then(cache => {
                // Don't cache API calls or external resources
                if (event.request.url.includes('/api/') || 
                    !event.request.url.startsWith(self.location.origin)) {
                  return;
                }
                cache.put(event.request, responseToCache);
              });
              
            return response;
          })
          .catch(error => {
            console.error('[Service Worker] Fetch failed:', error);
            // You could return a custom offline page here
            return new Response('Network error occurred', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({
                'Content-Type': 'text/plain'
              })
            });
          });
      })
  );
});

// Active journey tracking
let journeyData = null;
let notificationTag = 'opentravel-journey';
let initialDistance = 0;
let lastNotificationTime = 0;
const MIN_UPDATE_INTERVAL = 5000; // Minimum 5 seconds between notification updates

// Listen for messages from the main app
self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message received:', event.data);
  
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
  } else if (event.data && event.data.type === 'TEST_NOTIFICATION') {
    // Send a test notification
    self.registration.showNotification('OPEN TRAVEL - Test', {
      body: 'This is a test notification',
      icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
      badge: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
      tag: 'test-notification',
      renotify: true,
      requireInteraction: true,
      vibrate: [200, 100, 200]
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
    body: `Your travel has started!`,
    icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
    badge: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
    tag: notificationTag,
    renotify: true,
    silent: false,
    vibrate: [200, 100, 200],
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
  
  console.log('[Service Worker] Showing start journey notification');
  
  // Show the notification
  self.registration.showNotification('OPEN TRAVEL - Your travel has started!', options);
  
  // Schedule an update after a short delay to show the progress notification
  setTimeout(() => {
    if (journeyData) {
      updateJourneyProgress(null, initialDistance * 0.95); // Start with a small progress
    }
  }, 3000);
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
  
  // Create progress bar string (20 characters)
  const progressBarLength = 20;
  const filledLength = Math.round((progress / 100) * progressBarLength);
  const emptyLength = progressBarLength - filledLength;
  const progressBar = '█'.repeat(filledLength) + '░'.repeat(emptyLength);
  
  // Format the message based on remaining time
  let message;
  if (currentDistance <= 10) {
    message = `You have reached your destination!`;
    showArrivalNotification();
    return;
  } else if (remainingMinutes <= 1) {
    message = `Almost there! ${progressBar}`;
  } else {
    message = `Approx arrive ${remainingMinutes} mins\n${progressBar}`;
  }
  
  console.log('[Service Worker] Updating journey progress notification');
  
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
        silent: true, // Silent updates for progress
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
      self.registration.showNotification('OPEN TRAVEL - Approx arrive ' + remainingMinutes + ' mins', options);
    });
}

// Show arrival notification
function showArrivalNotification() {
  if (!journeyData) return;
  
  console.log('[Service Worker] Showing arrival notification');
  
  // Close any existing journey notifications
  self.registration.getNotifications({ tag: notificationTag })
    .then(notifications => {
      notifications.forEach(notification => notification.close());
      
      // Show arrival notification with different tag to ensure it appears as a new notification
      self.registration.showNotification('OPEN TRAVEL - You have reached your destination!', {
        body: `You have reached your destination!`,
        icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
        badge: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
        tag: 'opentravel-arrival',
        vibrate: [200, 100, 200, 100, 200],
        requireInteraction: true,
        silent: false,
        data: {
          destinationName: journeyData.destinationName,
          timestamp: Date.now()
        }
      });
      
      // Clear journey data
      journeyData = null;
    });
}

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification click received', event);
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
          return self.clients.openWindow('./');
        }
      })
    );
  }
});

// Handle push events (for web push notifications)
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push received', event);
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
        self.registration.showNotification(data.title || 'OPEN TRAVEL', options)
      );
    } catch (error) {
      console.error('Error processing push notification:', error);
    }
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

// Log that the service worker is loaded
console.log('[Service Worker] Service worker loaded');
