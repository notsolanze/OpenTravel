// Simulated database of active alarms
const activeAlarms = new Map();

// Helper function to calculate distance between two points using the Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

// Helper function to calculate progress percentage
function calculateProgress(currentDistance, initialDistance) {
  return Math.max(0, Math.min(100, ((initialDistance - currentDistance) / initialDistance) * 100));
}

export default function handler(req, res) {
  try {
    const { method } = req;

    if (method === 'POST') {
      // Set a new alarm
      const { userId, destination, radius, initialDistance } = JSON.parse(req.body);
      if (!userId || !destination || !radius) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }
      activeAlarms.set(userId, { 
        destination, 
        radius: Number(radius),
        initialDistance: initialDistance || 0,
        startTime: Date.now()
      });
      res.status(200).json({ message: 'Alarm set successfully' });
    } else if (method === 'GET') {
      // Check for notifications
      const { userId, currentLocation } = req.query;
      
      if (!userId || !currentLocation) {
        return res.status(400).json({ error: 'Missing userId or currentLocation' });
      }

      const userAlarm = activeAlarms.get(userId);
      
      if (!userAlarm) {
        return res.status(200).json({ hasNotification: false });
      }

      const { destination, radius, initialDistance, startTime } = userAlarm;
      const [currentLat, currentLon] = currentLocation.split(',').map(Number);
      
      const distance = calculateDistance(
        currentLat, currentLon,
        destination.latitude, destination.longitude
      );

      // Calculate progress
      const progress = calculateProgress(distance, initialDistance || distance * 2);
      
      // Calculate estimated time remaining
      const speed = 5; // meters per second (walking speed)
      const remainingTimeSeconds = distance / speed;
      const remainingMinutes = Math.ceil(remainingTimeSeconds / 60);
      
      // Determine if we should show a notification
      const hasNotification = distance <= radius;
      
      // Format message based on distance
      let message;
      if (hasNotification) {
        message = `You have reached your destination!`;
      } else if (remainingMinutes <= 1) {
        message = `Almost there!`;
      } else {
        message = `${remainingMinutes} min to destination`;
      }

      res.status(200).json({
        hasNotification,
        title: "OpenTravel",
        message,
        progress,
        distance,
        remainingMinutes,
        // Include data for the progress notification
        notificationData: {
          tag: 'opentravel-journey',
          renotify: false,
          requireInteraction: true,
          silent: !hasNotification,
          data: {
            progress,
            distance,
            remainingMinutes,
            timestamp: Date.now()
          }
        }
      });
    } else if (method === 'DELETE') {
      // Clear an alarm
      const { userId } = JSON.parse(req.body);
      if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
      }
      
      activeAlarms.delete(userId);
      res.status(200).json({ message: 'Alarm cleared successfully' });
    } else {
      res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
      res.status(405).end(`Method ${method} Not Allowed`);
    }
  } catch (error) {
    console.error('Error in check-notifications handler:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
