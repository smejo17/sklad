alter table stock_lots add column if not exists buy_by text;
alter table stock_lots add column if not exists buy_source text;
select 'ok' as done;