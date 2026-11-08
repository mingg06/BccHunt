-- BCCHunt game engine. Internal functions are prefixed with "_" and are not callable by clients.

-- ───────────── utilities ─────────────
create or replace function public._haversine(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
returns float8 language sql immutable set search_path = '' as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ))
$$;

-- random point within `d` metres of (lat,lng)
create or replace function public._offset(lat float8, lng float8, d float8)
returns jsonb language plpgsql volatile set search_path = '' as $$
declare a float8 := random() * 2 * pi(); r float8 := sqrt(random()) * d;
begin
  return jsonb_build_object(
    'lat', lat + (r * cos(a)) / 111320.0,
    'lng', lng + (r * sin(a)) / (111320.0 * cos(radians(lat)))
  );
end $$;

create or replace function public._gms(g public.games)
returns bigint language sql stable set search_path = '' as $$
  select case when g.started_at is null then 0 else
    (extract(epoch from (coalesce(g.paused_at, now()) - g.started_at)) * 1000)::bigint - g.paused_ms
  end
$$;

create or replace function public._s(s jsonb, k text, def numeric)
returns numeric language sql immutable set search_path = '' as $$
  select coalesce((s->>k)::numeric, def)
$$;

create or replace function public._event(p_game uuid, p_type text, p_gms bigint, p_data jsonb default '{}')
returns void language sql set search_path = '' as $$
  insert into public.events (game_id, type, gms, data) values (p_game, p_type, p_gms, p_data)
$$;

create or replace function public._next_zone(z jsonb, s jsonb)
returns jsonb language plpgsql volatile set search_path = '' as $$
declare r float8; nr float8; c jsonb;
begin
  if z is null then return null; end if;
  r  := (z->>'r')::float8;
  nr := greatest(public._s(s,'minRadiusM',50), r * (1 - public._s(s,'shrinkPct',25) / 100.0));
  if nr >= r - 1 then return null; end if;
  c := public._offset((z->>'lat')::float8, (z->>'lng')::float8, r - nr);
  return jsonb_build_object('lat', c->'lat', 'lng', c->'lng', 'r', round(nr::numeric, 1));
end $$;

create or replace function public._jitter(s jsonb)
returns bigint language sql volatile set search_path = '' as $$
  select ((random() * 2 - 1) * public._s(s,'revealJitterSec',0) * 1000)::bigint
$$;

-- ───────────── reveal ─────────────
create or replace function public._reveal(p_game uuid, p_kind text, p_only uuid default null)
returns void language plpgsql set search_path = '' as $$
declare
  g public.games; gm bigint; seqn int; sh jsonb; hu jsonb := null;
  fuzzy boolean; fr float8;
begin
  select * into g from public.games where id = p_game;
  gm := public._gms(g);
  fuzzy := coalesce(g.settings->>'revealMode','exact') = 'fuzzy';
  fr := public._s(g.settings,'fuzzRadiusM',60);

  select coalesce(jsonb_agg(
           case when fuzzy then
             jsonb_build_object('player_id', p.id, 'acc', pos.acc, 'ts', pos.ts, 'fuzz', fr)
               || public._offset(pos.lat, pos.lng, fr)
           else
             jsonb_build_object('player_id', p.id, 'lat', pos.lat, 'lng', pos.lng, 'acc', pos.acc, 'ts', pos.ts)
           end), '[]'::jsonb)
    into sh
    from public.players p join public.positions_latest pos on pos.player_id = p.id
   where p.game_id = p_game and p.role = 'shadow' and p.status = 'alive'
     and (p_only is null or p.id = p_only);

  if p_only is null and coalesce(g.settings->>'shadowsSeeHunters','never') = 'reveal' then
    select coalesce(jsonb_agg(jsonb_build_object('player_id', p.id, 'lat', pos.lat, 'lng', pos.lng, 'ts', pos.ts)), '[]'::jsonb)
      into hu
      from public.players p join public.positions_latest pos on pos.player_id = p.id
     where p.game_id = p_game and p.role = 'hunter' and p.status = 'alive';
  end if;

  select coalesce(max(seq), 0) + 1 into seqn from public.reveals where game_id = p_game;
  insert into public.reveals (game_id, seq, kind, gms, shadows, hunters)
       values (p_game, seqn, p_kind, gm, sh, hu);
  perform public._event(p_game, 'reveal', gm,
    jsonb_build_object('kind', p_kind, 'seq', seqn, 'count', jsonb_array_length(sh), 'player_id', p_only));
end $$;

-- ───────────── end ─────────────
create or replace function public._end_game(p_game uuid, p_winner text, p_reason text)
returns void language plpgsql set search_path = '' as $$
declare g public.games;
begin
  select * into g from public.games where id = p_game;
  if g.status <> 'live' then return; end if;
  update public.games
     set status = 'ended', ended_at = now(), winner = p_winner, end_reason = p_reason,
         paused_ms = case when paused_at is not null
                          then paused_ms + (extract(epoch from (now() - paused_at)) * 1000)::bigint
                          else paused_ms end,
         paused_at = null
   where id = p_game;
  perform public._event(p_game, 'end', public._gms(g), jsonb_build_object('winner', p_winner, 'reason', p_reason));
end $$;

-- ───────────── tick: advances reveals, zone and the clock ─────────────
create or replace function public._tick(p_game uuid)
returns void language plpgsql set search_path = '' as $$
declare
  g public.games; s jsonb; gm bigint; hs bigint; iv bigint; sv bigint;
begin
  select * into g from public.games where id = p_game for update;
  if not found or g.status <> 'live' or g.paused_at is not null then return; end if;
  s  := g.settings;
  gm := public._gms(g);
  hs := (public._s(s,'headstartSec',180) * 1000)::bigint;
  iv := greatest(15000, (public._s(s,'revealIntervalSec',180) * 1000)::bigint);
  sv := greatest(30000, (public._s(s,'shrinkIntervalSec',600) * 1000)::bigint);

  if gm >= g.end_gms then
    perform public._end_game(p_game, 'shadow', 'time');
    return;
  end if;

  if not g.released and gm >= hs then
    g.released := true;
    perform public._event(p_game, 'release', hs);
  end if;

  -- one snapshot even if several slots were missed; then skip ahead
  if g.next_reveal_gms is not null and gm >= g.next_reveal_gms then
    perform public._reveal(p_game, 'scheduled');
    g.reveal_count := g.reveal_count + 1;
    loop
      g.next_reveal_gms := g.next_reveal_gms + iv;
      exit when g.next_reveal_gms > gm;
    end loop;
    g.next_reveal_gms := greatest(gm + 10000, g.next_reveal_gms + public._jitter(s));
    if g.next_reveal_gms >= g.end_gms then g.next_reveal_gms := null; end if;
  end if;

  if g.next_shrink_gms is not null and gm >= g.next_shrink_gms then
    if g.zone_next is not null then
      g.zone_current := g.zone_next;
      g.zone_stage   := g.zone_stage + 1;
      perform public._event(p_game, 'shrink', gm, jsonb_build_object('stage', g.zone_stage, 'zone', g.zone_current));
    end if;
    g.zone_next := public._next_zone(g.zone_current, s);
    g.next_shrink_gms := g.next_shrink_gms + sv;
    if g.zone_next is null or g.next_shrink_gms >= g.end_gms then
      g.next_shrink_gms := null; g.zone_next := null;
    end if;
  end if;

  update public.games set
    released = g.released, reveal_count = g.reveal_count, next_reveal_gms = g.next_reveal_gms,
    zone_current = g.zone_current, zone_next = g.zone_next, zone_stage = g.zone_stage,
    next_shrink_gms = g.next_shrink_gms
  where id = p_game;
end $$;

create or replace function public._due(g public.games)
returns boolean language sql stable set search_path = '' as $$
  select g.status = 'live' and g.paused_at is null and (
    public._gms(g) >= g.end_gms
    or (not g.released and public._gms(g) >= (public._s(g.settings,'headstartSec',180) * 1000))
    or public._gms(g) >= coalesce(g.next_reveal_gms, 9000000000000000000)
    or public._gms(g) >= coalesce(g.next_shrink_gms, 9000000000000000000))
$$;

-- ───────────── tagging internals ─────────────
create or replace function public._confirm_tag(p_tag uuid)
returns void language plpgsql set search_path = '' as $$
declare t public.tags; g public.games; alive int; hn text; sn text;
begin
  update public.tags set status = 'confirmed', resolved_at = now() where id = p_tag returning * into t;
  select * into g from public.games where id = t.game_id;
  if coalesce(g.settings->>'taggedBecome','out') = 'hunter' then
    update public.players set role = 'hunter', status = 'alive', tagged_at = now(), tagged_by = t.hunter_id, out_since = null
     where id = t.shadow_id;
  else
    update public.players set status = 'tagged', tagged_at = now(), tagged_by = t.hunter_id
     where id = t.shadow_id;
  end if;
  select nickname into hn from public.players where id = t.hunter_id;
  select nickname into sn from public.players where id = t.shadow_id;
  perform public._event(t.game_id, 'tag', public._gms(g),
    jsonb_build_object('hunter_id', t.hunter_id, 'shadow_id', t.shadow_id, 'hunter', hn, 'shadow', sn, 'distance_m', t.distance_m));

  select count(*) into alive from public.players
   where game_id = t.game_id and role = 'shadow' and status = 'alive';
  if alive = 0 then perform public._end_game(t.game_id, 'hunter', 'all_tagged'); end if;
end $$;

-- lock down internals
do $$
declare f text;
begin
  foreach f in array array[
    'public._haversine(float8,float8,float8,float8)', 'public._offset(float8,float8,float8)',
    'public._gms(public.games)', 'public._s(jsonb,text,numeric)', 'public._event(uuid,text,bigint,jsonb)',
    'public._next_zone(jsonb,jsonb)', 'public._jitter(jsonb)', 'public._reveal(uuid,text,uuid)',
    'public._end_game(uuid,text,text)', 'public._tick(uuid)', 'public._due(public.games)',
    'public._confirm_tag(uuid)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- backstop: advance live games even if every phone is asleep
select cron.schedule('bcchunt-tick', '15 seconds',
  $$select public._tick(id) from public.games where status = 'live' and paused_at is null$$);
