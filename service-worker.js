let intervalId = null; // Interval reference
let totalDistance = null; // Store total distance for progress calculation

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'START_JOURNEY') {
    alarmSettings = event.data.settings;
    totalDistance = alarmSettings.initialDistance; // Save initial distance
    startJourney();
  }
});

function startJourney() {
  if (alarmSettings) {
    const estimatedTime = calculateEstimatedTime();
    sendStatusNotification('start', 0, estimatedTime);

    intervalId = setInterval(() => {
      checkLocation();
    }, alarmSettings.updateInterval * 1000);
  }
}

async function checkLocation() {
  try {
    const position = await getCurrentPosition();
    const distance = calculateDistance(
      position.coords, 
      {latitude: alarmSettings.destination[0], longitude: alarmSettings.destination[1]}
    );
    
    const progress = calculateProgress(distance);

    // Update progress in notification
    updateProgressNotification(progress, distance);

    // If distance is within the set radius, notify the user and stop updates
    if (distance <= alarmSettings.radius) {
      sendStatusNotification('end');
      clearInterval(intervalId); // Stop the interval
      intervalId = null;
      self.registration.unregister(); // Clean up the service worker
    }
  } catch (error) {
    console.error('Error checking location:', error);
  }
}

function sendStatusNotification(type, progress, estimatedTime) {
  const title = 'OpenTravel';
  let body = '';
  let progressBar = '';

  if (type === 'start') {
    body = `Journey started. Estimated arrival: ${formatTime(estimatedTime.end)}`;
    progressBar = progressTemplate(progress);
  } else if (type === 'end') {
    body = 'You have reached your destination!';
    progressBar = progressTemplate(100); // Complete progress
  }

  const options = {
    body: `${body}\n\n${progressBar}`,
    icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
    badge: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
    tag: 'opentravel-status',
    renotify: true,
    requireInteraction: true,
    timestamp: Date.now()
  };

  self.registration.showNotification(title, options);
}

function updateProgressNotification(progress, currentDistance) {
  const progressBar = progressTemplate(progress);
  const title = 'OpenTravel';
  const options = {
    body: `You are ${currentDistance.toFixed(2)} meters away.\n\n${progressBar}`,
    icon: 'https://cdn-icons-png.flaticon.com/128/10473/10473293.png',
    tag: 'opentravel-status',
    renotify: true,
    requireInteraction: false
  };

  self.registration.showNotification(title, options);
}

// Function to calculate progress percentage
function calculateProgress(currentDistance) {
  return Math.max(0, Math.min(100, ((totalDistance - currentDistance) / totalDistance) * 100));
}

// Generate a progress bar string (to mimic the look)
function progressTemplate(progress) {
  const filledBlocks = Math.round(progress / 10); // 10% = 1 block
  const emptyBlocks = 10 - filledBlocks; // Total blocks = 10
  const filled = '█'.repeat(filledBlocks);
  const empty = '░'.repeat(emptyBlocks);
  return `[${filled}${empty}] ${progress.toFixed(1)}%`;
}
