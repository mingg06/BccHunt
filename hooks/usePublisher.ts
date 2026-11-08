"use client";
import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { GeoFix } from "./device";

/** Sends the device's latest GPS fix to the server every `everyMs`. */
export function usePublisher(gameId: string | undefined, fix: GeoFix | null, enabled: boolean, everyMs = 3000) {
  const latest = useRef<GeoFix | null>(null);
  latest.current = fix;
  const lastSent = useRef(0);
  const lastBeat = useRef(0);

  useEffect(() => {
    if (!gameId || !enabled) return;
    const sb = supabase();
    let inFlight = false;
    const send = async () => {
      const f = latest.current;
      if (!f || inFlight) return;
      // unchanged fix: only heartbeat every ~15 s
      if (f.ts === lastSent.current && Date.now() - lastBeat.current < 15000) return;
      inFlight = true;
      lastBeat.current = Date.now();
      try {
        await sb.rpc("report_position", {
          p_game: gameId,
          p_lat: f.lat,
          p_lng: f.lng,
          p_acc: Math.round(f.acc),
          p_heading: f.heading ?? null,
        });
        lastSent.current = f.ts;
      } finally {
        inFlight = false;
      }
    };
    void send();
    const t = setInterval(send, everyMs);
    return () => clearInterval(t);
  }, [gameId, enabled, everyMs]);
}
