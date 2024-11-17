let watchId, destination, alarmRadius;

self.onmessage = function(e) {
    if (e.data.type === 'start') {
        destination = e.data.destination;
        alarmRadius = e.data.radius;
        startMonitoring();
    }
};

function startMonitoring() {
    watchId = navigator.geolocation.watchPosition(
        updateLocation,
        error => console.error('Error getting location:', error),
        {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 5000
        }
    );
}

function updateLocation(position) {
    const { latitude, longitude } = position.coords;
    if (destination) {
        const distance = calculateDistance(latitude, longitude, destination[0], destination[1]);
        if (distance <= alarmRadius) {
            self.postMessage({ type: 'alarm' });
        }
    }
}

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