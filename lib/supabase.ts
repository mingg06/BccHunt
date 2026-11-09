"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "bcchunt-auth" },
      realtime: { params: { eventsPerSecond: 20 } },
    });
  }
  return client;
}

/** Creates an isolated client (separate anonymous identity) — used by the dev bot simulator. */
export function isolatedClient(): SupabaseClient {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: true } });
}

/** Ensures this device has an anonymous session; returns the user id. */
export async function ensureSession(sb: SupabaseClient = supabase()): Promise<string> {
  const { data } = await sb.auth.getSession();
  if (data.session?.user) return data.session.user.id;
  const { data: d, error } = await sb.auth.signInAnonymously();
  if (error || !d.user) throw new Error(error?.message ?? "Could not sign in");
  return d.user.id;
}

const FRIENDLY: Record<string, string> = {
  room_not_found: "No room with that code.",
  room_full: "That room is full.",
  game_ended: "That game has already ended.",
  kicked: "You were removed from this room.",
  not_host: "Only the host can do that.",
  need_both_roles: "You need at least one Hunter and one Shadow.",
  zone_required: "Set the play zone on the map first.",
  already_started: "The game has already started.",
  headstart: "Hunters can't tag during the head start.",
  not_live: "The game isn't running.",
  bad_target: "That player can't be tagged right now.",
  too_far: "Too far away to tag — get closer.",
  no_gps: "Both players need a fresh GPS fix to tag.",
  tag_expired: "That tag request expired.",
  tag_closed: "That tag was already resolved.",
  not_member: "You're not in this room.",
  tag_cooldown: "Wait a few seconds before trying to tag again.",
  host_only_spectator: "Only the host can be a Spectator — spectators see everyone's location.",
  bad_zone: "The play zone is invalid — set it on the map again.",
  anonymous_provider_disabled: "Guest sign-in is disabled in Supabase (enable Anonymous sign-ins).",
};

export function friendlyError(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  for (const k of Object.keys(FRIENDLY)) if (msg.includes(k)) return FRIENDLY[k];
  if (/Anonymous sign-ins are disabled/i.test(msg)) return FRIENDLY.anonymous_provider_disabled;
  return msg;
}

/** RPC wrapper that throws a friendly error. */
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown>, sb: SupabaseClient = supabase()): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(friendlyError(error));
  return data as T;
}
