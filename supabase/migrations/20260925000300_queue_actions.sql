-- Check-in and queue ordering. A lane is the waiting pool (panel_id null) or one panel's
-- line-up. Positions are always 1..n within a lane.

-- Serialises all queue/interview actions for an induction (one QM double-clicking, two tabs).
create function public.lock_queue(p_induction_id uuid) returns void
language sql volatile security definer set search_path = '' as $$
  select pg_advisory_xact_lock(hashtextextended('queue:' || p_induction_id::text, 0))
$$;

create function public.lane_next_position(p_induction_id uuid, p_panel_id uuid) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(max(position), 0) + 1
    from public.queue_entries
   where induction_id = p_induction_id and panel_id is not distinct from p_panel_id
$$;

create function public.renumber_lane(p_induction_id uuid, p_panel_id uuid) returns void
language sql volatile security definer set search_path = '' as $$
  update public.queue_entries q
     set position = r.rn
    from (select candidate_id, row_number() over (order by position, created_at) as rn
            from public.queue_entries
           where induction_id = p_induction_id and panel_id is not distinct from p_panel_id) r
   where q.candidate_id = r.candidate_id and q.position <> r.rn
$$;

-- Puts exactly these candidates into the lane, in this order.
create function public.set_lane_order(p_induction_id uuid, p_panel_id uuid, p_ids uuid[]) returns void
language sql volatile security definer set search_path = '' as $$
  update public.queue_entries q
     set panel_id = p_panel_id, position = t.ord
    from unnest(p_ids) with ordinality as t(candidate_id, ord)
   where q.candidate_id = t.candidate_id and q.induction_id = p_induction_id
$$;

create function public.check_in(p_candidate_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_ind uuid;
  v_c public.candidates;
begin
  perform public.require_role('admin', 'queue_manager');
  v_ind := public.require_active_induction();
  perform public.lock_queue(v_ind);
  select * into v_c from public.candidates where id = p_candidate_id and induction_id = v_ind for update;
  if not found then
    raise exception 'Candidate not found';
  end if;
  if v_c.status <> 'registered' then
    raise exception 'Candidate #% is already %', v_c.number, v_c.status;
  end if;
  update public.candidates
     set status = 'waiting', checked_in_at = clock_timestamp(), updated_at = clock_timestamp()
   where id = v_c.id;
  insert into public.queue_entries (candidate_id, induction_id, panel_id, position)
  values (v_c.id, v_ind, null, public.lane_next_position(v_ind, null));
  perform public.broadcast_board();
end $$;

create function public.undo_check_in(p_candidate_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_ind uuid;
  v_c public.candidates;
  v_lane uuid;
begin
  perform public.require_role('admin', 'queue_manager');
  v_ind := public.require_active_induction();
  perform public.lock_queue(v_ind);
  select * into v_c from public.candidates where id = p_candidate_id and induction_id = v_ind for update;
  if not found then
    raise exception 'Candidate not found';
  end if;
  if v_c.status <> 'waiting' then
    raise exception 'Candidate #% is not waiting', v_c.number;
  end if;
  select panel_id into v_lane from public.queue_entries where candidate_id = v_c.id;
  delete from public.queue_entries where candidate_id = v_c.id;
  perform public.renumber_lane(v_ind, v_lane);
  update public.candidates
     set status = 'registered', checked_in_at = null, updated_at = clock_timestamp()
   where id = v_c.id;
  perform public.broadcast_board();
end $$;

-- Reorder, emergency-to-top (position 1), line up for a panel, or back to the pool (panel null).
-- A null or too-large position means "end of the lane".
create function public.move_candidate(p_candidate_id uuid, p_panel_id uuid, p_position int) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_ind uuid;
  v_entry public.queue_entries;
  v_ids uuid[];
  v_len int;
  v_pos int;
begin
  perform public.require_role('admin', 'queue_manager');
  v_ind := public.require_active_induction();
  perform public.lock_queue(v_ind);
  select * into v_entry from public.queue_entries where candidate_id = p_candidate_id and induction_id = v_ind;
  if not found then
    raise exception 'Candidate is no longer waiting';
  end if;
  if p_panel_id is not null and not exists (
    select 1 from public.panels where id = p_panel_id and induction_id = v_ind and deleted_at is null
  ) then
    raise exception 'Panel not found';
  end if;

  v_ids := array(
    select candidate_id from public.queue_entries
     where induction_id = v_ind and panel_id is not distinct from p_panel_id and candidate_id <> p_candidate_id
     order by position);
  v_len := coalesce(array_length(v_ids, 1), 0);
  v_pos := least(greatest(coalesce(p_position, v_len + 1), 1), v_len + 1);
  v_ids := v_ids[1:v_pos - 1] || p_candidate_id || v_ids[v_pos:v_len];

  perform public.set_lane_order(v_ind, p_panel_id, v_ids);
  if v_entry.panel_id is distinct from p_panel_id then
    perform public.renumber_lane(v_ind, v_entry.panel_id);
  end if;
  perform public.broadcast_board();
end $$;

create function public.skip_candidate(p_candidate_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_ind uuid;
  v_entry public.queue_entries;
begin
  perform public.require_role('admin', 'queue_manager');
  v_ind := public.require_active_induction();
  perform public.lock_queue(v_ind);
  select * into v_entry from public.queue_entries where candidate_id = p_candidate_id and induction_id = v_ind;
  if not found then
    raise exception 'Candidate is no longer waiting';
  end if;
  update public.queue_entries
     set position = public.lane_next_position(v_ind, v_entry.panel_id), skip_count = skip_count + 1
   where candidate_id = p_candidate_id;
  perform public.renumber_lane(v_ind, v_entry.panel_id);
  perform public.broadcast_board();
end $$;

revoke execute on function public.lock_queue(uuid) from public, anon, authenticated;
revoke execute on function public.lane_next_position(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.renumber_lane(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.set_lane_order(uuid, uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public.check_in(uuid) from public, anon;
revoke execute on function public.undo_check_in(uuid) from public, anon;
revoke execute on function public.move_candidate(uuid, uuid, int) from public, anon;
revoke execute on function public.skip_candidate(uuid) from public, anon;
grant execute on function public.check_in(uuid) to authenticated;
grant execute on function public.undo_check_in(uuid) to authenticated;
grant execute on function public.move_candidate(uuid, uuid, int) to authenticated;
grant execute on function public.skip_candidate(uuid) to authenticated;
