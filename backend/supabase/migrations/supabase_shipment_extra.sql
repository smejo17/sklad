-- =====================================================================
--  ZÁSIELKY — doplnkové polia: DPH, kto platí clo/DPH, poistná suma.
--  (Clo `duty`, colná hodnota `customs_value`, cena prepravy `ship_cost`
--   a incoterm už v schéme existujú.)
--  Spustiť v Supabase SQL editore.
-- =====================================================================
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS vat           NUMERIC(18,8);            -- DPH
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS duty_payer    TEXT;                     -- kto platí clo/DPH: my / prijemca / tretia strana
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS insured_value NUMERIC(18,8);            -- poistná suma
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS insured_cur   TEXT REFERENCES currencies(code) DEFAULT 'CZK';
