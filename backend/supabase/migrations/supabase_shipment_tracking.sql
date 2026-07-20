-- =====================================================================
--  ARCHÍV SLEDOVANIA — uchová kompletné údaje z UPS natrvalo
--  (UPS umožňuje dohľadať zásielku len ~6 mesiacov, preto si ukladáme
--   celý snapshot vrátane priebehu a Proof of Delivery).
--  Spustiť v Supabase SQL editore.
-- =====================================================================
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS tracking_json JSONB;      -- celý výsledok z UPS (archív)
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS tracking_at  TIMESTAMPTZ; -- kedy sme naposledy stiahli
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS delivered_on TIMESTAMPTZ; -- dátum a čas doručenia (ak je)
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS pod_url      TEXT;        -- uložený Proof of Delivery (voliteľné)
