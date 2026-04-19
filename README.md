# Fire map — briefing & thermal layer

A single-page **wildfire awareness demo**: full-screen [MapLibre](https://maplibre.org/) map, a tactical HUD, live clock, address search, NASA FIRMS thermal hotspots, weather context, and a short AI-generated briefing. **Not** an official emergency service, evacuation authority, or replacement for 911 or public alerts.

## Features

- **Thermal layer** — VIIRS/MODIS (and related) hotspots via NASA FIRMS, proxied by the app (`/api/firms`).
- **Location context** — Geocoding with OpenStreetMap [Nominatim](https://nominatim.org/) (`/api/location-context`). Weather from OpenWeatherMap when configured, otherwise [Open-Meteo](https://open-meteo.com/), then safe placeholders.
- **Briefing** — Compact JSON briefing from Anthropic (`/api/briefing-reasoning`) using only facts already shown in the UI (demo / hackathon-style assistant in code).
- **Demo routing** — Illustrative evacuation path and ETA from preset logic in the client, not real turn-by-turn routing.

## Stack

- [Next.js](https://nextjs.org/) 16 (App Router), React 19, TypeScript
- [Tailwind CSS](https://tailwindcss.com/) 4
- [MapLibre GL](https://maplibre.org/)
- [Anthropic SDK](https://docs.anthropic.com/) for the briefing route

## Prerequisites

- Node.js 20+ (LTS recommended)
- npm (or your preferred package manager)

## Setup

```bash
npm install
```

Create **`.env.local`** in this directory (it is gitignored). Set:

| Variable | Required | Purpose |
|----------|----------|---------|
| `NASA_FIRMS_MAP_KEY` | Yes, for the fire layer | [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) API map key |
| `ANTHROPIC_API_KEY` | Yes, for AI briefing | Anthropic API key |
| `ANTHROPIC_MODEL` | No | Overrides the default model in code |
| `WEATHER_API_KEY` | No | [OpenWeatherMap](https://openweathermap.org/api) key; if unset, Open-Meteo or placeholders are used |

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Run production server |
| `npm run lint` | ESLint |

## Deploy

Compatible with [Vercel](https://vercel.com/) and other Node hosts. Set the same environment variables in the host dashboard. See [Next.js deployment](https://nextjs.org/docs/app/building-your-application/deploying).

## License & data

Map tiles, geocoding, FIRMS, and weather APIs are subject to their providers’ terms. Respect [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) (the app sends an identifying User-Agent).
