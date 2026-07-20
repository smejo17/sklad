-- =====================================================================
--  SEED PRODUKTOV do Supabase (ASIC katalóg + značky)
--  Spustiť PO schema_basic.sql. Bezpečné na opakované spustenie (značky).
--  Produkty sa vložia do kategórie "ASIC minery".
-- =====================================================================

-- značky
INSERT INTO brands (name)
SELECT b FROM (VALUES
  ('Antminer'),('Whatsminer'),('Iceriver'),('Avalon'),('Bitmain'),('Elphapex'),
  ('VolcMiner'),('Sealminer'),('Goldshell'),('NerdMiner'),('Jasminer'),('Auradine'),
  ('Bitaxe'),('Pinecone'),('Magicminer'),('PlebSourse'),('Generic')
) v(b)
WHERE NOT EXISTS (SELECT 1 FROM brands x WHERE x.name = v.b);

-- produkty (názov = značka + model, hmotnosť v g, cena USD)
INSERT INTO products (name, model, brand_id, category_id, type, price, currency, weight_g, source)
SELECT v.brand||' '||v.model, v.model, br.id,
       (SELECT id FROM categories WHERE name='ASIC minery' LIMIT 1),
       'simple'::product_type, v.price, 'USD', v.weight, 'import'
FROM (VALUES
  ('Antminer','S21 XP+ Hyd',18900,9183.83),('Antminer','S19 XP Hyd',15700,4599),
  ('Antminer','S21 XP Hyd',16700,6199),('Antminer','S21e XP Hyd 3U',15700,10599),
  ('Antminer','S19',16500,768),('Antminer','S19J PRO',16300,800),
  ('Antminer','T21',19100,996),('Antminer','S23 Hyd',14800,12990),
  ('Antminer','S23',25500,6899),('Antminer','S21 Pro',18800,2059),
  ('Antminer','Z15 PRO',18800,6499),('Antminer','Z15',9000,3599),
  ('Antminer','S21',17500,907.2),('Antminer','KS5 PRO',17000,1199),
  ('Antminer','L9',16500,2601),('Antminer','L11',16500,7499),
  ('Antminer','D9',16100,1179),('Antminer','X9',21500,5449),
  ('Antminer','X5',18800,3990),('Antminer','S19k Pro',12800,297),
  ('Whatsminer','M63S++',32000,3969),('Whatsminer','M63S',30000,5361),
  ('Whatsminer','M66S++',19000,2959),('Whatsminer','M66S',17000,1969),
  ('Whatsminer','M60S++',13500,2316.76),('Whatsminer','M63S+',32500,5535),
  ('Whatsminer','M79S',52300,12279),
  ('Iceriver','KS5L',15000,599),('Iceriver','KS5M',15500,699),
  ('Iceriver','KS7',18200,1179),('Iceriver','KS7 Lite',4200,699),
  ('Iceriver','KS0 Ultra',2500,112),('Iceriver','AE1',4000,979),
  ('Iceriver','AE2',4020,2599),('Iceriver','AE3',17500,3501.22),
  ('Iceriver','XP0',3600,799),('Iceriver','AE0',4400,309),
  ('Avalon','A1566I',17000,3465),('Avalon','A15XP-206T',15900,3532.2),
  ('Avalon','Avalon Q',10500,1329),('Avalon','Nano 3S',1200,229),
  ('Bitmain','Antminer S21e Hyd',17000,1498),('Bitmain','Antminer S23 Hyd 3U',18200,15499),
  ('Elphapex','DG Hydro 1',18300,4349),('VolcMiner','D1',19250,6299),
  ('VolcMiner','D1 Hydro',25800,5799),('VolcMiner','D3',17500,5999),
  ('Sealminer','A2pro Hyd',26000,5919),('Sealminer','A3 Pro',21500,9590),
  ('Goldshell','XT BOX',4500,1749),('NerdMiner','NerdQaxe++',1200,279),
  ('Jasminer','X44-P',1600,11199),('Jasminer','X16Q',10000,1100.55),
  ('Auradine','Teraflux AH3880',15500,5699),('Bitaxe','Gamma 601 Lucky miner',1000,62.99),
  ('Pinecone','INIBOX',9000,1999),('Magicminer','BG02',NULL,349),
  ('PlebSourse','Hammer Miner Scrypt',3500,239)
) AS v(brand,model,weight,price)
JOIN brands br ON br.name = v.brand;
