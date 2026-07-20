-- =====================================================================
--  FOTKY — Supabase Storage bucket + fotky k skladovým položkám
--  Spustiť v SQL editore (po schema_basic.sql + supabase_auth_rls.sql).
-- =====================================================================

-- verejný bucket na fotky produktov aj fotodokumentáciu položiek
INSERT INTO storage.buckets (id, name, public)
VALUES ('photos', 'photos', true)
ON CONFLICT (id) DO NOTHING;

-- politiky pre súbory v buckete 'photos'
DROP POLICY IF EXISTS photos_read   ON storage.objects;
DROP POLICY IF EXISTS photos_insert ON storage.objects;
DROP POLICY IF EXISTS photos_update ON storage.objects;
DROP POLICY IF EXISTS photos_delete ON storage.objects;
CREATE POLICY photos_read   ON storage.objects FOR SELECT USING (bucket_id = 'photos');
CREATE POLICY photos_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'photos');
CREATE POLICY photos_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'photos');
CREATE POLICY photos_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'photos');

-- fotografie ku konkrétnym skladovým položkám (fotodokumentácia)
CREATE TABLE IF NOT EXISTS lot_photos (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    lot_id     BIGINT REFERENCES stock_lots(id) ON DELETE CASCADE,
    url        TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE lot_photos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lotph_read ON lot_photos;
DROP POLICY IF EXISTS lotph_wr   ON lot_photos;
CREATE POLICY lotph_read ON lot_photos FOR SELECT TO authenticated USING (has_perm('inventory.view'));
CREATE POLICY lotph_wr   ON lot_photos FOR ALL    TO authenticated USING (has_perm('inventory.move')) WITH CHECK (has_perm('inventory.move'));
