-- =====================================================================
--  ZDROJ ORIENTAČNEJ CENY — odkiaľ cena pochádza a kedy bola zadaná
--  Spustiť v Supabase SQL editore (po schema_basic.sql). Idempotentné.
-- =====================================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_source     TEXT;   -- 'internet' / 'manual'
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_updated_at DATE;   -- dátum poslednej zmeny ceny
