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
