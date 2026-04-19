"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MapFocusBBox } from "@/lib/map-focus-catalog";
import {
  buildFirmsUrlForViewport,
  type FirmsLayerTimeline,
} from "@/lib/firms-url";
import type { FirmsFeatureCollection } from "@/lib/firms-csv";

type FireFeature = FirmsFeatureCollection["features"][number];

const BASE_STYLE = {
  version: 8,
  name: "Dark basemap",
  sources: {
    dark: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright" rel="noreferrer">OpenStreetMap</a> © <a href="https://carto.com/attributions" rel="noreferrer">CARTO</a>',
    },
  },
  layers: [
    { id: "dark", type: "raster", source: "dark", minzoom: 0, maxzoom: 22 },
  ],
} satisfies StyleSpecification;

/** Initial globe framing (must match `new maplibregl.Map` defaults below). */
export const WORLD_MAP_CENTER: [number, number] = [0, 18];
export const WORLD_MAP_ZOOM = 1.12;

const FOCUS_BUMP: maplibregl.ExpressionSpecification = [
  "case",
  ["==", ["get", "focus"], true],
  6,
  0,
];

function glowRadiusExpr(scale: number): maplibregl.ExpressionSpecification {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    1,
    8 * scale,
    4,
    16 * scale,
    8,
    28 * scale,
    12,
    40 * scale,
  ];
}

function coreRadiusExpr(bob: number): maplibregl.ExpressionSpecification {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    1,
    ["*", bob, ["+", 2.4, FOCUS_BUMP]],
    4,
    ["*", bob, ["+", 4.5, FOCUS_BUMP]],
    8,
    ["*", bob, ["+", 7.5, FOCUS_BUMP]],
    12,
    ["*", bob, ["+", 11, FOCUS_BUMP]],
  ];
}

function lineFeature(waypoints: [number, number][]) {
  return {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "LineString" as const,
          coordinates: waypoints,
        },
      },
    ],
  };
}

function pointFeature(lon: number, lat: number) {
  return {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: {},
        geometry: { type: "Point" as const, coordinates: [lon, lat] },
      },
    ],
  };
}

function syncRoute(
  map: maplibregl.Map,
  waypoints: [number, number][] | null | undefined,
) {
  if (!waypoints || waypoints.length < 2) {
    if (map.getLayer("briefing-route-line")) map.removeLayer("briefing-route-line");
    if (map.getSource("briefing-route")) map.removeSource("briefing-route");
    return;
  }
  const data = lineFeature(waypoints);
  if (map.getSource("briefing-route")) {
    (map.getSource("briefing-route") as maplibregl.GeoJSONSource).setData(data);
  } else {
    map.addSource("briefing-route", { type: "geojson", data });
    map.addLayer(
      {
        id: "briefing-route-line",
        type: "line",
        source: "briefing-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#22d3ee",
          "line-width": 4,
          "line-opacity": 0.88,
          "line-blur": 0.2,
        },
      },
      "fires-glow",
    );
  }
}

function syncUser(map: maplibregl.Map, pt: [number, number] | null | undefined) {
  if (!pt) {
    if (map.getLayer("user-marker")) map.removeLayer("user-marker");
    if (map.getSource("user-marker")) map.removeSource("user-marker");
    return;
  }
  const data = pointFeature(pt[0], pt[1]);
  if (map.getSource("user-marker")) {
    (map.getSource("user-marker") as maplibregl.GeoJSONSource).setData(data);
  } else {
    map.addSource("user-marker", { type: "geojson", data });
    map.addLayer({
      id: "user-marker",
      type: "circle",
      source: "user-marker",
      paint: {
        "circle-radius": 9,
        "circle-color": "#38bdf8",
        "circle-opacity": 0.95,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });
  }
}

export type FiresLayerStatus = "loading" | "ready" | "error";

export type FiresOnlyMapProps = {
  /** FIRMS timeline + layer preset; hotspots load once from `/api/firms` (no pan/zoom refetch). */
  firesTimeline: FirmsLayerTimeline;
  userLngLat?: [number, number] | null;
  routeWaypoints?: [number, number][] | null;
  /** When set, map animates to this box (country / region picker). */
  mapFocusBounds?: MapFocusBBox | null;
  /** Fires once when the map style has finished loading (e.g. retry camera after remount). */
  onMapReady?: () => void;
  /** Reports the live NASA FIRMS fetch state so the shell can show a loading overlay. */
  onFiresStatusChange?: (status: FiresLayerStatus) => void;
};

export type FiresOnlyMapHandle = {
  /** Move camera to a resolved pin (call after geocode). Safe if style is still loading. */
  focusOnResolvedPin: (args: {
    center: [number, number];
    waypoints: [number, number][] | null;
  }) => void;
  /** Animate back to the default globe view. */
  resetWorldView: () => void;
  /** Re-query FIRMS for the current map bounds (e.g. after camera animation). */
  refreshViewportFires: () => void;
};

export const FiresOnlyMap = forwardRef<FiresOnlyMapHandle, FiresOnlyMapProps>(
  function FiresOnlyMap(
    {
      firesTimeline,
      userLngLat = null,
      routeWaypoints = null,
      mapFocusBounds = null,
      onMapReady,
      onFiresStatusChange,
    }: FiresOnlyMapProps,
    ref,
  ) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const firesTimelineRef = useRef(firesTimeline);
  firesTimelineRef.current = firesTimeline;
  /** Persist across effect remounts so CONUS→global swaps can union, not replace. */
  const lastFeaturesRef = useRef<FireFeature[]>([]);
  const refreshFiresRef = useRef<(() => void) | null>(null);
  const routeWpRef = useRef(routeWaypoints);
  routeWpRef.current = routeWaypoints;
  const onMapReadyRef = useRef(onMapReady);
  onMapReadyRef.current = onMapReady;
  const onFiresStatusChangeRef = useRef(onFiresStatusChange);
  onFiresStatusChangeRef.current = onFiresStatusChange;
  const [mapReady, setMapReady] = useState(false);

  const firesTimelineKey = [
    firesTimeline.date ?? "",
    firesTimeline.source ?? "",
    firesTimeline.days,
    firesTimeline.maxPoints,
    firesTimeline.layerPreset,
  ].join("|");

  useImperativeHandle(
    ref,
    () => ({
      refreshViewportFires: () => {
        refreshFiresRef.current?.();
      },
      resetWorldView() {
        const run = () => {
          const m = mapRef.current;
          if (!m) return;
          m.stop();
          m.resize();
          m.flyTo({
            center: WORLD_MAP_CENTER,
            zoom: WORLD_MAP_ZOOM,
            bearing: 0,
            pitch: 0,
            duration: 900,
            essential: true,
          });
        };

        let waitMap = 0;
        const waitForMapThenRun = () => {
          const m = mapRef.current;
          if (m) {
            let attempts = 0;
            const tryRun = () => {
              const mm = mapRef.current;
              if (!mm) return;
              if (mm.loaded()) {
                window.setTimeout(run, 0);
                return;
              }
              attempts += 1;
              if (attempts > 120) {
                window.setTimeout(run, 0);
                return;
              }
              window.setTimeout(tryRun, 25);
            };
            tryRun();
            return;
          }
          waitMap += 1;
          if (waitMap > 80) return;
          window.setTimeout(waitForMapThenRun, 16);
        };
        waitForMapThenRun();
      },
      focusOnResolvedPin({ center, waypoints }) {
        const extend = (b: maplibregl.LngLatBounds, lon: number, lat: number) =>
          b.extend([lon, lat]);

        const run = () => {
          const m = mapRef.current;
          if (!m) return;
          m.stop();
          m.resize();

          if (waypoints && waypoints.length >= 2) {
            const b = new maplibregl.LngLatBounds();
            extend(b, center[0], center[1]);
            for (const [lon, lat] of waypoints) extend(b, lon, lat);
            m.fitBounds(b, { padding: 72, maxZoom: 14, duration: 900 });
            return;
          }

          m.flyTo({
            center,
            zoom: 12.5,
            duration: 1000,
            essential: true,
          });
        };

        /**
         * Map is created in a child `useEffect`; parent focus may run the same tick.
         * Never rely on `load` alone: it fires once; if `loaded()` is briefly false,
         * `once("load")` would never run.
         */
        let waitMap = 0;
        const waitForMapThenRun = () => {
          const m = mapRef.current;
          if (m) {
            let attempts = 0;
            const tryRun = () => {
              const mm = mapRef.current;
              if (!mm) return;
              if (mm.loaded()) {
                window.setTimeout(run, 0);
                return;
              }
              attempts += 1;
              if (attempts > 120) {
                window.setTimeout(run, 0);
                return;
              }
              window.setTimeout(tryRun, 25);
            };
            tryRun();
            return;
          }
          waitMap += 1;
          if (waitMap > 80) return;
          window.setTimeout(waitForMapThenRun, 16);
        };
        waitForMapThenRun();
      },
    }),
    [],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const map = new maplibregl.Map({
      container: el,
      style: BASE_STYLE,
      center: WORLD_MAP_CENTER,
      zoom: WORLD_MAP_ZOOM,
      minZoom: 0.75,
      maxZoom: 18,
      pitch: 0,
      bearing: 0,
      attributionControl: { compact: true },
    });

    mapRef.current = map;

    map.on("error", (e) => console.error("[FiresOnlyMap]", e.error));
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "bottom-right",
    );

    let raf = 0;

    const pulsePaint = () => {
      if (!map.getStyle() || !map.getLayer("fires-core")) {
        raf = requestAnimationFrame(pulsePaint);
        return;
      }
      const t = performance.now() / 1000;
      const fade = 0.5 + 0.5 * Math.sin(t * 2.75);
      const bob = 1 + 0.11 * Math.sin(t * 3.55);
      const glowScale = bob * (0.96 + 0.06 * Math.sin(t * 1.9));

      map.setPaintProperty("fires-glow", "circle-opacity", 0.06 + 0.16 * fade);
      map.setPaintProperty(
        "fires-glow",
        "circle-radius",
        glowRadiusExpr(glowScale),
      );
      map.setPaintProperty("fires-core", "circle-opacity", 0.74 + 0.22 * fade);
      map.setPaintProperty("fires-core", "circle-radius", coreRadiusExpr(bob));
      raf = requestAnimationFrame(pulsePaint);
    };

    const onLoad = () => {
      map.resize();
      requestAnimationFrame(() => map.resize());

      /**
       * Start empty. The shell shows a loading overlay until the first real
       * FIRMS response resolves; no mock seed data is painted.
       */
      const seedFeatures =
        lastFeaturesRef.current.length > 0 ? lastFeaturesRef.current : [];
      map.addSource("fires", {
        type: "geojson",
        data: { type: "FeatureCollection", features: seedFeatures },
      });

      map.addLayer({
        id: "fires-glow",
        type: "circle",
        source: "fires",
        paint: {
          "circle-radius": glowRadiusExpr(1),
          "circle-color": "rgba(255, 59, 59, 0.14)",
          "circle-blur": 0.85,
          "circle-opacity": 0.12,
        },
      });

      map.addLayer({
        id: "fires-core",
        type: "circle",
        source: "fires",
        paint: {
          "circle-radius": coreRadiusExpr(1),
          "circle-color": [
            "match",
            ["get", "confidence"],
            "high",
            "#ff3b3b",
            "med",
            "#ff7a45",
            "#ffb020",
          ],
          "circle-opacity": 0.9,
          "circle-stroke-width": 1.2,
          "circle-stroke-color": "rgba(40, 6, 6, 0.92)",
        },
      });

      raf = requestAnimationFrame(pulsePaint);
      setMapReady(true);
      onMapReadyRef.current?.();
    };

    map.on("load", onLoad);

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el);

    return () => {
      setMapReady(false);
      map.off("load", onLoad);
      cancelAnimationFrame(raf);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !map.getSource("fires")) return;

    let abort: AbortController | null = null;
    /** First fetch after an effect (re)mount unions with what’s already painted. */
    let firstFetchAfterMount = true;

    const setFc = (
      src: maplibregl.GeoJSONSource,
      fc: FirmsFeatureCollection,
    ) => {
      src.setData(
        fc as unknown as Parameters<maplibregl.GeoJSONSource["setData"]>[0],
      );
    };

    const unionFeatures = (
      prev: FireFeature[],
      next: FireFeature[],
    ): FireFeature[] => {
      const seen = new Set<string>();
      const out: FireFeature[] = [];
      for (const f of [...prev, ...next]) {
        const c = f.geometry?.coordinates;
        if (!Array.isArray(c) || c.length < 2) continue;
        const k = `${c[1].toFixed(4)}|${c[0].toFixed(4)}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(f);
      }
      return out;
    };

    const runFetch = () => {
      const m = mapRef.current;
      const firesSrc = m?.getSource("fires") as maplibregl.GeoJSONSource | undefined;
      if (!m || !firesSrc) return;

      const b = m.getBounds();
      const url = buildFirmsUrlForViewport(
        {
          west: b.getWest(),
          south: b.getSouth(),
          east: b.getEast(),
          north: b.getNorth(),
        },
        m.getZoom(),
        firesTimelineRef.current,
      );

      abort?.abort();
      abort = new AbortController();
      const { signal } = abort;

      /** Only flip to "loading" if nothing is painted yet; avoid flashing the overlay on refetch. */
      if (lastFeaturesRef.current.length === 0) {
        onFiresStatusChangeRef.current?.("loading");
      }

      void (async () => {
        try {
          const res = await fetch(url, { cache: "no-store", signal });
          if (signal.aborted) return;
          if (!res.ok) {
            onFiresStatusChangeRef.current?.("error");
            return;
          }
          const fc = (await res.json()) as FirmsFeatureCollection;
          if (signal.aborted) return;
          const target = mapRef.current?.getSource("fires") as
            | maplibregl.GeoJSONSource
            | undefined;
          if (!target) return;
          if (!Array.isArray(fc.features) || fc.features.length === 0) {
            onFiresStatusChangeRef.current?.("error");
            return;
          }
          const merged =
            firstFetchAfterMount && lastFeaturesRef.current.length > 0
              ? unionFeatures(lastFeaturesRef.current, fc.features)
              : fc.features;
          firstFetchAfterMount = false;
          lastFeaturesRef.current = merged;
          setFc(target, { type: "FeatureCollection", features: merged });
          onFiresStatusChangeRef.current?.("ready");
        } catch {
          if (!signal.aborted) onFiresStatusChangeRef.current?.("error");
        }
      })();
    };

    refreshFiresRef.current = runFetch;

    /**
     * Fetch once per effect (re)mount only — pan/zoom must never refetch, otherwise
     * the layer flashes empty while a new request is in flight. If the effect
     * re-runs with prior features in memory, the first response unions with them.
     */
    runFetch();

    return () => {
      refreshFiresRef.current = null;
      abort?.abort();
    };
  }, [mapReady, firesTimelineKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.loaded()) return;
    syncRoute(map, routeWaypoints ?? null);
    syncUser(map, userLngLat ?? null);
  }, [mapReady, userLngLat, routeWaypoints]);

  const mapFocusKey = mapFocusBounds
    ? `${mapFocusBounds.west},${mapFocusBounds.south},${mapFocusBounds.east},${mapFocusBounds.north}`
    : "";

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.loaded() || !mapFocusBounds) return;

    const { west, south, east, north } = mapFocusBounds;
    const bounds: maplibregl.LngLatBoundsLike = [
      [west, south],
      [east, north],
    ];

    const apply = () => {
      map.stop();
      map.resize();
      map.fitBounds(bounds, {
        padding: { top: 56, bottom: 56, left: 56, right: 56 },
        duration: 850,
        maxZoom: 11,
      });
    };

    const t = window.setTimeout(apply, 0);
    return () => window.clearTimeout(t);
  }, [mapReady, mapFocusKey, mapFocusBounds]);

  return (
    <div
      ref={containerRef}
      className="h-full min-h-0 w-full min-w-0 touch-none"
      aria-label="Fire activity map"
    />
  );
  },
);
