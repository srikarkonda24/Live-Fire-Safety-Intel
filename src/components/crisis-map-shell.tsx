"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiresOnlyMap,
  type FiresOnlyMapHandle,
} from "@/components/fires-only-map";
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
  type FirmsLayerTimeline,
} from "@/lib/firms-url";
import type { SafetyBriefResponse } from "@/lib/briefing-reasoning-types";
import { TacticalHud } from "@/components/tactical-hud";
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
  const [addressInput, setAddressInput] = useState("");
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
  /** Increments on each successful geocode so the map can zoom once per selection. */
  const [addressFocusVersion, setAddressFocusVersion] = useState(0);

  const [debouncedAddressQuery, setDebouncedAddressQuery] = useState("");
  const geocodeSeqRef = useRef(0);
  const mapRef = useRef<FiresOnlyMapHandle | null>(null);
  const mapFocusPayloadRef = useRef<{
    version: number;
    center: [number, number] | null;
    waypoints: [number, number][] | null;
  }>({ version: 0, center: null, waypoints: null });

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedAddressQuery(addressInput.trim());
    }, 700);
    return () => window.clearTimeout(t);
  }, [addressInput]);

  const submitAddressLookup = useCallback(() => {
    const q = addressInput.trim();
    if (!q) return;
    setAddressInput(q);
    setDebouncedAddressQuery(q);
    // Allow Enter to re-center even when the same resolved address is already active.
    if (pinnedAnchor || activeAddress === q) {
      setAddressFocusVersion((v) => v + 1);
    }
  }, [addressInput, activeAddress, pinnedAnchor]);

  /** NASA “most recent” window (no `date` segment on FIRMS URLs). */
  const firmsDateParam = null as string | null;

  const historySingleDay = false;

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
      }),
    [firmsDateParam],
  );

  /** Map layer: contiguous US so coast-to-coast hotspots show regardless of searched address. */
  const mapConusFirmsUrl = useMemo(
    () =>
      buildContinentalUsFirmsApiUrl({
        days: historySingleDay ? 1 : 2,
        maxPoints: 22_000,
        date: firmsDateParam,
      }),
    [firmsDateParam, historySingleDay],
  );

  /** Briefing / nearest fire: tighter window around the pin (not used for map dots). */
  const regionalFirmsUrl = useMemo(() => {
    const b = padBbox(firmsAnchor.lon, firmsAnchor.lat, 14);
    return buildFirmsApiUrl({
      ...b,
      days: historySingleDay ? 1 : 2,
      maxPoints: 15_000,
      date: firmsDateParam,
    });
  }, [firmsAnchor, firmsDateParam, historySingleDay]);

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

  const firesMapTimeline = useMemo((): FirmsLayerTimeline => {
    return {
      date: firmsDateParam,
      days: historySingleDay ? 1 : 2,
      maxPoints: mapUseGlobalLayer ? 15_000 : 22_000,
      layerPreset: mapUseGlobalLayer ? "global" : "conus",
    };
  }, [firmsDateParam, historySingleDay, mapUseGlobalLayer]);

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
        setAddressFocusVersion((v) => v + 1);
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

  /** Stable tuple/refs so the map does not treat every parent render as a camera change. */
  const userLngLat = useMemo((): [number, number] | null => {
    if (!briefing) return null;
    return [briefing.anchor.lon, briefing.anchor.lat];
  }, [briefing?.anchor.lon, briefing?.anchor.lat]);

  const routeWaypoints = useMemo((): [number, number][] | null => {
    if (!briefing) return null;
    return briefing.route.waypoints;
  }, [
    briefing?.anchor.lat,
    briefing?.anchor.lon,
    briefing?.anchor.safeLat,
    briefing?.anchor.safeLon,
  ]);

  mapFocusPayloadRef.current = {
    version: addressFocusVersion,
    center: userLngLat,
    waypoints: routeWaypoints,
  };

  const runMapFocusFromRef = useCallback(() => {
    const { version, center, waypoints } = mapFocusPayloadRef.current;
    if (version < 1 || !center) return;
    mapRef.current?.focusOnResolvedPin({
      center,
      waypoints,
    });
  }, []);

  /** After paint: child map `useEffect` has run, so `mapRef` is valid before this runs. */
  useEffect(() => {
    runMapFocusFromRef();
  }, [addressFocusVersion, userLngLat, routeWaypoints, runMapFocusFromRef]);

  return (
    <div className="relative h-[100dvh] min-h-0 w-screen max-w-[100vw] overflow-hidden bg-[var(--map-fallback)]">
      <div className="absolute inset-0 z-0 min-h-0">
        <FiresOnlyMap
          ref={mapRef}
          firesTimeline={firesMapTimeline}
          userLngLat={userLngLat}
          routeWaypoints={routeWaypoints}
          onMapReady={runMapFocusFromRef}
        />
      </div>

      <TacticalHud
        briefing={briefing}
        onRegenerateAi={() => void fetchAiBriefing()}
        onClearPin={() => {
          setPinnedAnchor(null);
          setGeocodeError(null);
        }}
        geocoding={geocoding}
        geocodeError={geocodeError}
        firesLoading={firesLoading}
        pinnedAnchor={pinnedAnchor}
        safetyBrief={safetyBrief}
        safetyBriefUpdated={safetyBriefUpdated}
        aiLoading={aiLoading}
        aiError={aiError}
      />

      <div className="hud-panel pointer-events-auto absolute bottom-0 left-1/2 z-30 w-[min(96vw,34rem)] -translate-x-1/2 rounded-t-md shadow-[0_-4px_32px_rgba(0,0,0,0.25)]">
        <div className="hud-scroll-hidden max-h-[min(40vh,22rem)] overflow-y-auto px-2.5 pb-2.5 pt-2 font-tactical">
          <div>
            <label className="block font-mono text-[7px] font-semibold uppercase tracking-widest text-zinc-500">
              Location
              <textarea
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || e.shiftKey) return;
                  e.preventDefault();
                  submitAddressLookup();
                }}
                rows={2}
                placeholder="Address or coordinates…"
                className="mt-1 w-full resize-none rounded border border-white/12 bg-zinc-950/90 px-1.5 py-1 font-mono text-[10px] leading-snug text-zinc-100 outline-none focus:border-orange-500/50"
                aria-label="Address or location for briefing and map"
              />
            </label>
            <p className="mt-1 font-mono text-[7px] leading-snug text-zinc-500">
              Geocode pauses, then MET / INTEL refresh and the map flies to the
              pin.
            </p>
            <button
              type="button"
              onClick={() => mapRef.current?.resetWorldView()}
              className="mt-1.5 w-full rounded border border-white/15 bg-zinc-950/85 px-2 py-1 font-mono text-[8px] font-semibold uppercase tracking-widest text-zinc-300 transition hover:border-orange-500/40 hover:text-orange-200/95"
            >
              World view
            </button>
            {geocoding ? (
              <p className="mt-1 font-mono text-[8px] text-orange-300/90">
                Resolving…
              </p>
            ) : null}
            {geocodeError ? (
              <p className="mt-1 font-mono text-[8px] text-red-400">
                {geocodeError}
              </p>
            ) : null}
            {loadError ? (
              <p className="mt-1 font-mono text-[8px] text-red-400">
                {loadError}
              </p>
            ) : null}
          </div>
        </div>
      </div>

    </div>
  );
}
