-- =====================================================================
--  SYNCHRONIZÁCIA PREPRAVCOV — kedy sa naposledy automaticky overovali
--  stavy zásielok cez API prepravcu.
--  Spustiť v Supabase SQL editore (po schema_basic.sql + auth_rls).
-- =====================================================================
CREATE TABLE IF NOT EXISTS carrier_sync (
    carrier    TEXT PRIMARY KEY,          -- napr. 'UPS'
    last_run   TIMESTAMPTZ,               -- kedy naposledy bežala kontrola
    checked    INTEGER DEFAULT 0,         -- koľko zásielok sa kontrolovalo
    updated    INTEGER DEFAULT 0,         -- koľko sa aktualizovalo
    note       TEXT
);
ALTER TABLE carrier_sync ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS csync_read ON carrier_sync;
DROP POLICY IF EXISTS csync_wr   ON carrier_sync;
CREATE POLICY csync_read ON carrier_sync FOR SELECT TO authenticated USING (has_perm('shipment.view'));
CREATE POLICY csync_wr   ON carrier_sync FOR ALL    TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- prednastavené riadky prepravcov (voliteľné)
INSERT INTO carrier_sync(carrier) VALUES ('UPS')
ON CONFLICT (carrier) DO NOTHING;

-- =====================================================================
--  AUTOMATICKÉ SPÚŠŤANIE 2× DENNE
--  Možnosť A (odporúčané): Supabase Dashboard → Integrations → Cron →
--     New job → zavolaj Edge Function "ups-refresh-all" napr. o 07:00 a 15:00.
--  Možnosť B: pg_cron + pg_net (ak sú povolené). Príklad (nahraď URL a kľúč):
--
--  select cron.schedule('ups-refresh-am','0 7 * * *', $$
--    select net.http_post(
--      url:='https://TVOJPROJEKT.functions.supabase.co/ups-refresh-all',
--      headers:='{"Authorization":"Bearer SERVICE_ROLE_KEY","Content-Type":"application/json"}'::jsonb,
--      body:='{}'::jsonb);
--  $$);
--  select cron.schedule('ups-refresh-pm','0 15 * * *', $$ ... rovnako ... $$);
-- =====================================================================
