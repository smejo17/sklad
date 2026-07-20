-- Nové polia zásielok:
--   payment_method — spôsob platby (predom / predom+dobierka / dobierka / reklamácia / iné)
--   order_source   — zdroj objednávky (Interný systém / Bazoš / eBay / …)
--   received_on    — dátum fyzického prijatia zásielky (auto = dnes pri prijatí)
-- Spustiť v Supabase SQL editore (idempotentné).

ALTER TABLE shipments ADD COLUMN IF NOT EXISTS payment_method TEXT;  -- predom | predom_dobierka | dobierka | reklamacia | ine
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS order_source   TEXT;  -- napr. Bazoš, eBay, Interný systém
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS received_on    DATE;  -- kedy sme zásielku prijali (deň)
