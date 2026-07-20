-- =====================================================================
--  Nemenný denník krokov opravy / reklamácie (append-only).
--  Technik postupne zaznamenáva stavy; každý záznam má stav, štruktúrované
--  polia (data) a POZNÁMKU, ktorú po uložení UŽ NEMOŽNO meniť ani mazať.
--  Spustiť v Supabase SQL editore (po supabase_repairs.sql).
-- =====================================================================
CREATE TABLE IF NOT EXISTS repair_events (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    repair_id     BIGINT NOT NULL REFERENCES repairs(id) ON DELETE CASCADE,
    stage         TEXT NOT NULL,                 -- stav (napr. 'diagnostika')
    note          TEXT,                          -- poznámka — po uložení nemenná
    data          JSONB NOT NULL DEFAULT '{}',   -- polia pre daný stav
    created_by    UUID DEFAULT auth.uid(),
    created_by_name TEXT,                         -- meno/e-mail zapisujúceho
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_repair_events_r ON repair_events (repair_id, created_at);

ALTER TABLE repair_events ENABLE ROW LEVEL SECURITY;
-- ČÍTANIE: kto vidí inventár
DROP POLICY IF EXISTS repev_read ON repair_events;
CREATE POLICY repev_read ON repair_events FOR SELECT TO authenticated
  USING (has_perm('inventory.view'));
-- ZÁPIS: kto smie hýbať skladom (technici/admin). Len INSERT — žiadny UPDATE ani DELETE,
-- takže poznámky a záznamy sú nemenné (mazanie ide len cez kaskádu pri zmazaní opravy).
DROP POLICY IF EXISTS repev_insert ON repair_events;
CREATE POLICY repev_insert ON repair_events FOR INSERT TO authenticated
  WITH CHECK (has_perm('inventory.move'));
-- zámerne NEVYTVÁRAME UPDATE/DELETE politiku → nemenné.
