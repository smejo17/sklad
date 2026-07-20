-- =====================================================================
--  SEED – základné role, oprávnenia a ich predvolené mapovanie
--  Spustenie PO schema.sql:  psql -d nazov_db -f seed.sql
-- =====================================================================
BEGIN;

-- ---- ROLE ----------------------------------------------------------
INSERT INTO roles (name, description, is_system) VALUES
 ('admin',    'Prístup všade, správa používateľov, rolí a API klientov', TRUE),
 ('user',     'Pridávanie a úprava záznamov vo svojom module',            TRUE),
 ('visitor',  'Iba na pozeranie',                                         TRUE),
 ('external', 'Vzdialený obmedzený prístup cez API (dotazy na položky)',  TRUE);

-- ---- OPRÁVNENIA ----------------------------------------------------
INSERT INTO permissions (code, module, description) VALUES
 -- sklad
 ('product.view',        'sklad',    'Zobraziť produkty'),
 ('product.create',      'sklad',    'Pridať produkt'),
 ('product.edit',        'sklad',    'Upraviť produkt'),
 ('product.delete',      'sklad',    'Zmazať produkt'),
 ('price.view_meta',     'sklad',    'Zobraziť kto/kedy zadal cenu (ikona i)'),
 ('price.edit',          'sklad',    'Upraviť cenu'),
 ('inventory.view',      'sklad',    'Zobraziť stav na skladoch'),
 ('inventory.move',      'sklad',    'Presun v rámci skladu'),
 ('inventory.transfer',  'sklad',    'Transfer na iný sklad'),
 ('inventory.writeoff',  'sklad',    'Odpis položky'),
 ('qr.scan',             'sklad',    'Skenovať QR / sériové čísla'),
 ('qr.assign',           'sklad',    'Napárovať QR na kus'),
 ('qr.reprint',          'sklad',    'Dotlač / oprava QR'),
 ('qr.batch_manage',     'sklad',    'Správa várok QR'),
 ('premium.view',        'sklad',    'Vidieť prémiové produkty'),
 ('stock.report',        'sklad',    'Prehľad zásob'),
 ('filter.manage_own',   'sklad',    'Spravovať vlastné filtre'),
 ('filter.manage_others','sklad',    'Nastavovať filtre iným'),
 -- zásielky
 ('shipment.view',       'zasielky', 'Zobraziť zásielky'),
 ('shipment.create',     'zasielky', 'Založiť zásielku'),
 ('shipment.edit',       'zasielky', 'Upraviť zásielku'),
 ('shipment.delete',     'zasielky', 'Zmazať zásielku'),
 ('shipment.refresh',    'zasielky', 'Aktualizovať stav cez API'),
 ('shipment.replace',    'zasielky', 'Nahradiť zásielku'),
 ('shipment.payment',    'zasielky', 'Platba / faktúra k zásielke'),
 ('customs.view',        'zasielky', 'Zobraziť colné odbavenia'),
 ('customs.manage',      'zasielky', 'Spravovať colné odbavenia'),
 -- system
 ('user.manage',         'system',   'Správa používateľov'),
 ('role.manage',         'system',   'Správa rolí'),
 ('permission.assign',   'system',   'Priraďovanie oprávnení'),
 ('apiclient.manage',    'system',   'Správa API klientov'),
 ('audit.view',          'system',   'Logy zmien'),
 ('activity.view',       'system',   'Aktivita používateľov'),
 ('api.query',           'system',   'Dotaz na konkrétne položky (external)');

-- ---- ADMIN = všetky oprávnenia ------------------------------------
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name='admin'), p.id FROM permissions p;

-- ---- USER ----------------------------------------------------------
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name='user'), p.id FROM permissions p
WHERE p.code IN (
  'product.view','product.create','product.edit',
  'price.view_meta','price.edit',
  'inventory.view','inventory.move','inventory.transfer',
  'qr.scan','qr.assign','qr.reprint','stock.report','filter.manage_own',
  'shipment.view','shipment.create','shipment.edit','shipment.refresh',
  'shipment.replace','shipment.payment','customs.view','customs.manage'
);

-- ---- VISITOR (iba view) -------------------------------------------
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name='visitor'), p.id FROM permissions p
WHERE p.code IN (
  'product.view','price.view_meta','inventory.view','stock.report',
  'shipment.view','customs.view'
);

-- ---- EXTERNAL (iba API dotaz) -------------------------------------
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name='external'), p.id FROM permissions p
WHERE p.code IN ('api.query');

-- ---- Ukážkový admin používateľ (heslo si nastav cez appku!) -------
INSERT INTO users (full_name, email, password_hash, is_active)
VALUES ('Administrátor', 'admin@example.com', 'ZMEN_MA_placeholder_hash', TRUE);

INSERT INTO user_roles (user_id, role_id, module_scope)
VALUES (
  (SELECT id FROM users WHERE email='admin@example.com'),
  (SELECT id FROM roles WHERE name='admin'),
  'oboje'
);

COMMIT;
