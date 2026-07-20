-- =====================================================================
--  SÉRIOVÉ ČÍSLA položky — viac SN na jednu položku (napr. zostavy),
--  každé s voliteľnou (orezanou) fotkou. Uložené zvlášť pri SN,
--  nie medzi fotkami tovaru.
--  Spustiť v Supabase SQL editore (po schema_basic.sql + supabase_auth_rls.sql).
-- =====================================================================
CREATE TABLE IF NOT EXISTS lot_serials (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    lot_id     BIGINT REFERENCES stock_lots(id) ON DELETE CASCADE,
    serial     TEXT NOT NULL,
    photo_url  TEXT,                 -- orezaná fotka len sériového čísla
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lotserials_lot ON lot_serials (lot_id);
CREATE INDEX IF NOT EXISTS idx_lotserials_ser ON lot_serials (serial);

ALTER TABLE lot_serials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lotser_read ON lot_serials;
DROP POLICY IF EXISTS lotser_wr   ON lot_serials;
CREATE POLICY lotser_read ON lot_serials FOR SELECT TO authenticated USING (has_perm('inventory.view'));
CREATE POLICY lotser_wr   ON lot_serials FOR ALL    TO authenticated USING (has_perm('inventory.move')) WITH CHECK (has_perm('inventory.move'));
