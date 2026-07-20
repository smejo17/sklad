-- =====================================================================
--  KATEGÓRIE / PODKATEGÓRIE — cieľová štruktúra + základné TAGY
--  Idempotentné — dá sa spustiť opakovane.
--  Spustiť v Supabase SQL editore (po schema_basic.sql).
--
--  Hlavné kategórie: ASIC, Komponenty, Počítače/Servery, Kabely, Mining, Iné
-- =====================================================================

-- (voliteľná migrácia starých názvov na nové — zníži duplicity, ak si už seedoval)
UPDATE categories SET name='ASIC'         WHERE lower(name)='asic minery'          AND parent_id IS NULL;
UPDATE categories SET name='Procesory'    WHERE name='Procesory (CPU)';
UPDATE categories SET name='Pamäti'       WHERE name='Operačné pamäte (RAM)';
UPDATE categories SET name='Disky a SSD'  WHERE name IN ('Disky (úložiská)');
UPDATE categories SET name='Skrine a zdroje' WHERE name='Počítačové skrine';

-- pomocná funkcia: vloží kategóriu, ak (názov + rodič) ešte neexistuje, vráti id
CREATE OR REPLACE FUNCTION _upsert_cat(p_name TEXT, p_parent BIGINT)
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE v BIGINT;
BEGIN
  SELECT id INTO v FROM categories
   WHERE name = p_name AND parent_id IS NOT DISTINCT FROM p_parent
   LIMIT 1;
  IF v IS NULL THEN
    INSERT INTO categories(name, parent_id) VALUES (p_name, p_parent) RETURNING id INTO v;
  END IF;
  RETURN v;
END $$;

DO $$
DECLARE k BIGINT;
BEGIN
  -- ASIC
  k := _upsert_cat('ASIC', NULL);
  PERFORM _upsert_cat('Bitcoin (SHA-256)', k);
  PERFORM _upsert_cat('Kaspa (kHeavyHash)', k);
  PERFORM _upsert_cat('Litecoin / Doge (Scrypt)', k);
  PERFORM _upsert_cat('Ethereum Classic (Ethash)', k);
  PERFORM _upsert_cat('Príslušenstvo k ASIC', k);

  -- KOMPONENTY
  k := _upsert_cat('Komponenty', NULL);
  PERFORM _upsert_cat('Grafické karty', k);
  PERFORM _upsert_cat('Procesory', k);
  PERFORM _upsert_cat('Pamäti', k);
  PERFORM _upsert_cat('Disky a SSD', k);
  PERFORM _upsert_cat('Základné dosky', k);
  PERFORM _upsert_cat('Skrine a zdroje', k);
  PERFORM _upsert_cat('Chladenie', k);
  PERFORM _upsert_cat('Radiče', k);

  -- ostatné hlavné kategórie (bez podkategórií — dopĺňaš podľa potreby)
  PERFORM _upsert_cat('Počítače/Servery', NULL);
  PERFORM _upsert_cat('Kabely', NULL);
  PERFORM _upsert_cat('Mining', NULL);
  PERFORM _upsert_cat('Iné', NULL);
END $$;

DROP FUNCTION _upsert_cat(TEXT, BIGINT);

-- základné TAGY (nevytvorí duplicitný názov)
INSERT INTO tags(name)
SELECT t FROM (VALUES
  ('SSD'),('NVMe'),('HDD'),('DDR4'),('DDR5'),('RAM'),('CPU'),('GPU'),
  ('ASIC'),('mining'),('Bitcoin'),('Kaspa'),('Litecoin'),('notebook'),
  ('server'),('monitor'),('router'),('switch'),('WiFi'),('kábel'),
  ('napájací'),('USB'),('HDMI'),('RJ45'),('radič'),('RAID'),('nový'),('použitý')
) AS v(t)
WHERE NOT EXISTS (SELECT 1 FROM tags x WHERE lower(x.name) = lower(v.t));
