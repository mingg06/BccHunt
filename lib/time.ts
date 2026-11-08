import type { Game } from "./types";

/** Game-clock milliseconds (excludes paused time) at server-time `nowMs`. */
export function gameMs(game: Pick<Game, "started_at" | "paused_at" | "paused_ms" | "ended_at">, nowMs: number): number {
  if (!game.started_at) return 0;
  const start = Date.parse(game.started_at);
  const ref = game.paused_at ? Date.parse(game.paused_at) : game.ended_at ? Date.parse(game.ended_at) : nowMs;
  return Math.max(0, ref - start - (game.paused_ms ?? 0));
}

export function fmtClock(ms: number): string {
  if (!isFinite(ms)) return "--:--";
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, "0");
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

export function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}m ${s}s` : `${m} min`;
}

export function ago(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return `${m}m ago`;
}
