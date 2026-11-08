"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export function useNow(intervalMs = 250, now: () => number = Date.now) {
  const [t, setT] = useState(() => now());
  useEffect(() => {
    const id = setInterval(() => setT(now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, now]);
  return t;
}

export interface GeoFix {
  lat: number;
  lng: number;
  acc: number;
  heading: number | null;
  speed: number | null;
  ts: number;
}

export type GeoStatus = "idle" | "prompt" | "watching" | "denied" | "unavailable";

export function useGeolocation(enabled: boolean) {
  const [fix, setFix] = useState<GeoFix | null>(null);
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      return;
    }
    setStatus("prompt");
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setStatus("watching");
        setError(null);
        setFix({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          acc: p.coords.accuracy,
          heading: p.coords.heading,
          speed: p.coords.speed,
          ts: p.timestamp,
        });
      },
      (e) => {
        if (e.code === e.PERMISSION_DENIED) setStatus("denied");
        setError(e.message);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);

  return { fix, status, error };
}

/** Keeps the screen awake while `active`. Re-acquires after tab becomes visible. */
export function useWakeLock(active: boolean) {
  const lock = useRef<WakeLockSentinel | null>(null);
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let cancelled = false;
    const acquire = async () => {
      try {
        lock.current = await navigator.wakeLock.request("screen");
        if (cancelled) return void lock.current.release();
        setHeld(true);
        lock.current.addEventListener("release", () => setHeld(false));
      } catch {
        setHeld(false);
      }
    };
    void acquire();
    const onVis = () => document.visibilityState === "visible" && void acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      void lock.current?.release();
      lock.current = null;
    };
  }, [active]);
  return held;
}

/** Device compass heading (degrees from north), if available. */
export function useCompass() {
  const [heading, setHeading] = useState<number | null>(null);
  const [needsPermission, setNeedsPermission] = useState(false);

  const attach = useCallback(() => {
    const handler = (e: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
      if (typeof e.webkitCompassHeading === "number") setHeading(e.webkitCompassHeading);
      else if (e.absolute && e.alpha != null) setHeading((360 - e.alpha) % 360);
    };
    window.addEventListener("deviceorientationabsolute", handler as EventListener, true);
    window.addEventListener("deviceorientation", handler as EventListener, true);
    return () => {
      window.removeEventListener("deviceorientationabsolute", handler as EventListener, true);
      window.removeEventListener("deviceorientation", handler as EventListener, true);
    };
  }, []);

  useEffect(() => {
    const DOE = (typeof window !== "undefined" ? window.DeviceOrientationEvent : undefined) as
      | (typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> })
      | undefined;
    if (!DOE) return;
    if (typeof DOE.requestPermission === "function") {
      setNeedsPermission(true);
      return;
    }
    return attach();
  }, [attach]);

  const request = useCallback(async () => {
    const DOE = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<string>;
    };
    try {
      if ((await DOE.requestPermission?.()) === "granted") {
        setNeedsPermission(false);
        attach();
      }
    } catch {}
  }, [attach]);

  return { heading, needsPermission, request };
}
