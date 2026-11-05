const EARTH_RADIUS_M = 6_371_000;

export interface LatLng {
  lat: number;
  lng: number;
}

/** Great-circle distance in metres (haversine). */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface Zone extends LatLng {
  id: string;
  kind: 'site' | 'home';
  radiusM: number;
}

export interface PlaceResult {
  place: 'site' | 'home' | 'outside';
  zoneId: string | null;
  /** Distance to the nearest zone, rounded to whole metres. Null when there are no zones. */
  distanceM: number | null;
}

/** Nearest zone the point is inside of; otherwise `outside` with the distance to the nearest zone. */
export function resolvePlace(point: LatLng, zones: readonly Zone[]): PlaceResult {
  let nearestInside: { zone: Zone; d: number } | null = null;
  let nearestAny: number | null = null;
  for (const zone of zones) {
    const d = haversineMeters(point, zone);
    if (nearestAny === null || d < nearestAny) nearestAny = d;
    if (d <= zone.radiusM && (nearestInside === null || d < nearestInside.d)) {
      nearestInside = { zone, d };
    }
  }
  if (nearestInside) {
    return {
      place: nearestInside.zone.kind,
      zoneId: nearestInside.zone.id,
      distanceM: Math.round(nearestInside.d),
    };
  }
  return { place: 'outside', zoneId: null, distanceM: nearestAny === null ? null : Math.round(nearestAny) };
}
