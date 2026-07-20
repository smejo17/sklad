-- =====================================================================
--  OPRAVA + DOKONČENIE RLS POLITÍK
--  Rieši chybu: operator does not exist: bigint = uuid
--  (inventory_filters.user_id je bigint, auth.uid() je uuid — nedá sa porovnať)
--  Dopĺňa aj politiky, ktoré sa nestihli vytvoriť po páde skriptu.
--  Bezpečné na opakované spustenie (DROP POLICY IF EXISTS pred CREATE).
-- =====================================================================

-- ULOŽENÉ FILTRE — gate cez oprávnenia (bez porovnania bigint = uuid)
DROP POLICY IF EXISTS invf_read ON inventory_filters;
DROP POLICY IF EXISTS invf_wr   ON inventory_filters;
CREATE POLICY invf_read ON inventory_filters FOR SELECT TO authenticated USING (has_perm('inventory.view'));
CREATE POLICY invf_wr   ON inventory_filters FOR ALL    TO authenticated USING (has_perm('inventory.view')) WITH CHECK (has_perm('inventory.view'));

-- ZÁSIELKY
DROP POLICY IF EXISTS ship_read   ON shipments;
DROP POLICY IF EXISTS ship_wr     ON shipments;
CREATE POLICY ship_read ON shipments FOR SELECT TO authenticated USING (has_perm('shipment.view'));
CREATE POLICY ship_wr   ON shipments FOR ALL    TO authenticated USING (has_perm('shipment.edit')) WITH CHECK (has_perm('shipment.edit'));

DROP POLICY IF EXISTS shipit_read ON shipment_items;
DROP POLICY IF EXISTS shipit_wr   ON shipment_items;
CREATE POLICY shipit_read ON shipment_items FOR SELECT TO authenticated USING (has_perm('shipment.view'));
CREATE POLICY shipit_wr   ON shipment_items FOR ALL    TO authenticated USING (has_perm('shipment.edit')) WITH CHECK (has_perm('shipment.edit'));

-- FIREMNÝ MAJETOK
DROP POLICY IF EXISTS assets_read ON assets;
DROP POLICY IF EXISTS assets_wr   ON assets;
CREATE POLICY assets_read ON assets FOR SELECT TO authenticated USING (has_perm('product.view'));
CREATE POLICY assets_wr   ON assets FOR ALL    TO authenticated USING (has_perm('product.edit')) WITH CHECK (has_perm('product.edit'));
