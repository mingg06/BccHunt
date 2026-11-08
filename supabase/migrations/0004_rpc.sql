-- Client-callable RPCs (all SECURITY DEFINER, all validate the caller).

create or replace function public._assert_host(p_game uuid)
returns public.games language plpgsql set search_path = '' as $$
declare g public.games;
begin
  select * into g from public.games where id = p_game;
  if not found then raise exception 'game_not_found'; end if;
  if g.host_id <> auth.uid() then raise exception 'not_host'; end if;
  return g;
end $$;
revoke execute on function public._assert_host(uuid) from public, anon, authenticated;

create or replace function public._me(p_game uuid)
returns public.players language plpgsql set search_path = '' as $$
declare v public.players;
begin
  select * into v from public.players where game_id = p_game and user_id = auth.uid() and status <> 'kicked';
  if not found then raise exception 'not_member'; end if;
  return v;
end $$;
revoke execute on function public._me(uuid) from public, anon, authenticated;

create or replace function public._color(n int)
returns text language sql immutable set search_path = '' as $$
  select (array['#f59e0b','#8b5cf6','#10b981','#ef4444','#3b82f6','#ec4899','#14b8a6','#f97316',
                '#a855f7','#22c55e','#06b6d4','#e11d48','#84cc16','#6366f1','#eab308','#0ea5e9'])[(n % 16) + 1]
$$;

create or replace function public.server_now()
returns timestamptz language sql stable set search_path = '' as $$ select now() $$;

-- ───────────── rooms ─────────────
create or replace function public.create_game(p_nickname text, p_emoji text, p_settings jsonb, p_role text default 'hunter')
returns text language plpgsql security definer set search_path = '' as $$
declare c text; gid uuid; alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  loop
    c := '';
    for i in 1..5 loop c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    exit when not exists (select 1 from public.games where code = c);
  end loop;
  insert into public.games (code, host_id, settings) values (c, auth.uid(), p_settings) returning id into gid;
  insert into public.players (game_id, user_id, nickname, emoji, role, color)
       values (gid, auth.uid(), trim(p_nickname), coalesce(p_emoji,'🙂'),
               case when p_role in ('hunter','shadow','spectator') then p_role else 'hunter' end, public._color(0));
  perform public._event(gid, 'create', 0, jsonb_build_object('nickname', trim(p_nickname)));
  return c;
end $$;

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

  r := case when g.status = 'lobby' then 'hunter' else coalesce(g.settings->>'lateJoinRole','hunter') end;
  insert into public.players (game_id, user_id, nickname, emoji, role, color)
       values (g.id, auth.uid(), trim(p_nickname), coalesce(p_emoji,'🙂'), r, public._color(n));
  perform public._event(g.id, 'join', public._gms(g), jsonb_build_object('nickname', trim(p_nickname)));
  return g.id;
end $$;

create or replace function public.update_profile(p_game uuid, p_nickname text, p_emoji text)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.players;
begin
  v := public._me(p_game);
  update public.players set nickname = coalesce(nullif(trim(p_nickname),''), nickname), emoji = coalesce(p_emoji, emoji)
   where id = v.id;
end $$;

-- ───────────── host controls ─────────────
create or replace function public.update_settings(p_game uuid, p_settings jsonb, p_zone jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.games; gm bigint; iv bigint;
begin
  g := public._assert_host(p_game);
  if g.status = 'ended' then raise exception 'game_ended'; end if;
  if g.status = 'lobby' then
    update public.games set settings = p_settings, zone = coalesce(p_zone, zone) where id = p_game;
    return;
  end if;
  -- live: apply from the next boundary
  gm := public._gms(g);
  iv := greatest(15000, (public._s(p_settings,'revealIntervalSec',180) * 1000)::bigint);
  update public.games set
    settings = p_settings,
    next_reveal_gms = case
      when public._s(p_settings,'revealIntervalSec',180) <> public._s(settings,'revealIntervalSec',180)
       and next_reveal_gms is not null then least(next_reveal_gms, gm + iv)
      else next_reveal_gms end
  where id = p_game;
  perform public._event(p_game, 'settings', gm, '{}'::jsonb);
end $$;

create or replace function public.set_role(p_game uuid, p_player uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.games;
begin
  g := public._assert_host(p_game);
  if p_role not in ('hunter','shadow','spectator') then raise exception 'bad_role'; end if;
  update public.players set role = p_role where id = p_player and game_id = p_game;
end $$;

create or replace function public.shuffle_roles(p_game uuid, p_shadows int)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.games;
begin
  g := public._assert_host(p_game);
  if g.status <> 'lobby' then raise exception 'not_in_lobby'; end if;
  with ranked as (
    select id, row_number() over (order by random()) rn
      from public.players where game_id = p_game and status <> 'kicked' and role <> 'spectator'
  )
  update public.players p set role = case when r.rn <= p_shadows then 'shadow' else 'hunter' end
    from ranked r where p.id = r.id;
end $$;

create or replace function public.kick_player(p_game uuid, p_player uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.games;
begin
  g := public._assert_host(p_game);
  update public.players set status = 'kicked' where id = p_player and game_id = p_game and user_id <> auth.uid();
  delete from public.positions_latest where player_id = p_player;
end $$;

create or replace function public.set_player_status(p_game uuid, p_player uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.games; alive int;
begin
  g := public._assert_host(p_game);
  if p_status not in ('alive','tagged') then raise exception 'bad_status'; end if;
  update public.players set status = p_status,
         tagged_at = case when p_status = 'tagged' then now() else null end
   where id = p_player and game_id = p_game;
  perform public._event(p_game, case when p_status = 'tagged' then 'host_tag' else 'revive' end, public._gms(g),
    jsonb_build_object('player_id', p_player));
  if g.status = 'live' then
    select count(*) into alive from public.players where game_id = p_game and role = 'shadow' and status = 'alive';
    if alive = 0 then perform public._end_game(p_game, 'hunter', 'all_tagged'); end if;
  end if;
end $$;

create or replace function public.start_game(p_game uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.games; s jsonb; hs bigint; iv bigint; sv bigint; e bigint; nh int; ns int; zn jsonb := null;
begin
  g := public._assert_host(p_game);
  if g.status <> 'lobby' then raise exception 'already_started'; end if;
  s := g.settings;
  select count(*) filter (where role = 'hunter'), count(*) filter (where role = 'shadow')
    into nh, ns from public.players where game_id = p_game and status <> 'kicked';
  if nh < 1 or ns < 1 then raise exception 'need_both_roles'; end if;
  if coalesce((s->>'zoneEnabled')::boolean, true) and g.zone is null then raise exception 'zone_required'; end if;

  hs := (public._s(s,'headstartSec',180) * 1000)::bigint;
  iv := greatest(15000, (public._s(s,'revealIntervalSec',180) * 1000)::bigint);
  sv := greatest(30000, (public._s(s,'shrinkIntervalSec',600) * 1000)::bigint);
  e  := hs + (public._s(s,'durationMin',30) * 60000)::bigint;
  if coalesce((s->>'zoneEnabled')::boolean, true) and coalesce((s->>'shrinkEnabled')::boolean, true) then
    zn := public._next_zone(g.zone, s);
  end if;

  update public.players set status = 'alive', tagged_at = null, tagged_by = null, out_since = null
   where game_id = p_game and status <> 'kicked';
  update public.games set
    status = 'live', started_at = now(), paused_at = null, paused_ms = 0, released = false, reveal_count = 0,
    end_gms = e,
    next_reveal_gms = case when coalesce((s->>'revealAtRelease')::boolean, true) then hs else hs + iv end,
    zone_current = case when coalesce((s->>'zoneEnabled')::boolean, true) then g.zone else null end,
    zone_next = zn, zone_stage = 0,
    next_shrink_gms = case when zn is not null and hs + sv < e then hs + sv else null end
  where id = p_game;
  perform public._event(p_game, 'start', 0, '{}'::jsonb);
end $$;

create or replace function public.pause_game(p_game uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.games;
begin
  g := public._assert_host(p_game);
  if g.status <> 'live' or g.paused_at is not null then return; end if;
  update public.games set paused_at = now() where id = p_game;
  perform public._event(p_game, 'pause', public._gms(g));
end $$;

create or replace function public.resume_game(p_game uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.games;
begin
  g := public._assert_host(p_game);
  if g.status <> 'live' or g.paused_at is null then return; end if;
  update public.games
     set paused_ms = paused_ms + (extract(epoch from (now() - paused_at)) * 1000)::bigint, paused_at = null
   where id = p_game;
  select * into g from public.games where id = p_game;
  perform public._event(p_game, 'resume', public._gms(g));
end $$;

create or replace function public.force_reveal(p_game uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.games;
begin
  g := public._assert_host(p_game);
  if g.status <> 'live' then raise exception 'not_live'; end if;
  perform public._reveal(p_game, 'forced');
end $$;

create or replace function public.end_game(p_game uuid, p_winner text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.games;
begin
  g := public._assert_host(p_game);
  perform public._end_game(p_game, case when p_winner in ('hunter','shadow') then p_winner else null end, 'host');
end $$;

-- ───────────── gameplay ─────────────
create or replace function public.tick_game(p_game uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._me(p_game);
  perform public._tick(p_game);
end $$;

create or replace function public.report_position(p_game uuid, p_lat float8, p_lng float8, p_acc real, p_heading real)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.players; g public.games; gm bigint; last_gms bigint; d float8; grace float8;
begin
  v := public._me(p_game);
  select * into g from public.games where id = p_game;
  if g.status = 'ended' then return; end if;

  insert into public.positions_latest (player_id, game_id, lat, lng, acc, heading, ts)
       values (v.id, p_game, p_lat, p_lng, p_acc, p_heading, now())
  on conflict (player_id) do update set lat = excluded.lat, lng = excluded.lng, acc = excluded.acc,
                                         heading = excluded.heading, ts = excluded.ts;
  update public.players set last_seen = now() where id = v.id;

  if g.status <> 'live' then return; end if;
  gm := public._gms(g);

  -- trail for the replay (throttled to ~4 s)
  select max(l.gms) into last_gms from public.position_log l where l.player_id = v.id;
  if last_gms is null or gm - last_gms >= 4000 then
    insert into public.position_log (player_id, game_id, lat, lng, acc, gms) values (v.id, p_game, p_lat, p_lng, p_acc, gm);
  end if;

  -- out-of-zone penalty for shadows
  grace := public._s(g.settings,'outOfZoneGraceSec',30);
  if g.paused_at is null and v.role = 'shadow' and v.status = 'alive' and g.zone_current is not null and grace > 0 then
    d := public._haversine(p_lat, p_lng, (g.zone_current->>'lat')::float8, (g.zone_current->>'lng')::float8);
    if d > (g.zone_current->>'r')::float8 then
      if v.out_since is null then
        update public.players set out_since = now() where id = v.id;
      elsif now() - v.out_since > make_interval(secs => grace)
        and (v.last_penalty_at is null or now() - v.last_penalty_at > make_interval(secs => grace)) then
        update public.players set last_penalty_at = now() where id = v.id;
        perform public._reveal(p_game, 'penalty', v.id);
      end if;
    elsif v.out_since is not null then
      update public.players set out_since = null where id = v.id;
    end if;
  end if;

  if public._due(g) then perform public._tick(p_game); end if;
end $$;

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

  select * into pa from public.positions_latest where player_id = hid;
  select * into pb from public.positions_latest where player_id = sid;
  if pa.player_id is not null and pb.player_id is not null then
    d := public._haversine(pa.lat, pa.lng, pb.lat, pb.lng);
  end if;
  lim := public._s(g.settings,'tagRadiusM',0);
  if lim > 0 then
    if d is null or pa.ts < now() - interval '60 seconds' or pb.ts < now() - interval '60 seconds' then
      raise exception 'no_gps';
    end if;
    -- allow for GPS error (capped)
    if d - least(coalesce(pa.acc,0) + coalesce(pb.acc,0), 30) > lim then raise exception 'too_far'; end if;
  end if;

  insert into public.tags (game_id, hunter_id, shadow_id, initiated_by, distance_m)
       values (p_game, hid, sid, init, d) returning id into tid;
  if not coalesce((g.settings->>'tagConfirm')::boolean, true) then
    perform public._confirm_tag(tid);
  end if;
  return tid;
end $$;

create or replace function public.respond_tag(p_tag uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tags; v public.players; g public.games;
begin
  select * into t from public.tags where id = p_tag for update;
  if not found or t.status <> 'pending' then raise exception 'tag_closed'; end if;
  v := public._me(t.game_id);
  if (t.initiated_by = 'hunter' and v.id <> t.shadow_id) or (t.initiated_by = 'shadow' and v.id <> t.hunter_id) then
    raise exception 'not_your_tag';
  end if;
  if t.created_at < now() - interval '60 seconds' then
    update public.tags set status = 'expired', resolved_at = now() where id = p_tag;
    raise exception 'tag_expired';
  end if;
  if p_accept then
    perform public._confirm_tag(p_tag);
  else
    update public.tags set status = 'rejected', resolved_at = now() where id = p_tag;
    select * into g from public.games where id = t.game_id;
    perform public._event(t.game_id, 'tag_disputed', public._gms(g),
      jsonb_build_object('hunter_id', t.hunter_id, 'shadow_id', t.shadow_id));
  end if;
end $$;

create or replace function public.cancel_tag(p_tag uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tags; v public.players;
begin
  select * into t from public.tags where id = p_tag;
  v := public._me(t.game_id);
  update public.tags set status = 'expired', resolved_at = now()
   where id = p_tag and status = 'pending'
     and ((initiated_by = 'hunter' and hunter_id = v.id) or (initiated_by = 'shadow' and shadow_id = v.id));
end $$;

create or replace function public.send_message(p_game uuid, p_channel text, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.players;
begin
  v := public._me(p_game);
  if p_channel not in ('all','hunter','shadow') then raise exception 'bad_channel'; end if;
  if p_channel <> 'all' and v.role <> p_channel and v.role <> 'spectator' then raise exception 'bad_channel'; end if;
  insert into public.messages (game_id, player_id, channel, body) values (p_game, v.id, p_channel, left(trim(p_body), 300));
end $$;

create or replace function public.send_ping(p_game uuid, p_kind text, p_lat float8, p_lng float8)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.players;
begin
  v := public._me(p_game);
  if v.role not in ('hunter','shadow') then raise exception 'spectators_cannot_ping'; end if;
  insert into public.pings (game_id, player_id, team, kind, lat, lng) values (p_game, v.id, v.role, p_kind, p_lat, p_lng);
end $$;

-- only signed-in (incl. anonymous) users may call RPCs
do $$
declare f text;
begin
  foreach f in array array[
    'public.create_game(text,text,jsonb,text)', 'public.join_game(text,text,text)', 'public.update_profile(uuid,text,text)',
    'public.update_settings(uuid,jsonb,jsonb)', 'public.set_role(uuid,uuid,text)', 'public.shuffle_roles(uuid,int)',
    'public.kick_player(uuid,uuid)', 'public.set_player_status(uuid,uuid,text)', 'public.start_game(uuid)',
    'public.pause_game(uuid)', 'public.resume_game(uuid)', 'public.force_reveal(uuid)', 'public.end_game(uuid,text)',
    'public.tick_game(uuid)', 'public.report_position(uuid,float8,float8,real,real)', 'public.request_tag(uuid,uuid)',
    'public.respond_tag(uuid,boolean)', 'public.cancel_tag(uuid)', 'public.send_message(uuid,text,text)',
    'public.send_ping(uuid,text,float8,float8)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
