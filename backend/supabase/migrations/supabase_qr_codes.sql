-- =====================================================================
--  QR KÓDY — predpripravené (predtlačené) kódy
--  Dlhý unikátny reťazec (UNIQUE) => nikdy nevznikne duplicitný QR.
--  Spustiť v Supabase SQL editore (po schema_basic.sql + supabase_auth_rls.sql).
-- =====================================================================
CREATE TABLE IF NOT EXISTS qr_codes (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code       TEXT UNIQUE NOT NULL,           -- napr. QR-8F3K9ZQ2WX (dlhý reťazec)
    status     TEXT NOT NULL DEFAULT 'free',   -- free / assigned
    lot_id     BIGINT REFERENCES stock_lots(id) ON DELETE SET NULL,
    product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,  -- ak je kód pre konkrétny produkt
    label      TEXT,                            -- popis pod QR (napr. názov produktu)
    batch      TEXT,                            -- označenie tlačovej dávky
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    printed_at TIMESTAMPTZ
);
-- ak už tabuľka existuje bez nových stĺpcov, doplní ich:
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS product_id BIGINT REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS label TEXT;
CREATE INDEX IF NOT EXISTS idx_qr_status ON qr_codes (status);

ALTER TABLE qr_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS qr_read ON qr_codes;
DROP POLICY IF EXISTS qr_write ON qr_codes;
CREATE POLICY qr_read  ON qr_codes FOR SELECT TO authenticated USING (has_perm('inventory.view'));
CREATE POLICY qr_write ON qr_codes FOR ALL    TO authenticated USING (has_perm('inventory.move')) WITH CHECK (has_perm('inventory.move'));
