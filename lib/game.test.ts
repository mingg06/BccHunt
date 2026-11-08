import { describe, expect, it } from "vitest";
import { bearing, circleRing, destination, distance, formatDistance, pathLength } from "./geo";
import { fmtClock, gameMs } from "./time";
import { computeStats, groupTracks, positionAt } from "./stats";
import { applyPreset, DEFAULT_SETTINGS, withDefaults } from "./settings";
import type { GameEvent, Player } from "./types";

const KL = { lat: 3.139, lng: 101.6869 };

describe("geo", () => {
  it("distance and destination are inverse", () => {
    const p = destination(KL, 500, 90);
    expect(distance(KL, p)).toBeCloseTo(500, 0);
    expect(bearing(KL, p)).toBeCloseTo(90, 0);
  });
  it("circle ring is closed and has the right radius", () => {
    const ring = circleRing(KL, 300, 32);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    for (const [lng, lat] of ring) expect(distance(KL, { lat, lng })).toBeCloseTo(300, 0);
  });
  it("pathLength ignores teleport jumps", () => {
    const a = { ...KL, gms: 0 };
    const b = { ...destination(KL, 20, 0), gms: 5000 }; // 4 m/s ok
    const c = { ...destination(KL, 2000, 0), gms: 10000 }; // 396 m/s jump
    expect(pathLength([a, b])).toBeCloseTo(20, 0);
    expect(pathLength([a, b, c])).toBeCloseTo(20, 0);
  });
  it("formats distances", () => {
    expect(formatDistance(42.4)).toBe("42 m");
    expect(formatDistance(1530)).toBe("1.53 km");
  });
});

describe("game clock", () => {
  const start = Date.parse("2026-01-01T10:00:00Z");
  const base = { started_at: new Date(start).toISOString(), paused_at: null, paused_ms: 0, ended_at: null };
  it("counts elapsed time", () => expect(gameMs(base, start + 65000)).toBe(65000));
  it("subtracts paused time", () => expect(gameMs({ ...base, paused_ms: 15000 }, start + 65000)).toBe(50000));
  it("freezes while paused", () =>
    expect(gameMs({ ...base, paused_at: new Date(start + 30000).toISOString() }, start + 99999)).toBe(30000));
  it("is zero before start", () => expect(gameMs({ ...base, started_at: null }, start)).toBe(0));
  it("formats clocks", () => {
    expect(fmtClock(59_001)).toBe("1:00");
    expect(fmtClock(125_000)).toBe("2:05");
    expect(fmtClock(3_725_000)).toBe("1:02:05");
  });
});

describe("settings", () => {
  it("fills defaults", () => expect(withDefaults({ durationMin: 10 }).revealIntervalSec).toBe(DEFAULT_SETTINGS.revealIntervalSec));
  it("applies presets", () => {
    const s = applyPreset("infection");
    expect(s.taggedBecome).toBe("hunter");
    expect(s.preset).toBe("infection");
  });
});

describe("stats", () => {
  const mk = (id: string, role: Player["role"]): Player => ({
    id, game_id: "g", user_id: id, nickname: id, role, status: "alive", color: "#fff", emoji: "🙂",
    tagged_at: null, tagged_by: null, out_since: null, last_seen: "", joined_at: "",
  });
  const h = mk("h", "hunter");
  const s = mk("s", "shadow");
  const log = [
    { player_id: "h", ...KL, acc: 5, gms: 0 },
    { player_id: "h", ...destination(KL, 40, 0), acc: 5, gms: 10000 },
    { player_id: "s", ...destination(KL, 100, 0), acc: 5, gms: 0 },
    { player_id: "s", ...destination(KL, 50, 0), acc: 5, gms: 10000 },
  ];
  const tracks = groupTracks(log);
  const events: GameEvent[] = [{ id: 1, game_id: "g", type: "tag", gms: 10000, data: { hunter_id: "h", shadow_id: "s", hunter: "h" }, ts: "" }];

  it("interpolates positions", () => {
    const p = positionAt(tracks.get("h"), 5000)!;
    expect(distance(KL, p)).toBeCloseTo(20, 0);
    expect(positionAt(tracks.get("h"), -1)).toBeNull();
  });
  it("computes tags, survival and closest call", () => {
    const st = computeStats([h, s], tracks, events, 60000);
    const hs = st.find((x) => x.player.id === "h")!;
    const ss = st.find((x) => x.player.id === "s")!;
    expect(hs.tags).toBe(1);
    expect(ss.survivalMs).toBe(10000);
    expect(ss.closestCallM).toBeCloseTo(10, 0);
    expect(ss.taggedBy).toBe("h");
  });
});
