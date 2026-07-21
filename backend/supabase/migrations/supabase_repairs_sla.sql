alter table repairs add column if not exists last_by text;
alter table repairs add column if not exists parts_expected date;
select 'ok' as done;