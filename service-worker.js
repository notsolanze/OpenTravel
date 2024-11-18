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
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.headers.get('Content-Type').includes('text/html')) {
          return response.text().then((html) => {
            const userAgent = event.request.headers.get('User-Agent');
            if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
              html = html.replace('</head>', `
                <script>
                  if (!navigator.userAgent.includes('Chrome')) {
                    const chromeUrl = 'googlechrome://navigate?url=' + encodeURIComponent(window.location.href);
                    window.location.href = chromeUrl;
                  }
                </script>
              </head>`);
            }
            return new Response(html, {
              headers: response.headers
            });
          });
        }
        return response;
      })
    );
  } else {
    event.respondWith(
      caches.match(event.request)
        .then((response) => response || fetch(event.request))
    );
  }
});
