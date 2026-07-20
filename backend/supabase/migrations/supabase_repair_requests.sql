-- =====================================================================
--  Opravy: samostatné kontaktné polia + verejná stránka pre zákazníka
--  Spustiť v Supabase SQL editore (idempotentné).
-- =====================================================================

-- 1) Samostatné kontaktné polia na opravách + interný QR kód
ALTER TABLE repairs ADD COLUMN IF NOT EXISTS customer_email   TEXT;
ALTER TABLE repairs ADD COLUMN IF NOT EXISTS customer_phone   TEXT;
ALTER TABLE repairs ADD COLUMN IF NOT EXISTS customer_address TEXT;
ALTER TABLE repairs ADD COLUMN IF NOT EXISTS qr_code          TEXT;   -- interný QR kód (napr. OPR-123)
ALTER TABLE repairs ADD COLUMN IF NOT EXISTS request_id       BIGINT; -- odkaz na verejnú požiadavku

-- 2) Verejné požiadavky od zákazníkov (self-service)
CREATE TABLE IF NOT EXISTS repair_requests (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind            TEXT NOT NULL DEFAULT 'oprava',   -- oprava / reklamacia
    name            TEXT,                             -- meno zákazníka
    email           TEXT,
    phone           TEXT,
    address         TEXT,
    item            TEXT,                             -- názov tovaru
    serial          TEXT,
    fault           TEXT,                             -- popis závady
    note            TEXT,
    public_code     TEXT,                             -- referenčný kód pre zákazníka
    status          TEXT NOT NULL DEFAULT 'new',      -- new / taken / rejected
    taken_repair_id BIGINT REFERENCES repairs(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_repair_requests_status ON repair_requests (status);

-- 3) Bezpečnosť (RLS)
ALTER TABLE repair_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rr_insert_anon ON repair_requests;
DROP POLICY IF EXISTS rr_insert_auth ON repair_requests;
DROP POLICY IF EXISTS rr_read        ON repair_requests;
DROP POLICY IF EXISTS rr_update      ON repair_requests;

-- verejné odoslanie: neprihlásený (anon) smie IBA vložiť novú požiadavku (nič nečíta, nemení)
CREATE POLICY rr_insert_anon ON repair_requests
  FOR INSERT TO anon
  WITH CHECK (status = 'new' AND taken_repair_id IS NULL);

-- prihlásený personál smie vkladať, čítať a meniť (podľa práv na opravy)
CREATE POLICY rr_insert_auth ON repair_requests
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY rr_read ON repair_requests
  FOR SELECT TO authenticated USING (has_perm('repair.view') OR has_perm('inventory.view'));
CREATE POLICY rr_update ON repair_requests
  FOR UPDATE TO authenticated
  USING (has_perm('repair.edit') OR has_perm('inventory.move'))
  WITH CHECK (has_perm('repair.edit') OR has_perm('inventory.move'));

-- práva na úrovni rolí (RLS ešte filtruje riadky)
GRANT INSERT ON repair_requests TO anon;
GRANT SELECT, INSERT, UPDATE ON repair_requests TO authenticated;
