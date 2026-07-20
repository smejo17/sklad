-- =====================================================================
--  Umožní MAZANIE pohybov (príjemiek/výdajok) — potrebné pre tlačidlá
--  „Zmazať príjemku/výdajku". Časový limit pre bežných users rieši appka.
--  Spustiť v Supabase SQL editore. Idempotentné.
-- =====================================================================
DROP POLICY IF EXISTS moves_del ON stock_movements;
CREATE POLICY moves_del ON stock_movements FOR DELETE TO authenticated
  USING (has_perm('inventory.move'));
