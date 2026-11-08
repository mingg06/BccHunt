"use client";
import { useEffect, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { gameMs, ago } from "@/lib/time";
import type { MapCircle, MapMarker } from "@/components/GameMap";
import type { Player, RevealPoint } from "@/lib/types";
import type { GameState } from "./useGame";
import type { GeoFix } from "./device";
import { useNow } from "./device";

export const PING_EMOJI = { here: "📍", danger: "⚠️", target: "🎯", help: "🆘" } as const;

export interface LastKnown {
  player: Player;
  pt: RevealPoint;
  gms: number;
  seq: number;
}

/** Shared derived state for the play screen and the host dashboard. */
export function useGameView(st: GameState, myFix: GeoFix | null, opts: { omniscient?: boolean } = {}) {
  const t = useNow(250, st.now);
  const g = st.game!;
  const s = g.settings;
  const me = st.me;
  const gm = gameMs(g, t);
  const H = s.headstartSec * 1000;
  const inHeadstart = gm < H;
  const paused = !!g.paused_at;
  const timeLeft = Math.max(0, (g.end_gms ?? 0) - gm);
  const toReveal = g.next_reveal_gms != null ? g.next_reveal_gms - gm : null;
  const toShrink = g.next_shrink_gms != null ? g.next_shrink_gms - gm : null;
  const byId = useMemo(() => new Map(st.players.map((p) => [p.id, p])), [st.players]);

  // ── call tick when a boundary passes (server is the source of truth; cron is the backstop)
  const ticked = useRef<number>(-1);
  useEffect(() => {
    if (g.status !== "live" || paused) return;
    const bounds = [g.released ? null : H, g.next_reveal_gms, g.next_shrink_gms, g.end_gms].filter((x): x is number => x != null);
    const due = bounds.filter((b) => gm >= b);
    if (due.length === 0) return;
    const b = Math.min(...due);
    if (ticked.current === b) return;
    ticked.current = b;
    const delay = 150 + Math.random() * 700; // spread load across phones
    const id = setTimeout(() => void supabase().rpc("tick_game", { p_game: g.id }), delay);
    return () => clearTimeout(id);
  }, [gm, g.status, g.released, g.next_reveal_gms, g.next_shrink_gms, g.end_gms, g.id, H, paused]);

  // ── last known positions of each shadow from reveals
  const lastKnown = useMemo(() => {
    const m = new Map<string, LastKnown>();
    for (const r of st.reveals) {
      for (const pt of r.shadows) {
        const p = byId.get(pt.player_id);
        if (!p) continue;
        const cur = m.get(pt.player_id);
        if (!cur || r.seq > cur.seq) m.set(pt.player_id, { player: p, pt, gms: r.gms, seq: r.seq });
      }
    }
    return m;
  }, [st.reveals, byId]);

  const lastReveal = st.reveals.length ? st.reveals[st.reveals.length - 1] : null;

  const shadows = st.players.filter((p) => p.role === "shadow");
  const shadowsAlive = shadows.filter((p) => p.status === "alive").length;
  const hunters = st.players.filter((p) => p.role === "hunter");

  // ── map layers
  const { markers, circles } = useMemo(() => {
    const markers: MapMarker[] = [];
    const circles: MapCircle[] = [];
    const role = opts.omniscient ? "spectator" : (me?.role ?? "spectator");
    const nowMs = st.now();

    // revealed shadows
    for (const lk of lastKnown.values()) {
      if (lk.player.status !== "alive" || lk.player.role !== "shadow") continue;
      const age = gm - lk.gms;
      const isMe = lk.player.id === me?.id;
      if (role === "hunter" || role === "spectator" || isMe) {
        markers.push({
          id: `rv-${lk.player.id}`,
          lat: lk.pt.lat,
          lng: lk.pt.lng,
          color: "#9b6bff",
          emoji: lk.player.emoji,
          label: isMe ? "Hunters saw you here" : `${lk.player.nickname} · ${ago(age)}`,
          kind: role === "hunter" ? "reveal" : "ghost",
          pulse: age < 20000 && role === "hunter",
          stale: age > 90000,
        });
        if (lk.pt.fuzz) circles.push({ id: `fz-${lk.player.id}`, lat: lk.pt.lat, lng: lk.pt.lng, r: lk.pt.fuzz, color: "#9b6bff", opacity: 0.16 });
      }
    }

    // hunters revealed to shadows ("at reveals" mode)
    if (role === "shadow" && lastReveal?.hunters) {
      for (const pt of lastReveal.hunters) {
        const p = byId.get(pt.player_id);
        if (!p || st.positions.has(pt.player_id)) continue;
        markers.push({ id: `rh-${p.id}`, lat: pt.lat, lng: pt.lng, color: "#f5a524", emoji: p.emoji, label: `${p.nickname} · ${ago(gm - lastReveal.gms)}`, kind: "enemy", stale: true });
      }
    }

    // live positions the server lets us see
    for (const pos of st.positions.values()) {
      const p = byId.get(pos.player_id);
      if (!p || p.id === me?.id || p.status === "kicked") continue;
      if (p.role === "spectator") continue;
      const stale = nowMs - Date.parse(pos.ts) > 30000;
      const enemy = role !== "spectator" && p.role !== role;
      markers.push({
        id: `p-${p.id}`,
        lat: pos.lat,
        lng: pos.lng,
        color: p.role === "hunter" ? "#f5a524" : "#9b6bff",
        emoji: p.status === "tagged" ? "💀" : p.emoji,
        label: p.nickname,
        kind: enemy ? "enemy" : "ally",
        stale: stale || p.status === "tagged",
      });
    }

    // pings
    for (const pg of st.pings) {
      const p = byId.get(pg.player_id);
      markers.push({
        id: `pg-${pg.id}`,
        lat: pg.lat,
        lng: pg.lng,
        color: pg.team === "hunter" ? "#f5a524" : "#9b6bff",
        emoji: PING_EMOJI[pg.kind],
        label: p?.nickname,
        kind: "ping",
      });
    }

    // me
    if (myFix && me) {
      markers.push({ id: "me", lat: myFix.lat, lng: myFix.lng, color: me.role === "hunter" ? "#f5a524" : me.role === "shadow" ? "#9b6bff" : "#2ee6d6", emoji: me.emoji, kind: "me", heading: myFix.heading });
      if (myFix.acc > 15) circles.push({ id: "acc", lat: myFix.lat, lng: myFix.lng, r: myFix.acc, color: "#ffffff", opacity: 0.06 });
    }
    return { markers, circles };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastKnown, lastReveal, st.positions, st.pings, byId, me, myFix, Math.floor(gm / 5000), opts.omniscient]);

  return {
    t,
    gm,
    H,
    inHeadstart,
    paused,
    timeLeft,
    toReveal,
    toShrink,
    lastKnown,
    lastReveal,
    markers,
    circles,
    shadows,
    hunters,
    shadowsAlive,
    byId,
  };
}
