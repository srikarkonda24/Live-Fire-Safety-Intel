import type { AddressBriefingAnchor } from "@/lib/briefing-presets";

export type LocationContextResponse = {
  displayName: string;
  lat: number;
  lon: number;
  weather: AddressBriefingAnchor["weather"];
  safeZoneName: string;
  safeLon: number;
  safeLat: number;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export function locationContextToAnchor(
  ctx: LocationContextResponse,
): AddressBriefingAnchor {
  return {
    id: "geocoded",
    displayName: ctx.displayName,
    lon: ctx.lon,
    lat: ctx.lat,
    safeZoneName: ctx.safeZoneName,
    safeLon: ctx.safeLon,
    safeLat: ctx.safeLat,
    weather: ctx.weather,
  };
}

/** Rough “rally” point offset from resolved coordinates (not real routing). */
export function suggestSafePoint(lon: number, lat: number) {
  const dLon = 0.18;
  const dLat = 0.14;
  return {
    safeLon: clamp(lon + dLon, -180, 180),
    safeLat: clamp(lat + dLat, -85, 85),
    safeZoneName:
      "Auto offset rally point — verify with local evacuation orders and maps.",
  };
}

export function degreesToWindRose(deg: number | undefined): string {
  if (deg == null || !Number.isFinite(deg)) return "?";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const i = ((Math.round(deg / 45) % 8) + 8) % 8;
  return dirs[i]!;
}
