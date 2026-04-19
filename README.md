# Live Fire Safety Intel

**Satellite-informed wildfire intelligence on a single map.**

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![MapLibre](https://img.shields.io/badge/MapLibre-GL-4264fb?logo=maplibre&logoColor=white)](https://maplibre.org/)
[![NASA FIRMS](https://img.shields.io/badge/Data-NASA%20FIRMS-E03C31?logo=nasa&logoColor=white)](https://firms.modaps.eosdis.nasa.gov/)

---

## The Problem & Solution (the “why”)

**Problem:** Fire teams and analysts juggle disconnected tools—satellite feeds, maps, weather tabs, and written summaries—while minutes matter.

**Solution:** One workspace that **pulls NASA FIRMS thermal detections** (VIIRS / MODIS-class instruments on polar-orbiting satellites, delivered as NRT hotspot products), **anchors them to any address or coordinates**, layers **local weather**, and optionally turns on-screen facts into a **structured AI briefing**—so decision-makers see **global detections, local context, and narrative** together.

Use this **with** official incident systems and public alerting; it does not replace 911, authorized evacuation orders, or your command-and-control stack.

---

## Key Features

| Feature | What it delivers |
|--------|------------------|
| **Global thermal layer** | World map of FIRMS-derived hotspots as GeoJSON on [MapLibre](https://maplibre.org/); confidence drives styling. Loads once per session for a stable layer while you pan and zoom. |
| **NASA FIRMS proxy** | Server-side `GET /api/firms`: NASA map key stays off the client; CSV from the [FIRMS area API](https://firms.modaps.eosdis.nasa.gov/) is parsed to GeoJSON; short in-memory cache and request coalescing reduce repeat latency. |
| **Location & weather** | `GET /api/location-context`: geocode via Nominatim (Open-Meteo fallback patterns); current conditions via OpenWeatherMap (optional key) or Open-Meteo. |
| **Intel / Met HUD** | Tactical panels: gauges, risk framing, nearest-detection distance (regional FIRMS sample), live clock. |
| **AI briefing** | `POST /api/briefing-reasoning`: Anthropic model receives **only** validated facts from the UI; returns strict JSON (`risk`, `situation`, `reasoning`, `whatThisMeans`, `recommendedActions`). |
| **Planning overlay** | Illustrative multi-point route and time-style estimates from app rules—not turn-by-turn or a physical spread model. |

**Data reality:** Hotspots are **thermal anomalies** (wildfire, industry, burns, etc.), **orbit- and time-window dependent**—a snapshot, not a certified fire perimeter.

---

## Technical Stack

| Layer | Technology |
|-------|------------|
| **Runtime / framework** | Node.js; **Next.js 16** (App Router); **React 19**; **TypeScript** |
| **UI** | **Tailwind CSS 4** |
| **Map** | **maplibre-gl** — raster basemap (e.g. CARTO/OSM); GeoJSON fire source |
| **AI** | **@anthropic-ai/sdk** |
| **Integrations** | [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/); OpenStreetMap / Nominatim; Open-Meteo; optional OpenWeatherMap |

---

## Getting started

**Prerequisites:** Node.js 20+; npm.

```bash
npm install
```

Create **`.env.local`** (see [`env.example`](env.example)):

| Variable | Required | Purpose |
|----------|----------|---------|
| `NASA_FIRMS_MAP_KEY` | Yes (live layer) | [FIRMS](https://firms.modaps.eosdis.nasa.gov/) map key — server only |
| `ANTHROPIC_API_KEY` | Yes (briefing) | Anthropic API |
| `ANTHROPIC_MODEL` | No | Override default model in `src/app/api/briefing-reasoning/route.ts` |
| `WEATHER_API_KEY` | No | OpenWeatherMap; else Open-Meteo / fallbacks |
| `NOMINATIM_EMAIL` | No | [Nominatim fair-use](https://operations.osmfoundation.org/policies/nominatim/) contact at scale |

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Production server |
| `npm run lint` | ESLint |

**Deploy:** Vercel, containers, or any Node host — set the same env vars. See [Next.js deployment](https://nextjs.org/docs/app/building-your-application/deploying). In-memory FIRMS caching is per instance; serverless cold starts may pay full NASA latency on first request after idle.

**Architecture (high level):** Browser → `GET /api/firms` → NASA FIRMS CSV → GeoJSON map layer; browser → `GET /api/location-context` → geocode + weather; browser → `POST /api/briefing-reasoning` → Anthropic.

**Repository highlights:** `src/components/crisis-map-shell.tsx` (shell, regional FIRMS for analytics), `src/components/fires-only-map.tsx` (map + global FIRMS), `src/app/api/firms/route.ts`, `src/app/api/location-context/route.ts`, `src/app/api/briefing-reasoning/route.ts`.

**Compliance:** Map tiles, geocoding, FIRMS, and weather APIs are subject to provider terms. Nominatim requests use an identifying `User-Agent` per OSMF policy.
