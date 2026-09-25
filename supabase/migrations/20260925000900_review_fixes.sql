-- Fixes from the final branch review.
-- 1. import_candidates: the "possible reg number typo" check now runs after new rows are inserted,
--    so two NEW registrations sharing an email (e.g. within the first import) are flagged too.
--    The higher-numbered candidate is flagged against the lowest-numbered match.
-- 2. reopen_interview: refuses interviews whose panel has been deleted, so nobody can end up
--    "interviewing" on a panel no screen shows.

create or replace function public.import_candidates(p_rows jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_ind uuid;
  v_next int;
  v_added int := 0;
  v_updated int := 0;
  v_new_ids uuid[];
  v_flags jsonb;
begin
  perform public.require_role('admin', 'queue_manager');
  v_ind := public.require_active_induction();
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Import data must be a list of rows';
  end if;
  perform public.lock_queue(v_ind);

  -- Flags: rows without a reg number are skipped.
  select coalesce(jsonb_agg(jsonb_build_object(
           'reg_number', '',
           'name', coalesce(trim(t.x ->> 'full_name'), ''),
           'reason', 'Missing registration number; row skipped') order by t.ord), '[]'::jsonb)
    into v_flags
    from jsonb_array_elements(p_rows) with ordinality as t(x, ord)
   where public.normalize_reg(t.x ->> 'reg_number') = '';

  -- Flags: the same person submitted more than once.
  v_flags := v_flags || coalesce((
    select jsonb_agg(jsonb_build_object(
             'reg_number', d.reg_number,
             'name', d.full_name,
             'reason', format('Duplicate submission (%s responses); kept the latest', d.response_count))
           order by d.reg_number)
      from public.import_rows_dedup(p_rows) d
     where d.response_count > 1), '[]'::jsonb);

  -- Existing candidates: refresh application data only. Never number/status/queue/decision.
  update public.candidates c
     set full_name = d.full_name,
         email = d.email,
         account_email = d.account_email,
         phone = d.phone,
         department = d.department,
         batch = d.batch,
         preferences = d.preferences,
         answers = d.answers,
         submitted_at = least(c.submitted_at, d.first_submitted_at),
         updated_at = clock_timestamp()
    from public.import_rows_dedup(p_rows) d
   where c.induction_id = v_ind
     and c.reg_number = d.reg_number
     and (c.full_name, c.email, c.account_email, c.phone, c.department, c.batch, c.preferences, c.answers)
         is distinct from
         (d.full_name, d.email, d.account_email, d.phone, d.department, d.batch, d.preferences, d.answers);
  get diagnostics v_updated = row_count;

  -- New candidates: numbered in submission order after the current highest number.
  select coalesce(max(number), 0) into v_next from public.candidates where induction_id = v_ind;
  with inserted as (
    insert into public.candidates (induction_id, number, reg_number, full_name, email, account_email, phone,
                                   department, batch, submitted_at, preferences, answers)
    select v_ind,
           v_next + row_number() over (order by d.first_submitted_at, d.reg_number),
           d.reg_number, d.full_name, d.email, d.account_email, d.phone, d.department, d.batch,
           d.first_submitted_at, d.preferences, d.answers
      from public.import_rows_dedup(p_rows) d
     where not exists (
       select 1 from public.candidates c where c.induction_id = v_ind and c.reg_number = d.reg_number)
    returning id
  )
  select count(*)::int, coalesce(array_agg(id), '{}') into v_added, v_new_ids from inserted;

  -- Flags: a NEW candidate whose email belongs to a lower-numbered candidate (existing or new).
  v_flags := v_flags || coalesce((
    select jsonb_agg(jsonb_build_object(
             'reg_number', n.reg_number,
             'name', n.full_name,
             'reason', format('Possible reg number typo; email matches #%s', m.number))
           order by n.number)
      from public.candidates n
      join lateral (
        select c.number
          from public.candidates c
         where c.induction_id = v_ind
           and c.number < n.number
           and exists (
             select 1
               from unnest(array[lower(n.email), lower(n.account_email)]) as e(addr)
              where e.addr <> '' and e.addr in (lower(c.email), lower(c.account_email)))
         order by c.number
         limit 1) m on true
     where n.id = any (v_new_ids)), '[]'::jsonb);

  perform public.broadcast_board();
  return jsonb_build_object('added', v_added, 'updated', v_updated, 'flagged', v_flags);
end $$;

create or replace function public.reopen_interview(p_interview_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_ind uuid;
  v_i public.interviews;
  v_p public.panels;
begin
  perform public.require_role('admin', 'queue_manager');
  v_ind := public.require_active_induction();
  perform public.lock_queue(v_ind);
  select * into v_i from public.interviews where id = p_interview_id and induction_id = v_ind for update;
  if not found or v_i.status <> 'ended' then
    raise exception 'Interview cannot be reopened';
  end if;
  select * into v_p from public.panels where id = v_i.panel_id;
  if v_p.deleted_at is not null then
    raise exception 'Panel not found';
  end if;
  if exists (select 1 from public.interviews where panel_id = v_i.panel_id and status = 'in_progress') then
    raise exception '% is busy', v_p.name;
  end if;
  if public.panel_reopenable_interview(v_i.panel_id) is distinct from v_i.id then
    raise exception 'Only the most recent interview can be reopened';
  end if;
  update public.interviews set status = 'in_progress', ended_at = null, ended_by = null where id = v_i.id;
  update public.candidates set status = 'interviewing', updated_at = clock_timestamp() where id = v_i.candidate_id;
  perform public.broadcast_board();
end $$;
