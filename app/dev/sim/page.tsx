"use client";
import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Bot, Square } from "lucide-react";
import { Button, Card, Label, Slider } from "@/components/ui";
import { isolatedClient } from "@/lib/supabase";
import { destination, distance, bearing } from "@/lib/geo";
import type { Game, Reveal, Tag, Zone } from "@/lib/types";

const ENABLED = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_SIM === "1";
const NAMES = ["Botty", "Robo", "Chip", "Servo", "Pixel", "Byte", "Gizmo", "Sparky", "Nano", "Widget"];
const EMO = ["🤖", "👾", "🦾", "📟", "🛰️", "🧲", "🔋", "💾", "🧪", "⚙️"];

interface BotState {
  name: string;
  sb: SupabaseClient;
  playerId: string;
  role: string;
  status: string;
  lat: number;
  lng: number;
  heading: number;
}

export default function Sim() {
  const [code, setCode] = useState("");
  const [count, setCount] = useState(3);
  const [speed, setSpeed] = useState(2.5);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const bots = useRef<BotState[]>([]);
  const stop = useRef(false);

  const say = (s: string) => setLog((l) => [`${new Date().toLocaleTimeString()}  ${s}`, ...l].slice(0, 80));

  useEffect(() => () => void (stop.current = true), []);

  if (!ENABLED) return <main className="p-8 text-muted">Simulator disabled in production.</main>;

  const start = async () => {
    stop.current = false;
    setRunning(true);
    bots.current = [];
    for (let i = 0; i < count; i++) {
      const sb = isolatedClient();
      const { error: authErr } = await sb.auth.signInAnonymously();
      if (authErr) {
        say(`auth failed: ${authErr.message}`);
        continue;
      }
      const name = `${NAMES[i % NAMES.length]}${i >= NAMES.length ? i : ""}`;
      const { data: gid, error } = await sb.rpc("join_game", { p_code: code, p_nickname: name, p_emoji: EMO[i % EMO.length] });
      if (error) {
        say(`${name}: ${error.message}`);
        continue;
      }
      const { data: g } = await sb.from("games").select("*").eq("id", gid).single();
      const z = ((g as Game).zone_current ?? (g as Game).zone ?? { lat: 3.139, lng: 101.6869, r: 300 }) as Zone;
      const start = destination(z, Math.random() * z.r * 0.6, Math.random() * 360);
      const { data: me } = await sb.from("players").select("id,role,status").eq("game_id", gid).eq("nickname", name).single();
      bots.current.push({ name, sb, playerId: me!.id, role: me!.role, status: me!.status, lat: start.lat, lng: start.lng, heading: Math.random() * 360 });
      say(`${name} joined`);
    }
    void loop();
  };

  const loop = async () => {
    while (!stop.current) {
      await Promise.all(
        bots.current.map(async (b) => {
          const { data: g } = await b.sb.from("games").select("*").eq("code", code.toUpperCase()).single();
          if (!g) return;
          const game = g as Game;
          const { data: me } = await b.sb.from("players").select("role,status").eq("id", b.playerId).single();
          if (me) {
            b.role = me.role;
            b.status = me.status;
          }
          const zone = game.zone_current ?? game.zone;
          // steer
          let target: { lat: number; lng: number } | null = null;
          if (b.role === "hunter" && game.status === "live") {
            const { data: rv } = await b.sb.from("reveals").select("*").eq("game_id", game.id).order("seq", { ascending: false }).limit(1);
            const pt = (rv?.[0] as Reveal | undefined)?.shadows?.[0];
            if (pt) target = pt;
          }
          if (zone && distance(b, zone) > zone.r * 0.85) target = zone;
          if (target) b.heading = bearing(b, target) + (Math.random() - 0.5) * 40;
          else b.heading += (Math.random() - 0.5) * 70;
          const moved = destination(b, speed * 3 * (0.6 + Math.random() * 0.8), b.heading);
          b.lat = moved.lat;
          b.lng = moved.lng;
          if (game.status !== "ended") {
            await b.sb.rpc("report_position", { p_game: game.id, p_lat: b.lat, p_lng: b.lng, p_acc: 6, p_heading: b.heading });
          }
          // auto-confirm tags aimed at this bot
          const { data: tags } = await b.sb.from("tags").select("*").eq("game_id", game.id).eq("status", "pending");
          for (const t of (tags as Tag[]) ?? []) {
            const mine = (t.initiated_by === "hunter" && t.shadow_id === b.playerId) || (t.initiated_by === "shadow" && t.hunter_id === b.playerId);
            if (mine) {
              await b.sb.rpc("respond_tag", { p_tag: t.id, p_accept: true });
              say(`${b.name} confirmed a tag`);
            }
          }
        }),
      );
      await new Promise((r) => setTimeout(r, 3000));
    }
  };

  return (
    <main className="mx-auto max-w-lg space-y-4 p-5">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Bot /> Bot simulator
      </h1>
      <p className="text-sm text-muted">
        Spawns fake players with their own guest accounts. They wander inside the zone, Hunters chase the latest reveal, and they auto-confirm tags. Set bot roles from your lobby.
      </p>
      <Card className="space-y-4">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 5))}
          placeholder="ROOM CODE"
          className="h-12 w-full rounded-2xl border border-line bg-surface-2 px-4 text-center font-mono text-xl tracking-[0.3em] outline-none"
        />
        <div>
          <Label hint={count}>Bots</Label>
          <Slider value={count} min={1} max={10} onChange={setCount} disabled={running} />
        </div>
        <div>
          <Label hint={`${speed.toFixed(1)} m/s`}>Walking speed</Label>
          <Slider value={speed} min={0.5} max={6} step={0.5} onChange={setSpeed} />
        </div>
        {running ? (
          <Button variant="danger" className="w-full" onClick={() => ((stop.current = true), setRunning(false))}>
            <Square className="size-4" /> Stop bots
          </Button>
        ) : (
          <Button className="w-full" disabled={code.length !== 5} onClick={start}>
            Spawn bots
          </Button>
        )}
      </Card>
      <pre className="max-h-80 overflow-auto rounded-2xl bg-surface p-3 text-[12px] text-muted">{log.join("\n") || "…"}</pre>
    </main>
  );
}
