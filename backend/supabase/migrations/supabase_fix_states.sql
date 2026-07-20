-- =====================================================================
--  Rozšírenie stavov skladovej položky o 'refurb' (repasované) a
--  'damaged' (poškodené). Pôvodne boli len 'new' a 'used'.
--  Spustiť v Supabase SQL editore SAMOSTATNE (nie v transakcii s iným
--  dotazom) a PRED supabase_demo_data.sql.
-- =====================================================================
ALTER TYPE stock_state ADD VALUE IF NOT EXISTS 'refurb';
ALTER TYPE stock_state ADD VALUE IF NOT EXISTS 'damaged';
