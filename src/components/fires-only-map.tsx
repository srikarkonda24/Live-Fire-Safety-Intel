"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MapFocusBBox } from "@/lib/map-focus-catalog";

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

export type FiresOnlyMapProps = {
  /** Same-origin URL (e.g. `/api/firms?...`) for GeoJSON fire points. */
  firesDataUrl: string;
  userLngLat?: [number, number] | null;
  routeWaypoints?: [number, number][] | null;
  /** When set, map animates to this box (country / region picker). */
  mapFocusBounds?: MapFocusBBox | null;
};

export function FiresOnlyMap({
  firesDataUrl,
  userLngLat = null,
  routeWaypoints = null,
  mapFocusBounds = null,
}: FiresOnlyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const firesUrlRef = useRef(firesDataUrl);
  firesUrlRef.current = firesDataUrl;
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const map = new maplibregl.Map({
      container: el,
      style: BASE_STYLE,
      center: [0, 18],
      zoom: 1.12,
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

      map.addSource("fires", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
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

      (map.getSource("fires") as maplibregl.GeoJSONSource).setData(
        firesUrlRef.current,
      );

      raf = requestAnimationFrame(pulsePaint);
      setMapReady(true);
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
    if (!mapReady || !map?.getSource("fires")) return;
    (map.getSource("fires") as maplibregl.GeoJSONSource).setData(firesDataUrl);
  }, [mapReady, firesDataUrl]);

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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.loaded()) return;
    if (mapFocusBounds) return;

    const extend = (b: maplibregl.LngLatBounds, lon: number, lat: number) =>
      b.extend([lon, lat]);

    if (!userLngLat) return;

    const b = new maplibregl.LngLatBounds();
    extend(b, userLngLat[0], userLngLat[1]);
    if (routeWaypoints?.length) {
      for (const [lon, lat] of routeWaypoints) extend(b, lon, lat);
    } else {
      extend(b, userLngLat[0] + 0.035, userLngLat[1] + 0.035);
      extend(b, userLngLat[0] - 0.035, userLngLat[1] - 0.035);
    }

    const id = window.setTimeout(() => {
      map.stop();
      map.resize();
      map.fitBounds(b, { padding: 72, maxZoom: 11, duration: 900 });
    }, 0);

    return () => window.clearTimeout(id);
  }, [mapReady, mapFocusBounds, userLngLat, routeWaypoints]);

  return (
    <div
      ref={containerRef}
      className="h-dvh w-full min-w-0 touch-none"
      aria-label="Fire activity map"
    />
  );
}
