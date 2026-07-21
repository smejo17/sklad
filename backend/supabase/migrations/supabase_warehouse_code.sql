-- Sklady: krátka skratka (kód) pre kompaktné zobrazenie v zásobách (napr. ROS, STR, POD)
alter table warehouses add column if not exists code text;

update warehouses set code = case id
  when 1 then 'ROS' when 2 then 'POD' when 3 then 'STR'
  when 4 then 'RO2' when 5 then 'CES' when 6 then 'PO2'
  else upper(substr(regexp_replace(name,'^[Ss]klad ',''),1,3)) end
where code is null;
