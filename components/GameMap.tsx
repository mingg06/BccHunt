"use client";
import { useEffect, useRef, useState } from "react";
import { Map as MlMap, Marker, LngLatBounds, type GeoJSONSource, type MapMouseEvent } from "maplibre-gl";
import { Layers, LocateFixed } from "lucide-react";
import { circleRing } from "@/lib/geo";
import type { Zone } from "@/lib/types";
import { cn } from "./ui";

export type MarkerKind = "me" | "ally" | "enemy" | "reveal" | "ping" | "ghost";

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  color: string;
  emoji?: string;
  label?: string;
  kind: MarkerKind;
  heading?: number | null;
  stale?: boolean;
  pulse?: boolean;
  onClick?: () => void;
}

export interface MapCircle {
  id: string;
  lat: number;
  lng: number;
  r: number;
  color: string;
  opacity?: number;
}

const STYLES = {
  dark: "https://tiles.openfreemap.org/styles/dark",
  streets: "https://tiles.openfreemap.org/styles/liberty",
} as const;

type StyleKey = keyof typeof STYLES;

function markerHtml(m: MapMarker): string {
  const label = m.label ? `<div class="bh-label">${escapeHtml(m.label)}</div>` : "";
  if (m.kind === "ping") {
    return `<div class="bh-ping" style="--c:${m.color}"><span class="bh-ping-ring"></span><span class="bh-ping-dot">${m.emoji ?? "📍"}</span>${label}</div>`;
  }
  if (m.kind === "reveal" || m.kind === "ghost") {
    return `<div class="bh-reveal ${m.kind === "ghost" ? "bh-ghost" : ""} ${m.stale ? "bh-stale" : ""}" style="--c:${m.color}">
      ${m.pulse ? '<span class="bh-ring"></span><span class="bh-ring bh-ring2"></span>' : ""}
      <span class="bh-dot">${m.emoji ?? "🌑"}</span>${label}</div>`;
  }
  const arrow =
    m.kind === "me" && m.heading != null
      ? `<span class="bh-heading" style="transform:rotate(${m.heading}deg)"></span>`
      : "";
  return `<div class="bh-player bh-${m.kind} ${m.stale ? "bh-stale" : ""}" style="--c:${m.color}">
    ${arrow}${m.kind === "me" ? '<span class="bh-ring"></span>' : ""}
    <span class="bh-dot">${m.emoji ?? ""}</span>${label}</div>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function circleFeature(c: { lat: number; lng: number; r: number }, props: Record<string, unknown> = {}) {
  return {
    type: "Feature" as const,
    properties: props,
    geometry: { type: "Polygon" as const, coordinates: [circleRing(c, c.r)] },
  };
}

function maskFeature(z: Zone) {
  const world: [number, number][] = [
    [-180, -85],
    [180, -85],
    [180, 85],
    [-180, 85],
    [-180, -85],
  ];
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "Polygon" as const, coordinates: [world, circleRing(z, z.r).reverse()] },
  };
}

const EMPTY = { type: "FeatureCollection" as const, features: [] };

export interface GameMapProps {
  className?: string;
  zone?: Zone | null;
  nextZone?: Zone | null;
  markers?: MapMarker[];
  circles?: MapCircle[];
  trails?: { id: string; color: string; coords: [number, number][] }[];
  me?: { lat: number; lng: number } | null;
  initialCenter?: { lat: number; lng: number } | null;
  onMapClick?: (p: { lat: number; lng: number }) => void;
  onLongPress?: (p: { lat: number; lng: number }) => void;
  fitKey?: string | number;
  interactive?: boolean;
}

export default function GameMap({
  className,
  zone,
  nextZone,
  markers = [],
  circles = [],
  trails = [],
  me,
  initialCenter,
  onMapClick,
  onLongPress,
  fitKey,
}: GameMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markerRefs = useRef(new Map<string, { m: Marker; html: string }>());
  const [ready, setReady] = useState(0);
  const [styleKey, setStyleKey] = useState<StyleKey>(() => {
    try {
      return (localStorage.getItem("bcchunt-map") as StyleKey) || "dark";
    } catch {
      return "dark";
    }
  });
  const clickRef = useRef(onMapClick);
  const longRef = useRef(onLongPress);
  clickRef.current = onMapClick;
  longRef.current = onLongPress;
  const centeredOnce = useRef(false);

  // init
  useEffect(() => {
    if (!el.current) return;
    const c = initialCenter ?? zone ?? me ?? { lat: 3.139, lng: 101.6869 };
    const m = new MlMap({
      container: el.current,
      style: STYLES[styleKey],
      center: [c.lng, c.lat],
      zoom: 15.5,
      attributionControl: { compact: true },
      pitchWithRotate: false,
    });
    map.current = m;
    m.on("style.load", () => {
      ensureLayers(m);
      setReady((n) => n + 1);
    });
    m.on("click", (e: MapMouseEvent) => clickRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
    let pressTimer: ReturnType<typeof setTimeout> | null = null;
    const start = (e: MapMouseEvent) => {
      const ll = e.lngLat;
      pressTimer = setTimeout(() => longRef.current?.({ lat: ll.lat, lng: ll.lng }), 550);
    };
    const cancel = () => pressTimer && clearTimeout(pressTimer);
    m.on("touchstart", start as never);
    m.on("touchend", cancel);
    m.on("touchmove", cancel);
    m.on("contextmenu", (e: MapMouseEvent) => longRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
    m.on("dragstart", cancel);
    const refs = markerRefs.current;
    return () => {
      refs.forEach((x) => x.m.remove());
      refs.clear();
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // style switch (skip the initial render: the map was created with this style)
  const appliedStyle = useRef(styleKey);
  useEffect(() => {
    const m = map.current;
    if (!m || appliedStyle.current === styleKey) return;
    appliedStyle.current = styleKey;
    try {
      localStorage.setItem("bcchunt-map", styleKey);
    } catch {}
    m.setStyle(STYLES[styleKey]);
  }, [styleKey]);

  // zone + circles + trails
  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded() || !m.getSource("zone")) return;
    (m.getSource("zone") as GeoJSONSource).setData(zone ? { type: "FeatureCollection", features: [circleFeature(zone)] } : EMPTY);
    (m.getSource("mask") as GeoJSONSource).setData(zone ? { type: "FeatureCollection", features: [maskFeature(zone)] } : EMPTY);
    (m.getSource("next") as GeoJSONSource).setData(
      nextZone ? { type: "FeatureCollection", features: [circleFeature(nextZone)] } : EMPTY,
    );
    (m.getSource("circles") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: circles.map((c) => circleFeature(c, { color: c.color, opacity: c.opacity ?? 0.18 })),
    });
    (m.getSource("trails") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: trails
        .filter((t) => t.coords.length > 1)
        .map((t) => ({
          type: "Feature" as const,
          properties: { color: t.color },
          geometry: { type: "LineString" as const, coordinates: t.coords },
        })),
    });
  }, [zone, nextZone, circles, trails, ready]);

  // markers (diffed)
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const seen = new Set<string>();
    for (const mk of markers) {
      seen.add(mk.id);
      const html = markerHtml(mk);
      const existing = markerRefs.current.get(mk.id);
      if (existing) {
        existing.m.setLngLat([mk.lng, mk.lat]);
        if (existing.html !== html) {
          existing.m.getElement().innerHTML = html;
          existing.html = html;
        }
        existing.m.getElement().onclick = mk.onClick ? (e) => (e.stopPropagation(), mk.onClick!()) : null;
      } else {
        const div = document.createElement("div");
        div.innerHTML = html;
        div.style.zIndex = mk.kind === "me" ? "5" : "3";
        if (mk.onClick) div.onclick = (e) => (e.stopPropagation(), mk.onClick!());
        const marker = new Marker({ element: div, anchor: "center" }).setLngLat([mk.lng, mk.lat]).addTo(m);
        markerRefs.current.set(mk.id, { m: marker, html });
      }
    }
    for (const [id, x] of markerRefs.current) {
      if (!seen.has(id)) {
        x.m.remove();
        markerRefs.current.delete(id);
      }
    }
  }, [markers]);

  // fit to zone when asked
  useEffect(() => {
    const m = map.current;
    if (!m || !zone) return;
    const ring = circleRing(zone, zone.r * 1.1, 24);
    const b = ring.reduce((acc, p) => acc.extend(p), new LngLatBounds(ring[0], ring[0]));
    m.fitBounds(b, { padding: 40, duration: centeredOnce.current ? 600 : 0 });
    centeredOnce.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  const recenter = () => {
    const m = map.current;
    if (!m) return;
    if (me) m.easeTo({ center: [me.lng, me.lat], zoom: Math.max(m.getZoom(), 16), duration: 500 });
    else if (zone) m.easeTo({ center: [zone.lng, zone.lat], duration: 500 });
  };

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {/* inline style: maplibre's unlayered CSS (position:relative) beats Tailwind's layered utilities */}
      <div ref={el} style={{ position: "absolute", inset: 0 }} />
      <div className="pointer-events-none absolute bottom-24 right-3 z-[2] flex flex-col gap-2">
        <button
          onClick={() => setStyleKey((s) => (s === "dark" ? "streets" : "dark"))}
          className="glass pointer-events-auto grid size-11 place-items-center rounded-2xl text-ink active:scale-95"
          aria-label="Toggle map style"
        >
          <Layers className="size-5" />
        </button>
        <button
          onClick={recenter}
          className="glass pointer-events-auto grid size-11 place-items-center rounded-2xl text-ink active:scale-95"
          aria-label="Center on me"
        >
          <LocateFixed className="size-5" />
        </button>
      </div>
      <style>{MARKER_CSS}</style>
    </div>
  );
}

function ensureLayers(m: MlMap) {
  const add = (id: string) => !m.getSource(id) && m.addSource(id, { type: "geojson", data: EMPTY });
  ["mask", "zone", "next", "circles", "trails"].forEach(add);
  if (!m.getLayer("mask-fill"))
    m.addLayer({ id: "mask-fill", type: "fill", source: "mask", paint: { "fill-color": "#ff2d55", "fill-opacity": 0.12 } });
  if (!m.getLayer("zone-fill"))
    m.addLayer({ id: "zone-fill", type: "fill", source: "zone", paint: { "fill-color": "#2ee6d6", "fill-opacity": 0.05 } });
  if (!m.getLayer("zone-line"))
    m.addLayer({
      id: "zone-line",
      type: "line",
      source: "zone",
      paint: { "line-color": "#2ee6d6", "line-width": 3, "line-opacity": 0.9 },
    });
  if (!m.getLayer("next-line"))
    m.addLayer({
      id: "next-line",
      type: "line",
      source: "next",
      paint: { "line-color": "#ffffff", "line-width": 2, "line-dasharray": [2, 2], "line-opacity": 0.75 },
    });
  if (!m.getLayer("circles-fill"))
    m.addLayer({
      id: "circles-fill",
      type: "fill",
      source: "circles",
      paint: { "fill-color": ["get", "color"], "fill-opacity": ["get", "opacity"] },
    });
  if (!m.getLayer("circles-line"))
    m.addLayer({
      id: "circles-line",
      type: "line",
      source: "circles",
      paint: { "line-color": ["get", "color"], "line-width": 1.5, "line-opacity": 0.7 },
    });
  if (!m.getLayer("trails-line"))
    m.addLayer({
      id: "trails-line",
      type: "line",
      source: "trails",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": ["get", "color"], "line-width": 3, "line-opacity": 0.75 },
    });
}

const MARKER_CSS = `
.bh-player,.bh-reveal,.bh-ping{position:relative;display:grid;place-items:center;cursor:pointer}
.bh-dot{position:relative;display:grid;place-items:center;width:34px;height:34px;border-radius:999px;font-size:18px;
  background:color-mix(in oklab,var(--c) 30%,#0b0c12);box-shadow:inset 0 0 0 2.5px var(--c),0 4px 14px rgba(0,0,0,.5);z-index:2}
.bh-me .bh-dot{width:40px;height:40px;font-size:21px;box-shadow:inset 0 0 0 3px #fff,0 0 0 3px var(--c),0 6px 18px rgba(0,0,0,.6)}
.bh-enemy .bh-dot{box-shadow:inset 0 0 0 2.5px var(--c),0 0 18px var(--c)}
.bh-label{position:absolute;top:100%;margin-top:4px;white-space:nowrap;font:600 11px/1 var(--font-sans);color:#fff;
  padding:3px 6px;border-radius:6px;background:rgba(7,8,12,.78);border:1px solid rgba(255,255,255,.08);z-index:3}
.bh-ring{position:absolute;inset:0;margin:auto;width:34px;height:34px;border-radius:999px;border:2px solid var(--c);
  animation:pulse-ring 1.8s cubic-bezier(.2,.6,.4,1) infinite}
.bh-ring2{animation-delay:.9s}
.bh-reveal .bh-dot{background:color-mix(in oklab,var(--c) 55%,#0b0c12);box-shadow:0 0 0 3px #0b0c12,0 0 0 5px var(--c),0 0 24px var(--c)}
.bh-ghost .bh-dot{opacity:.55;filter:saturate(.4);box-shadow:0 0 0 2px #0b0c12,0 0 0 3.5px var(--c)}
.bh-stale{opacity:.55}
.bh-heading{position:absolute;width:0;height:0;top:-14px;left:50%;margin-left:-7px;border-left:7px solid transparent;
  border-right:7px solid transparent;border-bottom:12px solid var(--c);transform-origin:7px 34px;z-index:1}
.bh-ping-dot{display:grid;place-items:center;width:30px;height:30px;border-radius:10px;font-size:16px;background:#0b0c12;
  box-shadow:inset 0 0 0 2px var(--c),0 0 16px var(--c);transform:rotate(0deg)}
.bh-ping-ring{position:absolute;inset:0;margin:auto;width:30px;height:30px;border-radius:10px;border:2px solid var(--c);
  animation:pulse-ring 1.4s ease-out infinite}
`;
