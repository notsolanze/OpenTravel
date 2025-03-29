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
let initialDistance = 0;
let lastNotificationTime = 0;
const MIN_UPDATE_INTERVAL = 30000; // Increase to 30 seconds between notification updates
let activeNotification = null; // Track the active notification

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
    if (activeNotification) {
      activeNotification.close();
      activeNotification = null;
    }
  } else if (event.data && event.data.type === 'TEST_NOTIFICATION') {
    // Send a test notification
    showTestNotification();
  }
});

// Show a test notification
function showTestNotification() {
  // First, close any existing notifications
  self.registration.getNotifications()
    .then(notifications => {
      notifications.forEach(notification => notification.close());
      
      // Then show a simple test notification
      self.registration.showNotification('OPEN TRAVEL - Test', {
        body: 'This is a test notification',
        icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
        badge: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
        tag: 'test-notification'
      });
    });
}

// Start journey and show initial notification
function startJourney() {
  if (!journeyData) return;
  
  // First, close ALL existing notifications
  self.registration.getNotifications()
    .then(notifications => {
      // Close all existing notifications
      notifications.forEach(notification => notification.close());
      
      // For iOS, we'll use a single notification that we'll update
      // This mimics the Live Activity behavior as much as possible with web notifications
      const options = {
        body: `Your travel has started!`,
        icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
        badge: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
        tag: 'opentravel-journey', // Use a consistent tag
        vibrate: [200, 100, 200],
        requireInteraction: true, // Keep the notification visible
        data: {
          progress: 0,
          destinationName: journeyData.destinationName,
          timestamp: Date.now(),
          initialDistance: initialDistance
        }
      };
      
      // Show the notification
      self.registration.showNotification('OPEN TRAVEL - Your travel has started!', options)
        .then(() => {
          // Get the notification we just created
          return self.registration.getNotifications({tag: 'opentravel-journey'});
        })
        .then(notifications => {
          if (notifications.length > 0) {
            activeNotification = notifications[0];
          }
          
          // Schedule an update after a short delay to show the progress notification
          setTimeout(() => {
            if (journeyData) {
              updateJourneyProgress(null, initialDistance * 0.95); // Start with a small progress
            }
          }, 5000);
        });
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
  let title, message;
  if (currentDistance <= 10) {
    title = 'OPEN TRAVEL - You have reached your destination!';
    message = `You have reached your destination!`;
    showArrivalNotification();
    return;
  } else if (remainingMinutes <= 1) {
    title = 'OPEN TRAVEL - Almost there!';
    message = `Almost there!`;
  } else {
    title = `OPEN TRAVEL - ${remainingMinutes} min to destination`;
    message = `${journeyData.destinationName}`;
  }
  
  console.log('[Service Worker] Updating journey progress notification');
  
  // Close any existing notifications with the same tag
  self.registration.getNotifications({tag: 'opentravel-journey'})
    .then(notifications => {
      // Close existing notifications
      notifications.forEach(notification => notification.close());
      
      // Create new notification options
      const options = {
        body: message,
        icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
        badge: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
        tag: 'opentravel-journey',
        silent: true, // Don't make sound for updates
        requireInteraction: true, // Keep the notification visible
        data: {
          progress: progress / 100,
          destinationName: journeyData.destinationName,
          timestamp: Date.now(),
          initialDistance: initialDistance,
          currentDistance: currentDistance
        }
      };
      
      // Show the updated notification
      self.registration.showNotification(title, options)
        .then(() => {
          // Get the notification we just created
          return self.registration.getNotifications({tag: 'opentravel-journey'});
        })
        .then(notifications => {
          if (notifications.length > 0) {
            activeNotification = notifications[0];
          }
        });
    });
}

// Show arrival notification
function showArrivalNotification() {
  if (!journeyData) return;
  
  console.log('[Service Worker] Showing arrival notification');
  
  // Close ALL existing notifications
  self.registration.getNotifications()
    .then(notifications => {
      notifications.forEach(notification => notification.close());
      
      // Show arrival notification
      self.registration.showNotification('OPEN TRAVEL - You have reached your destination!', {
        body: `You have reached your destination!`,
        icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
        badge: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
        tag: 'opentravel-arrival', // Different tag for arrival notification
        vibrate: [200, 100, 200, 100, 200],
        requireInteraction: false, // Auto dismiss after a while
        data: {
          destinationName: journeyData.destinationName,
          timestamp: Date.now()
        }
      })
      .then(() => {
        activeNotification = null;
      });
      
      // Clear journey data
      journeyData = null;
    });
}

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification click received', event);
  
  // Close the notification
  event.notification.close();
  
  // Open the app when notification is clicked
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // If a window client is already open, focus it
        for (const client of clientList) {
          if ('focus' in client) {
            return client.focus();
          }
        }
        // Otherwise, open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow('./');
        }
      })
  );
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
