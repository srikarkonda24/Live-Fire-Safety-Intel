/** Earth radius in miles */
const R_MI = 3958.7613;

export function haversineMiles(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R_MI * c;
}

export type FirePoint = {
  lon: number;
  lat: number;
  name: string;
};

export function nearestFireMiles(
  userLon: number,
  userLat: number,
  fires: FirePoint[],
): { miles: number; name: string; lon: number; lat: number } | null {
  if (!fires.length) return null;
  let best = Infinity;
  let bestF = fires[0]!;
  for (const f of fires) {
    const d = haversineMiles(userLon, userLat, f.lon, f.lat);
    if (d < best) {
      best = d;
      bestF = f;
    }
  }
  return { miles: best, name: bestF.name, lon: bestF.lon, lat: bestF.lat };
}
