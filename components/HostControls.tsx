"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Flag, Pause, Play, Radar, SlidersHorizontal } from "lucide-react";
import { Button, Sheet } from "./ui";
import { SettingsPanel } from "./SettingsPanel";
import { rpc } from "@/lib/supabase";
import type { Game, Settings } from "@/lib/types";

export function HostButtons({ game, compact }: { game: Game; compact?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState<Settings>(game.settings);
  const paused = !!game.paused_at;

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    setBusy(name);
    try {
      await rpc(name, { p_game: game.id, ...args });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className={compact ? "grid grid-cols-2 gap-2" : "grid grid-cols-2 gap-2 sm:grid-cols-4"}>
        <Button variant={paused ? "primary" : "ghost"} loading={busy === "pause_game" || busy === "resume_game"} onClick={() => call(paused ? "resume_game" : "pause_game")}>
          {paused ? <Play className="size-4" /> : <Pause className="size-4" />} {paused ? "Resume" : "Pause"}
        </Button>
        <Button variant="hunter" loading={busy === "force_reveal"} onClick={() => call("force_reveal")}>
          <Radar className="size-4" /> Reveal now
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setDraft(game.settings);
            setSettingsOpen(true);
          }}
        >
          <SlidersHorizontal className="size-4" /> Rules
        </Button>
        <Button variant="ghost" className="text-danger" onClick={() => setConfirmEnd(true)}>
          <Flag className="size-4" /> End game
        </Button>
      </div>

      <Sheet open={confirmEnd} onClose={() => setConfirmEnd(false)} title="End the game?">
        <p className="mb-4 text-sm text-muted">Pick a winner, or end it as a draw.</p>
        <div className="grid gap-2">
          <Button variant="hunter" onClick={() => (setConfirmEnd(false), call("end_game", { p_winner: "hunter" }))}>
            Hunters win
          </Button>
          <Button variant="shadow" onClick={() => (setConfirmEnd(false), call("end_game", { p_winner: "shadow" }))}>
            Shadows win
          </Button>
          <Button variant="ghost" onClick={() => (setConfirmEnd(false), call("end_game", { p_winner: null }))}>
            No winner
          </Button>
        </div>
      </Sheet>

      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Live rules">
        <p className="mb-3 text-[13px] text-muted">Changes apply from the next reveal or shrink. Greyed-out settings are locked once the game starts.</p>
        <SettingsPanel s={draft} set={(p) => setDraft((d) => ({ ...d, ...p, preset: "custom" }))} editable live />
        <Button
          className="sticky bottom-0 mt-4 w-full"
          size="lg"
          loading={busy === "update_settings"}
          onClick={async () => {
            await call("update_settings", { p_settings: draft, p_zone: null });
            setSettingsOpen(false);
            toast.success("Rules updated");
          }}
        >
          Apply changes
        </Button>
      </Sheet>
    </>
  );
}
