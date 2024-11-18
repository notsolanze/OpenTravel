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

export default function handler(req, res) {
  try {
    const { method } = req;

    if (method === 'POST') {
      // Set a new alarm
      const { userId, destination, radius } = JSON.parse(req.body);
      if (!userId || !destination || !radius) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }
      activeAlarms.set(userId, { destination, radius: Number(radius) });
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

      const { destination, radius } = userAlarm;
      const [currentLat, currentLon] = currentLocation.split(',').map(Number);
      
      const distance = calculateDistance(
        currentLat, currentLon,
        destination.latitude, destination.longitude
      );

      const hasNotification = distance <= radius;

      res.status(200).json({
        hasNotification,
        title: hasNotification ? "OpenTravel Destination Alert" : "",
        message: hasNotification ? `You are within ${radius} meters of your destination!` : ""
      });
    } else {
      res.setHeader('Allow', ['GET', 'POST']);
      res.status(405).end(`Method ${method} Not Allowed`);
    }
  } catch (error) {
    console.error('Error in check-notifications handler:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
