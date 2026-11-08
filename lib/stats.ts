import { distance, pathLength } from "./geo";
import type { GameEvent, LogPoint, Player } from "./types";

export interface PlayerStats {
  player: Player;
  team: "hunter" | "shadow" | "spectator";
  distanceM: number;
  survivalMs: number | null;
  tags: number;
  closestCallM: number | null;
  taggedBy: string | null;
}

export type Tracks = Map<string, LogPoint[]>;

export function groupTracks(log: LogPoint[]): Tracks {
  const m: Tracks = new Map();
  for (const p of log) {
    const arr = m.get(p.player_id) ?? [];
    arr.push(p);
    m.set(p.player_id, arr);
  }
  for (const arr of m.values()) arr.sort((a, b) => a.gms - b.gms);
  return m;
}

/** Linear interpolation of a track at game-time t. Returns null before the first point. */
export function positionAt(track: LogPoint[] | undefined, t: number): { lat: number; lng: number } | null {
  if (!track || track.length === 0 || t < track[0].gms) return null;
  let lo = 0;
  let hi = track.length - 1;
  if (t >= track[hi].gms) return track[hi];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track[mid].gms <= t) lo = mid;
    else hi = mid;
  }
  const a = track[lo];
  const b = track[hi];
  const f = (t - a.gms) / Math.max(1, b.gms - a.gms);
  return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f };
}

/** The role each player started the match with (infection mode converts shadows to hunters). */
export function startingTeam(p: Player, events: GameEvent[]): "hunter" | "shadow" | "spectator" {
  if (events.some((e) => e.type === "tag" && e.data.shadow_id === p.id)) return "shadow";
  return p.role;
}

export function computeStats(players: Player[], tracks: Tracks, events: GameEvent[], endGms: number): PlayerStats[] {
  const tagEvents = events.filter((e) => e.type === "tag");
  const teamOf = new Map(players.map((p) => [p.id, startingTeam(p, events)]));
  const hunterIds = players.filter((p) => teamOf.get(p.id) === "hunter").map((p) => p.id);

  return players
    .filter((p) => p.status !== "kicked")
    .map((p) => {
      const team = teamOf.get(p.id)!;
      const track = tracks.get(p.id) ?? [];
      const tagged = tagEvents.find((e) => e.data.shadow_id === p.id);
      const survivalMs = team === "shadow" ? (tagged?.gms ?? endGms) : null;
      let closest: number | null = null;
      if (team === "shadow") {
        const limit = survivalMs ?? endGms;
        for (const pt of track) {
          if (pt.gms > limit) break;
          for (const h of hunterIds) {
            const hp = positionAt(tracks.get(h), pt.gms);
            if (!hp) continue;
            const d = distance(pt, hp);
            if (closest === null || d < closest) closest = d;
          }
        }
      }
      return {
        player: p,
        team,
        distanceM: pathLength(track),
        survivalMs,
        tags: tagEvents.filter((e) => e.data.hunter_id === p.id).length,
        closestCallM: closest,
        taggedBy: (tagged?.data.hunter as string) ?? null,
      };
    });
}
