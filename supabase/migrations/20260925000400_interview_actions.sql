-- Interview lifecycle: waiting --send in--> interviewing --end--> interviewed,
-- with undo send-in and reopen. started_at/ended_at are server timestamps (the shared timer).

create function public.send_in(p_candidate_id uuid, p_panel_id uuid) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_ind uuid;
  v_c public.candidates;
  v_p public.panels;
  v_lane uuid;
  v_interview_id uuid;
begin
  v_uid := public.require_role('admin', 'queue_manager');
  v_ind := public.require_active_induction();
  perform public.lock_queue(v_ind);
  select * into v_c from public.candidates where id = p_candidate_id and induction_id = v_ind for update;
  if not found then
    raise exception 'Candidate not found';
  end if;
  if v_c.status <> 'waiting' then
    raise exception 'Candidate #% is not waiting', v_c.number;
  end if;
  select * into v_p from public.panels where id = p_panel_id and induction_id = v_ind and deleted_at is null;
  if not found then
    raise exception 'Panel not found';
  end if;
  if exists (select 1 from public.interviews where panel_id = v_p.id and status = 'in_progress') then
    raise exception '% is busy', v_p.name;
  end if;

  select panel_id into v_lane from public.queue_entries where candidate_id = v_c.id;
  delete from public.queue_entries where candidate_id = v_c.id;
  perform public.renumber_lane(v_ind, v_lane);

  insert into public.interviews (induction_id, candidate_id, panel_id, status, started_at, started_by)
  values (v_ind, v_c.id, v_p.id, 'in_progress', clock_timestamp(), v_uid)
  returning id into v_interview_id;
  update public.candidates set status = 'interviewing', updated_at = clock_timestamp() where id = v_c.id;

  perform public.broadcast_board();
  return v_interview_id;
end $$;

-- Sent the wrong person: cancel the interview and put them back at the top of that panel's lane.
create function public.undo_send_in(p_interview_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_ind uuid;
  v_i public.interviews;
begin
  v_uid := public.require_role('admin', 'queue_manager');
  v_ind := public.require_active_induction();
  perform public.lock_queue(v_ind);
  select * into v_i from public.interviews where id = p_interview_id and induction_id = v_ind for update;
  if not found or v_i.status <> 'in_progress' then
    raise exception 'Interview is not in progress';
  end if;
  update public.interviews
     set status = 'cancelled', ended_at = clock_timestamp(), ended_by = v_uid
   where id = v_i.id;
  update public.candidates set status = 'waiting', updated_at = clock_timestamp() where id = v_i.candidate_id;
  update public.queue_entries set position = position + 1 where induction_id = v_ind and panel_id = v_i.panel_id;
  insert into public.queue_entries (candidate_id, induction_id, panel_id, position)
  values (v_i.candidate_id, v_ind, v_i.panel_id, 1);
  perform public.broadcast_board();
end $$;

create function public.end_interview(p_interview_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_ind uuid;
  v_i public.interviews;
begin
  v_uid := public.require_role('admin', 'queue_manager', 'panelist');
  v_ind := public.require_active_induction();
  perform public.lock_queue(v_ind);
  select * into v_i from public.interviews where id = p_interview_id and induction_id = v_ind for update;
  if not found or v_i.status <> 'in_progress' then
    raise exception 'Interview is not in progress';
  end if;
  update public.interviews
     set status = 'ended', ended_at = clock_timestamp(), ended_by = v_uid
   where id = v_i.id;
  update public.candidates set status = 'interviewed', updated_at = clock_timestamp() where id = v_i.candidate_id;
  perform public.broadcast_board();
end $$;

-- "End" clicked by mistake: resume the panel's latest interview while the panel is still free.
-- The timer keeps counting from the original started_at.
create function public.reopen_interview(p_interview_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_ind uuid;
  v_i public.interviews;
  v_panel_name text;
begin
  perform public.require_role('admin', 'queue_manager');
  v_ind := public.require_active_induction();
  perform public.lock_queue(v_ind);
  select * into v_i from public.interviews where id = p_interview_id and induction_id = v_ind for update;
  if not found or v_i.status <> 'ended' then
    raise exception 'Interview cannot be reopened';
  end if;
  if exists (select 1 from public.interviews where panel_id = v_i.panel_id and status = 'in_progress') then
    select name into v_panel_name from public.panels where id = v_i.panel_id;
    raise exception '% is busy', v_panel_name;
  end if;
  if public.panel_reopenable_interview(v_i.panel_id) is distinct from v_i.id then
    raise exception 'Only the most recent interview can be reopened';
  end if;
  update public.interviews set status = 'in_progress', ended_at = null, ended_by = null where id = v_i.id;
  update public.candidates set status = 'interviewing', updated_at = clock_timestamp() where id = v_i.candidate_id;
  perform public.broadcast_board();
end $$;

revoke execute on function public.send_in(uuid, uuid) from public, anon;
revoke execute on function public.undo_send_in(uuid) from public, anon;
revoke execute on function public.end_interview(uuid) from public, anon;
revoke execute on function public.reopen_interview(uuid) from public, anon;
grant execute on function public.send_in(uuid, uuid) to authenticated;
grant execute on function public.undo_send_in(uuid) to authenticated;
grant execute on function public.end_interview(uuid) to authenticated;
grant execute on function public.reopen_interview(uuid) to authenticated;
