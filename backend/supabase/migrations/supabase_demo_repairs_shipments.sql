-- =====================================================================
--  DEMO DÁTA — náhodné zásielky + opravy/reklamácie (s krokmi denníka).
--  Určené na test zobrazenia po sekciách. Bezpečné opakované spustenie
--  (zásielky cez ON CONFLICT). Ak chceš čistý stav, spusti najprv
--  supabase_wipe_data.sql. Vyžaduje: supabase_repairs.sql + supabase_repair_events.sql.
-- =====================================================================

-- ---------- ZÁSIELKY (rôzne stavy: zadané → na ceste → doručené → uzavreté) ----------
INSERT INTO shipments (tracking_number,carrier,direction,status,sender,from_address,to_address,our_order,contents,expected_date,delivered_on,created_at,label_date,is_paid,customer_payment,paid_where,customs,incoterm,jds_number,invoice_number,ship_cost)
VALUES
 ('1ZDEMO00000000001','UPS','inbound',NULL,'Bitmain','Shenzhen, CN','Rostovská 260/2b, Praha, CZ','OBJ-2401','20× Antminer S21',   CURRENT_DATE+7, NULL, now()-interval '1 day',  (CURRENT_DATE-1)::text, FALSE,NULL,NULL,TRUE,'DAP','26CZ600000AAAA111','FV-1001', 4200),
 ('1ZDEMO00000000002','UPS','inbound','Order Processed by UPS','Iceriver','Chengdu, CN','Rostovská 260/2b, Praha, CZ','OBJ-2402','KAS minery KS5L', CURRENT_DATE+9, NULL, now()-interval '2 days', (CURRENT_DATE-2)::text, TRUE,NULL,'proforma',TRUE,'CPT',NULL,'FV-1002', 3900),
 ('1ZDEMO00000000003','UPS','inbound','In Transit','Alza a.s.','Praha, CZ','Rostovská 260/2b, Praha, CZ','OBJ-2403','Sieťové prvky MikroTik', CURRENT_DATE+2, NULL, now()-interval '3 days', (CURRENT_DATE-3)::text, TRUE,NULL,'proforma',FALSE,NULL,NULL,'FV-1003', 320),
 ('773300000004','FedEx','inbound','In transit','Supplier US','New York, US','Rostovská 260/2b, Praha, CZ','OBJ-2404','Náhradné hashboardy', CURRENT_DATE+4, NULL, now()-interval '2 days', (CURRENT_DATE-2)::text, FALSE,NULL,NULL,TRUE,'DDP','26CZ600000BBBB222','FV-1004', 1500),
 ('1ZDEMO00000000005','UPS','inbound','Delivered','Goldshell','Hong Kong, HK','Rostovská 260/2b, Praha, CZ','OBJ-2405','Goldshell KA Box', NULL, now()-interval '1 day', now()-interval '6 days', (CURRENT_DATE-6)::text, TRUE,NULL,'proforma',TRUE,'DAP','26CZ600000CCCC333','FV-1005', 260),
 ('1ZDEMO00000000006','UPS','outbound','Delivered','Kentino s.r.o.','Rostovská 260/2b, Praha, CZ','Vila Nova de Gaia, PT','ORD-PT-77','1× Antminer S19 (dobierka)', NULL, now()-interval '2 days', now()-interval '7 days', (CURRENT_DATE-8)::text, TRUE,'dobierka 6779 EUR','dobierka (UPS)',FALSE,'DAP',NULL,'FV-2001', 180),
 ('1ZDEMO00000000007','UPS','outbound','In Transit','Kentino s.r.o.','Rostovská 260/2b, Praha, CZ','Bratislava, SK','ORD-SK-12','2× GPU rig', CURRENT_DATE+1, NULL, now()-interval '1 day', (CURRENT_DATE-1)::text, FALSE,'proforma',NULL,FALSE,NULL,NULL,'FV-2002', 45),
 ('1ZDEMO00000000008','UPS','outbound','Returned to Shipper','Kentino s.r.o.','Rostovská 260/2b, Praha, CZ','Wien, AT','ORD-AT-03','Reklamovaný zdroj', NULL, NULL, now()-interval '12 days', (CURRENT_DATE-12)::text, FALSE,NULL,NULL,FALSE,'DAP',NULL,'FV-2003', 60),
 ('CZ0099887766','GLS','inbound','Doručené','Distributor SK','Košice, SK','Rostovská 260/2b, Praha, CZ','OBJ-2406','Kabeláž a konektory', NULL, now()-interval '3 days', now()-interval '5 days', (CURRENT_DATE-5)::text, TRUE,NULL,'faktúra',FALSE,NULL,NULL,'FV-1006', 90),
 ('1ZDEMO00000000010','UPS','dropship',NULL,'Bitmain','Shenzhen, CN','Zákazník DE, Leipzig','ORD-DS-01','Dropship S21 priamo zákazníkovi', CURRENT_DATE+10, NULL, now(), NULL, FALSE,'proforma',NULL,TRUE,'DDP',NULL,'FV-3001', 210)
ON CONFLICT (tracking_number) DO NOTHING;

-- ---------- OPRAVY A REKLAMÁCIE naprieč stavmi + nemenný denník ----------
DO $$
DECLARE rid BIGINT;
BEGIN
  -- 1) OPRAVA — práve prijaté
  INSERT INTO repairs(kind,title,serial,customer,customer_contact,received_by,technician,status,fault,price_currency,created_at)
    VALUES('oprava','Antminer S19 – hlučný',    'SN-S19-001','Jozef Novák','jozef@ex.sk','sklad@firma.sk',NULL,'prijaté','Hlučný ventilátor, občas sa reštartuje','EUR',now()-interval '1 day')
    RETURNING id INTO rid;
  INSERT INTO repair_events(repair_id,stage,note,data,created_by_name,created_at) VALUES
    (rid,'prijaté','Prijaté na servis, vizuálne OK.',jsonb_build_object('received_by','sklad@firma.sk','fault','Hlučný ventilátor'),'sklad@firma.sk',now()-interval '1 day');

  -- 2) OPRAVA — diagnostika
  INSERT INTO repairs(kind,title,serial,customer,customer_contact,received_by,technician,status,fault,price_currency,created_at)
    VALUES('oprava','Whatsminer M30S – nenabieha','SN-M30-014','Peter Kováč','peter@ex.sk','sklad@firma.sk','Martin T.','diagnostika','Po zapnutí zhasne','EUR',now()-interval '3 days')
    RETURNING id INTO rid;
  INSERT INTO repair_events(repair_id,stage,note,data,created_by_name,created_at) VALUES
    (rid,'prijaté','Prijaté.',jsonb_build_object('received_by','sklad@firma.sk','fault','Po zapnutí zhasne'),'sklad@firma.sk',now()-interval '3 days'),
    (rid,'diagnostika','Podozrenie na chybný PSU.',jsonb_build_object('technician','Martin T.','diagnosis','Napájací zdroj nedodáva 12V'),'martin@firma.sk',now()-interval '2 days');

  -- 3) OPRAVA — cena schválená
  INSERT INTO repairs(kind,title,serial,customer,customer_contact,received_by,technician,status,fault,price_estimate,price_currency,created_at)
    VALUES('oprava','GPU rig – jedna karta mŕtva','SN-RIG-007','Firma XYZ s.r.o.','it@xyz.sk','sklad@firma.sk','Martin T.','schválenie ceny','Rig hlási chýbajúcu GPU',180,'EUR',now()-interval '5 days')
    RETURNING id INTO rid;
  INSERT INTO repair_events(repair_id,stage,note,data,created_by_name,created_at) VALUES
    (rid,'prijaté','Prijaté.',jsonb_build_object('received_by','sklad@firma.sk'),'sklad@firma.sk',now()-interval '5 days'),
    (rid,'diagnostika','Mŕtva GPU #3.',jsonb_build_object('technician','Martin T.','diagnosis','GPU #3 bez detekcie'),'martin@firma.sk',now()-interval '4 days'),
    (rid,'schválenie ceny','Zákazník súhlasí s výmenou karty.',jsonb_build_object('price','180','currency','EUR','approved_by','p. Horváth'),'martin@firma.sk',now()-interval '3 days');

  -- 4) OPRAVA — objednané diely
  INSERT INTO repairs(kind,title,serial,customer,received_by,technician,status,fault,price_estimate,price_currency,created_at)
    VALUES('oprava','Antminer S21 – hashboard','SN-S21-100','Miner Group','sklad@firma.sk','Martin T.','objednané diely','1 hashboard bez výkonu',260,'EUR',now()-interval '7 days')
    RETURNING id INTO rid;
  INSERT INTO repair_events(repair_id,stage,note,data,created_by_name,created_at) VALUES
    (rid,'prijaté','Prijaté.',jsonb_build_object('received_by','sklad@firma.sk'),'sklad@firma.sk',now()-interval '7 days'),
    (rid,'diagnostika','Chybný hashboard B.',jsonb_build_object('technician','Martin T.','diagnosis','Hashboard B 0 TH/s'),'martin@firma.sk',now()-interval '6 days'),
    (rid,'schválenie ceny','Schválené.',jsonb_build_object('price','260','currency','EUR','approved_by','zákazník'),'martin@firma.sk',now()-interval '6 days'),
    (rid,'objednané diely','Objednané u dodávateľa.',jsonb_build_object('parts','Hashboard S21','order_no','PO-5567','supplier','Bitmain'),'martin@firma.sk',now()-interval '5 days');

  -- 5) OPRAVA — čaká na diely
  INSERT INTO repairs(kind,title,serial,customer,received_by,technician,status,price_estimate,price_currency,created_at)
    VALUES('oprava','Zdroj APW12 – oprava','SN-APW-021','Jozef Novák','sklad@firma.sk','Martin T.','čaká na diely',75,'EUR',now()-interval '9 days')
    RETURNING id INTO rid;
  INSERT INTO repair_events(repair_id,stage,note,data,created_by_name,created_at) VALUES
    (rid,'prijaté','Prijaté.',jsonb_build_object('received_by','sklad@firma.sk'),'sklad@firma.sk',now()-interval '9 days'),
    (rid,'diagnostika','Vadný kondenzátor.',jsonb_build_object('technician','Martin T.','diagnosis','Nafúknutý kondenzátor'),'martin@firma.sk',now()-interval '8 days'),
    (rid,'schválenie ceny','Schválené.',jsonb_build_object('price','75','currency','EUR','approved_by','zákazník'),'martin@firma.sk',now()-interval '8 days'),
    (rid,'objednané diely','Objednané.',jsonb_build_object('parts','Sada kondenzátorov','order_no','PO-5590'),'martin@firma.sk',now()-interval '7 days'),
    (rid,'čaká na diely','Dodávka do konca týždňa.',jsonb_build_object('expected',(CURRENT_DATE+3)::text),'martin@firma.sk',now()-interval '6 days');

  -- 6) OPRAVA — hotovo, čaká na platbu
  INSERT INTO repairs(kind,title,serial,customer,customer_contact,received_by,technician,status,price_estimate,price_currency,created_at)
    VALUES('oprava','Antminer S19j – čistenie+servis','SN-S19-088','Data s.r.o.','info@data.sk','sklad@firma.sk','Martin T.','čaká na platbu',120,'EUR',now()-interval '12 days')
    RETURNING id INTO rid;
  INSERT INTO repair_events(repair_id,stage,note,data,created_by_name,created_at) VALUES
    (rid,'prijaté','Prijaté.',jsonb_build_object('received_by','sklad@firma.sk'),'sklad@firma.sk',now()-interval '12 days'),
    (rid,'diagnostika','Zanesené chladiče.',jsonb_build_object('technician','Martin T.','diagnosis','Prehrievanie, prach'),'martin@firma.sk',now()-interval '11 days'),
    (rid,'schválenie ceny','Schválené.',jsonb_build_object('price','120','currency','EUR','approved_by','zákazník'),'martin@firma.sk',now()-interval '11 days'),
    (rid,'oprava','Vyčistené, vymenená pasta.',jsonb_build_object('technician','Martin T.','work','Čistenie + nová teplovodivá pasta'),'martin@firma.sk',now()-interval '9 days'),
    (rid,'hotovo','Zákazník informovaný e-mailom.',jsonb_build_object('notified_on',(CURRENT_DATE-8)::text,'notify_how','e-mail'),'martin@firma.sk',now()-interval '8 days'),
    (rid,'čaká na platbu','Vystavená faktúra.',jsonb_build_object('price_final','120','currency','EUR'),'sklad@firma.sk',now()-interval '7 days');

  -- 7) OPRAVA — uzavreté
  INSERT INTO repairs(kind,title,serial,customer,received_by,technician,status,price_estimate,price_currency,created_at)
    VALUES('oprava','Router – výmena PSU','SN-RTR-002','Peter Kováč','sklad@firma.sk','Martin T.','uzavreté',40,'EUR',now()-interval '20 days')
    RETURNING id INTO rid;
  INSERT INTO repair_events(repair_id,stage,note,data,created_by_name,created_at) VALUES
    (rid,'prijaté','Prijaté.',jsonb_build_object('received_by','sklad@firma.sk'),'sklad@firma.sk',now()-interval '20 days'),
    (rid,'diagnostika','Chybný adaptér.',jsonb_build_object('technician','Martin T.'),'martin@firma.sk',now()-interval '19 days'),
    (rid,'oprava','Vymenený adaptér.',jsonb_build_object('work','Nový 12V adaptér'),'martin@firma.sk',now()-interval '18 days'),
    (rid,'hotovo','Informovaný telefonicky.',jsonb_build_object('notified_on',(CURRENT_DATE-17)::text,'notify_how','telefón'),'martin@firma.sk',now()-interval '17 days'),
    (rid,'uzavreté','Zaplatené a prevzaté.',jsonb_build_object('paid_on',(CURRENT_DATE-16)::text,'returned_on',(CURRENT_DATE-16)::text,'payment_method','hotovosť'),'sklad@firma.sk',now()-interval '16 days');

  -- 8) REKLAMÁCIA — diagnostika (s termínom)
  INSERT INTO repairs(kind,title,serial,customer,customer_contact,received_by,technician,status,fault,deadline,price_currency,created_at)
    VALUES('reklamacia','Antminer S21 – reklamácia výkonu','SN-S21-777','E-shop klient','klient@mail.sk','sklad@firma.sk','Martin T.','diagnostika','Nedosahuje deklarovaný hashrate',CURRENT_DATE+18,'EUR',now()-interval '4 days')
    RETURNING id INTO rid;
  INSERT INTO repair_events(repair_id,stage,note,data,created_by_name,created_at) VALUES
    (rid,'prijaté','Reklamácia prijatá, spísaný protokol.',jsonb_build_object('received_by','sklad@firma.sk','fault','Nízky hashrate'),'sklad@firma.sk',now()-interval '4 days'),
    (rid,'diagnostika','Meranie prebieha.',jsonb_build_object('technician','Martin T.','diagnosis','Overujeme 2 z 3 hashboardov'),'martin@firma.sk',now()-interval '2 days');

  -- 9) REKLAMÁCIA — uzavreté (vybavená)
  INSERT INTO repairs(kind,title,serial,customer,received_by,technician,status,fault,deadline,price_currency,created_at)
    VALUES('reklamacia','Zdroj – reklamácia','SN-PSU-333','Firma XYZ s.r.o.','sklad@firma.sk','Martin T.','uzavreté','DOA – nefunkčný z výroby',CURRENT_DATE-2,'EUR',now()-interval '25 days')
    RETURNING id INTO rid;
  INSERT INTO repair_events(repair_id,stage,note,data,created_by_name,created_at) VALUES
    (rid,'prijaté','Reklamácia DOA.',jsonb_build_object('received_by','sklad@firma.sk','fault','DOA'),'sklad@firma.sk',now()-interval '25 days'),
    (rid,'diagnostika','Potvrdená chyba.',jsonb_build_object('technician','Martin T.','diagnosis','Nefunkčný zdroj'),'martin@firma.sk',now()-interval '24 days'),
    (rid,'uzavreté','Vymenené za nový kus, vrátené.',jsonb_build_object('returned_on',(CURRENT_DATE-20)::text,'payment_method','výmena v záruke'),'sklad@firma.sk',now()-interval '20 days');
END $$;

-- ---------- MAJETOK (demo) ----------
INSERT INTO assets (name, serial, holder, manager, room, state, acquired_at, note) VALUES
 ('Monitor Dell 27"',      'DELL-27-001','M. Beno','IT oddelenie','Kancelária 1','used', CURRENT_DATE-200,'Pracovný monitor'),
 ('Monitor Dell 27"',      'DELL-27-002','M. Beno','IT oddelenie','Kancelária 1','used', CURRENT_DATE-200,'Druhý monitor'),
 ('Notebook Lenovo T14',   'LN-T14-051','M. Beno','IT oddelenie','Kancelária 1','used', CURRENT_DATE-400,'Firemný notebook'),
 ('Televízor Samsung 55"', 'SAMSUNG-55X','—','Správa budovy','Zasadačka','used', CURRENT_DATE-300,'Prezentácie'),
 ('Konferenčný telefón',   'POLY-CT-01','—','Správa budovy','Zasadačka','new',  CURRENT_DATE-90,'Polycom'),
 ('Tlačiareň HP LaserJet', 'HP-LJ-777','Peter Kováč','IT oddelenie','Kancelária 2','used', CURRENT_DATE-500,'Sieťová tlačiareň'),
 ('Router MikroTik',       'MT-RB-900','—','IT oddelenie','Serverovňa','used', CURRENT_DATE-260,'Hlavný router');
