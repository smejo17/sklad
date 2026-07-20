-- =====================================================================
--  ROLE v2 — kompletná sada rolí + oprávnenia pre opravy a majetok.
--  Roly: admin, skladník, technik, visitor, zamestnanec, dočasný, externý.
--  Idempotentné — možno spustiť opakovane. Spustiť po schema_basic.sql
--  a supabase_auth_rls.sql (a supabase_repairs.sql + supabase_repair_events.sql).
-- =====================================================================

-- 1) Nové roly (staré admin/visitor ostávajú; 'user'/'external' nechávame kvôli spätnosti)
INSERT INTO roles (name) VALUES
  ('skladník'), ('technik'), ('zamestnanec'), ('dočasný'), ('externý')
ON CONFLICT (name) DO NOTHING;

-- 2) Nové oprávnenia — servis (opravy/reklamácie) a majetok
INSERT INTO permissions (code, module, description) VALUES
  ('repair.view','servis','Zobraziť opravy a reklamácie'),
  ('repair.edit','servis','Zaznamenávať kroky opráv/reklamácií'),
  ('asset.view','majetok','Zobraziť firemný majetok'),
  ('asset.edit','majetok','Spravovať majetok (presun, priradenie)')
ON CONFLICT (code) DO NOTHING;

-- 3) Mapovanie oprávnení rolám (najprv vyčisti pre spravované roly, potom nasaď)
DELETE FROM role_permissions
WHERE role_id IN (SELECT id FROM roles WHERE name IN
  ('admin','skladník','technik','visitor','zamestnanec','dočasný','externý'));

-- admin = všetko
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name='admin'), p.id FROM permissions p;

-- skladník = sklad + zásielky + majetok + náhľad opráv
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name='skladník'), p.id FROM permissions p
WHERE p.code IN ('product.view','product.edit','product.merge','price.edit',
  'inventory.view','inventory.move','qr.scan',
  'shipment.view','shipment.edit','shipment.payment',
  'asset.view','asset.edit','repair.view');

-- technik = opravy/reklamácie + náhľad skladu + skenovanie (na diely/SN)
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name='technik'), p.id FROM permissions p
WHERE p.code IN ('product.view','inventory.view','inventory.move','qr.scan',
  'repair.view','repair.edit','asset.view','shipment.view');

-- zamestnanec = náhľad + skenovanie + vidí svoj/priradený majetok
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name='zamestnanec'), p.id FROM permissions p
WHERE p.code IN ('product.view','inventory.view','shipment.view','qr.scan','asset.view','repair.view');

-- dočasný = minimálny náhľad
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name='dočasný'), p.id FROM permissions p
WHERE p.code IN ('product.view','inventory.view');

-- visitor = len čítanie hlavných modulov
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name='visitor'), p.id FROM permissions p
WHERE p.code IN ('product.view','inventory.view','shipment.view','asset.view','repair.view');

-- externý = API dotaz (ako pôvodné 'external')
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name='externý'), p.id FROM permissions p
WHERE p.code IN ('api.query');

-- 4) RLS pre opravy/reklamácie a ich denník — použijú repair.* (spätne aj inventory.move)
DROP POLICY IF EXISTS rep_read ON repairs;
DROP POLICY IF EXISTS rep_wr   ON repairs;
CREATE POLICY rep_read ON repairs FOR SELECT TO authenticated
  USING (has_perm('repair.view') OR has_perm('inventory.view'));
CREATE POLICY rep_wr   ON repairs FOR ALL TO authenticated
  USING (has_perm('repair.edit') OR has_perm('inventory.move'))
  WITH CHECK (has_perm('repair.edit') OR has_perm('inventory.move'));

DROP POLICY IF EXISTS repev_read ON repair_events;
DROP POLICY IF EXISTS repev_insert ON repair_events;
CREATE POLICY repev_read ON repair_events FOR SELECT TO authenticated
  USING (has_perm('repair.view') OR has_perm('inventory.view'));
CREATE POLICY repev_insert ON repair_events FOR INSERT TO authenticated
  WITH CHECK (has_perm('repair.edit') OR has_perm('inventory.move'));

DROP POLICY IF EXISTS repph_read ON repair_photos;
DROP POLICY IF EXISTS repph_wr   ON repair_photos;
CREATE POLICY repph_read ON repair_photos FOR SELECT TO authenticated
  USING (has_perm('repair.view') OR has_perm('inventory.view'));
CREATE POLICY repph_wr   ON repair_photos FOR ALL TO authenticated
  USING (has_perm('repair.edit') OR has_perm('inventory.move'))
  WITH CHECK (has_perm('repair.edit') OR has_perm('inventory.move'));

-- 5) RLS pre majetok — asset.* (spätne aj product.edit)
DROP POLICY IF EXISTS assets_read ON assets;
DROP POLICY IF EXISTS assets_wr   ON assets;
CREATE POLICY assets_read ON assets FOR SELECT TO authenticated
  USING (has_perm('asset.view') OR has_perm('product.view'));
CREATE POLICY assets_wr   ON assets FOR ALL TO authenticated
  USING (has_perm('asset.edit') OR has_perm('product.edit'))
  WITH CHECK (has_perm('asset.edit') OR has_perm('product.edit'));
