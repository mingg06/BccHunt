export type Role = "hunter" | "shadow" | "spectator";
export type Team = "hunter" | "shadow";
export type PlayerStatus = "alive" | "tagged" | "kicked";

export interface Zone {
  lat: number;
  lng: number;
  r: number; // metres
}

export interface Settings {
  headstartSec: number;
  durationMin: number;
  revealIntervalSec: number;
  revealJitterSec: number;
  revealAtRelease: boolean;
  revealMode: "exact" | "fuzzy";
  fuzzRadiusM: number;
  zoneEnabled: boolean;
  shrinkEnabled: boolean;
  shrinkIntervalSec: number;
  shrinkPct: number;
  minRadiusM: number;
  outOfZoneGraceSec: number;
  tagRadiusM: number;
  tagConfirm: boolean;
  taggedBecome: "out" | "hunter";
  shadowsSeeHunters: "never" | "reveal" | "always";
  shadowsSeeEachOther: boolean;
  maxPlayers: number;
  lateJoinRole: "hunter" | "spectator";
  preset?: string;
}

export interface Game {
  id: string;
  code: string;
  host_id: string;
  status: "lobby" | "live" | "ended";
  settings: Settings;
  zone: Zone | null;
  zone_current: Zone | null;
  zone_next: Zone | null;
  zone_stage: number;
  started_at: string | null;
  paused_at: string | null;
  paused_ms: number;
  released: boolean;
  reveal_count: number;
  next_reveal_gms: number | null;
  next_shrink_gms: number | null;
  end_gms: number | null;
  ended_at: string | null;
  winner: Team | null;
  end_reason: string | null;
  created_at: string;
}

export interface Player {
  id: string;
  game_id: string;
  user_id: string;
  nickname: string;
  role: Role;
  status: PlayerStatus;
  color: string;
  emoji: string;
  tagged_at: string | null;
  tagged_by: string | null;
  out_since: string | null;
  last_seen: string;
  joined_at: string;
}

export interface Position {
  player_id: string;
  game_id: string;
  lat: number;
  lng: number;
  acc: number | null;
  heading: number | null;
  ts: string;
}

export interface RevealPoint {
  player_id: string;
  lat: number;
  lng: number;
  acc?: number | null;
  ts?: string;
  fuzz?: number;
}

export interface Reveal {
  id: number;
  game_id: string;
  seq: number;
  kind: "scheduled" | "forced" | "penalty";
  gms: number;
  ts: string;
  shadows: RevealPoint[];
  hunters: RevealPoint[] | null;
}

export interface Tag {
  id: string;
  game_id: string;
  hunter_id: string;
  shadow_id: string;
  initiated_by: Team;
  status: "pending" | "confirmed" | "rejected" | "expired";
  distance_m: number | null;
  created_at: string;
  resolved_at: string | null;
}

export interface Message {
  id: number;
  game_id: string;
  player_id: string;
  channel: "all" | Team;
  body: string;
  ts: string;
}

export interface Ping {
  id: number;
  game_id: string;
  player_id: string;
  team: Team;
  kind: "here" | "danger" | "target" | "help";
  lat: number;
  lng: number;
  ts: string;
  expires_at: string;
}

export interface GameEvent {
  id: number;
  game_id: string;
  type: string;
  gms: number | null;
  data: Record<string, unknown>;
  ts: string;
}

export interface LogPoint {
  player_id: string;
  lat: number;
  lng: number;
  acc: number | null;
  gms: number;
}
