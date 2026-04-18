import { NextResponse } from "next/server";
import { parseFirmsAreaCsv } from "@/lib/firms-csv";

export const runtime = "nodejs";

const FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";

const ALLOWED_SOURCES = new Set([
  "VIIRS_SNPP_NRT",
  "VIIRS_SNPP_SP",
  "VIIRS_NOAA20_NRT",
  "VIIRS_NOAA20_SP",
  "VIIRS_NOAA21_NRT",
  "MODIS_NRT",
  "MODIS_SP",
  "LANDSAT_NRT",
]);

function parseNumber(v: string | null, fallback: number): number {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(req: Request) {
  const mapKey = process.env.NASA_FIRMS_MAP_KEY?.trim();
  if (!mapKey) {
    return NextResponse.json(
      { error: "NASA_FIRMS_MAP_KEY is not set in the server environment." },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(req.url);
  const west = parseNumber(searchParams.get("west"), -180);
  const south = parseNumber(searchParams.get("south"), -90);
  const east = parseNumber(searchParams.get("east"), 180);
  const north = parseNumber(searchParams.get("north"), 90);
  const days = Math.min(
    5,
    Math.max(1, Math.round(parseNumber(searchParams.get("days"), 2))),
  );
  const maxPoints = Math.min(
    50_000,
    Math.max(1, Math.round(parseNumber(searchParams.get("maxPoints"), 12_000))),
  );

  const rawSource = searchParams.get("source")?.trim() ?? "VIIRS_SNPP_NRT";
  const source = ALLOWED_SOURCES.has(rawSource) ? rawSource : "VIIRS_SNPP_NRT";

  const date = searchParams.get("date")?.trim();
  const dateOk = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;

  let w = west;
  let s = south;
  let e = east;
  let n = north;
  if (w > e) [w, e] = [e, w];
  if (s > n) [s, n] = [n, s];

  const area =
    w <= -179.9 &&
    s <= -89.9 &&
    e >= 179.9 &&
    n >= 89.9
      ? "world"
      : `${w},${s},${e},${n}`;

  const pathSegs = [
    encodeURIComponent(mapKey),
    source,
    area,
    String(days),
    ...(dateOk ? [dateOk] : []),
  ];
  const firmsUrl = `${FIRMS_BASE}/${pathSegs.join("/")}`;

  let text: string;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 90_000);
    const res = await fetch(firmsUrl, {
      signal: ac.signal,
      headers: { Accept: "text/csv,*/*" },
      cache: "no-store",
    });
    clearTimeout(t);
    if (!res.ok) {
      return NextResponse.json(
        {
          error: `FIRMS request failed (${res.status}). Try a smaller bounding box or fewer days.`,
        },
        { status: 502 },
      );
    }
    text = await res.text();
  } catch {
    return NextResponse.json(
      {
        error:
          "Could not reach NASA FIRMS (timeout or network). Try a smaller area.",
      },
      { status: 504 },
    );
  }

  if (text.includes("Error in processing") || text.includes("<html")) {
    return NextResponse.json(
      {
        error:
          "FIRMS returned an error page. Check MAP_KEY, source, bbox, and day range.",
      },
      { status: 502 },
    );
  }

  const fc = parseFirmsAreaCsv(text, maxPoints);

  const cacheControl =
    fc.features.length === 0
      ? "no-store"
      : "public, max-age=60, s-maxage=120, stale-while-revalidate=300";

  return NextResponse.json(fc, {
    headers: { "Cache-Control": cacheControl },
  });
}
