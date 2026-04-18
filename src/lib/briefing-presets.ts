export type SafetyLevel = "LOW" | "MODERATE" | "HIGH" | "EXTREME";

export type AddressBriefingAnchor = {
  id: string;
  displayName: string;
  lon: number;
  lat: number;
  /** Demo “safe corridor” label */
  safeZoneName: string;
  /** End of pre-computed evacuation polyline */
  safeLon: number;
  safeLat: number;
  /** Hardcoded local conditions for this anchor */
  weather: {
    tempF: number;
    windMph: number;
    windFromTo: string;
    smokeLevel: string;
  };
};

export const BRIEFING_ANCHORS: AddressBriefingAnchor[] = [
  {
    id: "malibu",
    displayName: "24255 Pacific Coast Hwy, Malibu, CA (demo)",
    lon: -118.7792,
    lat: 34.0361,
    safeZoneName: "US-101 / Ventura safe corridor (demo)",
    safeLon: -119.15,
    safeLat: 34.28,
    weather: {
      tempF: 79,
      windMph: 22,
      windFromTo: "SW → NE",
      smokeLevel: "Unhealthy (sensitive groups)",
    },
  },
  {
    id: "ojai",
    displayName: "120 N Signal St, Ojai, CA (demo)",
    lon: -119.2431,
    lat: 34.448,
    safeZoneName: "CA-33 south / Ventura plain (demo)",
    safeLon: -119.05,
    safeLat: 34.22,
    weather: {
      tempF: 86,
      windMph: 31,
      windFromTo: "ESE → WNW",
      smokeLevel: "Hazardous (near fire complex)",
    },
  },
  {
    id: "default",
    displayName: "Default monitoring point (Central CA demo)",
    lon: -119.45,
    lat: 36.75,
    safeZoneName: "Nearest major highway egress (demo)",
    safeLon: -119.9,
    safeLat: 36.9,
    weather: {
      tempF: 82,
      windMph: 18,
      windFromTo: "NW → SE",
      smokeLevel: "Moderate",
    },
  },
];

/** Naive “geocode”: match keywords to preset; else default anchor. */
export function resolveBriefingAnchor(raw: string): AddressBriefingAnchor {
  const q = raw.trim().toLowerCase();
  if (q.includes("ojai")) {
    return BRIEFING_ANCHORS.find((a) => a.id === "ojai")!;
  }
  if (q.includes("malibu") || q.includes("pacific coast") || q.includes("pch")) {
    return BRIEFING_ANCHORS.find((a) => a.id === "malibu")!;
  }
  return BRIEFING_ANCHORS.find((a) => a.id === "default")!;
}

/** Demo spread rate (mph) toward populated footprint — not a real model. */
const DEMO_SPREAD_MPH = 1.35;

export function estimateFireEtaMinutes(distanceMiles: number): number {
  if (!Number.isFinite(distanceMiles) || distanceMiles <= 0) return 0;
  const hours = distanceMiles / DEMO_SPREAD_MPH;
  return Math.round(Math.min(999, Math.max(20, hours * 60)));
}

export function safetyFromDistanceMiles(miles: number): SafetyLevel {
  if (miles < 6) return "EXTREME";
  if (miles < 15) return "HIGH";
  if (miles < 40) return "MODERATE";
  return "LOW";
}

export function smokeFromSafety(s: SafetyLevel, baseSmoke: string): string {
  if (s === "EXTREME") return "Hazardous — limit all outdoor exposure";
  if (s === "HIGH") return "Very unhealthy — smoke plume proximity";
  if (s === "MODERATE") return baseSmoke;
  return "Good to moderate — stay alert";
}

const HIGH_RISK_ADVICE =
  "Close all windows, turn off AC (to prevent smoke intake), and move patio furniture inside.";

export function propertyAdvice(safety: SafetyLevel): string | null {
  if (safety === "HIGH" || safety === "EXTREME") return HIGH_RISK_ADVICE;
  return null;
}

/** Hardcoded multi-stop “fastest path” narrative + coordinates for map line. */
export function buildDemoEvacuationRoute(
  anchor: AddressBriefingAnchor,
): { waypoints: [number, number][]; summary: string; turnText: string[] } {
  const { lon, lat, safeLon, safeLat, safeZoneName } = anchor;
  const midLon = (lon + safeLon) / 2 + 0.04;
  const midLat = (lat + safeLat) / 2 - 0.02;
  const waypoints: [number, number][] = [
    [lon, lat],
    [midLon, midLat],
    [safeLon, safeLat],
  ];
  const summary = `Pre-calculated fastest egress (demo routing API): ${anchor.displayName.split("(")[0].trim()} → ${safeZoneName}. Obey local orders if they differ.`;
  const turnText = [
    "Head toward primary arterial away from plume axis (demo vector).",
    "Use middle waypoint to avoid modeled congestion pocket (hardcoded).",
    `Join ${safeZoneName} — remain in vehicle if smoke is thick.`,
  ];
  return { waypoints, summary, turnText };
}
