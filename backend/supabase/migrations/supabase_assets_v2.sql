-- =====================================================================
--  MAJETOK v2 — rozšírenie tabuľky assets o správcu, budovu/miestnosť,
--  užívateľa (kto ho má), fotku a väzbu na pôvodnú skladovú šaržu.
--  Spustiť v Supabase SQL editore. Idempotentné.
-- =====================================================================
ALTER TABLE assets ADD COLUMN IF NOT EXISTS manager    TEXT;   -- správca (zodpovedná osoba)
ALTER TABLE assets ADD COLUMN IF NOT EXISTS room       TEXT;   -- budova / miestnosť (napr. Zasadačka)
ALTER TABLE assets ADD COLUMN IF NOT EXISTS holder     TEXT;   -- užívateľ (kto ho reálne má)
ALTER TABLE assets ADD COLUMN IF NOT EXISTS image_url  TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS source_lot BIGINT; -- z ktorej skladovej šarže vznikol
ALTER TABLE assets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- prenesenie starého poľa assigned_to do holder (ak sa dá) — jednorazovo, bezpečne
UPDATE assets SET holder = assigned_to WHERE holder IS NULL AND assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assets_room   ON assets (room);
CREATE INDEX IF NOT EXISTS idx_assets_holder ON assets (holder);
