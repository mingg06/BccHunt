"use client";
import { EMOJIS, cn } from "./ui";
import type { Profile } from "@/lib/profile";

export function ProfileFields({ profile, update }: { profile: Profile; update: (p: Partial<Profile>) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2 px-3 focus-within:border-line-strong">
        <span className="text-2xl">{profile.emoji}</span>
        <input
          value={profile.nickname}
          onChange={(e) => update({ nickname: e.target.value.slice(0, 20) })}
          placeholder="Your nickname"
          maxLength={20}
          autoComplete="nickname"
          className="h-14 flex-1 bg-transparent text-lg font-medium outline-none placeholder:text-faint"
        />
      </div>
      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => update({ emoji: e })}
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-xl text-xl transition",
              profile.emoji === e ? "bg-white/15 ring-2 ring-white/60" : "bg-surface-2 hover:bg-white/10",
            )}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
