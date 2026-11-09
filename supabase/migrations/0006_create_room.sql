-- create_room: like create_game, but also takes the starting zone so the host
-- can configure everything up front on the Create screen.
create or replace function public.create_room(
  p_nickname text, p_emoji text, p_settings jsonb, p_role text default 'hunter', p_zone jsonb default null
)
returns text language plpgsql security definer set search_path = '' as $$
declare c text; gid uuid; alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if p_zone is not null and (
       (p_zone->>'lat') is null or (p_zone->>'lng') is null or coalesce((p_zone->>'r')::float8, 0) < 25
     ) then
    raise exception 'bad_zone';
  end if;
  loop
    c := '';
    for i in 1..5 loop c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    exit when not exists (select 1 from public.games where code = c);
  end loop;
  insert into public.games (code, host_id, settings, zone) values (c, auth.uid(), p_settings, p_zone) returning id into gid;
  insert into public.players (game_id, user_id, nickname, emoji, role, color)
       values (gid, auth.uid(), trim(p_nickname), coalesce(p_emoji,'🙂'),
               case when p_role in ('hunter','shadow','spectator') then p_role else 'hunter' end, public._color(0));
  perform public._event(gid, 'create', 0, jsonb_build_object('nickname', trim(p_nickname)));
  return c;
end $$;

revoke execute on function public.create_room(text, text, jsonb, text, jsonb) from public, anon;
grant execute on function public.create_room(text, text, jsonb, text, jsonb) to authenticated;
