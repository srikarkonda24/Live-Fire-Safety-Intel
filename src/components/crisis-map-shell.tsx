"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { SafetyBriefResponse } from "@/lib/briefing-reasoning-types";
import { TacticalHud, type HudPanel } from "@/components/tactical-hud";
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

function formatIntelBriefTime(d: Date): string {
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

export function CrisisMapShell() {
  const [firmsTimeOpen, setFirmsTimeOpen] = useState(true);
  const [hudPanel, setHudPanel] = useState<HudPanel | null>(null);
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
  const [safetyBrief, setSafetyBrief] = useState<SafetyBriefResponse | null>(null);
  const [safetyBriefUpdated, setSafetyBriefUpdated] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [pendingAutoBrief, setPendingAutoBrief] = useState(false);

  const [debouncedAddressQuery, setDebouncedAddressQuery] = useState(() =>
    addressInput.trim(),
  );
  const geocodeSeqRef = useRef(0);

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

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedAddressQuery(addressInput.trim());
    }, 700);
    return () => window.clearTimeout(t);
  }, [addressInput]);

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
    let cancelled = false;
    setMapUseGlobalLayer(false);
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
  }, [mapGlobalFirmsUrl, mapConusFirmsUrl]);

  const timelineScrubbing =
    tacticalHoursFromNow !== debouncedTacticalHours ||
    normalizeArchiveYmd(archiveJumpDate) !== debouncedArchiveDate;

  const mapFiresDataUrl = mapUseGlobalLayer
    ? mapGlobalFirmsUrl
    : mapConusFirmsUrl;

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
    const q = debouncedAddressQuery;
    if (!q) {
      geocodeSeqRef.current += 1;
      setPinnedAnchor(null);
      setActiveAddress(null);
      setGeocodeError(null);
      setGeocoding(false);
      return;
    }
    if (q.length < 5) return;

    const seq = ++geocodeSeqRef.current;
    const ac = new AbortController();
    setGeocoding(true);
    setGeocodeError(null);

    void (async () => {
      try {
        const r = await fetch(
          `/api/location-context?q=${encodeURIComponent(q)}`,
          { cache: "no-store", signal: ac.signal },
        );
        const data = (await r.json()) as LocationContextResponse & {
          error?: string;
        };
        if (seq !== geocodeSeqRef.current) return;
        if (!r.ok) {
          throw new Error(data.error ?? `Lookup failed (${r.status})`);
        }
        setPinnedAnchor(locationContextToAnchor(data));
        setActiveAddress(q);
        setPendingAutoBrief(true);
        setGeocodeError(null);
      } catch (e) {
        if (ac.signal.aborted) return;
        if (seq !== geocodeSeqRef.current) return;
        setGeocodeError(
          e instanceof Error ? e.message : "Address lookup failed.",
        );
      } finally {
        if (seq === geocodeSeqRef.current) setGeocoding(false);
      }
    })();

    return () => ac.abort();
  }, [debouncedAddressQuery]);

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

  const briefingFingerprint = useMemo(() => {
    if (!briefing) return "";
    return [
      briefing.anchor.lat,
      briefing.anchor.lon,
      briefing.anchor.displayName,
      briefing.safety,
      briefing.miles ?? "x",
      briefing.nearest?.name ?? "x",
      briefing.etaMin ?? "x",
    ].join("|");
  }, [briefing]);

  useEffect(() => {
    setSafetyBrief(null);
    setSafetyBriefUpdated(null);
    setAiError(null);
  }, [briefingFingerprint]);

  const fetchAiBriefing = useCallback(async () => {
    if (!briefing) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const body = {
        displayName: briefing.anchor.displayName,
        lat: briefing.anchor.lat,
        lon: briefing.anchor.lon,
        safeZoneName: briefing.anchor.safeZoneName,
        safeLon: briefing.anchor.safeLon,
        safeLat: briefing.anchor.safeLat,
        weather: briefing.anchor.weather,
        safety: briefing.safety,
        nearestFireName: briefing.nearest?.name ?? null,
        nearestFireMiles: briefing.miles,
        smokeSummary: briefing.smoke,
        etaMin: briefing.etaMin,
        demoRouteSummary: briefing.route.summary,
        demoRouteSteps: briefing.route.turnText,
      };
      const r = await fetch("/api/briefing-reasoning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      const data = (await r.json()) as SafetyBriefResponse & {
        error?: string;
      };
      if (!r.ok) {
        throw new Error(data.error ?? `Request failed (${r.status})`);
      }
      setSafetyBriefUpdated(formatIntelBriefTime(new Date()));
      setSafetyBrief(data);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "AI briefing failed");
    } finally {
      setAiLoading(false);
    }
  }, [briefing]);

  useEffect(() => {
    if (!pendingAutoBrief || !briefing) return;
    if (firesLoading) return;
    const t = window.setTimeout(() => {
      setPendingAutoBrief(false);
      void fetchAiBriefing();
    }, 550);
    return () => window.clearTimeout(t);
  }, [
    pendingAutoBrief,
    firesLoading,
    briefingFingerprint,
    briefing,
    fetchAiBriefing,
  ]);

  const userLngLat = briefing
    ? ([briefing.anchor.lon, briefing.anchor.lat] as [number, number])
    : null;
  const routeWaypoints = briefing ? briefing.route.waypoints : null;

  const toggleHudPanel = useCallback((id: HudPanel) => {
    setHudPanel((p) => (p === id ? null : id));
  }, []);
  const closeHudPanel = useCallback(() => setHudPanel(null), []);

  return (
    <div className="relative h-dvh min-h-0 w-full bg-[var(--map-fallback)]">
      <FiresOnlyMap
        firesDataUrl={mapFiresDataUrl}
        userLngLat={userLngLat}
        routeWaypoints={routeWaypoints}
      />

      <TacticalHud
        openPanel={hudPanel}
        onTogglePanel={toggleHudPanel}
        onClosePanel={closeHudPanel}
        briefing={briefing}
        onRegenerateAi={() => void fetchAiBriefing()}
        onClearPin={() => {
          setPinnedAnchor(null);
          setGeocodeError(null);
        }}
        geocoding={geocoding}
        firesLoading={firesLoading}
        pinnedAnchor={pinnedAnchor}
        safetyBrief={safetyBrief}
        safetyBriefUpdated={safetyBriefUpdated}
        aiLoading={aiLoading}
        aiError={aiError}
      />

      <div className="pointer-events-none absolute left-3 top-[4.5rem] z-20 md:left-4 md:top-[5rem]">
        <LiveTimestamp />
      </div>

      <div className="pointer-events-auto absolute bottom-4 left-1/2 z-30 w-[min(94vw,34rem)] -translate-x-1/2 rounded-lg border border-white/12 bg-black/80 shadow-lg backdrop-blur-md md:bottom-6 md:px-4 md:py-3">
        {firmsTimeOpen ? (
          <div className="px-3 py-2.5 md:px-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
                  FIRMS time
                </p>
                <button
                  type="button"
                  onClick={() => setFirmsTimeOpen(false)}
                  className="rounded border border-white/10 bg-white/5 px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-zinc-400 hover:border-white/20 hover:text-zinc-100"
                  aria-label="Minimize FIRMS time"
                >
                  Minimize
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
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

        <div className="mt-4 border-t border-white/10 pt-3">
          <label className="block font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
            Location (auto-updates)
            <textarea
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              rows={2}
              placeholder="Street, city, state or coordinates…"
              className="mt-1.5 w-full resize-none rounded border border-white/15 bg-zinc-950/90 px-2.5 py-2 font-mono text-[12px] leading-snug text-zinc-100 outline-none focus:border-orange-500/50"
              aria-label="Address or location for briefing and map"
            />
          </label>
          <p className="mt-1.5 font-mono text-[9px] leading-snug text-zinc-500">
            After a short pause, we geocode this address, refresh meteorology /
            surveillance / operations, and fly the map to the pin. Panels stay
            closed unless you open them from the dock.
          </p>
          {geocoding ? (
            <p className="mt-2 font-mono text-[10px] text-orange-300/90">
              Resolving address…
            </p>
          ) : null}
          {geocodeError ? (
            <p className="mt-2 font-mono text-[10px] text-red-400">
              {geocodeError}
            </p>
          ) : null}
          {loadError ? (
            <p className="mt-2 font-mono text-[10px] text-red-400">
              {loadError}
            </p>
          ) : null}
        </div>

        <p className="mt-2 font-mono text-[9px] leading-snug text-zinc-600">
          NASA Area API: max 5 days per request; tactical non-zero &amp; archive
          use 1-day slices. Empty layers on unavailable dates are normal.
        </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setFirmsTimeOpen(true)}
            className="w-full px-3 py-2 font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            aria-label="Expand FIRMS time"
          >
            FIRMS time — tap to expand
          </button>
        )}
      </div>

    </div>
  );
}
