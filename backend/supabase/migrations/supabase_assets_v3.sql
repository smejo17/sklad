-- =====================================================================
--  MAJETOK v3 — štruktúrovaný model: provozovne, miestnosti, osoby,
--  pohyby majetku + QR kód na majetku.
-- =====================================================================
create table if not exists asset_premises(
  id bigserial primary key, name text not null, address text, sort_order int, created_at timestamptz default now());
create table if not exists asset_rooms(
  id bigserial primary key, premise_id bigint references asset_premises(id) on delete cascade,
  name text not null, sort_order int, created_at timestamptz default now());
create table if not exists asset_persons(
  id bigserial primary key, name text not null, email text, note text,
  active boolean default true, sort_order int, created_at timestamptz default now());
create table if not exists asset_movements(
  id bigserial primary key, asset_id bigint references assets(id) on delete cascade,
  action text, person_id bigint, room_id bigint, premise_id bigint,
  note text, doc_no text, by_user text, happened_at timestamptz default now());

alter table assets add column if not exists person_id  bigint references asset_persons(id);
alter table assets add column if not exists room_id    bigint references asset_rooms(id);
alter table assets add column if not exists premise_id bigint references asset_premises(id);
alter table assets add column if not exists qr_code    text;

create index if not exists asset_rooms_prem_idx on asset_rooms(premise_id);
create index if not exists asset_mov_asset_idx on asset_movements(asset_id);
create index if not exists assets_person_idx on assets(person_id);

-- RLS: prihlásený používateľ má plný prístup (rovnako ako k ostatnej evidencii)
do $$
declare t text;
begin
  foreach t in array array['asset_premises','asset_rooms','asset_persons','asset_movements'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t||'_all', t);
    execute format('create policy %I on %I for all to authenticated using (true) with check (true)', t||'_all', t);
    execute format('grant all on %I to authenticated', t);
  end loop;
end $$;
grant usage, select on all sequences in schema public to authenticated;
