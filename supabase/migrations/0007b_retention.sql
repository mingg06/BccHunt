-- Retention (needs approval to apply: it deletes data).
-- Scrubs pending-tag distances, removes 'spectator' late-join settings,
-- and wipes location data 7 days after a game ends.
update public.tags set distance_m = null where status <> 'confirmed';
update public.games set settings = jsonb_set(settings, '{lateJoinRole}', '"hunter"')
 where settings->>'lateJoinRole' = 'spectator';

create or replace function public._purge_locations()
returns void language sql set search_path = '' as $$
  delete from public.position_log l using public.games g
   where l.game_id = g.id and g.status = 'ended' and g.ended_at < now() - interval '7 days';
  delete from public.positions_latest p using public.games g
   where p.game_id = g.id and g.status = 'ended' and g.ended_at < now() - interval '7 days';
  update public.reveals r set shadows = '[]'::jsonb, hunters = null from public.games g
   where r.game_id = g.id and g.status = 'ended' and g.ended_at < now() - interval '7 days'
     and (r.shadows <> '[]'::jsonb or r.hunters is not null);
  delete from public.pings p using public.games g
   where p.game_id = g.id and g.status = 'ended' and g.ended_at < now() - interval '7 days';
$$;
revoke execute on function public._purge_locations() from public, anon, authenticated;

select cron.schedule('bcchunt-purge-locations', '17 3 * * *', $$select public._purge_locations()$$);
