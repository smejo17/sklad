-- Zásielky: zamykanie + dátum platby + fyzické parametre + popis (hazard/nebezpečný materiál)
alter table shipments
  add column if not exists locked      boolean default false,
  add column if not exists locked_at   timestamptz,
  add column if not exists locked_by   text,
  add column if not exists paid_date   date,
  add column if not exists weight      text,   -- napr. "12,5 kg"
  add column if not exists dimensions  text,   -- napr. "60×40×40 cm"
  add column if not exists descr       text;   -- voľný popis, napr. "nebezpečný materiál (ADR)", vyhľadateľné

create index if not exists shipments_locked_idx on shipments(locked);
