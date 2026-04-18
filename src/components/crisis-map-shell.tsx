"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FiresOnlyMap } from "@/components/fires-only-map";
import { LiveTimestamp } from "@/components/live-timestamp";
import {
  buildDemoEvacuationRoute,
  estimateFireEtaMinutes,
  propertyAdvice,
  resolveBriefingAnchor,
  smokeFromSafety,
  safetyFromDistanceMiles,
  type AddressBriefingAnchor,
  type SafetyLevel,
} from "@/lib/briefing-presets";
import {
  locationContextToAnchor,
  type LocationContextResponse,
} from "@/lib/location-context-types";
import {
  buildContinentalUsFirmsApiUrl,
  buildFirmsApiUrl,
  buildGlobalFirmsApiUrl,
  padBbox,
} from "@/lib/firms-url";
import {
  ARCHIVE_YMD_MIN,
  defaultArchiveJumpYmd,
  firmsDateFromTacticalHours,
  formatLocalDateTimeFromHoursOffset,
  hoursFromTacticalSliderPosition,
  normalizeArchiveYmd,
  tacticalSliderPositionFromHours,
  TACTICAL_MAX_HOURS,
  TACTICAL_MIN_HOURS,
  ymdLocalToday,
} from "@/lib/firms-timeline";
import {
  getMapFocusBbox,
  MAP_FOCUS_COUNTRIES,
} from "@/lib/map-focus-catalog";
import { nearestFireMiles, type FirePoint } from "@/lib/geo";

type GeoJsonInput = {
  type: string;
  features: Array<{
    type: string;
    geometry?: { type: string; coordinates: unknown };
    properties?: Record<string, unknown>;
  }>;
};

function extractFirePoints(fc: GeoJsonInput): FirePoint[] {
  const out: FirePoint[] = [];
  for (const f of fc.features) {
    if (f.geometry?.type !== "Point") continue;
    const c = f.geometry.coordinates as [number, number];
    if (!Array.isArray(c) || c.length < 2) continue;
    out.push({
      lon: c[0],
      lat: c[1],
      name: String(f.properties?.name ?? "Thermal point"),
    });
  }
  return out;
}

function safetyStyles(s: SafetyLevel) {
  if (s === "EXTREME")
    return "text-red-400 ring-red-500/40 bg-red-950/50";
  if (s === "HIGH")
    return "text-orange-300 ring-orange-500/35 bg-orange-950/40";
  if (s === "MODERATE")
    return "text-amber-200 ring-amber-500/30 bg-amber-950/30";
  return "text-emerald-300 ring-emerald-500/25 bg-emerald-950/25";
}

export function CrisisMapShell() {
  const [briefingOpen, setBriefingOpen] = useState(true);
  const [addressInput, setAddressInput] = useState(
    "24255 Pacific Coast Hwy, Malibu, CA",
  );
  const [activeAddress, setActiveAddress] = useState<string | null>(null);
  const [fires, setFires] = useState<FirePoint[]>([]);
  const [firesLoading, setFiresLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pinnedAnchor, setPinnedAnchor] = useState<AddressBriefingAnchor | null>(
    null,
  );
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);

  const [mapCountryId, setMapCountryId] = useState("");
  const [mapRegionId, setMapRegionId] = useState("");

  const [timelineMode, setTimelineMode] = useState<"tactical" | "archive">(
    "tactical",
  );
  /** Hours from “now”: [-72, +6]. 0 = NASA latest (no `date`). */
  const [tacticalHoursFromNow, setTacticalHoursFromNow] = useState(0);
  const [debouncedTacticalHours, setDebouncedTacticalHours] = useState(0);
  const [archiveJumpDate, setArchiveJumpDate] = useState(defaultArchiveJumpYmd);
  const [debouncedArchiveDate, setDebouncedArchiveDate] = useState(() =>
    normalizeArchiveYmd(defaultArchiveJumpYmd()),
  );

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedTacticalHours(tacticalHoursFromNow);
      setDebouncedArchiveDate(normalizeArchiveYmd(archiveJumpDate));
    }, 320);
    return () => window.clearTimeout(t);
  }, [tacticalHoursFromNow, archiveJumpDate]);

  const firmsDateParam = useMemo(() => {
    if (timelineMode === "archive") return debouncedArchiveDate;
    return firmsDateFromTacticalHours(debouncedTacticalHours);
  }, [timelineMode, debouncedArchiveDate, debouncedTacticalHours]);

  const historySingleDay = firmsDateParam != null;

  /** NASA NRT is only recent; historic calendar days need standard product. */
  const firmsQueryOpts = useMemo(
    () =>
      timelineMode === "archive"
        ? ({ source: "VIIRS_SNPP_SP" as const } satisfies {
            source?: string;
          })
        : {},
    [timelineMode],
  );

  const mapFocusBbox = useMemo(
    () => getMapFocusBbox(mapCountryId, mapRegionId),
    [mapCountryId, mapRegionId],
  );

  const mapCatalogFirmsUrl = useMemo(() => {
    const b = mapFocusBbox;
    if (!b) return null;
    return buildFirmsApiUrl({
      ...b,
      days: historySingleDay ? 1 : 2,
      maxPoints: 18_000,
      date: firmsDateParam,
      ...firmsQueryOpts,
    });
  }, [mapFocusBbox, firmsDateParam, historySingleDay, firmsQueryOpts]);

  /** FIRMS bbox center: live geocode pin when set, else keyword demo presets from typed text. */
  const firmsAnchor = useMemo((): AddressBriefingAnchor => {
    if (pinnedAnchor) return pinnedAnchor;
    return resolveBriefingAnchor(addressInput);
  }, [pinnedAnchor, addressInput]);

  /** Full-globe FIRMS (optional; often empty after cap / parse). */
  const mapGlobalFirmsUrl = useMemo(
    () =>
      buildGlobalFirmsApiUrl({
        days: 1,
        maxPoints: 15_000,
        date: firmsDateParam,
        ...firmsQueryOpts,
      }),
    [firmsDateParam, firmsQueryOpts],
  );

  /** Map layer: contiguous US so coast-to-coast hotspots show regardless of searched address. */
  const mapConusFirmsUrl = useMemo(
    () =>
      buildContinentalUsFirmsApiUrl({
        days: historySingleDay ? 1 : 2,
        maxPoints: 22_000,
        date: firmsDateParam,
        ...firmsQueryOpts,
      }),
    [firmsDateParam, historySingleDay, firmsQueryOpts],
  );

  /** Briefing / nearest fire: tighter window around the pin (not used for map dots). */
  const regionalFirmsUrl = useMemo(() => {
    const b = padBbox(firmsAnchor.lon, firmsAnchor.lat, 14);
    return buildFirmsApiUrl({
      ...b,
      days: historySingleDay ? 1 : 2,
      maxPoints: 15_000,
      date: firmsDateParam,
      ...firmsQueryOpts,
    });
  }, [firmsAnchor, firmsDateParam, historySingleDay, firmsQueryOpts]);

  /** Prefer global map; else always CONUS (not regional) so the whole US stays visible. */
  const [mapUseGlobalLayer, setMapUseGlobalLayer] = useState(false);

  useEffect(() => {
    if (mapCatalogFirmsUrl) {
      setMapUseGlobalLayer(false);
      return;
    }
    setMapUseGlobalLayer(false);
    let cancelled = false;
    void (async () => {
      const r = await fetch(mapGlobalFirmsUrl, { cache: "no-store" });
      if (cancelled || !r.ok) return;
      const j = (await r.json()) as { features?: unknown[] };
      if (
        !cancelled &&
        Array.isArray(j.features) &&
        j.features.length > 0
      ) {
        setMapUseGlobalLayer(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mapGlobalFirmsUrl, mapConusFirmsUrl, mapCatalogFirmsUrl]);

  const timelineScrubbing =
    tacticalHoursFromNow !== debouncedTacticalHours ||
    normalizeArchiveYmd(archiveJumpDate) !== debouncedArchiveDate;

  const mapFiresDataUrl =
    mapCatalogFirmsUrl ??
    (mapUseGlobalLayer ? mapGlobalFirmsUrl : mapConusFirmsUrl);

  useEffect(() => {
    let cancelled = false;
    setFiresLoading(true);
    setLoadError(null);

    const load = async () => {
      try {
        let r = await fetch(regionalFirmsUrl);
        if (!r.ok) r = await fetch("/mock-fires.geojson");
        if (!r.ok) throw new Error(String(r.status));
        const fc = (await r.json()) as GeoJsonInput;
        if (cancelled) return;
        setFires(extractFirePoints(fc));
        setLoadError(null);
      } catch {
        if (cancelled) return;
        setFires([]);
        setLoadError("Could not load fire layer for distance math.");
      } finally {
        if (!cancelled) setFiresLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [regionalFirmsUrl]);

  useEffect(() => {
    if (firesLoading || fires.length === 0) return;
    setActiveAddress((prev) => {
      if (prev !== null) return prev;
      return addressInput.trim() || "default";
    });
  }, [firesLoading, fires.length, addressInput]);

  const briefing = useMemo(() => {
    if (!activeAddress) return null;
    const anchor = pinnedAnchor ?? resolveBriefingAnchor(activeAddress);
    const nearest =
      fires.length > 0
        ? nearestFireMiles(anchor.lon, anchor.lat, fires)
        : null;
    const miles = nearest?.miles ?? null;
    const safety =
      miles == null ? "LOW" : safetyFromDistanceMiles(miles);
    const smoke = smokeFromSafety(safety, anchor.weather.smokeLevel);
    const etaMin = miles == null ? null : estimateFireEtaMinutes(miles);
    const advice = propertyAdvice(safety);
    const route = buildDemoEvacuationRoute(anchor);
    return {
      anchor,
      nearest,
      miles,
      safety,
      smoke,
      etaMin,
      advice,
      route,
    };
  }, [activeAddress, fires, pinnedAnchor]);

  const applyBriefing = useCallback(async () => {
    const query = addressInput.trim();
    if (!query) {
      setGeocodeError("Enter an address to look up.");
      return;
    }
    setGeocoding(true);
    setGeocodeError(null);
    try {
      const r = await fetch(
        `/api/location-context?q=${encodeURIComponent(query)}`,
        { cache: "no-store" },
      );
      const data = (await r.json()) as LocationContextResponse & {
        error?: string;
      };
      if (!r.ok) {
        throw new Error(data.error ?? `Lookup failed (${r.status})`);
      }
      setPinnedAnchor(locationContextToAnchor(data));
      setActiveAddress(query);
    } catch (e) {
      setGeocodeError(
        e instanceof Error ? e.message : "Address lookup failed.",
      );
    } finally {
      setGeocoding(false);
    }
  }, [addressInput]);

  const userLngLat = briefing
    ? ([briefing.anchor.lon, briefing.anchor.lat] as [number, number])
    : null;
  const routeWaypoints = briefing ? briefing.route.waypoints : null;

  return (
    <div className="relative h-dvh min-h-0 w-full bg-[var(--map-fallback)]">
      <FiresOnlyMap
        firesDataUrl={mapFiresDataUrl}
        mapFocusBounds={mapFocusBbox}
        userLngLat={userLngLat}
        routeWaypoints={routeWaypoints}
      />

      <div className="pointer-events-none absolute left-3 top-3 z-20 md:left-4 md:top-4">
        <LiveTimestamp />
      </div>

      <div className="pointer-events-auto absolute left-3 top-[5.5rem] z-30 max-w-[min(calc(100vw-1.5rem),18rem)] rounded-lg border border-white/12 bg-black/75 p-2.5 shadow-lg backdrop-blur-md md:left-4 md:top-[5.75rem] md:max-w-[20rem]">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
          Map area
        </p>
        <div className="mt-1.5 flex flex-col gap-2">
          <label className="block">
            <span className="sr-only">Country</span>
            <select
              value={mapCountryId}
              onChange={(e) => {
                setMapCountryId(e.target.value);
                setMapRegionId("");
              }}
              className="w-full rounded border border-white/15 bg-zinc-950/90 px-2 py-1.5 font-mono text-[11px] text-zinc-100 outline-none focus:border-orange-500/50"
            >
              <option value="">World (default view)</option>
              {MAP_FOCUS_COUNTRIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Region</span>
            <select
              value={mapRegionId}
              onChange={(e) => setMapRegionId(e.target.value)}
              disabled={!mapCountryId}
              className="w-full rounded border border-white/15 bg-zinc-950/90 px-2 py-1.5 font-mono text-[11px] text-zinc-100 outline-none focus:border-orange-500/50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <option value="">
                {mapCountryId ? "Entire country" : "Select a country first"}
              </option>
              {mapCountryId
                ? (MAP_FOCUS_COUNTRIES.find((c) => c.id === mapCountryId)
                    ?.regions ?? []
                  ).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))
                : null}
            </select>
          </label>
        </div>
        <p className="mt-2 font-mono text-[9px] leading-snug text-zinc-600">
          FIRMS hotspots load for the selected box. World uses global/CONUS
          fallback.
        </p>
      </div>

      <div className="pointer-events-auto absolute bottom-4 left-1/2 z-30 w-[min(94vw,34rem)] -translate-x-1/2 rounded-lg border border-white/12 bg-black/80 px-3 py-2.5 shadow-lg backdrop-blur-md md:bottom-6 md:px-4 md:py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
            FIRMS time
          </p>
          <div className="flex rounded border border-white/15 bg-zinc-950/80 p-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider">
            <button
              type="button"
              onClick={() => setTimelineMode("tactical")}
              className={`rounded px-2 py-1 transition ${
                timelineMode === "tactical"
                  ? "bg-orange-600/90 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Tactical
            </button>
            <button
              type="button"
              onClick={() => setTimelineMode("archive")}
              className={`rounded px-2 py-1 transition ${
                timelineMode === "archive"
                  ? "bg-orange-600/90 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Archive
            </button>
          </div>
          {timelineScrubbing || firesLoading ? (
            <span className="font-mono text-[9px] text-orange-300/90">
              {timelineScrubbing ? "Selecting…" : "Loading…"}
            </span>
          ) : null}
        </div>

        {timelineMode === "tactical" ? (
          <>
            <p className="mt-2 font-mono text-[10px] leading-snug text-zinc-400">
              Tactical (present / future): scrub{" "}
              <span className="text-zinc-300">{TACTICAL_MIN_HOURS}h</span> to{" "}
              <span className="text-zinc-300">+{TACTICAL_MAX_HOURS}h</span>{" "}
              from now. NASA uses the <span className="text-zinc-300">calendar</span>{" "}
              day of the instant you pick (single-day request when not “latest”).
            </p>
            <p className="mt-1.5 font-mono text-[11px] font-medium text-zinc-100">
              {debouncedTacticalHours === 0
                ? "As-of: latest NASA window (no fixed date)"
                : `As-of: ${formatLocalDateTimeFromHoursOffset(debouncedTacticalHours)}`}
            </p>
            <p className="mt-0.5 font-mono text-[10px] text-zinc-500">
              {debouncedTacticalHours === 0
                ? ""
                : `FIRMS date param: ${firmsDateFromTacticalHours(debouncedTacticalHours)}`}
            </p>
            <div className="mt-1 flex w-full flex-row-reverse justify-between font-mono text-[9px] text-zinc-500">
              <span>+6h ahead · Present</span>
              <span className="text-zinc-600">|</span>
              <span>−72h past</span>
            </div>
            <input
              type="range"
              min={0}
              max={78}
              step={1}
              value={78 - tacticalSliderPositionFromHours(tacticalHoursFromNow)}
              onChange={(e) => {
                const ui = Number.parseInt(e.target.value, 10) || 0;
                setTacticalHoursFromNow(hoursFromTacticalSliderPosition(78 - ui));
              }}
              className="mt-1 h-2 w-full cursor-pointer accent-orange-500 [direction:rtl]"
              aria-label="Tactical time: present and up to +6h on the right, up to −72h past on the left"
              aria-valuemin={TACTICAL_MIN_HOURS}
              aria-valuemax={TACTICAL_MAX_HOURS}
              aria-valuenow={tacticalHoursFromNow}
            />
          </>
        ) : (
          <>
            <p className="mt-2 font-mono text-[10px] leading-snug text-zinc-400">
              Archive (historic): pick any calendar day from{" "}
              <span className="text-zinc-300">{ARCHIVE_YMD_MIN}</span> through today.
              Uses NASA VIIRS standard product (not NRT).
            </p>
            <label className="mt-2 block font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
              Jump to date
              <input
                type="date"
                min={ARCHIVE_YMD_MIN}
                max={ymdLocalToday()}
                value={archiveJumpDate}
                onChange={(e) => setArchiveJumpDate(e.target.value)}
                className="mt-1 w-full rounded border border-white/15 bg-zinc-950/90 px-2 py-1.5 font-mono text-[12px] text-zinc-100 outline-none focus:border-orange-500/50"
              />
            </label>
            <p className="mt-1.5 font-mono text-[11px] font-medium text-zinc-100">
              Loading FIRMS for{" "}
              <span className="text-orange-200/95">
                {normalizeArchiveYmd(archiveJumpDate)}
              </span>
              {timelineScrubbing || archiveJumpDate !== debouncedArchiveDate
                ? " (pending…)"
                : ` (${debouncedArchiveDate})`}
            </p>
          </>
        )}

        <p className="mt-2 font-mono text-[9px] leading-snug text-zinc-600">
          NASA Area API: max 5 days per request; tactical non-zero &amp; archive
          use 1-day slices. Empty layers on unavailable dates are normal.
        </p>
      </div>

      <div className="pointer-events-none absolute left-1/2 top-3 z-20 max-w-[min(92vw,28rem)] -translate-x-1/2 text-center md:top-4">
        <div className="rounded-lg border border-white/10 bg-black/60 px-4 py-2 shadow-lg backdrop-blur-md md:px-6 md:py-2.5">
          <h1 className="font-sans text-sm font-bold uppercase tracking-[0.22em] text-zinc-100 md:text-base">
            Live Fire Intel
          </h1>
          <sub className="mt-1 block font-mono text-[9px] font-normal tracking-[0.2em] text-zinc-500 no-underline md:text-[10px]">
            powered by Claude A.I
          </sub>
        </div>
      </div>

      <div
        className={`pointer-events-auto absolute z-20 flex flex-col items-end transition-[width] duration-300 ease-out ${
          briefingOpen
            ? "right-2 top-2 bottom-2 w-[min(100%,420px)] max-w-[calc(100vw-1rem)] md:right-3 md:top-3 md:bottom-3"
            : "right-0 top-24 bottom-24 w-auto"
        }`}
      >
        {!briefingOpen ? (
          <button
            type="button"
            onClick={() => setBriefingOpen(true)}
            className="pointer-events-auto flex h-full max-h-[min(70dvh,520px)] min-h-[12rem] w-11 flex-col items-center justify-center gap-2 rounded-l-xl border border-r-0 border-white/12 bg-zinc-950/75 py-4 text-zinc-500 shadow-[inset_1px_0_0_rgba(255,255,255,0.04),-4px_0_24px_rgba(0,0,0,0.35)] backdrop-blur-xl transition hover:border-white/18 hover:bg-zinc-950/90 hover:text-zinc-200"
            aria-label="Open address briefing"
          >
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.32em] text-zinc-500"
              style={{ writingMode: "vertical-rl" }}
            >
              Briefing
            </span>
            <span className="text-lg leading-none text-zinc-400" aria-hidden>
              ‹
            </span>
          </button>
        ) : (
          <div className="panel-border flex h-full max-h-[min(92dvh,900px)] w-full flex-col overflow-hidden rounded-l-md rounded-r-md border border-white/10 bg-black/78 shadow-2xl backdrop-blur-xl">
            <div className="flex shrink-0 items-start justify-between gap-2 border-b border-white/10 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="font-sans text-[10px] font-bold uppercase tracking-[0.28em] text-zinc-500">
                  Address briefing
                </p>
                <p className="mt-0.5 font-mono text-[10px] leading-snug text-zinc-500">
                  Live OSM geocode + Open-Meteo · FIRMS hotspots · hide panel
                  anytime.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBriefingOpen(false)}
                className="shrink-0 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-400 transition hover:border-white/20 hover:bg-white/10 hover:text-zinc-100"
                aria-label="Minimize address briefing"
              >
                Hide
              </button>
            </div>

            <div className="briefing-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-3 pr-2 [scrollbar-gutter:stable]">
              <label className="block shrink-0">
                <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
                  Street address
                </span>
                <textarea
                  value={addressInput}
                  onChange={(e) => setAddressInput(e.target.value)}
                  rows={2}
                  className="mt-1 w-full resize-none rounded border border-white/15 bg-zinc-950/80 px-2 py-2 font-mono text-xs text-zinc-100 outline-none ring-0 placeholder:text-zinc-600 focus:border-orange-500/50"
                  placeholder="e.g. 1600 Pennsylvania Ave NW, Washington, DC"
                />
              </label>

              <button
                type="button"
                onClick={() => void applyBriefing()}
                disabled={firesLoading || geocoding}
                className="shrink-0 rounded bg-orange-600/90 px-3 py-2 font-sans text-xs font-bold uppercase tracking-widest text-white shadow hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {geocoding
                  ? "Looking up address…"
                  : firesLoading
                    ? "Loading fire data…"
                    : "Look up address & update"}
              </button>

              {pinnedAnchor ? (
                <button
                  type="button"
                  onClick={() => {
                    setPinnedAnchor(null);
                    setGeocodeError(null);
                  }}
                  className="shrink-0 rounded border border-white/15 bg-zinc-900/80 px-2 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-400 hover:border-white/25 hover:text-zinc-200"
                >
                  Clear live pin (use demo keyword presets)
                </button>
              ) : null}

              {geocodeError ? (
                <p className="shrink-0 font-mono text-[11px] text-red-400">
                  {geocodeError}
                </p>
              ) : null}

              {loadError ? (
                <p className="shrink-0 font-mono text-[11px] text-red-400">
                  {loadError}
                </p>
              ) : null}

              {!briefing ? (
                <p className="font-mono text-[11px] leading-relaxed text-zinc-500">
                  Enter a street address and tap{" "}
                  <span className="text-zinc-300">Look up address &amp; update</span>{" "}
                  to geocode it, pull current weather, reload FIRMS for that
                  region, and show safety / nearest hotspot / demo route on the
                  map.
                </p>
              ) : (
                <div className="space-y-3 font-mono text-[11px] text-zinc-300">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
                      {pinnedAnchor ? "Resolved location (live)" : "Demo preset"}
                    </p>
                    <p className="text-zinc-100">
                      {briefing.anchor.displayName}
                    </p>
                    <p className="mt-1 text-[10px] text-zinc-500">
                      {pinnedAnchor
                        ? `${pinnedAnchor.lat.toFixed(4)}°, ${pinnedAnchor.lon.toFixed(4)}°`
                        : "Tip: clear the live pin to use Malibu / Ojai keywords again."}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded border border-white/10 bg-zinc-950/60 p-2">
                      <p className="text-[9px] uppercase text-zinc-500">
                        Temp °F
                      </p>
                      <p className="text-lg font-bold tabular-nums text-zinc-100">
                        {briefing.anchor.weather.tempF}
                      </p>
                    </div>
                    <div className="rounded border border-white/10 bg-zinc-950/60 p-2">
                      <p className="text-[9px] uppercase text-zinc-500">Wind</p>
                      <p className="text-sm font-bold text-zinc-100">
                        {briefing.anchor.weather.windMph}{" "}
                        <span className="text-zinc-500">mph</span>
                      </p>
                      <p className="text-[10px] text-orange-200/90">
                        {briefing.anchor.weather.windFromTo}
                      </p>
                    </div>
                    <div className="col-span-2 rounded border border-white/10 bg-zinc-950/60 p-2">
                      <p className="text-[9px] uppercase text-zinc-500">
                        Smoke level (modeled)
                      </p>
                      <p className="text-sm text-zinc-100">{briefing.smoke}</p>
                    </div>
                    <div className="col-span-2 rounded border border-white/10 p-2 ring-1 ring-inset">
                      <p className="text-[9px] uppercase text-zinc-500">
                        Safety level
                      </p>
                      <p
                        className={`mt-1 inline-block rounded px-2 py-1 text-sm font-bold uppercase ring-1 ${safetyStyles(briefing.safety)}`}
                      >
                        {briefing.safety}
                      </p>
                    </div>
                  </div>

                  <div className="rounded border border-white/10 bg-zinc-950/50 p-2">
                    <p className="text-[9px] uppercase text-zinc-500">
                      Nearest thermal / fire point
                    </p>
                    {briefing.nearest ? (
                      <>
                        <p className="text-sm text-zinc-100">
                          {briefing.nearest.name}
                        </p>
                        <p className="mt-1 text-lg font-bold tabular-nums text-orange-200">
                          {briefing.miles!.toFixed(1)}{" "}
                          <span className="text-sm font-normal text-zinc-500">
                            mi away
                          </span>
                        </p>
                      </>
                    ) : (
                      <p className="text-zinc-500">No fire points loaded.</p>
                    )}
                  </div>

                  <div className="rounded border border-white/10 bg-zinc-950/50 p-2">
                    <p className="text-[9px] uppercase text-zinc-500">
                      ETA to footprint (demo model)
                    </p>
                    <p className="text-lg font-bold tabular-nums text-zinc-100">
                      {briefing.etaMin != null ? `${briefing.etaMin} min` : "—"}
                    </p>
                    <p className="mt-1 text-[10px] leading-snug text-zinc-500">
                      Uses fixed spread rate (~1.35 mph demo) — not operational
                      guidance.
                    </p>
                  </div>

                  {briefing.advice ? (
                    <div className="rounded border border-orange-500/30 bg-orange-950/35 p-2">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-orange-300">
                        Property-specific advice
                      </p>
                      <p className="mt-1 leading-snug text-orange-50/95">
                        {briefing.advice}
                      </p>
                    </div>
                  ) : (
                    <p className="rounded border border-white/5 bg-zinc-950/30 p-2 text-[10px] text-zinc-500">
                      No high-risk property checklist at this distance (demo).
                    </p>
                  )}

                  <div className="rounded border border-cyan-500/25 bg-cyan-950/20 p-2">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-cyan-300">
                      Evacuation route (pre-calculated demo)
                    </p>
                    <p className="mt-1 leading-snug text-cyan-50/90">
                      {briefing.route.summary}
                    </p>
                    <ol className="mt-2 list-decimal space-y-1 pl-4 text-[10px] text-zinc-300">
                      {briefing.route.turnText.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ol>
                    <p className="mt-2 text-[10px] text-zinc-500">
                      Cyan line on map: your anchor → waypoint →{" "}
                      {briefing.anchor.safeZoneName}. For real turn-by-turn
                      egress use a routing API (e.g. Mapbox, Google, OSRM).
                    </p>
                  </div>

                  <p className="text-[9px] leading-snug text-zinc-600">
                    Geocoding © OpenStreetMap contributors (
                    <a
                      href="https://www.openstreetmap.org/copyright"
                      className="text-zinc-500 underline hover:text-zinc-400"
                      target="_blank"
                      rel="noreferrer"
                    >
                      ODbL
                    </a>
                    ). Weather from{" "}
                    <a
                      href="https://open-meteo.com/"
                      className="text-zinc-500 underline hover:text-zinc-400"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open-Meteo
                    </a>
                    .
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
