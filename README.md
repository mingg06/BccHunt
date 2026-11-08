# BCCHunt — Hunters vs Shadows

A real-life GPS manhunt for internal use. Shadows get a head start and hide. Every _N_ minutes their location is revealed to the Hunters, and the play zone shrinks over time. Hunters tag Shadows in person, and the other player confirms the tag in the app.

**Stack:** Next.js 15 · Tailwind v4 · MapLibre + OpenFreeMap (no API key) · Supabase (Postgres, row-level security, Realtime, anonymous auth, pg_cron) · Vercel.

## Features
- **Fully adjustable rules:** head start, reveal interval and random timing, exact or fuzzy reveals, match length, shrinking zone (interval, %, minimum size), out-of-zone penalty reveals, GPS-checked tag distance, confirm or instant tags, "Infection" mode (tagged Shadows become Hunters), and visibility rules. Ships with 4 presets.
- **Rooms:** join with a 5-letter code or QR code and a nickname, no accounts. Reconnecting is automatic.
- **Lobby:** zone editor on the map, team columns, random team shuffle, a live settings panel, and a GPS readiness check.
- **Play screen:**
  - countdown ring and reveal flash;
  - compass to the nearest ping;
  - zone warnings and a preview of the next zone;
  - team chat with quick phrases, and map pings (long-press the map);
  - tag request and confirm/dispute flow;
  - haptics and sounds, with the screen kept awake.
- **Host:** pause/resume, force a reveal, change rules live, end with a chosen winner, reassign roles, mark a player as tagged or revive them, and kick players. Full dashboard at `/g/CODE/host`, with a big-screen mode.
- **Results:** winner screen, awards (Top Hunter, Best Shadow, Closest call, Marathon), stats table, timeline, and an animated **route replay** with a scrubber.
- **Bot simulator:** `/dev/sim` (dev only, or set `NEXT_PUBLIC_ENABLE_SIM=1`) spawns bots that walk around, so you can test a whole game alone.

## How it stays fair
- All writes go through `SECURITY DEFINER` RPCs that check who's calling.
- Row-level security means **Hunters can never read Shadow positions**. They only get the snapshot rows in `reveals`, which the server writes at reveal time.
- The game clock lives in the database (`started_at`, `paused_ms`, `next_reveal_gms`, …). `_tick()` advances it. Phones trigger it at each boundary, and `pg_cron` runs it every 15 s as a backstop.

## Setup
1. Supabase project: run the SQL files in `supabase/migrations/` in order.
2. **Enable anonymous sign-ins:** Supabase Dashboard → Authentication → Sign In / Providers → *Allow anonymous sign-ins*.
   - Optional: raise the anonymous sign-in rate limit (Authentication → Rate Limits). Phones on the same office Wi-Fi share one IP address.
3. Copy `.env.example` to `.env.local` and fill in the URL and publishable key.
4. Run `npm install`, then `npm run dev`.
   - To test on phones on your local network, use `npm run dev -- --experimental-https`. Phone browsers only allow GPS on HTTPS pages.

## Scripts
- `npm run dev`: start the local dev server.
- `npm run build`: production build.
- `npm test`: unit tests (geo maths, clock, stats).
- `npm run lint`: code checks.

## Notes
- Phone browsers pause GPS when the app is in the background. Players should keep BCCHunt open; it keeps the screen awake for this.
- Free Supabase projects pause after 7 days of no activity. Open the dashboard before an event.
