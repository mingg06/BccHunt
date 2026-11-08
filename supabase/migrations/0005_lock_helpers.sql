-- RLS helper functions: only signed-in users (policies evaluate as the caller).
revoke execute on function public.can_see_player(uuid) from public, anon;
revoke execute on function public.can_read_channel(uuid, text) from public, anon;
revoke execute on function public.my_player(uuid) from public, anon;
revoke execute on function public.is_member(uuid) from public, anon;
grant execute on function public.can_see_player(uuid) to authenticated;
grant execute on function public.can_read_channel(uuid, text) to authenticated;
grant execute on function public.my_player(uuid) to authenticated;
grant execute on function public.is_member(uuid) to authenticated;
revoke execute on function public.server_now() from public, anon;
grant execute on function public.server_now() to authenticated;
revoke execute on function public._color(int) from public, anon, authenticated;
