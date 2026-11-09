"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, RotateCcw, Sparkles } from "lucide-react";
import { Button, Card, ROLE_META, cn } from "@/components/ui";
import { ProfileFields } from "@/components/ProfileFields";
import { ZoneEditor } from "@/components/ZoneEditor";
import { SettingsPanel, settingsSummary } from "@/components/SettingsPanel";
import { useProfile } from "@/lib/profile";
import { ensureSession, rpc } from "@/lib/supabase";
import { PRESETS, applyPreset, withDefaults } from "@/lib/settings";
import { unlockAudio } from "@/lib/fx";
import { useGeolocation } from "@/hooks/device";
import type { Role, Settings, Zone } from "@/lib/types";

const LAST_KEY = "bcchunt-last-setup";

interface SavedSetup {
  settings: Settings;
  zone: Zone | null;
  role: Role;
}

function loadLast(): SavedSetup | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SavedSetup;
    return { ...s, settings: withDefaults(s.settings) };
  } catch {
    return null;
  }
}

export default function CreateRoom() {
  const router = useRouter();
  const { profile, update } = useProfile();
  const geo = useGeolocation(true);
  const [settings, setSettings] = useState<Settings>(applyPreset("classic"));
  const [zone, setZone] = useState<Zone | null>(null);
  const [zoneR, setZoneR] = useState(PRESETS[0].zoneR);
  const [role, setRole] = useState<Role>("hunter");
  const [last, setLast] = useState<SavedSetup | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setLast(loadLast()), []);

  // place the zone on the host's GPS the first time we get a fix
  useEffect(() => {
    if (!zone && geo.fix) setZone({ lat: geo.fix.lat, lng: geo.fix.lng, r: zoneR });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.fix?.lat]);

  const patch = (p: Partial<Settings>) => setSettings((s) => ({ ...s, ...p, preset: "custom" }));

  const pickPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)!;
    setSettings(applyPreset(id));
    setZoneR(p.zoneR);
    setZone((z) => (z ? { ...z, r: p.zoneR } : z));
  };

  const useLast = () => {
    if (!last) return;
    setSettings({ ...last.settings, preset: "last" });
    setRole(last.role);
    if (last.zone) {
      setZone(last.zone);
      setZoneR(last.zone.r);
    }
    toast.success("Loaded your last setup");
  };

  const create = async () => {
    if (!profile.nickname.trim()) {
      toast.error("Pick a nickname first");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (settings.zoneEnabled && !zone) return toast.error("Set the play zone first (or turn the zone off)");
    unlockAudio();
    setBusy(true);
    try {
      await ensureSession();
      const finalSettings = { ...settings, preset: settings.preset === "last" ? "custom" : settings.preset };
      const code = await rpc<string>("create_room", {
        p_nickname: profile.nickname.trim(),
        p_emoji: profile.emoji,
        p_settings: finalSettings,
        p_role: role,
        p_zone: settings.zoneEnabled ? zone : null,
      });
      try {
        localStorage.setItem(LAST_KEY, JSON.stringify({ settings: finalSettings, zone, role } satisfies SavedSetup));
      } catch {}
      router.push(`/g/${code}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };

  const summary = settingsSummary(settings);

  return (
    <main className="mx-auto min-h-dvh max-w-lg pb-40">
      <header className="safe-top sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-bg/85 px-5 pb-3 backdrop-blur-xl">
        <Link href="/" className="grid size-10 place-items-center rounded-xl bg-white/5" aria-label="Back">
          <ArrowLeft className="size-5" />
        </Link>
        <div>
          <h1 className="text-lg font-bold leading-tight">New room</h1>
          <p className="text-[12px] text-muted">Set everything up now — you can still tweak it in the lobby.</p>
        </div>
      </header>

      <div className="space-y-5 px-5 pt-4">
        <Step n={1} title="You">
          <Card>
            <ProfileFields profile={profile} update={update} />
            <div className="mt-4 grid grid-cols-3 gap-2">
              {(["hunter", "shadow", "spectator"] as Role[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={cn("rounded-2xl border px-2 py-3 text-center text-sm font-semibold transition", role === r ? "bg-white/5" : "border-line bg-surface-2 text-muted")}
                  style={role === r ? { borderColor: ROLE_META[r].color, color: ROLE_META[r].color } : undefined}
                >
                  <div className="text-xl">{ROLE_META[r].icon}</div>
                  {r === "spectator" ? "Just host" : `Play ${ROLE_META[r].label}`}
                </button>
              ))}
            </div>
            {role === "spectator" && <p className="mt-2 text-[12px] text-muted">You'll watch everyone live on the host dashboard without playing.</p>}
          </Card>
        </Step>

        <Step n={2} title="Game mode" aside={last && (
          <button onClick={useLast} className="flex items-center gap-1 text-[13px] font-medium text-hunter">
            <RotateCcw className="size-3.5" /> Use last setup
          </button>
        )}>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => pickPreset(p.id)}
                className={cn("rounded-2xl border p-3 text-left transition", settings.preset === p.id ? "border-shadow bg-shadow/10" : "border-line bg-surface hover:border-line-strong")}
              >
                <div className="text-xl">{p.emoji}</div>
                <div className="mt-1 font-semibold">{p.name}</div>
                <div className="mt-0.5 text-[12px] leading-snug text-muted">{p.blurb}</div>
              </button>
            ))}
          </div>
          {(settings.preset === "custom" || settings.preset === "last") && (
            <div className="mt-2 flex items-center gap-1.5 text-[13px] text-hunter">
              <Sparkles className="size-3.5" /> {settings.preset === "last" ? "Your last setup" : "Custom rules"} — based on your edits below
            </div>
          )}
        </Step>

        <Step n={3} title="Play zone">
          <ZoneEditor
            zone={zone}
            setZone={(z) => {
              setZone(z);
              setZoneR(z.r);
            }}
            enabled={settings.zoneEnabled}
            setEnabled={(v) => patch({ zoneEnabled: v })}
            editable
            fix={geo.fix}
            geoStatus={geo.status}
            markers={geo.fix ? [{ id: "me", lat: geo.fix.lat, lng: geo.fix.lng, color: "#2ee6d6", emoji: profile.emoji, kind: "me" }] : []}
          />
        </Step>

        <Step n={4} title="Rules">
          <SettingsPanel s={settings} set={patch} editable />
        </Step>
      </div>

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 px-5 pt-3 backdrop-blur-xl">
        <div className="mx-auto max-w-lg">
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2">
            {summary.map((x) => (
              <span key={x.k} className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[12px]">
                <span className="text-faint">{x.k}</span> <span className="font-medium">{x.v}</span>
              </span>
            ))}
          </div>
          <Button size="xl" className="w-full" loading={busy} onClick={create}>
            Create room
          </Button>
        </div>
      </div>
    </main>
  );
}

function Step({ n, title, aside, children }: { n: number; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-full bg-white/10 font-mono text-[12px] font-bold">{n}</span>
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <div className="ml-auto">{aside}</div>
      </div>
      {children}
    </section>
  );
}
