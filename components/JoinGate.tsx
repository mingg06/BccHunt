"use client";
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, Loader2, RotateCw } from "lucide-react";
import { Button, Card } from "./ui";
import { Logo } from "./Logo";
import { ProfileFields } from "./ProfileFields";
import { useProfile } from "@/lib/profile";
import { ensureSession, rpc } from "@/lib/supabase";
import { unlockAudio } from "@/lib/fx";

export function Splash({ label, error, retry }: { label: string; error?: boolean; retry?: () => void }) {
  return (
    <main className="grid-bg grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <div className="mx-auto w-fit">{error ? <Logo size={56} /> : <div className="animate-pulse"><Logo size={56} /></div>}</div>
        <div className="mt-5 flex items-center justify-center gap-2 text-muted">
          {!error && <Loader2 className="size-4 animate-spin" />} {label}
        </div>
        {retry && (
          <Button variant="ghost" className="mt-5" onClick={retry}>
            <RotateCw className="size-4" /> Try again
          </Button>
        )}
      </div>
    </main>
  );
}

export function JoinGate({ code, onJoined }: { code: string; onJoined: () => Promise<void> }) {
  const { profile, update } = useProfile();
  const [busy, setBusy] = useState(false);
  const join = async () => {
    if (!profile.nickname.trim()) return toast.error("Pick a nickname first");
    unlockAudio();
    setBusy(true);
    try {
      await ensureSession();
      await rpc("join_game", { p_code: code, p_nickname: profile.nickname.trim(), p_emoji: profile.emoji });
      await onJoined();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="grid-bg min-h-dvh">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 safe-top safe-bottom">
        <div className="mb-6 text-center">
          <div className="mx-auto w-fit"><Logo size={44} /></div>
          <div className="mt-4 text-[12px] uppercase tracking-[0.25em] text-muted">You're invited to room</div>
          <div className="mt-1 font-mono text-5xl font-bold tracking-[0.2em]">{code.toUpperCase()}</div>
        </div>
        <Card className="space-y-4">
          <ProfileFields profile={profile} update={update} />
          <Button size="lg" className="w-full" loading={busy} onClick={join}>
            Join game <ArrowRight className="size-4" />
          </Button>
        </Card>
        <Link href="/" className="mt-6 text-center text-sm text-faint hover:text-muted">
          Back to home
        </Link>
      </div>
    </main>
  );
}
