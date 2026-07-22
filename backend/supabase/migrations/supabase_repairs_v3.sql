-- Opravy v3: neopravuje sa (+ disposition), prepojenie zásielok, demo dáta
alter table repairs   add column if not exists not_repaired boolean default false;
alter table repairs   add column if not exists disposition  text;   -- vrátené neopravené / likvidácia / na diely
alter table shipments add column if not exists repair_id    bigint references repairs(id);
create index if not exists shipments_repair_idx on shipments(repair_id);

do $$
begin
if (select count(*) from repairs) < 6 then
  insert into repairs (kind,status,repair_no,title,serial,customer,customer_email,customer_phone,technician,received_by,last_by,price_estimate,price_final,price_currency,fault,parts_expected,not_repaired,disposition,created_at,updated_at) values
  ('oprava','zadane',       'OPR2026-00010','Antminer S19 Pro','SN-S19-001','Peter Král','peter.kral@x.sk','+421900111','',       'michal','',       null,null,'CZK','Nezapína sa',                    null,                    false,null,               now()-interval '1 day', now()-interval '1 day'),
  ('oprava','prijate',      'OPR2026-00011','Whatsminer M30',  'SN-M30-77', 'Eva Nová',  'eva@x.sk',       '+421900222','jozko',  'michal','jozko',  null,null,'CZK','Hučí ventilátor',                null,                    false,null,               now()-interval '3 day', now()-interval '3 day'),
  ('oprava','diagnostika',  'OPR2026-00012','Avalon 1246',     'SN-AV-12',  'Firma ABC', 'abc@firma.sk',   '+420111',   'peter',  'michal','peter',  3000,null,'CZK','Chyba hashboardu',               null,                    false,null,               now()-interval '6 day', now()-interval '5 day'),
  ('oprava','cena_info',    'OPR2026-00013','PSU 3300W',       'SN-PSU-9',  'Ján Malý',  'jan@x.sk',       '+421900333','jozko',  'jozko','jozko',   1800,null,'CZK','Vypína sa pri záťaži',           null,                    false,null,               now()-interval '2 day', now()-interval '2 day'),
  ('oprava','k_oprave',     'OPR2026-00014','GeForce RTX 4090','SN-GPU-4',  'Martin V',  'martin@x.sk',    '+421900444','peter',  'michal','zákazník',4500,null,'CZK','Artefakty na obraze',            null,                    false,null,               now()-interval '4 day', now()-interval '1 day'),
  ('oprava','cakanie_diely','OPR2026-00015','Antminer S17',    'SN-S17-3',  'Lucia H',   'lucia@x.sk',     '+421900555','jozko',  'michal','jozko',  2500,null,'CZK','Vadný PSU konektor',            (now()-interval '6 day')::date, false,null,        now()-interval '10 day',now()-interval '8 day'),
  ('oprava','opravene',     'OPR2026-00016','Iceriver KS3',    'SN-KS3-1',  'Tomáš R',   'tomas@x.sk',     '+421900666','peter',  'michal','peter',  2000,1700,'CZK','Prehrievanie',                  null,                    false,null,               now()-interval '9 day', now()-interval '1 day'),
  ('oprava','zaplatene',    'OPR2026-00017','Goldshell LT6',   'SN-LT6-2',  'Katarína',  'kat@x.sk',       '+421900777','jozko',  'jozko','jozko',   1500,1500,'CZK','Nefunkčný chip',                null,                    false,null,               now()-interval '12 day',now()-interval '2 day'),
  ('oprava','vratene',      'OPR2026-00018','Bitmain S21',     'SN-S21-8',  'Michal O',  'michalo@x.sk',   '+421900888','peter',  'michal','peter',  3200,3500,'CZK','Výmena hashboardu',             null,                    false,null,               now()-interval '15 day',now()-interval '3 day'),
  ('oprava','uzavrete',     'OPR2026-00019','Antminer L7',     'SN-L7-5',   'Zuzana',    'zuz@x.sk',       '+421900999','jozko',  'michal','admin',   2800,2800,'CZK','Servis a čistenie',             null,                    false,null,               now()-interval '20 day',now()-interval '5 day'),
  ('oprava','zaplatene',    'OPR2026-00020','Whatsminer M50',  'SN-M50-1',  'Roman D',   'roman@x.sk',     '+421901000','peter',  'michal','peter',  3000,null,'CZK','Neopraviteľný hashboard',       null,                    true,'na diely',          now()-interval '8 day', now()-interval '2 day'),
  ('reklamacia','cena_info','OPR2026-00021','PSU 2600W',       'SN-PSU-x',  'Nina S',    'nina@x.sk',      '+421901111','jozko',  'jozko','jozko',   1200,null,'CZK','Zákazník odmietol cenu',        null,                    true,'vrátené neopravené', now()-interval '6 day', now()-interval '4 day'),
  ('oprava','uzavrete',     'OPR2026-00022','GPU RX 6800',     'SN-GPU-x',  'Ondrej',    'ondrej@x.sk',    '+421901222','peter',  'michal','peter',  900, null,'CZK','Nevyzdvihnuté, likvidácia',     null,                    true,'likvidácia',         now()-interval '30 day',now()-interval '10 day');
end if;
end $$;
select count(*) as repairs_total from repairs;
