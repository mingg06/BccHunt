"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Crown, Hand, MapPin, MessageCircle, Navigation, Pause, Users, Volume2, VolumeX, Zap } from "lucide-react";
import { Avatar, Button, RoleBadge, ROLE_META, Sheet, cn } from "./ui";
import { ChatSheet } from "./ChatSheet";
import { HostButtons } from "./HostControls";
import { bearing, compassLabel, distance, formatDistance } from "@/lib/geo";
import { fmtClock } from "@/lib/time";
import { fx, isMuted, setMuted, unlockAudio } from "@/lib/fx";
import { rpc } from "@/lib/supabase";
import { useCompass, useGeolocation, useWakeLock } from "@/hooks/device";
import { usePublisher } from "@/hooks/usePublisher";
import { PING_EMOJI, useGameView } from "@/hooks/useGameView";
import type { GameState } from "@/hooks/useGame";
import type { Ping, Player, Tag } from "@/lib/types";

const GameMap = dynamic(() => import("./GameMap"), { ssr: false });

interface Moment {
  id: number;
  title: string;
  sub?: string;
  color: string;
  icon: string;
}

export function Play({ st }: { st: GameState }) {
  const g = st.game!;
  const s = g.settings;
  const me = st.me!;
  const geo = useGeolocation(true);
  const playing = me.role !== "spectator" && me.status === "alive";
  usePublisher(g.id, geo.fix, me.role !== "spectator");
  useWakeLock(true);
  const compass = useCompass();
  const v = useGameView(st, geo.fix);

  const [chatOpen, setChatOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [playersOpen, setPlayersOpen] = useState(false);
  const [hostOpen, setHostOpen] = useState(false);
  const [pingAt, setPingAt] = useState<{ lat: number; lng: number } | null>(null);
  const [muted, setMutedState] = useState(false);
  const [moment, setMoment] = useState<Moment | null>(null);
  const [seenMsgs, setSeenMsgs] = useState(0);
  const [fitKey] = useState(() => Date.now());

  useEffect(() => setMutedState(isMuted()), []);

  const show = (m: Omit<Moment, "id">, ms = 2600) => {
    const id = Date.now();
    setMoment({ ...m, id });
    setTimeout(() => setMoment((cur) => (cur?.id === id ? null : cur)), ms);
  };

  // ── role intro on first mount
  useEffect(() => {
    const m = ROLE_META[me.role];
    show(
      {
        title: `You're a ${m.label}`,
        sub: v.inHeadstart
          ? me.role === "shadow"
            ? `Run! Hunters are released in ${fmtClock(v.H - v.gm)}`
            : me.role === "hunter"
              ? `Shadows are hiding. You're released in ${fmtClock(v.H - v.gm)}`
              : m.tagline
          : m.tagline,
        color: m.color,
        icon: m.icon,
      },
      3500,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── react to new events (toasts, sounds, moments)
  const lastEvent = useRef<number | null>(null);
  useEffect(() => {
    const evs = st.events;
    if (lastEvent.current === null) {
      lastEvent.current = evs.length ? evs[evs.length - 1].id : 0;
      return;
    }
    const fresh = evs.filter((e) => e.id > lastEvent.current!);
    if (!fresh.length) return;
    lastEvent.current = fresh[fresh.length - 1].id;
    for (const e of fresh) {
      const d = e.data as Record<string, string>;
      switch (e.type) {
        case "release":
          fx.warn();
          show({ title: "Hunters released!", sub: me.role === "shadow" ? "Stay hidden." : "Go get them.", color: "var(--color-hunter)", icon: "🚨" });
          break;
        case "reveal": {
          const penalty = d.kind === "penalty";
          const p = penalty ? v.byId.get(d.player_id) : null;
          fx.reveal();
          if (penalty) {
            if (d.player_id === me.id) show({ title: "You were revealed", sub: "You left the zone too long", color: "var(--color-danger)", icon: "📡" });
            else toast(`📡 ${p?.nickname ?? "A Shadow"} revealed for leaving the zone`);
          } else
            show(
              {
                title: me.role === "shadow" ? "You've been revealed" : "Shadows revealed",
                sub: me.role === "shadow" ? "Hunters can see where you are — move!" : `${d.count ?? 0} location${d.count === "1" ? "" : "s"} on the map`,
                color: "var(--color-shadow)",
                icon: "📡",
              },
              2200,
            );
          break;
        }
        case "shrink":
          fx.zone();
          toast("🌀 The zone has shrunk", { description: "Stay inside the solid circle." });
          break;
        case "tag": {
          const self = d.shadow_id === me.id;
          fx.tag();
          if (self)
            show(
              s.taggedBecome === "hunter"
                ? { title: "You've been infected 🧟", sub: "You're a Hunter now", color: "var(--color-hunter)", icon: "🧟" }
                : { title: "You've been tagged", sub: `by ${d.hunter}`, color: "var(--color-danger)", icon: "💀" },
              3500,
            );
          else toast(`💀 ${d.shadow} was tagged by ${d.hunter}`);
          break;
        }
        case "tag_disputed":
          if (d.hunter_id === me.id || d.shadow_id === me.id) toast.error("Tag was disputed");
          break;
        case "pause":
          fx.warn();
          break;
        case "resume":
          fx.warn();
          toast("▶️ Game resumed");
          break;
        case "revive":
          if (d.player_id === me.id) toast.success("The host brought you back in");
          break;
        case "join":
          toast(`👋 ${d.nickname} joined`);
          break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.events]);

  // ── countdown beeps
  const lastBeep = useRef<number | null>(null);
  useEffect(() => {
    if (v.paused) return;
    const target = v.inHeadstart ? v.H - v.gm : v.toReveal;
    if (target == null) return;
    const sec = Math.ceil(target / 1000);
    if (sec === lastBeep.current) return;
    lastBeep.current = sec;
    if (sec === 30 || sec === 10) fx.warn();
    else if (sec > 0 && sec <= 5 && (me.role === "shadow" || v.inHeadstart)) fx.tick();
  }, [v.gm, v.toReveal, v.inHeadstart, v.H, v.paused, me.role]);

  // ── zone check (client side, for warnings)
  const zone = g.zone_current;
  const outside = useMemo(() => {
    if (!zone || !geo.fix) return null;
    const d = distance(zone, geo.fix) - zone.r;
    return d > 0 ? d : null;
  }, [zone, geo.fix]);
  const outsideSince = useRef<number | null>(null);
  useEffect(() => {
    if (outside != null && outsideSince.current == null) {
      outsideSince.current = Date.now();
      if (playing) fx.zone();
    } else if (outside == null) outsideSince.current = null;
  }, [outside, playing]);

  // ── tags involving me
  const incoming = st.tags.find(
    (t) =>
      t.status === "pending" &&
      st.now() - Date.parse(t.created_at) < 60000 &&
      ((t.initiated_by === "hunter" && t.shadow_id === me.id) || (t.initiated_by === "shadow" && t.hunter_id === me.id)),
  );
  const outgoing = st.tags.find(
    (t) =>
      t.status === "pending" &&
      st.now() - Date.parse(t.created_at) < 60000 &&
      ((t.initiated_by === "hunter" && t.hunter_id === me.id) || (t.initiated_by === "shadow" && t.shadow_id === me.id)),
  );
  const prevIncoming = useRef<string | null>(null);
  useEffect(() => {
    if (incoming && incoming.id !== prevIncoming.current) fx.request();
    prevIncoming.current = incoming?.id ?? null;
  }, [incoming]);
  const prevOutgoing = useRef<Tag | null>(null);
  useEffect(() => {
    const prev = prevOutgoing.current;
    if (prev && !outgoing) {
      const resolved = st.tags.find((t) => t.id === prev.id);
      if (resolved?.status === "rejected") toast.error("They disputed the tag");
      else if (resolved?.status === "expired") toast("Tag request expired");
    }
    prevOutgoing.current = outgoing ?? null;
  }, [outgoing, st.tags]);

  // ── nearest target for the compass
  const target = useMemo(() => {
    if (!geo.fix) return null;
    let best: { name: string; lat: number; lng: number; d: number; age?: number } | null = null;
    if (me.role === "hunter") {
      for (const lk of v.lastKnown.values()) {
        if (lk.player.status !== "alive" || lk.player.role !== "shadow") continue;
        const d = distance(geo.fix, lk.pt);
        if (!best || d < best.d) best = { name: lk.player.nickname, lat: lk.pt.lat, lng: lk.pt.lng, d, age: v.gm - lk.gms };
      }
    } else if (me.role === "shadow" && outside != null && zone) {
      best = { name: "Zone", lat: zone.lat, lng: zone.lng, d: distance(geo.fix, zone) };
    }
    return best;
  }, [geo.fix, me.role, v.lastKnown, v.gm, outside, zone]);

  const unread = st.messages.filter((m) => m.player_id !== me.id && (m.channel === "all" || m.channel === me.role)).length - seenMsgs;

  const dropPing = async (kind: Ping["kind"], at: { lat: number; lng: number }) => {
    setPingAt(null);
    try {
      await rpc("send_ping", { p_game: g.id, p_kind: kind, p_lat: at.lat, p_lng: at.lng });
      fx.pop();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const mainTimer = v.paused
    ? { label: "Paused", ms: null as number | null, color: "var(--color-muted)" }
    : v.inHeadstart
      ? { label: me.role === "hunter" ? "You're released in" : "Head start", ms: v.H - v.gm, color: "var(--color-shadow)", total: v.H }
      : v.toReveal != null
        ? { label: "Next reveal", ms: v.toReveal, color: "var(--color-hunter)", total: s.revealIntervalSec * 1000 }
        : { label: "No more reveals", ms: null, color: "var(--color-muted)" };

  return (
    <main className="fixed inset-0 overflow-hidden bg-bg" onPointerDown={unlockAudio}>
      <GameMap
        className="absolute inset-0"
        zone={zone}
        nextZone={g.zone_next}
        markers={v.markers}
        circles={v.circles}
        me={geo.fix}
        initialCenter={zone ?? geo.fix}
        fitKey={fitKey}
        onLongPress={me.role !== "spectator" ? (p) => setPingAt(p) : undefined}
      />

      {/* top HUD */}
      <div className="safe-top pointer-events-none absolute inset-x-0 top-0 z-10 px-3">
        <div className="pointer-events-auto mx-auto flex max-w-lg items-stretch gap-2">
          <div className="glass flex flex-1 items-center gap-2 rounded-2xl px-3 py-2">
            <Avatar player={me} size={32} dim={me.status !== "alive"} />
            <div className="min-w-0">
              <RoleBadge role={me.role} />
              <div className="truncate text-[12px] text-muted">{me.status === "tagged" ? "Tagged — spectating" : me.nickname}</div>
            </div>
          </div>
          <TimerRing {...mainTimer} />
          <div className="glass flex flex-1 flex-col items-end justify-center rounded-2xl px-3 py-2">
            <div className="font-mono text-lg font-bold tabular leading-none">{fmtClock(v.timeLeft)}</div>
            <div className="mt-1 text-[12px] text-muted">
              🌑 {v.shadowsAlive}/{v.shadows.length} hiding
            </div>
          </div>
        </div>

        {/* secondary chips */}
        <div className="pointer-events-auto mx-auto mt-2 flex max-w-lg flex-wrap justify-center gap-1.5">
          {v.toShrink != null && !v.inHeadstart && (
            <span className="glass rounded-full px-2.5 py-1 text-[12px] text-zone">🌀 Zone shrinks in {fmtClock(v.toShrink)}</span>
          )}
          {geo.status !== "watching" && (
            <span className="rounded-full bg-danger/90 px-2.5 py-1 text-[12px] font-semibold text-white">
              {geo.status === "denied" ? "📍 Location blocked" : "📍 Finding GPS…"}
            </span>
          )}
          {geo.fix && geo.fix.acc > 40 && <span className="glass rounded-full px-2.5 py-1 text-[12px] text-hunter">GPS weak ±{Math.round(geo.fix.acc)} m</span>}
          {compass.needsPermission && (
            <button onClick={compass.request} className="glass rounded-full px-2.5 py-1 text-[12px]">
              🧭 Enable compass
            </button>
          )}
        </div>

        {/* out of zone */}
        <AnimatePresence>
          {outside != null && playing && (
            <motion.div
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0 }}
              className="mx-auto mt-2 max-w-lg rounded-2xl bg-danger px-4 py-3 text-white shadow-lg"
            >
              <div className="font-semibold">⚠️ You're outside the zone</div>
              <div className="text-[13px] opacity-90">
                {formatDistance(outside)} out.{" "}
                {me.role === "shadow" && s.outOfZoneGraceSec > 0 ? `Get back or you'll be revealed after ${s.outOfZoneGraceSec}s.` : "Head back in."}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* compass card */}
      {target && (
        <div className="pointer-events-none absolute left-3 z-10" style={{ bottom: "calc(max(env(safe-area-inset-bottom),0.75rem) + 96px)" }}>
          <CompassCard
            from={geo.fix!}
            to={target}
            heading={compass.heading}
            label={me.role === "hunter" ? `Nearest ping · ${target.name}` : "Back to the zone"}
          />
        </div>
      )}

      {/* bottom bar */}
      <div className="safe-bottom absolute inset-x-0 bottom-0 z-10 px-3">
        <div className="mx-auto flex max-w-lg items-end gap-2">
          <RoundBtn
            onClick={() => {
              setChatOpen(true);
              setSeenMsgs(st.messages.filter((m) => m.player_id !== me.id && (m.channel === "all" || m.channel === me.role)).length);
            }}
            label="Chat"
            badge={unread > 0 ? unread : undefined}
          >
            <MessageCircle className="size-5" />
          </RoundBtn>
          {me.role !== "spectator" && (
            <RoundBtn onClick={() => geo.fix && setPingAt({ lat: geo.fix.lat, lng: geo.fix.lng })} label="Ping">
              <MapPin className="size-5" />
            </RoundBtn>
          )}
          <div className="flex-1">
            {me.role === "hunter" && me.status === "alive" && (
              <Button variant="hunter" size="xl" className="w-full rounded-3xl text-lg font-bold tracking-wide" disabled={v.inHeadstart || v.paused} onClick={() => setTagOpen(true)}>
                <Zap className="size-5 fill-current" /> {v.inHeadstart ? "Wait for release" : "TAG"}
              </Button>
            )}
            {me.role === "shadow" && me.status === "alive" && (
              <Button variant="outline" size="xl" className="w-full rounded-3xl border-shadow/60 bg-surface/80 backdrop-blur" disabled={v.inHeadstart || v.paused} onClick={() => setTagOpen(true)}>
                <Hand className="size-5" /> I got tagged
              </Button>
            )}
            {(me.role === "spectator" || me.status !== "alive") && (
              <div className="glass flex h-16 items-center justify-center rounded-3xl text-sm text-muted">
                {me.status === "tagged" ? "💀 You're out — keep watching" : "👁️ Spectating"}
              </div>
            )}
          </div>
          <RoundBtn onClick={() => setPlayersOpen(true)} label="Players">
            <Users className="size-5" />
          </RoundBtn>
          {st.isHost && (
            <RoundBtn onClick={() => setHostOpen(true)} label="Host">
              <Crown className="size-5 text-hunter" />
            </RoundBtn>
          )}
        </div>
      </div>

      {/* mute */}
      <button
        onClick={() => {
          setMuted(!muted);
          setMutedState(!muted);
        }}
        className="glass absolute right-3 z-[2] grid size-11 place-items-center rounded-2xl"
        style={{ bottom: "calc(max(env(safe-area-inset-bottom),0.75rem) + 200px)" }}
        aria-label="Toggle sound"
      >
        {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
      </button>

      {/* pause overlay */}
      <AnimatePresence>
        {v.paused && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 grid place-items-center bg-black/70 backdrop-blur-sm">
            <div className="text-center">
              <Pause className="mx-auto size-14" />
              <div className="mt-3 text-3xl font-bold">Game paused</div>
              <div className="mt-1 text-muted">The clock is frozen. Hang tight.</div>
              {st.isHost && (
                <Button className="mt-6" size="lg" onClick={() => rpc("resume_game", { p_game: g.id }).catch((e) => toast.error(e.message))}>
                  Resume
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* full-screen moments */}
      <AnimatePresence>
        {moment && (
          <motion.div
            key={moment.id}
            className="pointer-events-none absolute inset-0 z-40 grid place-items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 45%, color-mix(in oklab, ${moment.color} 45%, transparent), rgb(0 0 0 / 0.75) 70%)` }} />
            <motion.div initial={{ scale: 0.85, y: 10 }} animate={{ scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 20 }} className="relative px-8 text-center">
              <div className="text-7xl">{moment.icon}</div>
              <div className="mt-4 text-4xl font-bold tracking-tight" style={{ color: moment.color }}>
                {moment.title}
              </div>
              {moment.sub && <div className="mt-2 text-lg text-ink/90">{moment.sub}</div>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* incoming tag */}
      <AnimatePresence>{incoming && <IncomingTag key={incoming.id} tag={incoming} me={me} byId={v.byId} now={st.now} />}</AnimatePresence>

      {/* sheets */}
      <TagSheet open={tagOpen} onClose={() => setTagOpen(false)} st={st} lastKnown={v.lastKnown} myPos={geo.fix} outgoing={outgoing} />
      <ChatSheet open={chatOpen} onClose={() => setChatOpen(false)} gameId={g.id} me={me} players={st.players} messages={st.messages} />
      <PlayersSheet open={playersOpen} onClose={() => setPlayersOpen(false)} st={st} myPos={geo.fix} />
      <Sheet open={!!pingAt} onClose={() => setPingAt(null)} title="Drop a ping for your team">
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(PING_EMOJI) as Ping["kind"][]).map((k) => (
            <button key={k} onClick={() => pingAt && dropPing(k, pingAt)} className="rounded-2xl bg-surface-2 py-4 text-center active:scale-95">
              <div className="text-3xl">{PING_EMOJI[k]}</div>
              <div className="mt-1 text-[12px] capitalize text-muted">{k}</div>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[12px] text-faint">Tip: long-press anywhere on the map to ping that spot. Pings vanish after 90 s.</p>
      </Sheet>
      {st.isHost && (
        <Sheet open={hostOpen} onClose={() => setHostOpen(false)} title="Host controls">
          <HostButtons game={g} compact />
          <a href={`/g/${g.code}/host`} className="mt-3 block text-center text-sm text-muted underline">
            Open full host dashboard
          </a>
        </Sheet>
      )}
    </main>
  );
}

function TimerRing({ label, ms, color, total }: { label: string; ms: number | null; color: string; total?: number }) {
  const frac = ms != null && total ? Math.max(0, Math.min(1, ms / total)) : 0;
  const urgent = ms != null && ms < 10000;
  const C = 2 * Math.PI * 34;
  return (
    <div className={cn("glass relative grid size-[88px] shrink-0 place-items-center rounded-full", urgent && "animate-pulse")}>
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="34" fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="5" />
        <circle cx="40" cy="40" r="34" fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} style={{ transition: "stroke-dashoffset .25s linear" }} />
      </svg>
      <div className="relative text-center">
        <div className="font-mono text-[19px] font-bold tabular leading-none" style={{ color: urgent ? "var(--color-danger)" : undefined }}>
          {ms != null ? fmtClock(ms) : "—"}
        </div>
        <div className="mx-auto mt-1 max-w-[70px] text-[9px] font-semibold uppercase leading-tight tracking-wider text-muted">{label}</div>
      </div>
    </div>
  );
}

function RoundBtn({ children, onClick, label, badge }: { children: React.ReactNode; onClick: () => void; label: string; badge?: number }) {
  return (
    <button onClick={onClick} className="glass relative flex size-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-3xl text-ink active:scale-95" aria-label={label}>
      {children}
      <span className="text-[10px] text-muted">{label}</span>
      {badge ? <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">{badge}</span> : null}
    </button>
  );
}

function CompassCard({ from, to, heading, label }: { from: { lat: number; lng: number }; to: { lat: number; lng: number; d: number; age?: number }; heading: number | null; label: string }) {
  const b = bearing(from, to);
  const rot = heading != null ? b - heading : b;
  return (
    <div className="glass flex items-center gap-3 rounded-2xl py-2 pl-2 pr-4">
      <div className="relative grid size-12 place-items-center rounded-full bg-surface-2">
        <Navigation className="size-6 text-hunter transition-transform duration-300" style={{ transform: `rotate(${rot - 45}deg)` }} fill="currentColor" />
        {heading == null && <span className="absolute -top-1 text-[9px] font-bold text-muted">N</span>}
      </div>
      <div>
        <div className="text-[11px] text-muted">{label}</div>
        <div className="font-mono text-lg font-bold tabular leading-tight">
          {formatDistance(to.d)} <span className="text-sm text-muted">{compassLabel(b)}</span>
        </div>
      </div>
    </div>
  );
}

function IncomingTag({ tag, me, byId, now }: { tag: Tag; me: Player; byId: Map<string, Player>; now: () => number }) {
  const other = byId.get(me.id === tag.hunter_id ? tag.shadow_id : tag.hunter_id);
  const [busy, setBusy] = useState(false);
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, 60000 - (now() - Date.parse(tag.created_at)));
  const respond = async (accept: boolean) => {
    setBusy(true);
    try {
      await rpc("respond_tag", { p_tag: tag.id, p_accept: accept });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const iAmShadow = me.id === tag.shadow_id;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 grid place-items-center bg-black/80 p-6 backdrop-blur">
      <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="w-full max-w-sm rounded-[32px] border border-line bg-surface p-6 text-center">
        {other && <Avatar player={other} size={72} />}
        <div className="mt-4 text-2xl font-bold">{iAmShadow ? `${other?.nickname} says they tagged you` : `${other?.nickname} says you tagged them`}</div>
        <div className="mt-1 text-muted">
          {tag.distance_m != null && `GPS distance ${formatDistance(tag.distance_m)} · `}
          {Math.ceil(left / 1000)}s to respond
        </div>
        <div className="mt-6 grid gap-2">
          <Button variant={iAmShadow ? "danger" : "hunter"} size="lg" loading={busy} onClick={() => respond(true)}>
            {iAmShadow ? "Yes, I was tagged" : "Confirm tag"}
          </Button>
          <Button variant="ghost" size="lg" disabled={busy} onClick={() => respond(false)}>
            Dispute
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function TagSheet({
  open,
  onClose,
  st,
  lastKnown,
  myPos,
  outgoing,
}: {
  open: boolean;
  onClose: () => void;
  st: GameState;
  lastKnown: ReturnType<typeof useGameView>["lastKnown"];
  myPos: { lat: number; lng: number } | null;
  outgoing: Tag | undefined;
}) {
  const me = st.me!;
  const g = st.game!;
  const [busy, setBusy] = useState<string | null>(null);
  const iAmHunter = me.role === "hunter";
  const targets = st.players
    .filter((p) => p.status === "alive" && p.role === (iAmHunter ? "shadow" : "hunter"))
    .map((p) => {
      const live = st.positions.get(p.id);
      const known = live ?? lastKnown.get(p.id)?.pt;
      return { p, d: known && myPos ? distance(myPos, known) : null };
    })
    .sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9));

  const request = async (p: Player) => {
    setBusy(p.id);
    try {
      await rpc("request_tag", { p_game: g.id, p_other: p.id });
      if (!g.settings.tagConfirm) onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const pendingWith = outgoing ? st.players.find((p) => p.id === (iAmHunter ? outgoing.shadow_id : outgoing.hunter_id)) : null;

  return (
    <Sheet open={open} onClose={onClose} title={iAmHunter ? "Who did you tag?" : "Who tagged you?"}>
      {outgoing && pendingWith ? (
        <div className="py-6 text-center">
          <div className="relative mx-auto grid size-24 place-items-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-hunter/30" />
            <Avatar player={pendingWith} size={72} />
          </div>
          <div className="mt-4 text-lg font-semibold">Waiting for {pendingWith.nickname} to confirm…</div>
          <div className="mt-1 text-sm text-muted">They have 60 seconds. If they dispute, the host can settle it.</div>
          <Button variant="ghost" className="mt-5" onClick={() => rpc("cancel_tag", { p_tag: outgoing.id }).catch(() => {})}>
            Cancel request
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {g.settings.tagRadiusM > 0 && <p className="text-[13px] text-muted">You must be within {g.settings.tagRadiusM} m (GPS-checked).</p>}
          {targets.map(({ p, d }) => (
            <button
              key={p.id}
              onClick={() => request(p)}
              disabled={!!busy}
              className="flex w-full items-center gap-3 rounded-2xl bg-surface-2 p-3 text-left active:scale-[0.98] disabled:opacity-50"
            >
              <Avatar player={p} size={40} />
              <div className="flex-1">
                <div className="font-semibold">{p.nickname}</div>
                <div className="text-[12px] text-muted">{d != null ? `~${formatDistance(d)} away` : "Distance unknown"}</div>
              </div>
              <span className={cn("rounded-xl px-3 py-1.5 text-sm font-bold", iAmHunter ? "bg-hunter text-black" : "bg-shadow text-white")}>
                {busy === p.id ? "…" : iAmHunter ? "Tag" : "Them"}
              </span>
            </button>
          ))}
          {targets.length === 0 && <div className="py-8 text-center text-muted">Nobody to tag.</div>}
        </div>
      )}
    </Sheet>
  );
}

function PlayersSheet({ open, onClose, st, myPos }: { open: boolean; onClose: () => void; st: GameState; myPos: { lat: number; lng: number } | null }) {
  const groups = (["shadow", "hunter", "spectator"] as const).map((r) => ({ r, list: st.players.filter((p) => p.role === r) })).filter((x) => x.list.length);
  return (
    <Sheet open={open} onClose={onClose} title="Players">
      <div className="space-y-4">
        {groups.map(({ r, list }) => (
          <div key={r}>
            <div className="mb-2 text-[12px] font-bold uppercase tracking-wider" style={{ color: ROLE_META[r].color }}>
              {ROLE_META[r].label}s · {list.filter((p) => p.status === "alive").length}/{list.length}
            </div>
            <div className="space-y-1.5">
              {list.map((p) => {
                const pos = st.positions.get(p.id);
                const d = pos && myPos && p.id !== st.me?.id ? distance(myPos, pos) : null;
                const online = st.now() - Date.parse(p.last_seen) < 45000;
                return (
                  <div key={p.id} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-2.5">
                    <Avatar player={p} size={36} dim={p.status !== "alive"} />
                    <div className="flex-1">
                      <div className={cn("font-medium", p.status !== "alive" && "text-muted line-through")}>
                        {p.nickname} {p.id === st.me?.id && <span className="text-[12px] text-muted">(you)</span>}
                      </div>
                      <div className="text-[12px] text-muted">
                        {p.status === "tagged" ? "Tagged" : online ? "Online" : "Signal lost"}
                        {d != null && ` · ${formatDistance(d)}`}
                      </div>
                    </div>
                    <span className={cn("size-2 rounded-full", online ? "bg-ok" : "bg-faint")} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
