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

type GeocodeHit = { lat: number; lon: number; displayName: string };

/** Accepts `34.05, -118.71` or `34.05 -118.71` so users can bypass geocoder outages. */
function parseLatLonQuery(q: string): GeocodeHit | null {
  const t = q.trim();
  const m = t.match(
    /^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/,
  );
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return {
    lat,
    lon,
    displayName: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
  };
}

/**
 * Primary: OSM Nominatim (best addresses). Often rate-limited or 503 on the public instance.
 * Optional `NOMINATIM_EMAIL` in `.env.local` (see `env.example`) for fair-use policy contact.
 */
async function geocodeNominatim(q: string): Promise<GeocodeHit | null> {
  const nomUrl = new URL("https://nominatim.openstreetmap.org/search");
  nomUrl.searchParams.set("q", q);
  nomUrl.searchParams.set("format", "json");
  nomUrl.searchParams.set("limit", "1");
  const email = process.env.NOMINATIM_EMAIL?.trim();
  if (email) nomUrl.searchParams.set("email", email);

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
    return null;
  }
  if (!nomRes.ok) return null;

  const results: unknown = await nomRes.json();
  if (!Array.isArray(results) || results.length === 0) return null;

  const r0 = results[0] as Record<string, unknown>;
  const lat = Number(r0.lat);
  const lon = Number(r0.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return {
    lat,
    lon,
    displayName: String(r0.display_name ?? q),
  };
}

/** Open-Meteo returns no `results` for comma-heavy strings like "Cincinnati, OH" — needs city + countryCode. */
async function searchOpenMeteoOnce(
  name: string,
  countryCode?: string,
): Promise<GeocodeHit | null> {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", name);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  if (countryCode) url.searchParams.set("countryCode", countryCode);

  let res: Response;
  try {
    res = await fetch(url.toString(), { cache: "no-store" });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const data = (await res.json()) as {
    results?: Array<{
      name: string;
      latitude: number;
      longitude: number;
      admin1?: string;
      country?: string;
    }>;
  };
  const r = data.results?.[0];
  if (
    !r ||
    typeof r.latitude !== "number" ||
    typeof r.longitude !== "number" ||
    !Number.isFinite(r.latitude) ||
    !Number.isFinite(r.longitude)
  ) {
    return null;
  }

  const parts = [r.name, r.admin1, r.country].filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );
  const displayName = parts.length > 0 ? parts.join(", ") : name;

  return { lat: r.latitude, lon: r.longitude, displayName };
}

/**
 * Retry variants for Open-Meteo. US: "City, ST" / "…, Malibu, CA" → segment before 2-letter state + countryCode=US.
 */
function openMeteoSearchAttempts(q: string): Array<{ name: string; countryCode?: string }> {
  const trimmed = q.trim();
  const seen = new Set<string>();
  const out: Array<{ name: string; countryCode?: string }> = [];

  const add = (name: string, countryCode?: string) => {
    const key = `${name}|${countryCode ?? ""}`;
    if (seen.has(key) || name.length < 2) return;
    seen.add(key);
    out.push({ name, countryCode });
  };

  add(trimmed);

  const segments = trimmed.split(",").map((s) => s.trim());
  if (segments.length >= 2) {
    const last = segments[segments.length - 1]!;
    if (/^[A-Z]{2}$/i.test(last)) {
      const place = segments[segments.length - 2]!;
      if (place) add(place, "US");
    }
  }

  if (segments.length >= 2) {
    add(segments[0]!);
  }

  return out;
}

/** Fallback: Open-Meteo geocoding (no key; used when Nominatim fails). */
async function geocodeOpenMeteo(q: string): Promise<GeocodeHit | null> {
  for (const att of openMeteoSearchAttempts(q)) {
    const hit = await searchOpenMeteoOnce(att.name, att.countryCode);
    if (hit) return hit;
  }
  return null;
}

type WeatherSnapshot = {
  tempF: number;
  windMph: number;
  windFromTo: string;
  smokeLevel: string;
};

async function fetchOpenWeatherMap(
  lat: number,
  lon: number,
  apiKey: string,
): Promise<WeatherSnapshot | null> {
  const url = new URL("https://api.openweathermap.org/data/2.5/weather");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("appid", apiKey);
  url.searchParams.set("units", "imperial");

  let res: Response;
  try {
    res = await fetch(url.toString(), { cache: "no-store" });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const data = (await res.json()) as {
    main?: { temp?: number };
    wind?: { speed?: number; deg?: number };
  };

  if (typeof data.main?.temp !== "number") return null;

  const tempF = Math.round(data.main.temp);
  const windMph =
    typeof data.wind?.speed === "number" ? Math.round(data.wind.speed) : 0;
  const deg = data.wind?.deg;
  const rose = degreesToWindRose(deg);
  const windFromTo =
    windMph <= 1
      ? "Calm"
      : typeof deg === "number"
        ? `${rose} (${Math.round(deg)}°)`
        : rose;

  return {
    tempF,
    windMph,
    windFromTo,
    smokeLevel:
      "OpenWeatherMap at this pin; smoke row still blends nearest hotspot distance.",
  };
}

async function fetchOpenMeteo(lat: number, lon: number): Promise<WeatherSnapshot | null> {
  const wxUrl = new URL("https://api.open-meteo.com/v1/forecast");
  wxUrl.searchParams.set("latitude", String(lat));
  wxUrl.searchParams.set("longitude", String(lon));
  wxUrl.searchParams.set(
    "current",
    "temperature_2m,wind_speed_10m,wind_direction_10m",
  );
  wxUrl.searchParams.set("wind_speed_unit", "mph");
  wxUrl.searchParams.set("temperature_unit", "fahrenheit");

  let wxRes: Response;
  try {
    wxRes = await fetch(wxUrl.toString(), { cache: "no-store" });
  } catch {
    return null;
  }
  if (!wxRes.ok) return null;

  const wx = (await wxRes.json()) as {
    current?: {
      temperature_2m?: number;
      wind_speed_10m?: number;
      wind_direction_10m?: number;
    };
  };
  const c = wx.current;
  if (!c || typeof c.temperature_2m !== "number") return null;

  const tempF = Math.round(c.temperature_2m);
  const windMph =
    typeof c.wind_speed_10m === "number" ? Math.round(c.wind_speed_10m) : 0;
  const rose = degreesToWindRose(c.wind_direction_10m);
  const windFromTo =
    windMph <= 1
      ? "Calm"
      : `${rose} (${Math.round(c.wind_direction_10m ?? 0)}°)`;

  return {
    tempF,
    windMph,
    windFromTo,
    smokeLevel:
      "Open-Meteo at this pin; smoke row still blends nearest hotspot distance.",
  };
}

async function resolveWeather(
  lat: number,
  lon: number,
): Promise<WeatherSnapshot> {
  const apiKey = process.env.WEATHER_API_KEY?.trim();
  if (apiKey) {
    const owm = await fetchOpenWeatherMap(lat, lon, apiKey);
    if (owm) return owm;
  }
  const meteo = await fetchOpenMeteo(lat, lon);
  if (meteo) return meteo;

  return {
    tempF: 72,
    windMph: 6,
    windFromTo: "Calm / variable",
    smokeLevel:
      "Weather unavailable — using placeholders; smoke row blends nearest hotspot distance.",
  };
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q || q.length < 3) {
    return NextResponse.json(
      { error: "Enter at least 3 characters to search." },
      { status: 400 },
    );
  }

  let hit = parseLatLonQuery(q);
  if (!hit) hit = await geocodeNominatim(q);
  if (!hit) hit = await geocodeOpenMeteo(q);

  if (!hit) {
    return NextResponse.json(
      {
        error:
          "Could not resolve that location. Try again, shorten the query, or paste lat,lon.",
      },
      { status: 502 },
    );
  }

  const { lat, lon, displayName } = hit;

  const weather = await resolveWeather(lat, lon);

  const { safeLon, safeLat, safeZoneName } = suggestSafePoint(lon, lat);

  const body: LocationContextResponse = {
    displayName,
    lat,
    lon,
    weather: {
      tempF: weather.tempF,
      windMph: weather.windMph,
      windFromTo: weather.windFromTo,
      smokeLevel: weather.smokeLevel,
    },
    safeZoneName,
    safeLon,
    safeLat,
  };

  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
  });
}
