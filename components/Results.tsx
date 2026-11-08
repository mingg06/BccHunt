"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { Footprints, Home, Pause, Play as PlayIcon, Shield, Timer, Zap } from "lucide-react";
import { Avatar, Button, Card, Segmented, cn, ROLE_META } from "./ui";
import { supabase } from "@/lib/supabase";
import { computeStats, groupTracks, positionAt, startingTeam, type Tracks } from "@/lib/stats";
import { formatDistance } from "@/lib/geo";
import { fmtClock } from "@/lib/time";
import { fx } from "@/lib/fx";
import type { GameState } from "@/hooks/useGame";
import type { LogPoint, Zone } from "@/lib/types";
import type { MapMarker } from "./GameMap";

const GameMap = dynamic(() => import("./GameMap"), { ssr: false });

async function loadLog(gameId: string): Promise<LogPoint[]> {
  const sb = supabase();
  const out: LogPoint[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb
      .from("position_log")
      .select("player_id,lat,lng,acc,gms")
      .eq("game_id", gameId)
      .order("gms")
      .range(from, from + page - 1);
    if (error || !data) break;
    out.push(...(data as LogPoint[]));
    if (data.length < page) break;
  }
  return out;
}

export function Results({ st }: { st: GameState }) {
  const g = st.game!;
  const [tracks, setTracks] = useState<Tracks | null>(null);
  const endGms = useMemo(() => {
    const end = st.events.find((e) => e.type === "end");
    return end?.gms ?? g.end_gms ?? 0;
  }, [st.events, g.end_gms]);

  useEffect(() => {
    void loadLog(g.id).then((l) => setTracks(groupTracks(l)));
  }, [g.id]);

  useEffect(() => {
    const myTeam = st.me ? startingTeam(st.me, st.events) : null;
    if (g.winner && myTeam === g.winner) fx.win();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => (tracks ? computeStats(st.players, tracks, st.events, endGms) : []), [tracks, st.players, st.events, endGms]);
  const tagEvents = st.events.filter((e) => e.type === "tag");
  const winner = g.winner;
  const wm = winner ? ROLE_META[winner] : null;

  const mvpHunter = [...stats].filter((x) => x.team === "hunter").sort((a, b) => b.tags - a.tags || b.distanceM - a.distanceM)[0];
  const mvpShadow = [...stats].filter((x) => x.team === "shadow").sort((a, b) => (b.survivalMs ?? 0) - (a.survivalMs ?? 0) || (a.closestCallM ?? 1e9) - (b.closestCallM ?? 1e9))[0];
  const closest = [...stats].filter((x) => x.closestCallM != null).sort((a, b) => a.closestCallM! - b.closestCallM!)[0];
  const marathon = [...stats].sort((a, b) => b.distanceM - a.distanceM)[0];

  const [tab, setTab] = useState<"replay" | "stats">("replay");

  return (
    <main className="grid-bg min-h-dvh">
      <div className="mx-auto max-w-lg space-y-4 px-5 pb-10 safe-top">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="pt-6 text-center">
          <div className="text-6xl">{winner ? (winner === "hunter" ? "🎯" : "🌑") : "🤝"}</div>
          <h1 className="mt-3 text-4xl font-bold tracking-tight" style={{ color: wm?.color }}>
            {winner ? `${wm!.label}s win!` : "Game over"}
          </h1>
          <p className="mt-1 text-muted">
            {g.end_reason === "all_tagged" ? "Every Shadow was caught" : g.end_reason === "time" ? "The Shadows outlasted the clock" : "Ended by the host"} ·{" "}
            {fmtClock(endGms)} played · {tagEvents.length} tag{tagEvents.length === 1 ? "" : "s"}
          </p>
        </motion.div>

        <div className="grid grid-cols-2 gap-2">
          {mvpHunter && <Award icon={<Zap className="size-4" />} title="Top Hunter" who={mvpHunter.player} value={`${mvpHunter.tags} tag${mvpHunter.tags === 1 ? "" : "s"}`} color="var(--color-hunter)" />}
          {mvpShadow && <Award icon={<Shield className="size-4" />} title="Best Shadow" who={mvpShadow.player} value={`survived ${fmtClock(mvpShadow.survivalMs ?? 0)}`} color="var(--color-shadow)" />}
          {closest && <Award icon={<Timer className="size-4" />} title="Closest call" who={closest.player} value={`${formatDistance(closest.closestCallM!)} from a Hunter`} color="var(--color-danger)" />}
          {marathon && marathon.distanceM > 0 && <Award icon={<Footprints className="size-4" />} title="Marathon" who={marathon.player} value={formatDistance(marathon.distanceM)} color="var(--color-zone)" />}
        </div>

        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "replay", label: "▶ Replay" },
            { value: "stats", label: "📊 Stats" },
          ]}
        />

        {tab === "replay" ? (
          tracks ? (
            <Replay st={st} tracks={tracks} endGms={endGms} />
          ) : (
            <Card className="py-16 text-center text-muted">Loading routes…</Card>
          )
        ) : (
          <Card className="p-2">
            <table className="w-full text-left text-[13px]">
              <thead className="text-[11px] uppercase tracking-wider text-faint">
                <tr>
                  <th className="p-2">Player</th>
                  <th className="p-2 text-right">Distance</th>
                  <th className="p-2 text-right">Tags</th>
                  <th className="p-2 text-right">Survived</th>
                </tr>
              </thead>
              <tbody>
                {stats
                  .filter((x) => x.team !== "spectator")
                  .sort((a, b) => (a.team === b.team ? b.distanceM - a.distanceM : a.team === "shadow" ? -1 : 1))
                  .map((x) => (
                    <tr key={x.player.id} className="border-t border-line">
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <Avatar player={x.player} size={28} />
                          <div>
                            <div className="font-medium">{x.player.nickname}</div>
                            <div className="text-[11px]" style={{ color: ROLE_META[x.team].color }}>
                              {ROLE_META[x.team].label}
                              {x.taggedBy && ` · tagged by ${x.taggedBy}`}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-2 text-right font-mono tabular">{formatDistance(x.distanceM)}</td>
                      <td className="p-2 text-right font-mono tabular">{x.team === "hunter" ? x.tags : "—"}</td>
                      <td className="p-2 text-right font-mono tabular">{x.survivalMs != null ? fmtClock(x.survivalMs) : "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Card>
        )}

        <Card>
          <div className="mb-3 text-[15px] font-semibold">Timeline</div>
          <ol className="space-y-2.5">
            {st.events
              .filter((e) => ["start", "release", "reveal", "shrink", "tag", "tag_disputed", "pause", "resume", "end", "host_tag", "revive"].includes(e.type))
              .map((e) => (
                <li key={e.id} className="flex gap-3 text-[13px]">
                  <span className="w-12 shrink-0 font-mono text-faint tabular">{fmtClock(e.gms ?? 0)}</span>
                  <span>{describe(e.type, e.data as Record<string, string>, st)}</span>
                </li>
              ))}
          </ol>
        </Card>

        <Button size="lg" variant="outline" className="w-full" onClick={() => (window.location.href = "/")}>
          <Home className="size-5" /> Back to home
        </Button>
      </div>
    </main>
  );
}

function describe(type: string, d: Record<string, string>, st: GameState): string {
  const name = (id?: string) => st.players.find((p) => p.id === id)?.nickname ?? "Someone";
  switch (type) {
    case "start": return "🏁 Game started — Shadows ran";
    case "release": return "🚨 Hunters released";
    case "reveal": return d.kind === "penalty" ? `📡 ${name(d.player_id)} revealed (left the zone)` : d.kind === "forced" ? "📡 Host forced a reveal" : `📡 Reveal #${d.seq}`;
    case "shrink": return `🌀 Zone shrank (stage ${d.stage})`;
    case "tag": return `💀 ${d.hunter} tagged ${d.shadow}${d.distance_m ? ` (${formatDistance(Number(d.distance_m))})` : ""}`;
    case "tag_disputed": return `⚖️ ${name(d.shadow_id)} disputed a tag by ${name(d.hunter_id)}`;
    case "host_tag": return `💀 Host marked ${name(d.player_id)} as tagged`;
    case "revive": return `❤️ Host revived ${name(d.player_id)}`;
    case "pause": return "⏸ Paused";
    case "resume": return "▶️ Resumed";
    case "end": return `🏆 Game over${d.winner ? ` — ${d.winner}s win` : ""}`;
    default: return type;
  }
}

function Award({ icon, title, who, value, color }: { icon: React.ReactNode; title: string; who: { emoji: string; color: string; nickname: string }; value: string; color: string }) {
  return (
    <div className="rounded-3xl border border-line bg-surface p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color }}>
        {icon} {title}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Avatar player={who} size={30} />
        <div className="min-w-0">
          <div className="truncate font-semibold">{who.nickname}</div>
          <div className="truncate text-[12px] text-muted">{value}</div>
        </div>
      </div>
    </div>
  );
}

function Replay({ st, tracks, endGms }: { st: GameState; tracks: Tracks; endGms: number }) {
  const g = st.game!;
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(30);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      setT((cur) => {
        const n = cur + dt * speed;
        if (n >= endGms) {
          setPlaying(false);
          return endGms;
        }
        return n;
      });
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, speed, endGms]);

  const tagAt = useMemo(() => {
    const m = new Map<string, number>();
    st.events.filter((e) => e.type === "tag").forEach((e) => m.set(String(e.data.shadow_id), e.gms ?? 0));
    return m;
  }, [st.events]);

  const zoneAt = useMemo(() => {
    let z: Zone | null = g.zone;
    for (const e of st.events) if (e.type === "shrink" && (e.gms ?? 0) <= t) z = e.data.zone as Zone;
    return g.settings.zoneEnabled ? z : null;
  }, [st.events, t, g.zone, g.settings.zoneEnabled]);

  const markers: MapMarker[] = [];
  const trails: { id: string; color: string; coords: [number, number][] }[] = [];
  for (const p of st.players) {
    const tr = tracks.get(p.id);
    if (!tr) continue;
    const team = startingTeam(p, st.events);
    if (team === "spectator") continue;
    const tg = tagAt.get(p.id);
    const isHunterNow = team === "hunter" || (tg != null && t >= tg && g.settings.taggedBecome === "hunter");
    const out = tg != null && t >= tg && !isHunterNow;
    const pos = positionAt(tr, t);
    const color = isHunterNow ? "#f5a524" : "#9b6bff";
    trails.push({ id: p.id, color, coords: tr.filter((x) => x.gms <= t).map((x) => [x.lng, x.lat]) });
    if (pos) markers.push({ id: p.id, lat: pos.lat, lng: pos.lng, color, emoji: out ? "💀" : p.emoji, label: p.nickname, kind: isHunterNow ? "enemy" : "ally", stale: out });
  }
  for (const r of st.reveals) {
    if (t >= r.gms && t < r.gms + 15000) {
      r.shadows.forEach((pt) => markers.push({ id: `rv-${r.id}-${pt.player_id}`, lat: pt.lat, lng: pt.lng, color: "#9b6bff", kind: "reveal", pulse: true, emoji: "📡" }));
    }
  }
  const recent = st.events.filter((e) => ["reveal", "tag", "shrink", "release"].includes(e.type) && (e.gms ?? 0) <= t).slice(-1)[0];

  return (
    <Card className="overflow-hidden p-0">
      <div className="relative h-[52dvh]">
        <GameMap className="absolute inset-0" zone={zoneAt} markers={markers} trails={trails} initialCenter={g.zone} fitKey={1} />
        {recent && (
          <div className="glass absolute inset-x-3 top-3 z-10 rounded-2xl px-3 py-2 text-[13px]">
            <span className="font-mono text-faint">{fmtClock(recent.gms ?? 0)}</span> {describe(recent.type, recent.data as Record<string, string>, st)}
          </div>
        )}
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          <button onClick={() => (t >= endGms && setT(0), setPlaying((p) => !p))} className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ink text-bg">
            {playing ? <Pause className="size-5" /> : <PlayIcon className="size-5 fill-current" />}
          </button>
          <div className="flex-1">
            <TimelineScrubber t={t} end={endGms} onChange={(v) => (setPlaying(false), setT(v))} events={st.events} />
          </div>
          <span className="w-14 text-right font-mono text-sm tabular">{fmtClock(t)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-muted">Speed</span>
          <div className="flex gap-1">
            {[10, 30, 60, 120].map((x) => (
              <button key={x} onClick={() => setSpeed(x)} className={cn("rounded-lg px-2.5 py-1 font-mono text-[12px]", speed === x ? "bg-white/15 text-ink" : "text-muted")}>
                {x}×
              </button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function TimelineScrubber({ t, end, onChange, events }: { t: number; end: number; onChange: (v: number) => void; events: GameState["events"] }) {
  const marks = events.filter((e) => e.type === "tag" || e.type === "reveal" || e.type === "shrink");
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-[3px] h-2">
        {marks.map((e) => (
          <span
            key={e.id}
            className="absolute top-0 h-2 w-[3px] -translate-x-1/2 rounded-full"
            style={{
              left: `${((e.gms ?? 0) / Math.max(1, end)) * 100}%`,
              background: e.type === "tag" ? "var(--color-danger)" : e.type === "shrink" ? "var(--color-zone)" : "var(--color-hunter)",
            }}
          />
        ))}
      </div>
      <input
        type="range"
        min={0}
        max={end}
        step={1000}
        value={t}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ["--fill" as string]: `${(t / Math.max(1, end)) * 100}%`, ["--accent" as string]: "var(--color-ink)" }}
      />
    </div>
  );
}
