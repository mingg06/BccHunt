"use client";
import { use } from "react";
import { useGame } from "@/hooks/useGame";
import { Lobby } from "@/components/Lobby";
import { Play } from "@/components/Play";
import { Results } from "@/components/Results";
import { JoinGate, Splash } from "@/components/JoinGate";

export default function GamePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const st = useGame(code);

  if (st.load === "loading") return <Splash label="Connecting…" />;
  if (st.load === "error") return <Splash label={st.error ?? "Something went wrong"} error retry={st.reload} />;
  if (st.load === "not_member" || !st.me || !st.game) return <JoinGate code={code} onJoined={st.reload} />;

  if (st.game.status === "lobby") return <Lobby st={st} />;
  if (st.game.status === "live") return <Play st={st} />;
  return <Results st={st} />;
}
