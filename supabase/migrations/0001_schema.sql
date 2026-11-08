-- BCCHunt core schema
-- All writes happen through SECURITY DEFINER RPCs; tables only expose SELECT via RLS.

create extension if not exists pg_cron;

-- ───────────────────────── tables ─────────────────────────
create table public.games (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  host_id         uuid not null references auth.users(id) on delete cascade,
  status          text not null default 'lobby' check (status in ('lobby','live','ended')),
  settings        jsonb not null,
  zone            jsonb,            -- initial zone {lat,lng,r} (metres)
  zone_current    jsonb,            -- live zone
  zone_next       jsonb,            -- preview of next zone
  zone_stage      int not null default 0,
  started_at      timestamptz,
  paused_at       timestamptz,
  paused_ms       bigint not null default 0,
  released        boolean not null default false,
  reveal_count    int not null default 0,
  next_reveal_gms bigint,           -- game-ms of next scheduled reveal
  next_shrink_gms bigint,
  end_gms         bigint,
  ended_at        timestamptz,
  winner          text check (winner in ('hunter','shadow')),
  end_reason      text,
  created_at      timestamptz not null default now()
);

create table public.players (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references public.games(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  nickname    text not null check (char_length(nickname) between 1 and 20),
  role        text not null default 'hunter' check (role in ('hunter','shadow','spectator')),
  status      text not null default 'alive' check (status in ('alive','tagged','kicked')),
  color       text not null,
  emoji       text not null default '🙂',
  tagged_at   timestamptz,
  tagged_by   uuid,
  out_since   timestamptz,           -- when they left the zone
  last_penalty_at timestamptz,
  last_seen   timestamptz not null default now(),
  joined_at   timestamptz not null default now(),
  unique (game_id, user_id)
);
create index on public.players (game_id);

create table public.positions_latest (
  player_id uuid primary key references public.players(id) on delete cascade,
  game_id   uuid not null references public.games(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  acc real,
  heading real,
  ts  timestamptz not null default now()
);
create index on public.positions_latest (game_id);

create table public.position_log (
  id        bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  game_id   uuid not null references public.games(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  acc real,
  gms bigint not null,
  ts  timestamptz not null default now()
);
create index on public.position_log (game_id, gms);
create index on public.position_log (player_id, gms);

create table public.reveals (
  id       bigint generated always as identity primary key,
  game_id  uuid not null references public.games(id) on delete cascade,
  seq      int not null,
  kind     text not null check (kind in ('scheduled','forced','penalty')),
  gms      bigint not null,
  ts       timestamptz not null default now(),
  shadows  jsonb not null default '[]',   -- [{player_id,lat,lng,acc,fuzz}]
  hunters  jsonb                          -- only when shadowsSeeHunters = 'reveal'
);
create index on public.reveals (game_id, seq);

create table public.tags (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references public.games(id) on delete cascade,
  hunter_id   uuid not null references public.players(id) on delete cascade,
  shadow_id   uuid not null references public.players(id) on delete cascade,
  initiated_by text not null check (initiated_by in ('hunter','shadow')),
  status      text not null default 'pending' check (status in ('pending','confirmed','rejected','expired')),
  distance_m  real,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index on public.tags (game_id);

create table public.messages (
  id        bigint generated always as identity primary key,
  game_id   uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  channel   text not null check (channel in ('all','hunter','shadow')),
  body      text not null check (char_length(body) between 1 and 300),
  ts        timestamptz not null default now()
);
create index on public.messages (game_id, id);

create table public.pings (
  id        bigint generated always as identity primary key,
  game_id   uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  team      text not null check (team in ('hunter','shadow')),
  kind      text not null check (kind in ('here','danger','target','help')),
  lat double precision not null,
  lng double precision not null,
  ts        timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 seconds'
);
create index on public.pings (game_id);

create table public.events (
  id      bigint generated always as identity primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  type    text not null,
  gms     bigint,
  data    jsonb not null default '{}',
  ts      timestamptz not null default now()
);
create index on public.events (game_id, id);
