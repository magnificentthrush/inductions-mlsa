-- Shared action helpers, the staff board snapshot, the public projector snapshot,
-- and realtime broadcasting. Topics: board (private), interview:<id> (private),
-- display:<display_key> (public — the secret key is the protection).

create function public.require_role(variadic p_roles text[]) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (
    select 1 from public.profiles p
     where p.id = v_uid and p.is_active and p.role::text = any (p_roles)
  ) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return v_uid;
end $$;

create function public.current_app_role() returns text
language sql stable security definer set search_path = '' as $$
  select role::text from public.profiles where id = auth.uid() and is_active
$$;

create function public.require_active_induction() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid := public.active_induction_id();
begin
  if v_id is null then
    raise exception 'No active induction';
  end if;
  return v_id;
end $$;

create function public.server_now() returns timestamptz
language sql volatile set search_path = '' as $$
  select clock_timestamp()
$$;

-- One lane (panel_id null = the waiting pool) as an ordered JSON array.
create function public.lane_json(p_induction_id uuid, p_panel_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'candidate_id', c.id, 'number', c.number, 'name', c.full_name, 'reg_number', c.reg_number,
           'position', q.position, 'skip_count', q.skip_count, 'checked_in_at', c.checked_in_at)
         order by q.position), '[]'::jsonb)
    from public.queue_entries q
    join public.candidates c on c.id = q.candidate_id
   where q.induction_id = p_induction_id and q.panel_id is not distinct from p_panel_id
$$;

-- The interview "Reopen" applies to: the panel's latest non-cancelled interview,
-- and only while nothing is in progress on that panel.
create function public.panel_reopenable_interview(p_panel_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select i.id
    from public.interviews i
   where i.panel_id = p_panel_id
     and i.status <> 'cancelled'
     and not exists (select 1 from public.interviews x where x.panel_id = p_panel_id and x.status = 'in_progress')
   order by i.started_at desc, i.id desc
   limit 1
$$;

-- Everything the projector shows. No login; returns null for a wrong key. No email/phone.
create function public.display_snapshot(p_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ind public.inductions;
begin
  select * into v_ind from public.inductions where is_active and display_key = p_key;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'induction_name', v_ind.name,
    'target_interview_minutes', v_ind.target_interview_minutes,
    'server_time', clock_timestamp(),
    'panels', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'name', p.name,
               'current', (
                 select jsonb_build_object('number', c.number, 'name', c.full_name, 'started_at', i.started_at)
                   from public.interviews i
                   join public.candidates c on c.id = i.candidate_id
                  where i.panel_id = p.id and i.status = 'in_progress'),
               'lined_up', coalesce((
                 select jsonb_agg(jsonb_build_object('number', c.number, 'name', c.full_name) order by q.position)
                   from public.queue_entries q
                   join public.candidates c on c.id = q.candidate_id
                  where q.panel_id = p.id and q.position <= 3), '[]'::jsonb))
             order by p.sort_order)
        from public.panels p
       where p.induction_id = v_ind.id and p.deleted_at is null), '[]'::jsonb),
    'waiting', coalesce((
      select jsonb_agg(jsonb_build_object('number', c.number, 'name', c.full_name) order by q.position)
        from public.queue_entries q
        join public.candidates c on c.id = q.candidate_id
       where q.induction_id = v_ind.id and q.panel_id is null and q.position <= 8), '[]'::jsonb)
  );
end $$;

-- Everything the queue manager and panelists need for the live board.
create function public.board_snapshot() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ind public.inductions;
begin
  perform public.require_role('admin', 'queue_manager', 'panelist');
  select * into v_ind from public.inductions where is_active;
  if not found then
    raise exception 'No active induction';
  end if;
  return jsonb_build_object(
    'induction', jsonb_build_object(
      'id', v_ind.id,
      'name', v_ind.name,
      'target_interview_minutes', v_ind.target_interview_minutes,
      'results_published', v_ind.results_published),
    'server_time', clock_timestamp(),
    'counts', (
      select jsonb_build_object(
               'registered', count(*) filter (where c.status = 'registered'),
               'waiting', count(*) filter (where c.status = 'waiting'),
               'interviewing', count(*) filter (where c.status = 'interviewing'),
               'interviewed', count(*) filter (where c.status = 'interviewed'))
        from public.candidates c
       where c.induction_id = v_ind.id),
    'panels', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'name', p.name,
               'is_default', p.is_default,
               'current', (
                 select jsonb_build_object(
                          'interview_id', i.id, 'candidate_id', c.id, 'number', c.number,
                          'name', c.full_name, 'reg_number', c.reg_number, 'started_at', i.started_at)
                   from public.interviews i
                   join public.candidates c on c.id = i.candidate_id
                  where i.panel_id = p.id and i.status = 'in_progress'),
               'last_ended', (
                 select jsonb_build_object(
                          'interview_id', i.id, 'candidate_id', c.id, 'number', c.number,
                          'name', c.full_name, 'ended_at', i.ended_at)
                   from public.interviews i
                   join public.candidates c on c.id = i.candidate_id
                  where i.id = public.panel_reopenable_interview(p.id)),
               'lane', public.lane_json(v_ind.id, p.id),
               'panelists', coalesce((
                 select jsonb_agg(jsonb_build_object('id', pr.id, 'display_name', pr.display_name)
                                  order by pr.display_name)
                   from public.profiles pr
                  where pr.current_panel_id = p.id and pr.is_active), '[]'::jsonb))
             order by p.sort_order)
        from public.panels p
       where p.induction_id = v_ind.id and p.deleted_at is null), '[]'::jsonb),
    'pool', public.lane_json(v_ind.id, null)
  );
end $$;

-- Called once at the end of every queue/interview/panel action. A broadcast failure must never
-- fail the action itself, so errors become warnings.
create function public.broadcast_board() returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_key text;
begin
  select display_key into v_key from public.inductions where is_active;
  if v_key is null then
    return;
  end if;
  begin
    perform realtime.send(jsonb_build_object('at', clock_timestamp()), 'changed', 'board', true);
    perform realtime.send(public.display_snapshot(v_key), 'snapshot', 'display:' || v_key, false);
  exception when others then
    raise warning 'broadcast_board failed: %', sqlerrm;
  end;
end $$;

create function public.broadcast_interview(p_interview_id uuid, p_event text, p_payload jsonb) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform realtime.send(p_payload, p_event, 'interview:' || p_interview_id::text, true);
exception when others then
  raise warning 'broadcast_interview failed: %', sqlerrm;
end $$;

-- Who may receive private broadcasts.
create policy "staff receive board broadcasts" on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) = 'board'
    and (select public.has_role('admin', 'queue_manager', 'panelist'))
  );
create policy "panelists receive interview broadcasts" on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) like 'interview:%'
    and (select public.has_role('admin', 'panelist'))
  );

revoke execute on function public.require_role(text[]) from public, anon, authenticated;
revoke execute on function public.current_app_role() from public, anon, authenticated;
revoke execute on function public.require_active_induction() from public, anon, authenticated;
revoke execute on function public.lane_json(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.panel_reopenable_interview(uuid) from public, anon, authenticated;
revoke execute on function public.broadcast_board() from public, anon, authenticated;
revoke execute on function public.broadcast_interview(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.board_snapshot() from public, anon;
grant execute on function public.board_snapshot() to authenticated;
grant execute on function public.display_snapshot(text) to anon, authenticated;
grant execute on function public.server_now() to anon, authenticated;
