-- =====================================================================
--  OPRAVY a REKLAMÁCIE — tovar, ktorý neprichádza na sklad, ale opravujeme.
--  Často to nie je produkt z katalógu (prispôsobené výrobky) → vlastný názov.
--  Spustiť v Supabase SQL editore (po schema_basic.sql + auth_rls + photos).
-- =====================================================================
CREATE TABLE IF NOT EXISTS repairs (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind              TEXT NOT NULL DEFAULT 'oprava',   -- oprava / reklamacia
    product_id        BIGINT REFERENCES products(id) ON DELETE SET NULL, -- ak z katalógu
    title             TEXT,                              -- názov (ak nie je produkt)
    serial            TEXT,
    customer          TEXT,                              -- zákazník
    customer_contact  TEXT,                              -- e-mail / telefón
    received_by       TEXT,                              -- kto prijal
    technician        TEXT,                              -- kto opravuje
    status            TEXT NOT NULL DEFAULT 'prijaté',
    fault             TEXT,                              -- popis závady
    note              TEXT,
    price_estimate    NUMERIC(18,8),                     -- návrh ceny opravy
    price_currency    TEXT DEFAULT 'EUR',
    deadline          DATE,                              -- termín (najmä reklamácie)
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_repairs_kind ON repairs (kind);
CREATE INDEX IF NOT EXISTS idx_repairs_status ON repairs (status);

CREATE TABLE IF NOT EXISTS repair_photos (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    repair_id  BIGINT REFERENCES repairs(id) ON DELETE CASCADE,
    url        TEXT NOT NULL,
    note       TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_repairphotos_r ON repair_photos (repair_id);

ALTER TABLE repairs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_photos  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rep_read ON repairs;
DROP POLICY IF EXISTS rep_wr   ON repairs;
DROP POLICY IF EXISTS repph_read ON repair_photos;
DROP POLICY IF EXISTS repph_wr   ON repair_photos;
CREATE POLICY rep_read   ON repairs       FOR SELECT TO authenticated USING (has_perm('inventory.view'));
CREATE POLICY rep_wr     ON repairs       FOR ALL    TO authenticated USING (has_perm('inventory.move')) WITH CHECK (has_perm('inventory.move'));
CREATE POLICY repph_read ON repair_photos FOR SELECT TO authenticated USING (has_perm('inventory.view'));
CREATE POLICY repph_wr   ON repair_photos FOR ALL    TO authenticated USING (has_perm('inventory.move')) WITH CHECK (has_perm('inventory.move'));
