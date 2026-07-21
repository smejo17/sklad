-- Demo dáta majetku: 2 provozovne, 5 miestností, 5 osôb, 35 kusov majetku
do $$
declare
  prem_ros bigint; prem_pod bigint; rr bigint[]; pp bigint[];
  names text[] := array['Monitor Dell 24"','Monitor LG 27"','Notebook Lenovo T14','Notebook HP EliteBook',
    'Klávesnica Logitech','Myš Logitech','Dokovacia stanica','Telefón iPhone 12','Telefón Samsung A54',
    'Kancelárska stolička','Písací stôl','Tlačiareň HP','Skener','Router Ubiquiti','Switch 24-port',
    'Projektor Epson','Webkamera Logitech','Slúchadlá Jabra','USB disk 1TB','Externý SSD 2TB',
    'Tablet iPad','Čítačka čiarových kódov','UPS záložný zdroj','NAS Synology','Server Dell R740',
    'Monitor AOC 24"','Notebook MacBook Air','Myš Microsoft','Klávesnica Keychron','Telefón Pixel 7',
    'Kancelárska stolička ergo','Konferenčný stôl','Tlačiareň Brother','Reproduktory','Držiak na monitor'];
  i int; aid bigint;
begin
  if (select count(*) from asset_persons)=0 then
    insert into asset_premises(name,address,sort_order) values ('Rostovská','Rostovská 260/2b, Praha',1) returning id into prem_ros;
    insert into asset_premises(name,address,sort_order) values ('Poděbrady','Tovární, Poděbrady',2) returning id into prem_pod;
    insert into asset_rooms(premise_id,name,sort_order) values
      (prem_ros,'Kancelária 1',1),(prem_ros,'Kancelária 2',2),(prem_ros,'Serverovňa',3),
      (prem_pod,'Dielňa',4),(prem_pod,'Sklad',5);
    select array_agg(id order by id) into rr from asset_rooms;
    insert into asset_persons(name,email,active,sort_order) values
      ('Peter Novák','peter@oneminers.com',true,1),('Jana Malá','jana@oneminers.com',true,2),
      ('Martin Kováč','martin@oneminers.com',true,3),('Eva Horváthová','eva@oneminers.com',true,4),
      ('Tomáš Varga','tomas@oneminers.com',true,5);
    select array_agg(id order by id) into pp from asset_persons;
    for i in 1..array_length(names,1) loop
      insert into assets(name,serial,state,acquired_at)
        values (names[i],'SN'||lpad(i::text,5,'0'),(array['new','used','used','used'])[1+(i%4)],(date '2026-01-01'+(i*7)))
        returning id into aid;
      if (i % 2)=1 then
        update assets set person_id=pp[1+(i%5)], qr_code='AST-'||aid where id=aid;
      else
        update assets set room_id=rr[1+(i%5)], premise_id=(select premise_id from asset_rooms where id=rr[1+(i%5)]), qr_code='AST-'||aid where id=aid;
      end if;
    end loop;
  end if;
end $$;
select (select count(*) from asset_persons) persons, (select count(*) from asset_premises) premises,
       (select count(*) from asset_rooms) rooms, (select count(*) from assets) assets;
