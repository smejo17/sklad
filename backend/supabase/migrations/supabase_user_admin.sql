-- =====================================================================
--  Rozšírenie profilov o informačné polia pre správu používateľov.
--  Spustiť v Supabase SQL editore (po supabase_auth_rls.sql).
-- =====================================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS position TEXT;   -- pozícia / funkcia
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone    TEXT;   -- telefón
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS note     TEXT;   -- interná poznámka
-- is_active už existuje (ban = FALSE). full_name/role/module_scope tiež.
-- Politiky profiles_admin_all + profiles_self_* už umožňujú adminovi čítať a meniť
-- všetky profily; vytváranie/mazanie/ban účtov rieši edge funkcia admin-users
-- (Auth Admin API vyžaduje service_role, ktorý NESMIE byť vo frontende).
