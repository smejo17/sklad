-- =====================================================================
--  Dátum vytvorenia ŠTÍTKU zásielky (z trackingu). Ak nie je, appka
--  zobrazí dátum zadania do systému (created_at).
--  Spustiť v Supabase SQL editore.
-- =====================================================================
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS label_date DATE;
