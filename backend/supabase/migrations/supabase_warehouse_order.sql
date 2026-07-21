alter table warehouses add column if not exists sort_order int;
update warehouses set sort_order = id where sort_order is null;
select id,name,code,sort_order from warehouses order by sort_order;