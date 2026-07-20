-- =====================================================================
--  DOPLNENIE RBAC — tabuľky permissions + role_permissions a ich seed.
--  Spustiť PO schema_basic.sql a PRED (alebo pred opätovným) supabase_auth_rls.sql.
--  Skript je bezpečný na opakované spustenie.
-- =====================================================================

-- oprávnenia (kódy zodpovedajú matici v aplikácii)
CREATE TABLE IF NOT EXISTS permissions (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        TEXT UNIQUE NOT NULL,
    module      TEXT,                 -- sklad / zasielky / system
    description TEXT
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id       BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- --- seed oprávnení ---
INSERT INTO permissions (code, module, description) VALUES
 ('product.view','sklad','Zobraziť produkty'),
 ('product.edit','sklad','Pridať / upraviť produkt'),
 ('product.delete','sklad','Zmazať produkt'),
 ('product.merge','sklad','Zlučovať duplicity'),
 ('price.edit','sklad','Upraviť cenu'),
 ('inventory.view','sklad','Zobraziť zásoby'),
 ('inventory.move','sklad','Presun / transfer / príjem / výdaj'),
 ('qr.scan','sklad','Skenovať QR / SN'),
 ('premium.view','sklad','Vidieť prémiové produkty'),
 ('shipment.view','zasielky','Zobraziť zásielky'),
 ('shipment.edit','zasielky','Pridať / upraviť zásielku'),
 ('shipment.payment','zasielky','Platba / faktúra'),
 ('user.manage','system','Správa používateľov'),
 ('role.manage','system','Správa rolí'),
 ('api.query','system','API dotaz (external)')
ON CONFLICT (code) DO NOTHING;

-- --- mapovanie rola -> oprávnenia (predvolené) ---
-- admin = všetko
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name='admin'), p.id FROM permissions p
ON CONFLICT DO NOTHING;

-- user
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name='user'), p.id FROM permissions p
WHERE p.code IN ('product.view','product.edit','price.edit','inventory.view','inventory.move',
                 'qr.scan','shipment.view','shipment.edit','shipment.payment')
ON CONFLICT DO NOTHING;

-- visitor (len čítanie)
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name='visitor'), p.id FROM permissions p
WHERE p.code IN ('product.view','inventory.view','shipment.view')
ON CONFLICT DO NOTHING;

-- external (len API dotaz)
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name='external'), p.id FROM permissions p
WHERE p.code IN ('api.query')
ON CONFLICT DO NOTHING;
