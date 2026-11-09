"use client";
import type { ReactNode } from "react";
import { Clock, Eye, Hand, Radar, Shrink, Users } from "lucide-react";
import { Label, Segmented, Slider, Toggle, cn } from "./ui";
import { fmtDuration } from "@/lib/time";
import type { Settings } from "@/lib/types";

function Section({ icon: I, title, children }: { icon: typeof Clock; title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-surface p-4">
      <h3 className="mb-4 flex items-center gap-2 text-[15px] font-semibold">
        <I className="size-4 text-muted" /> {title}
      </h3>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label hint={hint}>{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange, disabled }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-[14px] font-medium">{label}</div>
        {desc && <div className="text-[12px] leading-snug text-muted">{desc}</div>}
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

export function SettingsPanel({
  s,
  set,
  editable,
  live,
}: {
  s: Settings;
  set: (patch: Partial<Settings>) => void;
  editable: boolean;
  live?: boolean;
}) {
  const d = !editable;
  const lockedLive = d || !!live; // some settings can't change mid-game
  return (
    <div className={cn("space-y-3", d && "[&_input]:pointer-events-none")}>
      <Section icon={Clock} title="Timing">
        <Row label="Shadow head start" hint={s.headstartSec ? fmtDuration(s.headstartSec) : "None"}>
          <Slider value={s.headstartSec} min={0} max={600} step={15} onChange={(v) => set({ headstartSec: v })} disabled={lockedLive} accent="var(--color-shadow)" />
        </Row>
        <Row label="Match length (after head start)" hint={`${s.durationMin} min`}>
          <Slider value={s.durationMin} min={5} max={120} step={5} onChange={(v) => set({ durationMin: v })} disabled={lockedLive} />
        </Row>
      </Section>

      <Section icon={Radar} title="Location reveals">
        <Row label="Reveal every" hint={fmtDuration(s.revealIntervalSec)}>
          <Slider value={s.revealIntervalSec} min={30} max={600} step={15} onChange={(v) => set({ revealIntervalSec: v })} disabled={d} accent="var(--color-hunter)" />
        </Row>
        <Row label="Random timing (±)" hint={s.revealJitterSec ? `±${s.revealJitterSec}s` : "Off"}>
          <Slider value={s.revealJitterSec} min={0} max={60} step={5} onChange={(v) => set({ revealJitterSec: v })} disabled={d} accent="var(--color-hunter)" />
        </Row>
        <ToggleRow label="Reveal when Hunters are released" desc="First ping fires the moment the head start ends." checked={s.revealAtRelease} onChange={(v) => set({ revealAtRelease: v })} disabled={lockedLive} />
        <Row label="Precision">
          <Segmented
            value={s.revealMode}
            onChange={(v) => set({ revealMode: v })}
            disabled={d}
            options={[
              { value: "exact", label: "Exact pin" },
              { value: "fuzzy", label: "Fuzzy area" },
            ]}
          />
        </Row>
        {s.revealMode === "fuzzy" && (
          <Row label="Fuzzy radius" hint={`${s.fuzzRadiusM} m`}>
            <Slider value={s.fuzzRadiusM} min={10} max={250} step={5} onChange={(v) => set({ fuzzRadiusM: v })} disabled={d} accent="var(--color-hunter)" />
          </Row>
        )}
      </Section>

      <Section icon={Shrink} title="Play zone">
        <ToggleRow label="Use a play zone" checked={s.zoneEnabled} onChange={(v) => set({ zoneEnabled: v })} disabled={lockedLive} />
        {s.zoneEnabled && (
          <>
            <ToggleRow label="Shrink over time" desc="Next zone is previewed as a dashed circle." checked={s.shrinkEnabled} onChange={(v) => set({ shrinkEnabled: v })} disabled={lockedLive} />
            {s.shrinkEnabled && (
              <>
                <Row label="Shrink every" hint={fmtDuration(s.shrinkIntervalSec)}>
                  <Slider value={s.shrinkIntervalSec} min={60} max={1200} step={30} onChange={(v) => set({ shrinkIntervalSec: v })} disabled={lockedLive} accent="var(--color-zone)" />
                </Row>
                <Row label="Shrink by" hint={`${s.shrinkPct}%`}>
                  <Slider value={s.shrinkPct} min={5} max={60} step={5} onChange={(v) => set({ shrinkPct: v })} disabled={d} accent="var(--color-zone)" />
                </Row>
                <Row label="Smallest zone" hint={`${s.minRadiusM} m`}>
                  <Slider value={s.minRadiusM} min={25} max={500} step={25} onChange={(v) => set({ minRadiusM: v })} disabled={d} accent="var(--color-zone)" />
                </Row>
              </>
            )}
            <Row label="Out-of-zone penalty" hint={s.outOfZoneGraceSec ? `Reveal after ${s.outOfZoneGraceSec}s` : "Off"}>
              <Slider value={s.outOfZoneGraceSec} min={0} max={120} step={10} onChange={(v) => set({ outOfZoneGraceSec: v })} disabled={d} accent="var(--color-danger)" />
            </Row>
          </>
        )}
      </Section>

      <Section icon={Hand} title="Tagging">
        <ToggleRow label="Other player must confirm" desc="The tagged player (or Hunter) taps confirm. Disputes are logged." checked={s.tagConfirm} onChange={(v) => set({ tagConfirm: v })} disabled={d} />
        <Row label="Max tag distance (GPS check)" hint={s.tagRadiusM ? `${s.tagRadiusM} m` : "Off"}>
          <Slider value={s.tagRadiusM} min={0} max={100} step={5} onChange={(v) => set({ tagRadiusM: v })} disabled={d} />
        </Row>
        <Row label="Tagged Shadows">
          <Segmented
            value={s.taggedBecome}
            onChange={(v) => set({ taggedBecome: v })}
            disabled={d}
            options={[
              { value: "out", label: "Are out" },
              { value: "hunter", label: "Become Hunters 🧟" },
            ]}
          />
        </Row>
      </Section>

      <Section icon={Eye} title="Visibility">
        <Row label="Shadows can see Hunters">
          <Segmented
            value={s.shadowsSeeHunters}
            onChange={(v) => set({ shadowsSeeHunters: v })}
            disabled={d}
            options={[
              { value: "never", label: "Never" },
              { value: "reveal", label: "At reveals" },
              { value: "always", label: "Always" },
            ]}
          />
        </Row>
        <ToggleRow label="Shadows see each other" checked={s.shadowsSeeEachOther} onChange={(v) => set({ shadowsSeeEachOther: v })} disabled={d} />
        <p className="text-[12px] text-muted">Hunters always see fellow Hunters. Spectators see everyone.</p>
      </Section>

      <Section icon={Users} title="Room">
        <Row label="Max players" hint={s.maxPlayers}>
          <Slider value={s.maxPlayers} min={2} max={50} step={1} onChange={(v) => set({ maxPlayers: v })} disabled={d} />
        </Row>
        <Row label="People joining mid-game become">
          <Segmented
            value={s.lateJoinRole}
            onChange={(v) => set({ lateJoinRole: v })}
            disabled={d}
            options={[
              { value: "hunter", label: "Hunters" },
              { value: "shadow", label: "Shadows" },
            ]}
          />
        </Row>
      </Section>
    </div>
  );
}

export function settingsSummary(s: Settings): { k: string; v: string }[] {
  return [
    { k: "Head start", v: s.headstartSec ? fmtDuration(s.headstartSec) : "None" },
    { k: "Reveal", v: `every ${fmtDuration(s.revealIntervalSec)}${s.revealJitterSec ? ` ±${s.revealJitterSec}s` : ""}` },
    { k: "Match", v: `${s.durationMin} min` },
    { k: "Zone", v: !s.zoneEnabled ? "Off" : s.shrinkEnabled ? `shrinks ${s.shrinkPct}% / ${fmtDuration(s.shrinkIntervalSec)}` : "Fixed" },
    { k: "Tag", v: `${s.tagConfirm ? "confirm" : "instant"}${s.tagRadiusM ? ` · ≤${s.tagRadiusM} m` : ""}` },
    { k: "Mode", v: s.taggedBecome === "hunter" ? "Infection" : s.revealMode === "fuzzy" ? "Fuzzy pings" : "Classic" },
  ];
}
