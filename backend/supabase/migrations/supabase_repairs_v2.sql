-- Opravy v2: poradové číslo, finálna cena, 10 stavov (premapovanie starých)
alter table repairs add column if not exists repair_no  text;
alter table repairs add column if not exists price_final numeric;

create sequence if not exists repair_no_seq;
create or replace function next_repair_no() returns text
language sql security definer as $$
  select 'OPR'||to_char(now(),'YYYY')||'-'||lpad(nextval('repair_no_seq')::text,5,'0');
$$;
grant execute on function next_repair_no() to authenticated, anon;

-- premapovanie starých kľúčov stavov na nové (repairs.status + repair_events.stage)
do $$
declare m text[][] := array[
  array['prijaté','prijate'], array['schválenie ceny','k_oprave'],
  array['objednané diely','cakanie_diely'], array['čaká na diely','cakanie_diely'],
  array['oprava','opravene'], array['hotovo','opravene'],
  array['čaká na platbu','zaplatene'], array['uzavreté','uzavrete']];
  i int;
begin
  for i in 1..array_length(m,1) loop
    update repairs        set status = m[i][2] where status = m[i][1];
    update repair_events  set stage  = m[i][2] where stage  = m[i][1];
  end loop;
end $$;

-- doplň číslo opravy existujúcim záznamom (podľa id)
update repairs set repair_no = 'OPR'||to_char(coalesce(created_at, now()),'YYYY')||'-'||lpad(id::text,5,'0')
where repair_no is null;

select count(*) as repairs_total, count(repair_no) as with_no from repairs;
