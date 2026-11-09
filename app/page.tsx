"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight, Plus, Radar, Timer, Shrink, Hand } from "lucide-react";
import { toast } from "sonner";
import { Button, Card } from "@/components/ui";
import { ProfileFields } from "@/components/ProfileFields";
import { Logo } from "@/components/Logo";
import { useProfile } from "@/lib/profile";
import { ensureSession, rpc } from "@/lib/supabase";
import { unlockAudio } from "@/lib/fx";

export default function Home() {
  const router = useRouter();
  const { profile, update } = useProfile();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"join" | null>(null);

  const nickOk = profile.nickname.trim().length > 0;

  const join = async () => {
    if (!nickOk) return toast.error("Pick a nickname first");
    unlockAudio();
    setBusy("join");
    try {
      await ensureSession();
      await rpc("join_game", { p_code: code, p_nickname: profile.nickname.trim(), p_emoji: profile.emoji });
      router.push(`/g/${code.toUpperCase()}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  };

  return (
    <main className="grid-bg min-h-dvh">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 safe-top safe-bottom">
        <header className="flex items-center gap-2 pt-2">
          <Logo />
          <span className="text-lg font-bold tracking-tight">BCCHunt</span>
          <span className="ml-auto rounded-full border border-line px-2 py-0.5 text-[11px] uppercase tracking-widest text-muted">
            internal
          </span>
        </header>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="pb-6 pt-10"
        >
          <h1 className="text-[44px] font-bold leading-[0.95] tracking-tight">
            <span className="text-hunter">Hunters</span>
            <br />
            <span className="text-muted">vs</span> <span className="text-shadow">Shadows</span>
          </h1>
          <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-muted">
            A real-world GPS manhunt. Shadows hide; every few minutes their location is revealed. Survive the clock — or
            hunt them down.
          </p>
          <div className="mt-6 grid grid-cols-4 gap-2 text-center text-[11px] text-muted">
            {[
              { i: Timer, t: "Head start" },
              { i: Radar, t: "Timed pings" },
              { i: Shrink, t: "Shrinking zone" },
              { i: Hand, t: "Tag & confirm" },
            ].map(({ i: I, t }) => (
              <div key={t} className="rounded-2xl border border-line bg-surface/60 px-1 py-3">
                <I className="mx-auto mb-1.5 size-5 text-ink" />
                {t}
              </div>
            ))}
          </div>
        </motion.section>

        <Card className="space-y-4">
          <ProfileFields profile={profile} update={update} />
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))}
              placeholder="ROOM CODE"
              inputMode="text"
              autoCapitalize="characters"
              className="h-14 min-w-0 flex-1 rounded-2xl border border-line bg-surface-2 px-4 text-center font-mono text-xl tracking-[0.35em] outline-none placeholder:tracking-[0.2em] placeholder:text-faint focus:border-line-strong"
            />
            <Button size="lg" disabled={code.length !== 5} loading={busy === "join"} onClick={join}>
              Join <ArrowRight className="size-4" />
            </Button>
          </div>
          <div className="flex items-center gap-3 text-[12px] uppercase tracking-widest text-faint">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
          <Button variant="outline" size="lg" className="w-full" onClick={() => router.push("/create")}>
            <Plus className="size-5" /> Create a room
          </Button>
        </Card>

        <p className="mt-auto pt-8 text-center text-[12px] text-faint">
          Play somewhere safe. Watch for traffic. Keep the app open while playing.
        </p>
      </div>

    </main>
  );
}
