import { NextResponse } from "next/server";
import {
  degreesToWindRose,
  suggestSafePoint,
  type LocationContextResponse,
} from "@/lib/location-context-types";

export const runtime = "nodejs";

/** Nominatim requires a valid identifying User-Agent (https://operations.osmfoundation.org/policies/nominatim/). */
const NOMINATIM_UA =
  "ForestFireIntel/1.0 (local crisis map demo; contact via project maintainer)";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q || q.length < 3) {
    return NextResponse.json(
      { error: "Enter at least 3 characters to search." },
      { status: 400 },
    );
  }

  const nomUrl = new URL("https://nominatim.openstreetmap.org/search");
  nomUrl.searchParams.set("q", q);
  nomUrl.searchParams.set("format", "json");
  nomUrl.searchParams.set("limit", "1");

  let nomRes: Response;
  try {
    nomRes = await fetch(nomUrl.toString(), {
      headers: {
        "User-Agent": NOMINATIM_UA,
        "Accept-Language": "en",
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: "Could not reach geocoder (network)." },
      { status: 502 },
    );
  }

  if (!nomRes.ok) {
    return NextResponse.json(
      { error: "Geocoder service error. Try again in a moment." },
      { status: 502 },
    );
  }

  const results: unknown = await nomRes.json();
  if (!Array.isArray(results) || results.length === 0) {
    return NextResponse.json(
      { error: "No location found for that search." },
      { status: 404 },
    );
  }

  const r0 = results[0] as Record<string, unknown>;
  const lat = Number(r0.lat);
  const lon = Number(r0.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      { error: "Geocoder returned invalid coordinates." },
      { status: 502 },
    );
  }

  const displayName = String(r0.display_name ?? q);

  const wxUrl = new URL("https://api.open-meteo.com/v1/forecast");
  wxUrl.searchParams.set("latitude", String(lat));
  wxUrl.searchParams.set("longitude", String(lon));
  wxUrl.searchParams.set(
    "current",
    "temperature_2m,wind_speed_10m,wind_direction_10m",
  );
  wxUrl.searchParams.set("wind_speed_unit", "mph");
  wxUrl.searchParams.set("temperature_unit", "fahrenheit");

  let tempF = 72;
  let windMph = 6;
  let windFromTo = "Calm / variable";

  try {
    const wxRes = await fetch(wxUrl.toString(), { cache: "no-store" });
    if (wxRes.ok) {
      const wx = (await wxRes.json()) as {
        current?: {
          temperature_2m?: number;
          wind_speed_10m?: number;
          wind_direction_10m?: number;
        };
      };
      const c = wx.current;
      if (c) {
        if (typeof c.temperature_2m === "number")
          tempF = Math.round(c.temperature_2m);
        if (typeof c.wind_speed_10m === "number")
          windMph = Math.round(c.wind_speed_10m);
        const rose = degreesToWindRose(c.wind_direction_10m);
        windFromTo =
          windMph <= 1
            ? "Calm"
            : `${rose} (${Math.round(c.wind_direction_10m ?? 0)}°)`;
      }
    }
  } catch {
    /* keep defaults */
  }

  const { safeLon, safeLat, safeZoneName } = suggestSafePoint(lon, lat);

  const body: LocationContextResponse = {
    displayName,
    lat,
    lon,
    weather: {
      tempF,
      windMph,
      windFromTo,
      smokeLevel:
        "Open-Meteo at this pin; smoke row below still blends nearest hotspot distance.",
    },
    safeZoneName,
    safeLon,
    safeLat,
  };

  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
  });
}
