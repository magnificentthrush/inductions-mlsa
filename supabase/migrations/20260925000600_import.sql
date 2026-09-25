-- CSV import. The browser parses the Google Forms export and sends rows as JSON; this function
-- matches on the normalised reg number, updates details of existing candidates without touching
-- their induction state, numbers new candidates in submission order, and flags suspicious rows.

create function public.normalize_reg(p_reg text) returns text
language sql immutable set search_path = '' as $$
  select upper(regexp_replace(coalesce(p_reg, ''), '\s+', '', 'g'))
$$;

-- One row per reg number: data from the latest response, time of the earliest one.
create function public.import_rows_dedup(p_rows jsonb)
returns table (
  reg_number text, first_submitted_at timestamptz, response_count int,
  full_name text, email text, account_email text, phone text, department text, batch text,
  preferences text[], answers jsonb
)
language sql stable set search_path = '' as $$
  with src as (
    select public.normalize_reg(t.x ->> 'reg_number') as reg,
           coalesce((t.x ->> 'submitted_at')::timestamptz, now()) as ts,
           t.x,
           t.ord
      from jsonb_array_elements(p_rows) with ordinality as t(x, ord)
  ), grouped as (
    select reg,
           min(ts) as first_ts,
           count(*)::int as n,
           (array_agg(x order by ts desc, ord desc))[1] as latest
      from src
     where reg <> ''
     group by reg
  )
  select g.reg, g.first_ts, g.n,
         coalesce(trim(g.latest ->> 'full_name'), ''),
         coalesce(trim(g.latest ->> 'email'), ''),
         coalesce(trim(g.latest ->> 'account_email'), ''),
         coalesce(trim(g.latest ->> 'phone'), ''),
         coalesce(trim(g.latest ->> 'department'), ''),
         coalesce(trim(g.latest ->> 'batch'), ''),
         array(select jsonb_array_elements_text(
                 case when jsonb_typeof(g.latest -> 'preferences') = 'array'
                      then g.latest -> 'preferences' else '[]'::jsonb end)),
         case when jsonb_typeof(g.latest -> 'answers') = 'object'
              then g.latest -> 'answers' else '{}'::jsonb end
    from grouped g
$$;

create function public.import_candidates(p_rows jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_ind uuid;
  v_next int;
  v_added int := 0;
  v_updated int := 0;
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

  -- Flags: a NEW reg number whose email belongs to someone already imported.
  v_flags := v_flags || coalesce((
    select jsonb_agg(jsonb_build_object(
             'reg_number', d.reg_number,
             'name', d.full_name,
             'reason', format('Possible reg number typo; email matches #%s', m.number))
           order by d.reg_number)
      from public.import_rows_dedup(p_rows) d
      join lateral (
        select c.number
          from public.candidates c
         where c.induction_id = v_ind
           and c.reg_number <> d.reg_number
           and exists (
             select 1
               from unnest(array[lower(d.email), lower(d.account_email)]) as e(addr)
              where e.addr <> '' and e.addr in (lower(c.email), lower(c.account_email)))
         order by c.number
         limit 1) m on true
     where not exists (
       select 1 from public.candidates x where x.induction_id = v_ind and x.reg_number = d.reg_number)), '[]'::jsonb);

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
  insert into public.candidates (induction_id, number, reg_number, full_name, email, account_email, phone,
                                 department, batch, submitted_at, preferences, answers)
  select v_ind,
         v_next + row_number() over (order by d.first_submitted_at, d.reg_number),
         d.reg_number, d.full_name, d.email, d.account_email, d.phone, d.department, d.batch,
         d.first_submitted_at, d.preferences, d.answers
    from public.import_rows_dedup(p_rows) d
   where not exists (
     select 1 from public.candidates c where c.induction_id = v_ind and c.reg_number = d.reg_number);
  get diagnostics v_added = row_count;

  perform public.broadcast_board();
  return jsonb_build_object('added', v_added, 'updated', v_updated, 'flagged', v_flags);
end $$;

revoke execute on function public.normalize_reg(text) from public, anon, authenticated;
revoke execute on function public.import_rows_dedup(jsonb) from public, anon, authenticated;
revoke execute on function public.import_candidates(jsonb) from public, anon;
grant execute on function public.import_candidates(jsonb) to authenticated;
