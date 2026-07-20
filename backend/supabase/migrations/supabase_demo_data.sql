-- =====================================================================
--  DEMO DÁTA — ~56 produktov a ~200 skladových šarží na otestovanie
--  filtrovania, zoskupovania, cien a stavov.
--  Vyžaduje: schema_basic.sql, kategórie (supabase_categories_seed.sql) a
--            aspoň 1 sklad (Rozmiestnenie / Správa).
--  Spustiť v Supabase SQL editore. Znovu spustenie pridá ďalšie dáta —
--  na čistý štart najprv pusti supabase_wipe_data.sql.
-- =====================================================================
DO $$
DECLARE
  whs BIGINT[]; wh BIGINT; loc BIGINT; pid BIGINT; brand_id BIGINT; cat_id BIGINT;
  prod_ids BIGINT[] := '{}'; pr NUMERIC; cur TEXT; st TEXT; n INT; c INT; j INT; i INT;
  states TEXT[] := ARRAY['new','new','new','used','refurb','damaged'];
  tmpl_cat   TEXT[]    := ARRAY['Bitcoin (SHA-256)','Kaspa (kHeavyHash)','Litecoin / Doge (Scrypt)','Grafické karty','Procesory','Pamäti','Disky a SSD','Základné dosky','Skrine a zdroje','Chladenie','Radiče','Kabely','Počítače/Servery','Iné'];
  tmpl_brand TEXT[]    := ARRAY['Bitmain','Iceriver','Goldshell','NVIDIA','AMD','Kingston','Samsung','ASUS','Corsair','Noctua','Broadcom','Generic','Dell','Generic'];
  tmpl_name  TEXT[]    := ARRAY['Antminer S','Iceriver KS','Goldshell LT','GeForce RTX 40','Ryzen 9 79','Fury DDR ','SSD NVMe ','ROG doska B','Zdroj RM','Chladič NH-','Radič HBA ','Kábel C13 ','PowerEdge R','Položka '];
  tmpl_cur   TEXT[]    := ARRAY['USD','USD','USD','CZK','CZK','CZK','CZK','CZK','CZK','CZK','CZK','CZK','USD','CZK'];
  tmpl_price NUMERIC[] := ARRAY[6000,4200,9000,900,12000,890,1790,4500,2600,1500,3200,120,45000,300];
BEGIN
  SELECT array_agg(id) INTO whs FROM warehouses;
  IF whs IS NULL THEN RAISE EXCEPTION 'Najprv vytvor aspoň jeden sklad.'; END IF;

  -- produkty (14 kategórií × 4 varianty)
  FOR c IN 1..array_length(tmpl_cat,1) LOOP
    SELECT id INTO cat_id FROM categories WHERE name=tmpl_cat[c] ORDER BY id LIMIT 1;
    IF cat_id IS NULL THEN CONTINUE; END IF;
    SELECT id INTO brand_id FROM brands WHERE lower(name)=lower(tmpl_brand[c]) LIMIT 1;
    IF brand_id IS NULL THEN INSERT INTO brands(name) VALUES(tmpl_brand[c]) RETURNING id INTO brand_id; END IF;
    FOR j IN 1..4 LOOP
      INSERT INTO products(name,category_id,brand_id,price,currency,type,source,sku,price_source,price_updated_at)
      VALUES(tmpl_name[c]||(10+j*2)::text, cat_id, brand_id, round(tmpl_price[c]*(1+j*0.1),2), tmpl_cur[c],
             'simple','seed','SEED-'||c||'-'||j,
             CASE WHEN j%2=0 THEN 'internet' ELSE 'manual' END, CURRENT_DATE-(j*3))
      RETURNING id INTO pid;
      prod_ids := prod_ids || pid;
    END LOOP;
  END LOOP;

  -- ~200 šarží rozložených po skladoch/pozíciách
  FOR i IN 1..200 LOOP
    pid := prod_ids[1 + (i % array_length(prod_ids,1))];
    SELECT price,currency INTO pr,cur FROM products WHERE id=pid;
    wh := whs[1 + (i % array_length(whs,1))];
    SELECT id INTO loc FROM warehouse_locations WHERE warehouse_id=wh ORDER BY random() LIMIT 1;
    st := states[1 + (i % 6)];
    n := 1 + (i % 8);
    INSERT INTO stock_lots(product_id,warehouse_id,location_id,track,quantity,status,state,state_note,
                           buy_price,buy_currency,buy_date,invoice_number,expected_date,serial,counted_at)
    VALUES(pid, wh, loc,
      (CASE WHEN n>3 THEN 'bulk' ELSE 'unit' END)::track_type,
      CASE WHEN n>3 THEN n ELSE 1 END,
      (CASE WHEN i%17=0 THEN 'na_ceste' ELSE 'skladom' END)::stock_status,
      st::stock_state,
      CASE WHEN st='refurb' THEN 'repasované, plne funkčné' WHEN st='damaged' THEN 'poškodený obal' ELSE NULL END,
      round(COALESCE(pr,100)*(0.9+((i%20)::numeric/100)),2), COALESCE(cur,'CZK'),
      CURRENT_DATE-(i%60), 'FA-2026-'||(100+i),
      CASE WHEN i%17=0 THEN CURRENT_DATE+(i%10) ELSE NULL END,
      CASE WHEN n<=3 THEN 'SN-'||i||'-'||pid ELSE NULL END,
      CASE WHEN i%9=0 THEN now() ELSE NULL END);
  END LOOP;
  RAISE NOTICE 'Hotovo: % produktov, 200 šarží.', array_length(prod_ids,1);
END $$;
