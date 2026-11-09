-- Privacy hardening:
--  1. Tag requests no longer leak distance (distance is only recorded once a tag is confirmed),
--     and are rate-limited so "too far" can't be used to triangulate.
--  2. Only the host may be a spectator (spectators see everyone's live location).

alter table public.players add column if not exists last_tag_try timestamptz;

-- 1a. request_tag: cooldown + no distance stored while pending.
--     Returns null (instead of raising) when too far, so the cooldown is still recorded.
create or replace function public.request_tag(p_game uuid, p_other uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v public.players; o public.players; g public.games; hid uuid; sid uuid; init text;
  pa public.positions_latest; pb public.positions_latest; d real := null; lim float8; tid uuid;
begin
  v := public._me(p_game);
  select * into g from public.games where id = p_game;
  if g.status <> 'live' or g.paused_at is not null then raise exception 'not_live'; end if;
  if not g.released then raise exception 'headstart'; end if;
  select * into o from public.players where id = p_other and game_id = p_game and status = 'alive';
  if not found or v.status <> 'alive' then raise exception 'bad_target'; end if;

  if v.role = 'hunter' and o.role = 'shadow' then hid := v.id; sid := o.id; init := 'hunter';
  elsif v.role = 'shadow' and o.role = 'hunter' then hid := o.id; sid := v.id; init := 'shadow';
  else raise exception 'bad_target'; end if;

  select id into tid from public.tags
   where game_id = p_game and hunter_id = hid and shadow_id = sid and status = 'pending'
     and created_at > now() - interval '45 seconds';
  if found then return tid; end if;

  if v.last_tag_try is not null and v.last_tag_try > now() - interval '10 seconds' then
    raise exception 'tag_cooldown';
  end if;
  update public.players set last_tag_try = now() where id = v.id;

  lim := public._s(g.settings,'tagRadiusM',0);
  if lim > 0 then
    select * into pa from public.positions_latest where player_id = hid;
    select * into pb from public.positions_latest where player_id = sid;
    if pa.player_id is null or pb.player_id is null
       or pa.ts < now() - interval '60 seconds' or pb.ts < now() - interval '60 seconds' then
      raise exception 'no_gps';
    end if;
    d := public._haversine(pa.lat, pa.lng, pb.lat, pb.lng);
    -- allow for GPS error (capped)
    if d - least(coalesce(pa.acc,0) + coalesce(pb.acc,0), 30) > lim then return null; end if;
  end if;

  insert into public.tags (game_id, hunter_id, shadow_id, initiated_by, distance_m)
       values (p_game, hid, sid, init, null) returning id into tid;
  if not coalesce((g.settings->>'tagConfirm')::boolean, true) then
    perform public._confirm_tag(tid);
  end if;
  return tid;
end $$;

-- 1b. distance is computed only at confirmation (the Shadow is out, so nothing is secret any more)
create or replace function public._confirm_tag(p_tag uuid)
returns void language plpgsql set search_path = '' as $$
declare t public.tags; g public.games; alive int; hn text; sn text;
        pa public.positions_latest; pb public.positions_latest; d real := null;
begin
  select * into t from public.tags where id = p_tag;
  select * into pa from public.positions_latest where player_id = t.hunter_id;
  select * into pb from public.positions_latest where player_id = t.shadow_id;
  if pa.player_id is not null and pb.player_id is not null then
    d := public._haversine(pa.lat, pa.lng, pb.lat, pb.lng);
  end if;
  update public.tags set status = 'confirmed', resolved_at = now(), distance_m = d where id = p_tag returning * into t;
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
revoke execute on function public._confirm_tag(uuid) from public, anon, authenticated;

-- 2. Only the host can be a spectator.
create or replace function public.set_role(p_game uuid, p_player uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.games; tu uuid;
begin
  g := public._assert_host(p_game);
  if p_role not in ('hunter','shadow','spectator') then raise exception 'bad_role'; end if;
  select user_id into tu from public.players where id = p_player and game_id = p_game;
  if p_role = 'spectator' and tu is distinct from g.host_id then raise exception 'host_only_spectator'; end if;
  update public.players set role = p_role where id = p_player and game_id = p_game;
end $$;

create or replace function public._late_role(g public.games)
returns text language sql immutable set search_path = '' as $$
  select case when g.settings->>'lateJoinRole' = 'shadow' then 'shadow' else 'hunter' end
$$;
revoke execute on function public._late_role(public.games) from public, anon, authenticated;

create or replace function public.join_game(p_code text, p_nickname text, p_emoji text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare g public.games; v public.players; n int; r text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select * into g from public.games where code = upper(trim(p_code));
  if not found then raise exception 'room_not_found'; end if;

  select * into v from public.players where game_id = g.id and user_id = auth.uid();
  if found then
    if v.status = 'kicked' then raise exception 'kicked'; end if;
    update public.players set nickname = coalesce(nullif(trim(p_nickname),''), nickname),
                              emoji = coalesce(p_emoji, emoji), last_seen = now()
     where id = v.id;
    return g.id;
  end if;

  if g.status = 'ended' then raise exception 'game_ended'; end if;
  select count(*) into n from public.players where game_id = g.id and status <> 'kicked';
  if n >= public._s(g.settings,'maxPlayers',16) then raise exception 'room_full'; end if;

  r := case when g.status = 'lobby' then 'hunter' else public._late_role(g) end;
  insert into public.players (game_id, user_id, nickname, emoji, role, color)
       values (g.id, auth.uid(), trim(p_nickname), coalesce(p_emoji,'🙂'), r, public._color(n));
  perform public._event(g.id, 'join', public._gms(g), jsonb_build_object('nickname', trim(p_nickname)));
  return g.id;
end $$;

