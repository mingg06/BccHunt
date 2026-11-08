"use client";
import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Segmented, Sheet, cn } from "./ui";
import { rpc } from "@/lib/supabase";
import type { Message, Player, Role } from "@/lib/types";

const QUICK: Record<string, string[]> = {
  hunter: ["Heading to last ping", "Split up!", "Cover the exit", "I see someone 👀", "Need backup"],
  shadow: ["Moving now", "Hunter nearby ⚠️", "Stay put", "Split up!", "Going dark 🌑"],
  spectator: ["👀", "So close!", "🔥🔥🔥"],
};

export function ChatSheet({
  open,
  onClose,
  gameId,
  me,
  players,
  messages,
}: {
  open: boolean;
  onClose: () => void;
  gameId: string;
  me: Player;
  players: Player[];
  messages: Message[];
}) {
  const team = me.role === "spectator" ? "all" : me.role;
  const [channel, setChannel] = useState<"all" | Role>(team);
  const [body, setBody] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const shown = messages.filter((m) => m.channel === channel);
  const byId = new Map(players.map((p) => [p.id, p]));

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [shown.length, open, channel]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t) return;
    setBody("");
    try {
      await rpc("send_message", { p_game: gameId, p_channel: channel, p_body: t });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Chat">
      {me.role !== "spectator" && (
        <div className="mb-3">
          <Segmented
            value={channel}
            onChange={setChannel}
            options={[
              { value: team, label: team === "hunter" ? "🎯 Hunters" : "🌑 Shadows" },
              { value: "all", label: "📣 Everyone" },
            ]}
          />
        </div>
      )}
      <div ref={listRef} className="h-[42dvh] space-y-2 overflow-y-auto pr-1">
        {shown.length === 0 && <div className="pt-12 text-center text-sm text-faint">No messages yet</div>}
        {shown.map((m) => {
          const p = byId.get(m.player_id);
          const mine = m.player_id === me.id;
          return (
            <div key={m.id} className={cn("flex items-end gap-2", mine && "flex-row-reverse")}>
              {p && <Avatar player={p} size={26} />}
              <div className={cn("max-w-[75%] rounded-2xl px-3 py-2 text-[14px]", mine ? "bg-shadow/90 text-white" : "bg-surface-2")}>
                {!mine && <div className="mb-0.5 text-[11px] font-semibold" style={{ color: p?.color }}>{p?.nickname}</div>}
                {m.body}
              </div>
            </div>
          );
        })}
      </div>
      <div className="no-scrollbar -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1">
        {QUICK[me.role].map((q) => (
          <button key={q} onClick={() => send(q)} className="shrink-0 rounded-full border border-line px-3 py-1.5 text-[13px] text-muted hover:text-ink">
            {q}
          </button>
        ))}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(body);
        }}
      >
        <input
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 300))}
          placeholder={channel === "all" ? "Message everyone" : "Message your team"}
          className="h-12 flex-1 rounded-2xl border border-line bg-surface-2 px-4 outline-none focus:border-line-strong"
        />
        <button type="submit" className="grid size-12 place-items-center rounded-2xl bg-ink text-bg disabled:opacity-40" disabled={!body.trim()}>
          <Send className="size-5" />
        </button>
      </form>
    </Sheet>
  );
}
