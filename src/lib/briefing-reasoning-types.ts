import type { SafetyLevel } from "@/lib/briefing-presets";

const SAFETY_LEVELS: SafetyLevel[] = ["LOW", "MODERATE", "HIGH", "EXTREME"];

function isSafetyLevel(v: unknown): v is SafetyLevel {
  return typeof v === "string" && SAFETY_LEVELS.includes(v as SafetyLevel);
}

export type BriefingReasoningRequest = {
  displayName: string;
  lat: number;
  lon: number;
  safeZoneName: string;
  safeLon: number;
  safeLat: number;
  weather: {
    tempF: number;
    windMph: number;
    windFromTo: string;
    smokeLevel: string;
  };
  safety: SafetyLevel;
  nearestFireName: string | null;
  nearestFireMiles: number | null;
  smokeSummary: string;
  etaMin: number | null;
  /** Demo route labels (same as cyan map polyline) for AI narrative only. */
  demoRouteSummary: string;
  demoRouteSteps: string[];
};

/** Consumer-style safety brief from Claude (plain sentences OK). */
export type SafetyBriefResponse = {
  risk: SafetyLevel;
  situation: string;
  reasoning: string;
  whatThisMeans: string;
  recommendedActions: string[];
};

export function parseBriefingReasoningRequest(
  body: unknown,
): BriefingReasoningRequest | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const w = b.weather;
  if (!w || typeof w !== "object") return null;
  const wx = w as Record<string, unknown>;
  if (typeof b.displayName !== "string") return null;
  if (typeof b.lat !== "number" || !Number.isFinite(b.lat)) return null;
  if (typeof b.lon !== "number" || !Number.isFinite(b.lon)) return null;
  if (typeof b.safeZoneName !== "string") return null;
  if (typeof b.safeLon !== "number" || !Number.isFinite(b.safeLon)) return null;
  if (typeof b.safeLat !== "number" || !Number.isFinite(b.safeLat)) return null;
  if (typeof wx.tempF !== "number" || !Number.isFinite(wx.tempF)) return null;
  if (typeof wx.windMph !== "number" || !Number.isFinite(wx.windMph)) return null;
  if (typeof wx.windFromTo !== "string") return null;
  if (typeof wx.smokeLevel !== "string") return null;
  if (!isSafetyLevel(b.safety)) return null;
  if (b.nearestFireName != null && typeof b.nearestFireName !== "string")
    return null;
  if (
    b.nearestFireMiles != null &&
    (typeof b.nearestFireMiles !== "number" ||
      !Number.isFinite(b.nearestFireMiles))
  )
    return null;
  if (typeof b.smokeSummary !== "string") return null;
  if (
    b.etaMin != null &&
    (typeof b.etaMin !== "number" || !Number.isFinite(b.etaMin))
  )
    return null;
  if (typeof b.demoRouteSummary !== "string") return null;
  if (!Array.isArray(b.demoRouteSteps)) return null;
  if (!b.demoRouteSteps.every((x) => typeof x === "string")) return null;

  return {
    displayName: b.displayName,
    lat: b.lat,
    lon: b.lon,
    safeZoneName: b.safeZoneName,
    safeLon: b.safeLon,
    safeLat: b.safeLat,
    weather: {
      tempF: Math.round(wx.tempF),
      windMph: Math.round(wx.windMph),
      windFromTo: wx.windFromTo,
      smokeLevel: wx.smokeLevel,
    },
    safety: b.safety,
    nearestFireName: b.nearestFireName ?? null,
    nearestFireMiles: b.nearestFireMiles ?? null,
    smokeSummary: b.smokeSummary,
    etaMin: b.etaMin ?? null,
    demoRouteSummary: b.demoRouteSummary,
    demoRouteSteps: b.demoRouteSteps as string[],
  };
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function parseModelRisk(v: unknown): SafetyLevel | null {
  if (typeof v !== "string") return null;
  const u = v.trim().toUpperCase();
  return isSafetyLevel(u) ? u : null;
}

export function parseSafetyBriefResponse(
  raw: unknown,
): SafetyBriefResponse | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const risk = parseModelRisk(o.risk);
  if (!risk) return null;
  if (typeof o.situation !== "string") return null;
  if (typeof o.reasoning !== "string") return null;
  if (typeof o.whatThisMeans !== "string") return null;
  if (!isStringArray(o.recommendedActions)) return null;
  if (o.recommendedActions.length < 2) return null;
  return {
    risk,
    situation: o.situation.trim(),
    reasoning: o.reasoning.trim(),
    whatThisMeans: o.whatThisMeans.trim(),
    recommendedActions: o.recommendedActions.map((s) => s.trim()),
  };
}
