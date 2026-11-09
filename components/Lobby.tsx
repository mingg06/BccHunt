"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { motion } from "motion/react";
import { Copy, LogOut, QrCode, Share2, Shuffle, SlidersHorizontal, Play as PlayIcon, Minus, Plus } from "lucide-react";
import { Avatar, Button, Card, RoleBadge, ROLE_META, Sheet, cn } from "./ui";
import { ZoneEditor } from "./ZoneEditor";
import { SettingsPanel, settingsSummary } from "./SettingsPanel";
import { rpc } from "@/lib/supabase";
import { PRESETS, applyPreset } from "@/lib/settings";
import { useGeolocation } from "@/hooks/device";
import { usePublisher } from "@/hooks/usePublisher";
import type { GameState } from "@/hooks/useGame";
import type { Player, Role, Settings, Zone } from "@/lib/types";

export function Lobby({ st }: { st: GameState }) {
  const game = st.game!;
  const host = st.isHost;
  const [settings, setSettings] = useState<Settings>(game.settings);
  const [zone, setZone] = useState<Zone | null>(game.zone);
  const [showSettings, setShowSettings] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);
  const [starting, setStarting] = useState(false);
  const dirty = useRef(false);
  const geo = useGeolocation(true);
  usePublisher(game.id, geo.fix, true, 5000);

  // follow server state unless we're mid-edit
  useEffect(() => {
    if (!dirty.current) {
      setSettings(game.settings);
      setZone(game.zone);
    }
  }, [game.settings, game.zone]);

  // debounce saves
  useEffect(() => {
    if (!host || !dirty.current) return;
    const t = setTimeout(async () => {
      try {
        await rpc("update_settings", { p_game: game.id, p_settings: settings, p_zone: zone });
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        dirty.current = false;
      }
    }, 450);
    return () => clearTimeout(t);
  }, [settings, zone, host, game.id]);

  const patch = (p: Partial<Settings>) => {
    dirty.current = true;
    setSettings((s) => ({ ...s, ...p, preset: "custom" }));
  };
  const setZ = (z: Zone) => {
    dirty.current = true;
    setZone(z);
  };

  // first-time zone: centre on host's GPS
  useEffect(() => {
    if (host && !zone && geo.fix) {
      const preset = PRESETS.find((p) => p.id === settings.preset);
      setZ({ lat: geo.fix.lat, lng: geo.fix.lng, r: preset?.zoneR ?? 500 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, geo.fix?.lat]);

  const teams = useMemo(() => {
    const by: Record<Role, Player[]> = { hunter: [], shadow: [], spectator: [] };
    st.players.forEach((p) => by[p.role].push(p));
    return by;
  }, [st.players]);

  const [shadowCount, setShadowCount] = useState(1);
  useEffect(() => {
    const n = teams.hunter.length + teams.shadow.length;
    setShadowCount((c) => Math.min(Math.max(1, c), Math.max(1, n - 1)));
  }, [teams.hunter.length, teams.shadow.length]);

  const blockers: string[] = [];
  if (teams.hunter.length < 1) blockers.push("at least 1 Hunter");
  if (teams.shadow.length < 1) blockers.push("at least 1 Shadow");
  if (settings.zoneEnabled && !zone) blockers.push("a play zone");

  const link = typeof window !== "undefined" ? `${window.location.origin}/g/${game.code}` : "";

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: "Join my BCCHunt game", text: `Room ${game.code}`, url: link });
      else {
        await navigator.clipboard.writeText(link);
        toast.success("Invite link copied");
      }
    } catch {}
  };

  const start = async () => {
    setStarting(true);
    try {
      if (dirty.current) await rpc("update_settings", { p_game: game.id, p_settings: settings, p_zone: zone });
      dirty.current = false;
      await rpc("start_game", { p_game: game.id });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  return (
    <main className="mx-auto min-h-dvh max-w-lg pb-36">
      {/* header */}
      <header className="safe-top sticky top-0 z-20 border-b border-line bg-bg/85 px-5 pb-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted">Room code</div>
            <button
              onClick={() => navigator.clipboard?.writeText(game.code).then(() => toast.success("Code copied"))}
              className="flex items-center gap-2 font-mono text-3xl font-bold tracking-[0.18em]"
            >
              {game.code} <Copy className="size-4 text-muted" />
            </button>
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" className="size-10 p-0" onClick={() => setShowQR(true)} aria-label="Show QR">
              <QrCode className="size-5" />
            </Button>
            <Button variant="ghost" size="sm" className="size-10 p-0" onClick={share} aria-label="Share">
              <Share2 className="size-5" />
            </Button>
          </div>
        </div>
      </header>

      <div className="space-y-4 px-5 pt-4">
        {/* zone */}
        <ZoneEditor
          zone={zone}
          setZone={setZ}
          enabled={settings.zoneEnabled}
          setEnabled={(v) => patch({ zoneEnabled: v })}
          editable={host}
          fix={geo.fix}
          geoStatus={geo.status}
          markers={[
            ...(geo.fix && st.me
              ? [{ id: "me", lat: geo.fix.lat, lng: geo.fix.lng, color: st.me.color, emoji: st.me.emoji, kind: "me" as const }]
              : []),
            ...[...st.positions.values()]
              .filter((p) => p.player_id !== st.me?.id)
              .map((p) => {
                const pl = st.players.find((x) => x.id === p.player_id);
                return pl
                  ? { id: p.player_id, lat: p.lat, lng: p.lng, color: pl.color, emoji: pl.emoji, label: pl.nickname, kind: "ally" as const }
                  : null;
              })
              .filter((x): x is NonNullable<typeof x> => !!x),
          ]}
        />

        {/* teams */}
        <div className="grid grid-cols-2 gap-3">
          {(["hunter", "shadow"] as const).map((r) => (
            <TeamColumn key={r} role={r} players={teams[r]} me={st.me} host={host} hostId={game.host_id} onTap={setEditPlayer} />
          ))}
        </div>
        {teams.spectator.length > 0 && (
          <TeamColumn role="spectator" players={teams.spectator} me={st.me} host={host} hostId={game.host_id} onTap={setEditPlayer} />
        )}

        {host && (
          <Card className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-[14px] font-semibold">Random teams</div>
              <div className="text-[12px] text-muted">
                {shadowCount} Shadow{shadowCount > 1 ? "s" : ""} · {Math.max(0, teams.hunter.length + teams.shadow.length - shadowCount)} Hunters
              </div>
            </div>
            <div className="flex items-center rounded-xl bg-surface-2">
              <button className="grid size-9 place-items-center" onClick={() => setShadowCount((c) => Math.max(1, c - 1))}>
                <Minus className="size-4" />
              </button>
              <span className="w-6 text-center font-mono tabular">{shadowCount}</span>
              <button className="grid size-9 place-items-center" onClick={() => setShadowCount((c) => c + 1)}>
                <Plus className="size-4" />
              </button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => rpc("shuffle_roles", { p_game: game.id, p_shadows: shadowCount }).catch((e) => toast.error(e.message))}
            >
              <Shuffle className="size-4" /> Shuffle
            </Button>
          </Card>
        )}

        {/* settings summary */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[15px] font-semibold">Rules</div>
            <Button variant="ghost" size="sm" onClick={() => setShowSettings(true)}>
              <SlidersHorizontal className="size-4" /> {host ? "Customize" : "Details"}
            </Button>
          </div>
          {host && (
            <div className="no-scrollbar -mx-1 mb-3 flex gap-2 overflow-x-auto px-1">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    dirty.current = true;
                    setSettings(applyPreset(p.id));
                    if (zone) setZone({ ...zone, r: p.zoneR });
                  }}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-medium",
                    settings.preset === p.id ? "border-shadow bg-shadow/15 text-ink" : "border-line text-muted",
                  )}
                >
                  {p.emoji} {p.name}
                </button>
              ))}
              {settings.preset === "custom" && (
                <span className="shrink-0 rounded-full border border-hunter bg-hunter/10 px-3 py-1.5 text-[13px] font-medium">✏️ Custom</span>
              )}
            </div>
          )}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {settingsSummary(settings).map((x) => (
              <div key={x.k}>
                <dt className="text-[11px] uppercase tracking-wider text-faint">{x.k}</dt>
                <dd className="text-[14px] font-medium">{x.v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <button
          className="mx-auto flex items-center gap-1.5 py-2 text-sm text-faint hover:text-muted"
          onClick={() => (window.location.href = "/")}
        >
          <LogOut className="size-4" /> Leave lobby
        </button>
      </div>

      {/* sticky action */}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 px-5 pt-3 backdrop-blur-xl">
        <div className="mx-auto max-w-lg">
          {st.me && <MyRoleLine role={st.me.role} />}
          {host ? (
            <Button size="xl" className="mt-2 w-full" disabled={blockers.length > 0} loading={starting} onClick={start}>
              <PlayIcon className="size-5 fill-current" />
              {blockers.length ? `Need ${blockers.join(", ")}` : `Start game · ${st.players.length} players`}
            </Button>
          ) : (
            <div className="mt-2 flex h-16 items-center justify-center gap-3 rounded-2xl border border-line bg-surface text-muted">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-75" />
                <span className="relative inline-flex size-2.5 rounded-full bg-ok" />
              </span>
              Waiting for the host to start…
            </div>
          )}
        </div>
      </div>

      <Sheet open={showSettings} onClose={() => setShowSettings(false)} title={host ? "Customize rules" : "Rules"}>
        <SettingsPanel s={settings} set={patch} editable={host} />
      </Sheet>

      <Sheet open={showQR} onClose={() => setShowQR(false)} title="Scan to join">
        <div className="flex flex-col items-center gap-4 pb-4">
          <div className="rounded-3xl bg-white p-5">
            <QRCodeSVG value={link} size={220} bgColor="#ffffff" fgColor="#07080c" level="M" />
          </div>
          <div className="font-mono text-4xl font-bold tracking-[0.25em]">{game.code}</div>
          <div className="break-all text-center text-sm text-muted">{link}</div>
        </div>
      </Sheet>

      <Sheet open={!!editPlayer} onClose={() => setEditPlayer(null)} title={editPlayer ? `${editPlayer.emoji} ${editPlayer.nickname}` : ""}>
        {editPlayer && (
          <div className="space-y-3">
            <div className="grid auto-cols-fr grid-flow-col gap-2">
              {(["hunter", "shadow", "spectator"] as Role[]).filter((r) => r !== "spectator" || editPlayer.user_id === game.host_id).map((r) => (
                <button
                  key={r}
                  onClick={async () => {
                    await rpc("set_role", { p_game: game.id, p_player: editPlayer.id, p_role: r }).catch((e) => toast.error(e.message));
                    setEditPlayer(null);
                  }}
                  className={cn("rounded-2xl border px-2 py-3 text-sm font-semibold", editPlayer.role === r ? "bg-white/5" : "border-line text-muted")}
                  style={editPlayer.role === r ? { borderColor: ROLE_META[r].color, color: ROLE_META[r].color } : undefined}
                >
                  <div className="text-xl">{ROLE_META[r].icon}</div>
                  {ROLE_META[r].label}
                </button>
              ))}
            </div>
            {editPlayer.user_id !== game.host_id && (
              <Button
                variant="ghost"
                className="w-full text-danger"
                onClick={async () => {
                  await rpc("kick_player", { p_game: game.id, p_player: editPlayer.id }).catch((e) => toast.error(e.message));
                  setEditPlayer(null);
                }}
              >
                Remove from room
              </Button>
            )}
          </div>
        )}
      </Sheet>
    </main>
  );
}

function MyRoleLine({ role }: { role: Role }) {
  const m = ROLE_META[role];
  return (
    <div className="flex items-center gap-2 text-[13px] text-muted">
      You're a <RoleBadge role={role} /> <span className="truncate">{m.tagline}</span>
    </div>
  );
}

function TeamColumn({
  role,
  players,
  me,
  host,
  hostId,
  onTap,
}: {
  role: Role;
  players: Player[];
  me: Player | null;
  host: boolean;
  hostId: string;
  onTap: (p: Player) => void;
}) {
  const m = ROLE_META[role];
  return (
    <div className="rounded-3xl border bg-surface p-3" style={{ borderColor: `color-mix(in oklab, ${m.color} 30%, transparent)` }}>
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[13px] font-bold uppercase tracking-wider" style={{ color: m.color }}>
          {m.icon} {m.label}s
        </span>
        <span className="font-mono text-sm text-muted">{players.length}</span>
      </div>
      <div className="space-y-1.5">
        {players.map((p) => (
          <motion.button
            layout
            layoutId={p.id}
            key={p.id}
            disabled={!host}
            onClick={() => onTap(p)}
            className={cn(
              "flex w-full items-center gap-2 rounded-2xl bg-surface-2 p-1.5 pr-2 text-left",
              host && "hover:bg-white/10",
              p.id === me?.id && "ring-1 ring-white/30",
            )}
          >
            <Avatar player={p} size={30} />
            <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{p.nickname}</span>
            {p.user_id === hostId && <span className="text-[10px] font-bold uppercase text-hunter">host</span>}
            <OnlineDot lastSeen={p.last_seen} />
          </motion.button>
        ))}
        {players.length === 0 && <div className="rounded-2xl border border-dashed border-line py-4 text-center text-[13px] text-faint">Nobody yet</div>}
      </div>
    </div>
  );
}

function OnlineDot({ lastSeen }: { lastSeen: string }) {
  const online = Date.now() - Date.parse(lastSeen) < 45000;
  return <span className={cn("size-1.5 shrink-0 rounded-full", online ? "bg-ok" : "bg-faint")} title={online ? "online" : "offline"} />;
}
