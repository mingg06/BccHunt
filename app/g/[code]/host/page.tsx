"use client";
import { use, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { ArrowLeft, Maximize2, Skull, Heart } from "lucide-react";
import { useGame } from "@/hooks/useGame";
import { useGameView } from "@/hooks/useGameView";
import { HostButtons } from "@/components/HostControls";
import { Avatar, Card, RoleBadge, Sheet, cn, ROLE_META } from "@/components/ui";
import { Splash } from "@/components/JoinGate";
import { rpc } from "@/lib/supabase";
import { fmtClock, ago } from "@/lib/time";
import type { Player, Role } from "@/lib/types";

const GameMap = dynamic(() => import("@/components/GameMap"), { ssr: false });

export default function HostPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const st = useGame(code);
  if (st.load === "loading") return <Splash label="Connecting…" />;
  if (!st.game || !st.me) return <Splash label="Join this room first." error retry={() => (window.location.href = `/g/${code}`)} />;
  return <Dashboard st={st} />;
}

function Dashboard({ st }: { st: ReturnType<typeof useGame> }) {
  const g = st.game!;
  // the host only gets omniscient data from the server if they are a spectator (anti-cheat)
  const omniscient = st.me?.role === "spectator";
  const v = useGameView(st, null, { omniscient });
  const [sel, setSel] = useState<Player | null>(null);
  const [tv, setTv] = useState(false);

  const feed = useMemo(() => [...st.events].reverse().slice(0, 60), [st.events]);

  const stateLabel =
    g.status === "lobby" ? "In lobby" : g.status === "ended" ? "Ended" : v.paused ? "Paused" : v.inHeadstart ? "Head start" : "Hunting";

  return (
    <main className={cn("grid min-h-dvh bg-bg lg:grid-cols-[1fr_400px]", tv && "lg:grid-cols-1")}>
      <div className="relative h-[60dvh] lg:h-dvh">
        <GameMap className="absolute inset-0" zone={g.zone_current ?? g.zone} nextZone={g.zone_next} markers={v.markers} circles={v.circles} initialCenter={g.zone} fitKey={g.zone_stage} />
        <div className="safe-top absolute inset-x-0 top-0 z-10 flex items-start gap-2 px-3">
          <a href={`/g/${g.code}`} className="glass grid size-11 place-items-center rounded-2xl">
            <ArrowLeft className="size-5" />
          </a>
          <div className="glass flex items-center gap-4 rounded-2xl px-4 py-2">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted">Room</div>
              <div className="font-mono text-lg font-bold tracking-widest">{g.code}</div>
            </div>
            <Stat label={stateLabel} value={g.status === "live" ? fmtClock(v.timeLeft) : "—"} />
            {g.status === "live" && <Stat label={v.inHeadstart ? "Release" : "Next reveal"} value={v.inHeadstart ? fmtClock(v.H - v.gm) : v.toReveal != null ? fmtClock(v.toReveal) : "—"} />}
            <Stat label="Shadows" value={`${v.shadowsAlive}/${v.shadows.length}`} />
          </div>
          <button onClick={() => setTv((x) => !x)} className="glass ml-auto hidden size-11 place-items-center rounded-2xl lg:grid" aria-label="Big-screen mode">
            <Maximize2 className="size-5" />
          </button>
        </div>
        {!omniscient && (
          <div className="glass absolute bottom-3 left-3 z-10 max-w-xs rounded-2xl px-3 py-2 text-[12px] text-muted">
            You're playing as a {ROLE_META[st.me!.role].label}, so the map only shows what your team can see. Set yourself to Spectator to see everyone.
          </div>
        )}
      </div>

      {!tv && (
        <aside className="space-y-3 overflow-y-auto border-l border-line p-4 lg:h-dvh">
          {st.isHost && g.status === "live" && (
            <Card>
              <div className="mb-3 text-[15px] font-semibold">Controls</div>
              <HostButtons game={g} />
            </Card>
          )}
          {!st.isHost && <Card className="text-sm text-muted">Spectator view. Only the host can change the game.</Card>}

          <Card>
            <div className="mb-2 text-[15px] font-semibold">Players</div>
            {(["shadow", "hunter", "spectator"] as Role[]).map((r) => {
              const list = st.players.filter((p) => p.role === r);
              if (!list.length) return null;
              return (
                <div key={r} className="mb-3">
                  <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: ROLE_META[r].color }}>
                    {ROLE_META[r].label}s
                  </div>
                  {list.map((p) => {
                    const pos = st.positions.get(p.id);
                    const seen = st.now() - Date.parse(pos?.ts ?? p.last_seen);
                    return (
                      <button key={p.id} disabled={!st.isHost} onClick={() => setSel(p)} className="flex w-full items-center gap-2.5 rounded-xl p-1.5 text-left hover:bg-white/5">
                        <Avatar player={p} size={30} dim={p.status !== "alive"} />
                        <div className="flex-1">
                          <div className={cn("text-[14px] font-medium", p.status === "tagged" && "line-through text-muted")}>{p.nickname}</div>
                          <div className={cn("text-[11px]", seen > 30000 ? "text-danger" : "text-muted")}>
                            {p.out_since && p.role === "shadow" && p.status === "alive" ? "⚠️ outside zone · " : ""}
                            GPS {ago(seen)}
                          </div>
                        </div>
                        {p.status === "tagged" && <Skull className="size-4 text-muted" />}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </Card>

          <Card>
            <div className="mb-2 text-[15px] font-semibold">Live feed</div>
            <ol className="space-y-2">
              {feed.map((e) => {
                const d = e.data as Record<string, string>;
                const name = (id?: string) => st.players.find((p) => p.id === id)?.nickname ?? "?";
                const text =
                  e.type === "tag" ? `💀 ${d.hunter} tagged ${d.shadow}` :
                  e.type === "reveal" ? (d.kind === "penalty" ? `📡 ${name(d.player_id)} out-of-zone reveal` : `📡 Reveal (${d.count} shown)`) :
                  e.type === "tag_disputed" ? `⚖️ ${name(d.shadow_id)} disputed ${name(d.hunter_id)}'s tag` :
                  e.type === "shrink" ? `🌀 Zone stage ${d.stage}` :
                  e.type === "join" ? `👋 ${d.nickname} joined` :
                  e.type === "release" ? "🚨 Hunters released" :
                  e.type === "start" ? "🏁 Started" :
                  e.type === "end" ? `🏆 Ended${d.winner ? ` — ${d.winner}s win` : ""}` :
                  e.type === "pause" ? "⏸ Paused" : e.type === "resume" ? "▶️ Resumed" : e.type === "settings" ? "⚙️ Rules changed" :
                  e.type === "host_tag" ? `💀 ${name(d.player_id)} marked tagged` : e.type === "revive" ? `❤️ ${name(d.player_id)} revived` : e.type;
                return (
                  <li key={e.id} className="flex gap-2 text-[13px]">
                    <span className="w-11 shrink-0 font-mono text-faint tabular">{fmtClock(e.gms ?? 0)}</span>
                    <span>{text}</span>
                  </li>
                );
              })}
            </ol>
          </Card>
        </aside>
      )}

      <Sheet open={!!sel} onClose={() => setSel(null)} title={sel ? `${sel.emoji} ${sel.nickname}` : ""}>
        {sel && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <RoleBadge role={sel.role} /> <span className="text-sm text-muted">{sel.status}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(["hunter", "shadow", "spectator"] as Role[]).map((r) => (
                <button
                  key={r}
                  onClick={() => rpc("set_role", { p_game: g.id, p_player: sel.id, p_role: r }).then(() => setSel(null)).catch((e) => toast.error(e.message))}
                  className={cn("rounded-2xl border px-2 py-3 text-sm font-semibold", sel.role === r ? "bg-white/5" : "border-line text-muted")}
                  style={sel.role === r ? { borderColor: ROLE_META[r].color, color: ROLE_META[r].color } : undefined}
                >
                  {ROLE_META[r].icon} {ROLE_META[r].label}
                </button>
              ))}
            </div>
            {sel.role === "shadow" && g.status === "live" && (
              <button
                onClick={() => rpc("set_player_status", { p_game: g.id, p_player: sel.id, p_status: sel.status === "alive" ? "tagged" : "alive" }).then(() => setSel(null)).catch((e) => toast.error(e.message))}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-surface-2 py-3 font-semibold"
              >
                {sel.status === "alive" ? <><Skull className="size-4" /> Mark as tagged</> : <><Heart className="size-4" /> Revive</>}
              </button>
            )}
            {sel.user_id !== g.host_id && (
              <button onClick={() => rpc("kick_player", { p_game: g.id, p_player: sel.id }).then(() => setSel(null)).catch((e) => toast.error(e.message))} className="w-full rounded-2xl py-3 font-semibold text-danger">
                Remove from game
              </button>
            )}
          </div>
        )}
      </Sheet>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className="font-mono text-lg font-bold tabular">{value}</div>
    </div>
  );
}
