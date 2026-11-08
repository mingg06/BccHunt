import type { Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  headstartSec: 180,
  durationMin: 30,
  revealIntervalSec: 180,
  revealJitterSec: 0,
  revealAtRelease: true,
  revealMode: "exact",
  fuzzRadiusM: 60,
  zoneEnabled: true,
  shrinkEnabled: true,
  shrinkIntervalSec: 600,
  shrinkPct: 25,
  minRadiusM: 75,
  outOfZoneGraceSec: 30,
  tagRadiusM: 0,
  tagConfirm: true,
  taggedBecome: "out",
  shadowsSeeHunters: "never",
  shadowsSeeEachOther: true,
  maxPlayers: 16,
  lateJoinRole: "hunter",
  preset: "classic",
};

export interface Preset {
  id: string;
  name: string;
  blurb: string;
  emoji: string;
  settings: Partial<Settings>;
  zoneR: number;
}

export const PRESETS: Preset[] = [
  {
    id: "classic",
    name: "Classic",
    emoji: "🎯",
    blurb: "3 min head start · ping every 3 min · 30 min",
    settings: {},
    zoneR: 600,
  },
  {
    id: "quick",
    name: "Quick 15",
    emoji: "⚡",
    blurb: "1 min head start · ping every 90 s · 15 min",
    settings: { headstartSec: 60, revealIntervalSec: 90, durationMin: 15, shrinkIntervalSec: 300, shrinkPct: 30 },
    zoneR: 350,
  },
  {
    id: "campus",
    name: "Campus",
    emoji: "🏢",
    blurb: "Tight zone · fuzzy pings · 20 m tag radius",
    settings: {
      headstartSec: 120, revealIntervalSec: 120, durationMin: 20, revealMode: "fuzzy", fuzzRadiusM: 40,
      shrinkIntervalSec: 300, shrinkPct: 20, minRadiusM: 50, tagRadiusM: 20,
    },
    zoneR: 250,
  },
  {
    id: "infection",
    name: "Infection",
    emoji: "🧟",
    blurb: "Tagged Shadows turn into Hunters",
    settings: { taggedBecome: "hunter", revealIntervalSec: 120, durationMin: 25 },
    zoneR: 500,
  },
];

export function withDefaults(s: Partial<Settings> | null | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

export function applyPreset(id: string): Settings {
  const p = PRESETS.find((x) => x.id === id);
  return { ...DEFAULT_SETTINGS, ...(p?.settings ?? {}), preset: id };
}
