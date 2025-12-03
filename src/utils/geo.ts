import axios from "axios";
// returns distance in kilometers
export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (v: number) => (v * Math.PI) / 180;
    const R = 6371; // Earth radius km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
  
export async function reverseGeocode(lat: number, lng: number) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;

    const resp = await axios.get(url, {
      timeout: 5000,
      headers: {
        "User-Agent": "Alraie-Geofence-Backend"
      }
    });

    const data = resp.data;

    return {
      address: data.display_name || null,
      city: data.address?.city || data.address?.town || data.address?.village || null,
      country: data.address?.country || null
    };
  } catch (err) {
    console.error("Reverse geocode failed", err);
    return {
      address: null,
      city: null,
      country: null,
    };
  }
  }
  