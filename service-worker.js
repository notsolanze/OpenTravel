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
    // Send a test notification with progress bar
    showProgressNotification(0.5, "Test progress notification", "This is a test notification with a progress bar");
  }
});

// Show a notification with a progress bar
function showProgressNotification(progressValue, title, body) {
  const options = {
    body: body,
    icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
    badge: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
    tag: notificationTag, // Use the same tag to update existing notification
    renotify: false, // Don't notify again when updating
    silent: true,
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
    // This is the key part - add a progress indicator
    image: createProgressBarImage(progressValue),
    data: {
      progress: progressValue,
      timestamp: Date.now()
    }
  };
  
  self.registration.showNotification(title, options);
}

// Create a data URL for a progress bar image
function createProgressBarImage(progress) {
  // We'll use a simple URL that represents a progress bar
  // In a real implementation, you might want to generate an actual image
  return `data:image/svg+xml;charset=UTF-8,
    <svg width="400" height="20" xmlns="http://www.w3.org/2000/svg">
      <rect width="400" height="20" fill="#eee" rx="10" ry="10"/>
      <rect width="${progress * 400}" height="20" fill="#10B981" rx="10" ry="10"/>
    </svg>`;
}

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
  
  console.log('[Service Worker] Showing start journey notification');
  
  // First, close any existing notifications with the same tag
  self.registration.getNotifications({ tag: notificationTag })
    .then(notifications => {
      notifications.forEach(notification => notification.close());
      
      // Show the initial notification
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
        data: {
          progress: 0,
          destinationName,
          timestamp: Date.now(),
          initialDistance: initialDistance
        }
      };
      
      // Show the notification
      self.registration.showNotification('OPEN TRAVEL - Your travel has started!', options);
      
      // Schedule an update after a short delay to show the progress notification
      setTimeout(() => {
        if (journeyData) {
          updateJourneyProgress(null, initialDistance * 0.95); // Start with a small progress
        }
      }, 3000);
    });
}

// Update journey progress
function updateJourneyProgress(location, currentDistance) {
  if (!journeyData) return;
  
  // Calculate progress percentage (0-100)
  const progress = Math.min(100, Math.max(0, 
    ((initialDistance - currentDistance) / initialDistance) * 100
  )) / 100; // Convert to 0-1 range for the progress bar
  
  // Calculate remaining time in minutes
  const speed = journeyData.speed || 5; // meters per second (walking speed)
  const remainingTimeSeconds = currentDistance / speed;
  const remainingMinutes = Math.ceil(remainingTimeSeconds / 60);
  
  // Format the message based on remaining time
  let message;
  if (currentDistance <= 10) {
    message = `You have reached your destination!`;
    showArrivalNotification();
    return;
  } else if (remainingMinutes <= 1) {
    message = `Almost there!`;
  } else {
    message = `Approx arrive ${remainingMinutes} mins`;
  }
  
  console.log('[Service Worker] Updating journey progress notification');
  
  // First, close any existing notifications with the same tag
  self.registration.getNotifications({ tag: notificationTag })
    .then(notifications => {
      // We'll update the notification instead of closing and creating a new one
      // This approach helps maintain a single persistent notification
      
      // Create new notification options with progress bar
      const options = {
        body: message,
        icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
        badge: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
        tag: notificationTag,
        renotify: false, // Don't notify again when updating
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
        // Add a visual progress bar as an image
        image: createProgressBarImage(progress),
        data: {
          progress: progress,
          destinationName: journeyData.destinationName,
          timestamp: Date.now(),
          initialDistance: initialDistance,
          currentDistance: currentDistance
        }
      };
      
      // Close existing notifications first
      notifications.forEach(notification => notification.close());
      
      // Then show the updated notification
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
        tag: 'opentravel-arrival', // Different tag for arrival notification
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
