const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Padding in degrees around a lon/lat for FIRMS area queries. */
export function padBbox(lon: number, lat: number, padDeg: number) {
  return {
    west: clamp(lon - padDeg, -180, 180),
    south: clamp(lat - padDeg, -90, 90),
    east: clamp(lon + padDeg, -180, 180),
    north: clamp(lat + padDeg, -90, 90),
  };
}

export const WORLD_BBOX = {
  west: -180,
  south: -90,
  east: 180,
  north: 90,
} as const;

/**
 * Lower 48 + southern Canada border / northern Mexico slice used by FIRMS “area”.
 * Alaska, Hawaii, and territories are outside this box (separate queries if needed).
 */
export const CONTINENTAL_US_BBOX = {
  west: -124.9,
  south: 24.2,
  east: -66.9,
  north: 49.5,
} as const;

export function buildContinentalUsFirmsApiUrl(opts?: {
  days?: number;
  maxPoints?: number;
  source?: string;
  /** `YYYY-MM-DD` — passed to `/api/firms` → NASA Area API (omit for “most recent”). */
  date?: string | null;
}): string {
  return buildFirmsApiUrl({
    ...CONTINENTAL_US_BBOX,
    days: opts?.days ?? 2,
    maxPoints: opts?.maxPoints ?? 22_000,
    source: opts?.source,
    date: opts?.date,
  });
}

/** NASA Area API uses `world` for full-globe queries (see `/api/firms` route). */
export function buildGlobalFirmsApiUrl(opts?: {
  days?: number;
  maxPoints?: number;
  source?: string;
  date?: string | null;
}): string {
  return buildFirmsApiUrl({
    ...WORLD_BBOX,
    days: opts?.days ?? 1,
    maxPoints: opts?.maxPoints ?? 15_000,
    source: opts?.source,
    date: opts?.date,
  });
}

export type FirmsApiQuery = {
  west: number;
  south: number;
  east: number;
  north: number;
  days?: number;
  source?: string;
  maxPoints?: number;
  /** NASA start date `YYYY-MM-DD`; omitted when null/undefined/invalid. */
  date?: string | null;
};

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function buildFirmsApiUrl(opts: FirmsApiQuery): string {
  const sp = new URLSearchParams();
  sp.set("west", String(opts.west));
  sp.set("south", String(opts.south));
  sp.set("east", String(opts.east));
  sp.set("north", String(opts.north));
  const days =
    opts.days == null ? 2 : Math.min(5, Math.max(1, Math.round(opts.days)));
  sp.set("days", String(days));
  if (opts.source) sp.set("source", opts.source);
  if (opts.maxPoints != null)
    sp.set("maxPoints", String(Math.max(1, Math.round(opts.maxPoints))));
  const d = opts.date?.trim();
  if (d && YMD_RE.test(d)) sp.set("date", d);
  return `/api/firms?${sp.toString()}`;
}

/** FIRMS query options shared by static URLs and viewport-driven map refreshes. */
export type FirmsLayerTimeline = {
  date: string | null;
  source?: string;
  days: number;
  maxPoints: number;
  /** When zoomed out, match the map shell preset (global vs CONUS). */
  layerPreset: "global" | "conus";
};

/**
 * Build `/api/firms` URL for the map’s current view. Uses CONUS/global presets when
 * zoomed out so NASA area requests stay within API-friendly boxes.
 */
export function buildFirmsUrlForViewport(
  bounds: { west: number; south: number; east: number; north: number },
  zoom: number,
  tl: FirmsLayerTimeline,
): string {
  let { west, south, east, north } = bounds;
  if (west > east) [west, east] = [east, west];
  if (south > north) [south, north] = [north, south];

  const lonSpan = east - west;
  const latSpan = north - south;

  const wideView = zoom <= 2.35 || lonSpan > 95 || latSpan > 52;

  if (wideView) {
    if (tl.layerPreset === "global") {
      return buildGlobalFirmsApiUrl({
        days: tl.days,
        maxPoints: tl.maxPoints,
        date: tl.date,
        source: tl.source,
      });
    }
    return buildContinentalUsFirmsApiUrl({
      days: tl.days,
      maxPoints: tl.maxPoints,
      date: tl.date,
      source: tl.source,
    });
  }

  /** Large pad so one response covers nearby pans; map clips client-side for instant motion. */
  const padLon = Math.max(0.55, lonSpan * 0.42);
  const padLat = Math.max(0.45, latSpan * 0.42);

  return buildFirmsApiUrl({
    west: clamp(west - padLon, -180, 180),
    south: clamp(south - padLat, -90, 90),
    east: clamp(east + padLon, -180, 180),
    north: clamp(north + padLat, -90, 90),
    days: tl.days,
    maxPoints: tl.maxPoints,
    date: tl.date,
    source: tl.source,
  });
}
