alter table assets add column if not exists category_id bigint references categories(id);
create index if not exists assets_category_idx on assets(category_id);
select 'ok' as done;