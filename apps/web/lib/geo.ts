import type { ErrorCode } from '@app/shared';

export interface Fix {
  lat: number;
  lng: number;
  accuracyM: number;
}

/** One-off location read, only at clock-in and clock-out. Never watches in the background. */
export function getFix(): Promise<Fix> {
  return new Promise((resolve, reject: (code: ErrorCode) => void) => {
    if (!('geolocation' in navigator)) return reject('LOCATION_DENIED');
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy }),
      (err) => reject(err.code === err.PERMISSION_DENIED ? 'LOCATION_DENIED' : 'GPS_WEAK'),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}
