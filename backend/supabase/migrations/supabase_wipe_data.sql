-- =====================================================================
--  PREMAZANIE DÁT — čistý štart na test (POZOR: nevratné!)
--  Vymaže: PRODUKTY, skladové položky, pohyby, zásielky, QR kódy,
--          fotky položiek, firemný majetok, väzby a parametre produktov.
--  PONECHÁ: kategórie, značky, tagy, sklady + pozície, číselníky,
--           používateľov, profily, role a oprávnenia (aby si sa prihlásil).
--
--  Spustiť v Supabase SQL editore. Sekvencie ID sa vynulujú
--  (nový produkt začne od 1).
-- =====================================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'product_tags','product_aliases','product_attributes','product_components',
    'stock_movements','lot_photos','stock_lots',
    'shipment_items','shipments','qr_codes','assets','products'
  ] LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', t);
    END IF;
  END LOOP;
END $$;

-- kontrola: koľko produktov ostalo (má byť 0)
SELECT count(*) AS produktov_ostalo FROM products;
