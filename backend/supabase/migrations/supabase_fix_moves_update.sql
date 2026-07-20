-- =====================================================================
--  Umožní PRESUN pohybov pri zlučovaní duplicitných produktov.
--  Doplní UPDATE politiku pre stock_movements (chýbala).
--  Spustiť v Supabase SQL editore. Idempotentné.
-- =====================================================================
DROP POLICY IF EXISTS moves_upd ON stock_movements;
CREATE POLICY moves_upd ON stock_movements FOR UPDATE TO authenticated
  USING (has_perm('inventory.move')) WITH CHECK (has_perm('inventory.move'));
