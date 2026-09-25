begin;
select no_plan();

select tests.reset_app();
select tests.create_user('qm_one', 'queue_manager');
select tests.create_user('pan_one', 'panelist');

select tests.login_as('pan_one');
select throws_ok($$ select public.import_candidates('[]'::jsonb) $$, '42501', 'Not allowed', 'panelists cannot import');

select tests.login_as('qm_one');
select throws_ok($$ select public.import_candidates('{}'::jsonb) $$, 'P0001', 'Import data must be a list of rows', 'rejects non-array input');

-- first import: numbers follow submission time, not file order
select is(
  public.import_candidates(jsonb_build_array(
    tests.import_row('2023002', 'Bilal', '2026-09-20T10:05:00+05:00'),
    tests.import_row('2023001', 'Ayesha', '2026-09-20T10:00:00+05:00'),
    tests.import_row('2023003', 'Chand', '2026-09-20T10:10:00+05:00'))),
  '{"added": 3, "updated": 0, "flagged": []}'::jsonb, 'three candidates added');
select is((select array_agg(full_name order by number) from public.candidates), array['Ayesha', 'Bilal', 'Chand'],
          '#1 is the earliest response');
select is((select status::text from public.candidates where reg_number = '2023001'), 'registered', 'imported as registered');
select is((select preferences from public.candidates where reg_number = '2023001'),
          array['Dev Team', 'L&Ds', 'Logikal', 'Marketing'], 'team preferences stored');
select is((select answers -> 'general' -> 0 ->> 'a' from public.candidates where reg_number = '2023001'),
          'Because Ayesha', 'answers stored by section');

-- re-importing the same file changes nothing
select is(
  public.import_candidates(jsonb_build_array(
    tests.import_row('2023002', 'Bilal', '2026-09-20T10:05:00+05:00'),
    tests.import_row('2023001', 'Ayesha', '2026-09-20T10:00:00+05:00'),
    tests.import_row('2023003', 'Chand', '2026-09-20T10:10:00+05:00'))),
  '{"added": 0, "updated": 0, "flagged": []}'::jsonb, 'the same file is a no-op');

-- Review focus 2: a later export mid-induction. #1 is checked in; their details change; a new
-- person appears whose timestamp is earlier than everyone's but still gets the next number.
select public.check_in(tests.candidate_id(1));
select is(
  public.import_candidates(jsonb_build_array(
    tests.import_row('2023001', 'Ayesha Khan', '2026-09-20T10:00:00+05:00', 'ayesha@example.test'),
    tests.import_row('2023002', 'Bilal', '2026-09-20T10:05:00+05:00'),
    tests.import_row('2023003', 'Chand', '2026-09-20T10:10:00+05:00'),
    tests.import_row('2023004', 'Danish', '2026-09-20T09:00:00+05:00'))),
  '{"added": 1, "updated": 1, "flagged": []}'::jsonb, 'one added, one updated');
select is((select full_name from public.candidates where number = 1), 'Ayesha Khan', 'details updated');
select is(tests.status(1), 'waiting', 'status untouched by re-import');
select ok((select checked_in_at is not null from public.candidates where number = 1), 'check-in time untouched');
select is(tests.lane(), array[1], 'queue untouched by re-import');
select is((select number from public.candidates where reg_number = '2023004'), 4, 'new registrations continue the numbering');

-- Review focus 3: reg numbers are normalised before matching
select is(
  public.import_candidates(jsonb_build_array(tests.import_row(' 2023 004 ', 'Danish', '2026-09-20T09:00:00+05:00'))),
  '{"added": 0, "updated": 0, "flagged": []}'::jsonb, 'spaces in reg numbers are ignored');
select is(
  public.import_candidates(jsonb_build_array(tests.import_row('ab-77', 'Lower', '2026-09-20T09:30:00+05:00'))) -> 'added',
  '1'::jsonb, 'lowercase reg number imported');
select is(
  public.import_candidates(jsonb_build_array(tests.import_row('AB-77', 'Lower', '2026-09-20T09:30:00+05:00'))) -> 'added',
  '0'::jsonb, 'and matched again in uppercase');

-- flags: missing reg number, duplicate submissions, likely reg-number typos
select is(
  public.import_candidates(jsonb_build_array(
    tests.import_row('', 'No Reg', '2026-09-20T11:00:00+05:00'),
    tests.import_row('2023005', 'Eman', '2026-09-20T11:00:00+05:00'),
    tests.import_row('2023005', 'Eman Ali', '2026-09-20T12:00:00+05:00'),
    tests.import_row('2023099', 'Ayesha K', '2026-09-20T12:30:00+05:00', 'Ayesha@Example.test'))) -> 'flagged',
  '[{"reg_number": "", "name": "No Reg", "reason": "Missing registration number; row skipped"},
    {"reg_number": "2023005", "name": "Eman Ali", "reason": "Duplicate submission (2 responses); kept the latest"},
    {"reg_number": "2023099", "name": "Ayesha K", "reason": "Possible reg number typo; email matches #1"}]'::jsonb,
  'all three problems are flagged');
select is((select full_name from public.candidates where reg_number = '2023005'), 'Eman Ali', 'a duplicate keeps the latest answers');
select is((select submitted_at from public.candidates where reg_number = '2023005'), '2026-09-20T11:00:00+05:00'::timestamptz,
          'but the earliest submission time');
select is((select count(*)::int from public.candidates), 7, 'the missing-reg row is skipped; the typo row is still added');

-- Review focus 4: names with quotes, dashes and non-Latin script survive intact
select public.import_candidates(jsonb_build_array(tests.import_row('2023100', 'Zara O''Brien — زارا', '2026-09-20T13:00:00+05:00')));
select is((select full_name from public.candidates where reg_number = '2023100'), 'Zara O''Brien — زارا', 'special characters kept');

-- New registrations in the same file that share an email are flagged too (e.g. the first import)
select is(
  public.import_candidates(jsonb_build_array(
    tests.import_row('2023200', 'Hina', '2026-09-20T14:00:00+05:00', 'hina@example.test'),
    tests.import_row('2032200', 'Hina R', '2026-09-20T14:05:00+05:00', 'HINA@example.test'))) -> 'flagged',
  '[{"reg_number": "2032200", "name": "Hina R", "reason": "Possible reg number typo; email matches #9"}]'::jsonb,
  'two new registrations sharing an email are flagged');

select * from finish();
rollback;
