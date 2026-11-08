"use client";
import { useEffect, useState } from "react";

export interface Profile {
  nickname: string;
  emoji: string;
}

const KEY = "bcchunt-profile";

export function useProfile() {
  const [profile, setProfile] = useState<Profile>({ nickname: "", emoji: "🦊" });
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setProfile(JSON.parse(raw));
    } catch {}
    setLoaded(true);
  }, []);
  const update = (p: Partial<Profile>) => {
    setProfile((cur) => {
      const next = { ...cur, ...p };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };
  return { profile, update, loaded };
}
