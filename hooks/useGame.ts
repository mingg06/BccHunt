"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { ensureSession, friendlyError, supabase } from "@/lib/supabase";
import { withDefaults } from "@/lib/settings";
import { gameMs } from "@/lib/time";
import type { Game, GameEvent, Message, Ping, Player, Position, Reveal, Tag } from "@/lib/types";

export type LoadState = "loading" | "ready" | "not_member" | "not_found" | "error";

export interface GameState {
  load: LoadState;
  error: string | null;
  uid: string | null;
  game: Game | null;
  players: Player[];
  me: Player | null;
  isHost: boolean;
  positions: Map<string, Position>;
  reveals: Reveal[];
  tags: Tag[];
  events: GameEvent[];
  messages: Message[];
  pings: Ping[];
  /** server-synchronised Date.now() */
  now: () => number;
  /** current game clock in ms */
  gms: () => number;
  reload: () => Promise<void>;
  refreshPositions: () => Promise<void>;
}

function upsertBy<T, K extends keyof T>(list: T[], row: T, key: K): T[] {
  const i = list.findIndex((x) => x[key] === row[key]);
  if (i === -1) return [...list, row];
  const copy = list.slice();
  copy[i] = row;
  return copy;
}

export function useGame(code: string): GameState {
  const sb = supabase();
  const [load, setLoad] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [positions, setPositions] = useState<Map<string, Position>>(new Map());
  const [reveals, setReveals] = useState<Reveal[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pings, setPings] = useState<Ping[]>([]);
  const offset = useRef(0);
  const gameRef = useRef<Game | null>(null);
  gameRef.current = game;

  const now = useCallback(() => Date.now() + offset.current, []);
  const gms = useCallback(() => (gameRef.current ? gameMs(gameRef.current, now()) : 0), [now]);

  const syncClock = useCallback(async () => {
    const t0 = Date.now();
    const { data } = await sb.rpc("server_now");
    const t1 = Date.now();
    if (data) offset.current = Date.parse(data as string) - (t0 + t1) / 2;
  }, [sb]);

  const refreshPositions = useCallback(async () => {
    const g = gameRef.current;
    if (!g) return;
    const { data } = await sb.from("positions_latest").select("*").eq("game_id", g.id);
    if (data) setPositions(new Map((data as Position[]).map((p) => [p.player_id, p])));
  }, [sb]);

  const reload = useCallback(async () => {
    try {
      const id = await ensureSession(sb);
      setUid(id);
      const { data: g, error: ge } = await sb.from("games").select("*").eq("code", code.toUpperCase()).maybeSingle();
      if (ge) throw ge;
      if (!g) {
        setLoad("not_member");
        return;
      }
      const gg = { ...(g as Game), settings: withDefaults((g as Game).settings) };
      setGame(gg);
      gameRef.current = gg;
      const gid = gg.id;
      const [pl, rv, tg, ev, ms, pg] = await Promise.all([
        sb.from("players").select("*").eq("game_id", gid).order("joined_at"),
        sb.from("reveals").select("*").eq("game_id", gid).order("seq"),
        sb.from("tags").select("*").eq("game_id", gid).order("created_at"),
        sb.from("events").select("*").eq("game_id", gid).order("id"),
        sb.from("messages").select("*").eq("game_id", gid).order("id").limit(300),
        sb.from("pings").select("*").eq("game_id", gid).gt("expires_at", new Date().toISOString()),
      ]);
      setPlayers((pl.data as Player[]) ?? []);
      setReveals((rv.data as Reveal[]) ?? []);
      setTags((tg.data as Tag[]) ?? []);
      setEvents((ev.data as GameEvent[]) ?? []);
      setMessages((ms.data as Message[]) ?? []);
      setPings((pg.data as Ping[]) ?? []);
      await refreshPositions();
      setLoad("ready");
    } catch (e) {
      setError(friendlyError(e));
      setLoad("error");
    }
  }, [code, sb, refreshPositions]);

  useEffect(() => {
    void syncClock();
    void reload();
  }, [reload, syncClock]);

  // realtime subscriptions
  const gameId = game?.id;
  useEffect(() => {
    if (!gameId) return;
    const filter = `game_id=eq.${gameId}`;
    const ch: RealtimeChannel = sb
      .channel(`game:${gameId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: `id=eq.${gameId}` }, (p) => {
        if (p.eventType === "DELETE") return;
        const g = p.new as Game;
        setGame({ ...g, settings: withDefaults(g.settings) });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter }, (p) => {
        if (p.eventType === "DELETE") return;
        setPlayers((l) => upsertBy(l, p.new as Player, "id"));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "reveals", filter }, (p) => {
        setReveals((l) => upsertBy(l, p.new as Reveal, "id"));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "tags", filter }, (p) => {
        if (p.eventType === "DELETE") return;
        setTags((l) => upsertBy(l, p.new as Tag, "id"));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "events", filter }, (p) => {
        setEvents((l) => upsertBy(l, p.new as GameEvent, "id"));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter }, (p) => {
        setMessages((l) => upsertBy(l, p.new as Message, "id"));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pings", filter }, (p) => {
        setPings((l) => upsertBy(l, p.new as Ping, "id"));
      })
      .subscribe((status) => {
        // after a reconnect, catch up on anything missed
        if (status === "SUBSCRIBED") void reload();
      });
    return () => {
      void sb.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, sb]);

  // poll positions (cheaper than realtime for high-frequency rows)
  useEffect(() => {
    if (!gameId) return;
    const t = setInterval(() => void refreshPositions(), 3000);
    return () => clearInterval(t);
  }, [gameId, refreshPositions]);

  // resync when the phone wakes up / comes back online
  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState === "visible") {
        void syncClock();
        void reload();
      }
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onWake);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
    };
  }, [reload, syncClock]);

  // drop expired pings
  useEffect(() => {
    const t = setInterval(() => {
      const n = now();
      setPings((l) => (l.some((p) => Date.parse(p.expires_at) < n) ? l.filter((p) => Date.parse(p.expires_at) >= n) : l));
    }, 5000);
    return () => clearInterval(t);
  }, [now]);

  const me = useMemo(() => players.find((p) => p.user_id === uid && p.status !== "kicked") ?? null, [players, uid]);
  const kicked = useMemo(() => players.some((p) => p.user_id === uid && p.status === "kicked"), [players, uid]);

  return {
    load: kicked ? "not_member" : load,
    error,
    uid,
    game,
    players: players.filter((p) => p.status !== "kicked"),
    me,
    isHost: !!game && game.host_id === uid,
    positions,
    reveals,
    tags,
    events,
    messages,
    pings,
    now,
    gms,
    reload,
    refreshPositions,
  };
}
