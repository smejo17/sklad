-- =====================================================================
--  PARAMETRE PODĽA KATEGÓRIE — preddefinované sady polí
--  (ASIC, GPU, CPU, RAM, disky, dosky, zdroje/skrine, chladenie, radiče)
--  Idempotentné (ON CONFLICT). Spustiť po schema_basic.sql + kategóriách.
-- =====================================================================
CREATE OR REPLACE FUNCTION _def(p_cat TEXT, p_key TEXT, p_label TEXT, p_type attr_type, p_unit TEXT, p_opts TEXT[], p_sort INT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE cid BIGINT;
BEGIN
  SELECT id INTO cid FROM categories WHERE name = p_cat ORDER BY id LIMIT 1;
  IF cid IS NULL THEN RETURN; END IF;
  INSERT INTO attribute_defs(category_id, attr_key, label, type, unit, options, is_filter, sort_order)
  VALUES (cid, p_key, p_label, p_type, p_unit, p_opts, TRUE, p_sort)
  ON CONFLICT (category_id, attr_key) DO UPDATE
    SET label = EXCLUDED.label, type = EXCLUDED.type, unit = EXCLUDED.unit,
        options = EXCLUDED.options, sort_order = EXCLUDED.sort_order;
END $$;

DO $$
BEGIN
  -- ASIC
  PERFORM _def('ASIC','algoritmus','Algoritmus','text',NULL,NULL,1);
  PERFORM _def('ASIC','hashrate','Hashrate (napr. 500 TH/s)','text',NULL,NULL,2);
  PERFORM _def('ASIC','prikon','Príkon','number','W',NULL,3);
  PERFORM _def('ASIC','napatie','Napätie','text','V',NULL,4);
  PERFORM _def('ASIC','hlucnost','Hlučnosť','number','dB',NULL,5);
  PERFORM _def('ASIC','chladenie','Chladenie','enum',NULL,ARRAY['vzduch','hydro','imerzia'],6);
  PERFORM _def('ASIC','rozmery','Rozmery (D×Š×V)','text','mm',NULL,7);

  -- Grafické karty
  PERFORM _def('Grafické karty','cip','Čip / GPU','text',NULL,NULL,1);
  PERFORM _def('Grafické karty','pamat','Pamäť','number','GB',NULL,2);
  PERFORM _def('Grafické karty','typ_pamate','Typ pamäte','enum',NULL,ARRAY['GDDR5','GDDR6','GDDR6X','HBM2'],3);
  PERFORM _def('Grafické karty','tdp','TDP','number','W',NULL,4);
  PERFORM _def('Grafické karty','konektory','Napájacie konektory','text',NULL,NULL,5);
  PERFORM _def('Grafické karty','zbernica','Zbernica','text',NULL,NULL,6);

  -- Procesory
  PERFORM _def('Procesory','socket','Socket','text',NULL,NULL,1);
  PERFORM _def('Procesory','jadra','Počet jadier','number',NULL,NULL,2);
  PERFORM _def('Procesory','vlakna','Počet vlákien','number',NULL,NULL,3);
  PERFORM _def('Procesory','frekvencia','Základná frekvencia','number','GHz',NULL,4);
  PERFORM _def('Procesory','boost','Boost frekvencia','number','GHz',NULL,5);
  PERFORM _def('Procesory','tdp','TDP','number','W',NULL,6);

  -- Pamäti
  PERFORM _def('Pamäti','typ','Typ','enum',NULL,ARRAY['DDR3','DDR4','DDR5'],1);
  PERFORM _def('Pamäti','kapacita','Kapacita','number','GB',NULL,2);
  PERFORM _def('Pamäti','frekvencia','Frekvencia','number','MHz',NULL,3);
  PERFORM _def('Pamäti','cas','CAS latencia','text',NULL,NULL,4);
  PERFORM _def('Pamäti','moduly','Počet modulov','number',NULL,NULL,5);

  -- Disky a SSD
  PERFORM _def('Disky a SSD','typ','Typ','enum',NULL,ARRAY['SSD','HDD','NVMe'],1);
  PERFORM _def('Disky a SSD','kapacita','Kapacita','number','GB',NULL,2);
  PERFORM _def('Disky a SSD','rozhranie','Rozhranie','text',NULL,NULL,3);
  PERFORM _def('Disky a SSD','citanie','Rýchlosť čítania','number','MB/s',NULL,4);
  PERFORM _def('Disky a SSD','zapis','Rýchlosť zápisu','number','MB/s',NULL,5);
  PERFORM _def('Disky a SSD','format','Formát','enum',NULL,ARRAY['2.5"','3.5"','M.2'],6);

  -- Základné dosky
  PERFORM _def('Základné dosky','socket','Socket','text',NULL,NULL,1);
  PERFORM _def('Základné dosky','chipset','Chipset','text',NULL,NULL,2);
  PERFORM _def('Základné dosky','formfaktor','Form factor','enum',NULL,ARRAY['ATX','Micro-ATX','Mini-ITX','E-ATX'],3);
  PERFORM _def('Základné dosky','ram_sloty','Sloty RAM','number',NULL,NULL,4);
  PERFORM _def('Základné dosky','max_ram','Max. RAM','number','GB',NULL,5);

  -- Skrine a zdroje
  PERFORM _def('Skrine a zdroje','vykon','Výkon zdroja','number','W',NULL,1);
  PERFORM _def('Skrine a zdroje','certifikat','80 PLUS','enum',NULL,ARRAY['White','Bronze','Silver','Gold','Platinum','Titanium'],2);
  PERFORM _def('Skrine a zdroje','modularita','Modularita','enum',NULL,ARRAY['nemodulárny','polomodulárny','modulárny'],3);
  PERFORM _def('Skrine a zdroje','formfaktor','Form factor','text',NULL,NULL,4);

  -- Chladenie
  PERFORM _def('Chladenie','typ','Typ','enum',NULL,ARRAY['vzduch','AIO vodné','custom loop'],1);
  PERFORM _def('Chladenie','socket','Podporované sockety','text',NULL,NULL,2);
  PERFORM _def('Chladenie','vyska','Výška','number','mm',NULL,3);
  PERFORM _def('Chladenie','tdp','Max. TDP','number','W',NULL,4);

  -- Radiče
  PERFORM _def('Radiče','rozhranie','Rozhranie','text',NULL,NULL,1);
  PERFORM _def('Radiče','porty','Počet portov','number',NULL,NULL,2);
  PERFORM _def('Radiče','raid','RAID úrovne','text',NULL,NULL,3);
  PERFORM _def('Radiče','cip','Čipset','text',NULL,NULL,4);
END $$;

DROP FUNCTION _def(TEXT, TEXT, TEXT, attr_type, TEXT, TEXT[], INT);
