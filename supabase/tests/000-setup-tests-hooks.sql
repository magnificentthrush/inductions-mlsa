-- Installs pgTAP. Task 2 replaces this file with the shared test helpers.
create extension if not exists pgtap with schema extensions;

select plan(1);
select ok(true, 'pgTAP is installed');
select * from finish();
