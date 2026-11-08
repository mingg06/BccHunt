-- Row level security: players only read what their role is allowed to see.

create or replace function public.my_player(p_game uuid)
returns public.players
language sql stable security definer set search_path = ''
as $$
  select p.* from public.players p
  where p.game_id = p_game and p.user_id = auth.uid() and p.status <> 'kicked'
  limit 1
$$;

create or replace function public.is_member(p_game uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.players p
    where p.game_id = p_game and p.user_id = auth.uid() and p.status <> 'kicked'
  )
$$;

-- Can the current user see the live position of `p_target`?
create or replace function public.can_see_player(p_target uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  t public.players;
  v public.players;
  g public.games;
begin
  select * into t from public.players where id = p_target;
  if not found then return false; end if;
  select * into v from public.players
    where game_id = t.game_id and user_id = auth.uid() and status <> 'kicked';
  if not found then return false; end if;
  if v.id = t.id then return true; end if;
  select * into g from public.games where id = t.game_id;
  if g.status = 'ended' then return true; end if;
  if v.role = 'spectator' then return true; end if;
  if v.role = t.role then
    return t.role = 'hunter' or coalesce((g.settings->>'shadowsSeeEachOther')::boolean, true);
  end if;
  if v.role = 'shadow' and t.role = 'hunter' then
    return coalesce(g.settings->>'shadowsSeeHunters', 'never') = 'always';
  end if;
  return false;
end
$$;

-- Can the current user read messages / pings for a team channel?
create or replace function public.can_read_channel(p_game uuid, p_channel text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare v public.players; g public.games;
begin
  select * into v from public.players
    where game_id = p_game and user_id = auth.uid() and status <> 'kicked';
  if not found then return false; end if;
  if p_channel = 'all' or v.role = 'spectator' or v.role = p_channel then return true; end if;
  select * into g from public.games where id = p_game;
  return g.status = 'ended';
end
$$;

alter table public.games            enable row level security;
alter table public.players          enable row level security;
alter table public.positions_latest enable row level security;
alter table public.position_log     enable row level security;
alter table public.reveals          enable row level security;
alter table public.tags             enable row level security;
alter table public.messages         enable row level security;
alter table public.pings            enable row level security;
alter table public.events           enable row level security;

create policy "members read game"     on public.games    for select to authenticated using (public.is_member(id));
create policy "members read players"  on public.players  for select to authenticated using (public.is_member(game_id));
create policy "visible positions"     on public.positions_latest for select to authenticated using (public.can_see_player(player_id));
create policy "visible trail"         on public.position_log     for select to authenticated using (public.can_see_player(player_id));
create policy "members read reveals"  on public.reveals  for select to authenticated using (public.is_member(game_id));
create policy "members read tags"     on public.tags     for select to authenticated using (public.is_member(game_id));
create policy "members read events"   on public.events   for select to authenticated using (public.is_member(game_id));
create policy "channel messages"      on public.messages for select to authenticated using (public.can_read_channel(game_id, channel));
create policy "team pings"            on public.pings    for select to authenticated using (public.can_read_channel(game_id, team));

-- helpers are internal to policies
revoke execute on function public.can_see_player(uuid) from anon;
revoke execute on function public.can_read_channel(uuid, text) from anon;
revoke execute on function public.my_player(uuid) from anon;
revoke execute on function public.is_member(uuid) from anon;

-- Realtime (postgres_changes honours RLS)
alter publication supabase_realtime add table
  public.games, public.players, public.reveals, public.tags,
  public.messages, public.pings, public.events;
