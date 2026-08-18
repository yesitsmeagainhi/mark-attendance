const EARTH_RADIUS_METERS = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Distance in meters between two lat/lng points (Haversine formula). */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/** Default geo-fence radius in meters (used as fallback). */
export const GEO_FENCE_RADIUS_METERS = 200;

/**
 * Find the nearest branch within its configured geo-fence radius.
 * Each branch can have its own radius; defaults to 200m if not set.
 * Returns the branch info + distance, or null if none are within range.
 */
export function findNearestBranch(
  empLat: number,
  empLon: number,
  branchList: Array<{ id: string; name: string; latitude: string; longitude: string; radius: number }>,
): { id: string; name: string; distance: number } | null {
  let nearest: { id: string; name: string; distance: number } | null = null;

  for (const branch of branchList) {
    const brLat = parseFloat(branch.latitude);
    const brLon = parseFloat(branch.longitude);
    if (isNaN(brLat) || isNaN(brLon)) continue;

    const branchRadius = branch.radius || GEO_FENCE_RADIUS_METERS;
    const distance = haversineDistance(empLat, empLon, brLat, brLon);
    if (distance <= branchRadius) {
      if (!nearest || distance < nearest.distance) {
        nearest = { id: branch.id, name: branch.name, distance };
      }
    }
  }

  return nearest;
}
