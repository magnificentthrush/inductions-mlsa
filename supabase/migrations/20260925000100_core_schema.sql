-- Core schema for the induction system.
-- Clients only READ these tables (through the policies below). Every write goes through a
-- SECURITY DEFINER function defined in a later migration, or the service role (accounts).

create type public.app_role as enum ('admin', 'queue_manager', 'panelist');
create type public.candidate_status as enum ('registered', 'waiting', 'interviewing', 'interviewed');
create type public.candidate_decision as enum ('undecided', 'selected', 'not_selected');
create type public.interview_status as enum ('in_progress', 'ended', 'cancelled');
create type public.recommendation as enum ('strong_yes', 'yes', 'maybe', 'no');
create type public.criterion_category as enum ('general', 'team_fit');

create table public.inductions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  is_active boolean not null default false,
  display_key text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  target_interview_minutes int not null default 15 check (target_interview_minutes between 1 and 180),
  results_published boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index inductions_single_active_idx on public.inductions (is_active) where is_active;

-- Written only by the service role (createAccount). No profile = no role = no access.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,32}$'),
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  role public.app_role not null,
  is_active boolean not null default true,
  current_panel_id uuid,
  created_at timestamptz not null default now()
);

create table public.panels (
  id uuid primary key default gen_random_uuid(),
  induction_id uuid not null references public.inductions (id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  sort_order int not null,
  deleted_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_current_panel_id_fkey
  foreign key (current_panel_id) references public.panels (id) on delete set null;

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  induction_id uuid not null references public.inductions (id) on delete cascade,
  number int not null check (number > 0),
  reg_number text not null check (reg_number <> ''),
  full_name text not null default '',
  email text not null default '',
  account_email text not null default '',
  phone text not null default '',
  department text not null default '',
  batch text not null default '',
  submitted_at timestamptz not null,
  preferences text[] not null default '{}',
  answers jsonb not null default '{}'::jsonb,
  status public.candidate_status not null default 'registered',
  checked_in_at timestamptz,
  decision public.candidate_decision not null default 'undecided',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (induction_id, number),
  unique (induction_id, reg_number)
);

-- A row exists only while the candidate is waiting. panel_id null = the waiting pool.
create table public.queue_entries (
  candidate_id uuid primary key references public.candidates (id) on delete cascade,
  induction_id uuid not null references public.inductions (id) on delete cascade,
  panel_id uuid references public.panels (id),
  position int not null check (position > 0),
  skip_count int not null default 0,
  created_at timestamptz not null default clock_timestamp()
);
create index queue_entries_lane_idx on public.queue_entries (induction_id, panel_id, position);

create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  induction_id uuid not null references public.inductions (id) on delete cascade,
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  panel_id uuid not null references public.panels (id),
  status public.interview_status not null default 'in_progress',
  started_at timestamptz not null default clock_timestamp(),
  ended_at timestamptz,
  started_by uuid references public.profiles (id) on delete set null,
  ended_by uuid references public.profiles (id) on delete set null
);
create unique index interviews_one_active_per_panel_idx on public.interviews (panel_id) where status = 'in_progress';
create unique index interviews_one_active_per_candidate_idx on public.interviews (candidate_id) where status = 'in_progress';
create index interviews_candidate_idx on public.interviews (candidate_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.interviews (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default clock_timestamp()
);
create index messages_interview_idx on public.messages (interview_id, created_at);

create table public.evaluation_criteria (
  id uuid primary key default gen_random_uuid(),
  induction_id uuid not null references public.inductions (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]+$'),
  label text not null,
  category public.criterion_category not null,
  sort_order int not null,
  unique (induction_id, key)
);

create table public.evaluations (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.interviews (id) on delete cascade,
  panelist_id uuid not null references public.profiles (id),
  scores jsonb not null default '{}'::jsonb,
  recommendation public.recommendation not null,
  comments text not null default '' check (length(comments) <= 5000),
  submitted_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (interview_id, panelist_id)
);

create function public.active_induction_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.inductions where is_active
$$;

-- True when the signed-in user has an active account with one of the given roles.
-- Used by every RLS policy (so it must stay executable by `authenticated`).
create function public.has_role(variadic p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.is_active and p.role::text = any (p_roles))
$$;

-- Creates the active induction with Panel 1, Panel 2 and the placeholder criteria.
-- Run from SQL only (next year: `select public.create_induction('Fall 2027');`).
create function public.create_induction(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  update public.inductions set is_active = false where is_active;
  insert into public.inductions (name, is_active) values (p_name, true) returning id into v_id;
  insert into public.panels (induction_id, name, is_default, sort_order)
  values (v_id, 'Panel 1', true, 1), (v_id, 'Panel 2', true, 2);
  insert into public.evaluation_criteria (induction_id, key, label, category, sort_order) values
    (v_id, 'communication', 'Communication', 'general', 1),
    (v_id, 'confidence_attitude', 'Confidence & Attitude', 'general', 2),
    (v_id, 'teamwork', 'Teamwork', 'general', 3),
    (v_id, 'commitment', 'Commitment', 'general', 4),
    (v_id, 'problem_solving', 'Problem Solving', 'general', 5),
    (v_id, 'fit_dev', 'Dev', 'team_fit', 6),
    (v_id, 'fit_logikal', 'LogiKal', 'team_fit', 7),
    (v_id, 'fit_lnd', 'L&D', 'team_fit', 8),
    (v_id, 'fit_marketing', 'Marketing', 'team_fit', 9);
  return v_id;
end $$;

-- Read policies. There are no insert/update/delete policies: clients cannot write.
alter table public.inductions enable row level security;
alter table public.profiles enable row level security;
alter table public.panels enable row level security;
alter table public.candidates enable row level security;
alter table public.queue_entries enable row level security;
alter table public.interviews enable row level security;
alter table public.messages enable row level security;
alter table public.evaluation_criteria enable row level security;
alter table public.evaluations enable row level security;

create policy "staff read inductions" on public.inductions for select to authenticated
  using ((select public.has_role('admin', 'queue_manager', 'panelist')));
create policy "staff read profiles" on public.profiles for select to authenticated
  using ((select public.has_role('admin', 'queue_manager', 'panelist')));
create policy "staff read panels" on public.panels for select to authenticated
  using ((select public.has_role('admin', 'queue_manager', 'panelist')));
create policy "staff read candidates" on public.candidates for select to authenticated
  using ((select public.has_role('admin', 'queue_manager', 'panelist')));
create policy "staff read queue" on public.queue_entries for select to authenticated
  using ((select public.has_role('admin', 'queue_manager', 'panelist')));
create policy "staff read interviews" on public.interviews for select to authenticated
  using ((select public.has_role('admin', 'queue_manager', 'panelist')));
create policy "staff read criteria" on public.evaluation_criteria for select to authenticated
  using ((select public.has_role('admin', 'queue_manager', 'panelist')));
create policy "panelists and admins read chat" on public.messages for select to authenticated
  using ((select public.has_role('admin', 'panelist')));
create policy "own evaluations, or all for admins" on public.evaluations for select to authenticated
  using ((select public.has_role('admin'))
         or (panelist_id = (select auth.uid()) and (select public.has_role('panelist'))));

-- Table privileges: anon gets nothing; authenticated can only SELECT (and not the projector key).
-- service_role keeps its defaults (account creation, scripts).
revoke all on public.inductions, public.profiles, public.panels, public.candidates, public.queue_entries,
  public.interviews, public.messages, public.evaluation_criteria, public.evaluations
  from anon, authenticated;
grant select on public.profiles, public.panels, public.candidates, public.queue_entries,
  public.interviews, public.messages, public.evaluation_criteria, public.evaluations
  to authenticated;
grant select (id, name, is_active, target_interview_minutes, results_published, created_at)
  on public.inductions to authenticated;

revoke execute on function public.active_induction_id() from public, anon, authenticated;
revoke execute on function public.create_induction(text) from public, anon, authenticated;
revoke execute on function public.has_role(text[]) from public, anon;
grant execute on function public.has_role(text[]) to authenticated;

select public.create_induction('Fall 2026');
