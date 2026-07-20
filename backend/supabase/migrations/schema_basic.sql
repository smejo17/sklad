-- =====================================================================
--  SKLADOVÝ A ZÁSIELKOVÝ SYSTÉM  –  ZÁKLADNÁ schéma v0.1 (štart)
--  Zjednodušený základ, ktorý budeme postupne dopĺňať do plnej verzie.
--  Meny: primárne CZK, aj EUR/USD a krypto (BTC, LTC, KAS, USDT, USDC, DOGE)
--  Spustenie:  psql -d nazov_db -f schema_basic.sql
-- =====================================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- podobnosť názvov / vyhľadávanie

-- ---- MENY (fiat aj krypto) ----------------------------------------
CREATE TYPE currency_type AS ENUM ('fiat', 'crypto');

CREATE TABLE currencies (
    code       TEXT PRIMARY KEY,            -- 'CZK','EUR','USD','BTC','LTC','KAS','USDT','USDC','DOGE'
    name       TEXT NOT NULL,
    type       currency_type NOT NULL,
    decimals   INTEGER NOT NULL DEFAULT 2,  -- fiat 2, krypto viac
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

-- ---- POUŽÍVATELIA A ROLE (zjednodušene) ---------------------------
CREATE TABLE roles (
    id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT UNIQUE NOT NULL              -- admin / user / visitor / external
);

-- oprávnenia a ich priradenie rolám (základ RBAC pre RLS v Supabase)
CREATE TABLE permissions (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        TEXT UNIQUE NOT NULL,       -- napr. product.edit
    module      TEXT,                        -- sklad / zasielky / system
    description TEXT
);
CREATE TABLE role_permissions (
    role_id       BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name     TEXT NOT NULL,
    email         CITEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role_id       BIGINT REFERENCES roles(id),
    module_scope  TEXT NOT NULL DEFAULT 'oboje',  -- sklad / zasielky / oboje
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- SKLAD (zjednodušene) -----------------------------------------
CREATE TABLE warehouses (
    id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name      TEXT NOT NULL,
    address   TEXT,
    color     TEXT,                     -- podfarbenie skladu v UI
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- rozmiestnenie v sklade: krátke označenie (code) + presnejší popis (description)
CREATE TABLE warehouse_locations (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    warehouse_id BIGINT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    code         TEXT NOT NULL,        -- napr. '1','4','Kancl'
    description  TEXT,                 -- napr. 'Kancelária na poschodí — u výťahu'
    sort_order   INTEGER NOT NULL DEFAULT 0,
    UNIQUE (warehouse_id, code)
);

-- kategórie s podkategóriami (strom cez parent_id)
CREATE TABLE categories (
    id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name      TEXT NOT NULL,               -- Spotrebný materiál / Komponenty / ASIC minery ...
    parent_id BIGINT REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TYPE product_type AS ENUM ('simple', 'assembly');  -- jednoduchý / zostava

-- značka ako samostatná spravovaná dimenzia
CREATE TABLE brands (
    id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE products (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sku           TEXT UNIQUE,
    name          TEXT NOT NULL,              -- jednotný (kanonický) názov
    description   TEXT,                       -- krátky popis
    long_description TEXT,                    -- podrobný popis (zostavy, ASIC parametre...)
    brand_id      BIGINT REFERENCES brands(id) ON DELETE SET NULL,
    model         TEXT,
    category_id   BIGINT REFERENCES categories(id) ON DELETE SET NULL,
    type          product_type NOT NULL DEFAULT 'simple',
    image_url     TEXT,
    price         NUMERIC(18,8),              -- orientačná nákupná cena
    currency      TEXT REFERENCES currencies(code) DEFAULT 'CZK',
    weight_g      NUMERIC,                     -- hmotnosť v gramoch
    is_premium    BOOLEAN NOT NULL DEFAULT FALSE,
    source        TEXT NOT NULL DEFAULT 'manual', -- manual / sales-db / import / photo
    external_id   TEXT,                       -- id v zdrojovej (predajnej) databáze
    stock_cycle   TEXT NOT NULL DEFAULT 'yearly', -- inventúra: monthly / yearly / none
    last_count_at DATE,                        -- posledná inventúra produktu
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== PARAMETRE PODĽA KATEGÓRIE (dynamické atribúty) =====
CREATE TYPE attr_type AS ENUM ('text', 'number', 'enum');

-- definícia parametra viazaná na kategóriu (podkategórie dedia od rodiča)
CREATE TABLE attribute_defs (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category_id  BIGINT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    attr_key     TEXT NOT NULL,              -- napr. 'hashrate', 'length'
    label        TEXT NOT NULL,
    type         attr_type NOT NULL DEFAULT 'text',
    unit         TEXT,                        -- napr. 'W', 'Th/s', 'm'
    options      TEXT[],                      -- povolené hodnoty pre enum
    is_filter    BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    UNIQUE (category_id, attr_key)
);

-- hodnoty parametrov konkrétneho produktu
CREATE TABLE product_attributes (
    product_id   BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    attr_def_id  BIGINT NOT NULL REFERENCES attribute_defs(id) ON DELETE CASCADE,
    value        TEXT,
    value_num    NUMERIC,                     -- pre číselné filtre/rozsahy
    PRIMARY KEY (product_id, attr_def_id)
);

-- alternatívne názvy (vznikajú pri zlúčení duplicít) — vyhľadávanie ich nájde
CREATE TABLE product_aliases (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    alias      TEXT NOT NULL
);

-- tagy (riadená sada, aby sa nerozišli) + priradenie k produktom
CREATE TABLE tags (
    id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);
-- rozsah tagu: pre ktoré kategórie sa navrhuje (prázdne = globálny tag)
CREATE TABLE tag_categories (
    tag_id      BIGINT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (tag_id, category_id)
);
CREATE TABLE product_tags (
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    tag_id     BIGINT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, tag_id)
);

-- zloženie zostavy: ktoré produkty a v akom množstve tvoria zostavu
CREATE TABLE product_components (
    assembly_id  BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    component_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity     NUMERIC NOT NULL DEFAULT 1,
    PRIMARY KEY (assembly_id, component_id),
    CHECK (assembly_id <> component_id)
);

-- indexy pre vyhľadávanie a detekciu podobných názvov
CREATE INDEX idx_products_name_trgm ON products USING gin (name gin_trgm_ops);
CREATE INDEX idx_aliases_trgm       ON product_aliases USING gin (alias gin_trgm_ops);

-- ŠARŽE ZÁSOB: jeden produkt môže mať viac šarží (rôzna cena, dátum, faktúra, miesto).
--  track='unit'  = jednotlivý kus s QR/SN (väčší/drahý tovar)
--  track='bulk'  = množstvo, QR len na bedni (spotrebný materiál)
CREATE TYPE track_type AS ENUM ('unit', 'bulk');
CREATE TYPE stock_state AS ENUM ('new', 'used');
CREATE TYPE stock_status AS ENUM ('skladom', 'na_ceste', 'pending');  -- na ceste = zvýraznené

CREATE TABLE stock_lots (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id    BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    warehouse_id  BIGINT REFERENCES warehouses(id) ON DELETE SET NULL,
    location_id   BIGINT REFERENCES warehouse_locations(id) ON DELETE SET NULL,
    track         track_type NOT NULL DEFAULT 'unit',
    quantity      NUMERIC NOT NULL DEFAULT 1,     -- pri unit = 1
    serial        TEXT,                            -- pri unit
    qr_code       TEXT,                            -- kus alebo QR na bedni
    status        stock_status NOT NULL DEFAULT 'skladom', -- skladom / na_ceste (doručuje sa)
    expected_date DATE,                            -- predpokladané doručenie (ak na ceste)
    shipment_id   BIGINT,                          -- prichádzajúca zásielka (FK doplní ALTER nižšie)
    state         stock_state NOT NULL DEFAULT 'new',
    state_note    TEXT,                            -- napr. 'zničená koncovka'
    note          TEXT,                            -- skladová poznámka, napr. 'rezervované' / 'doručuje sa'
    buy_price     NUMERIC(18,8),                   -- nákupná cena tejto šarže
    buy_currency  TEXT REFERENCES currencies(code) DEFAULT 'CZK',
    buy_date      DATE,
    invoice_number TEXT,                           -- faktúra k nákupu
    counted_at    TIMESTAMPTZ,                     -- posledná inventúra
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lots_product   ON stock_lots (product_id);
CREATE INDEX idx_lots_warehouse ON stock_lots (warehouse_id);
CREATE INDEX idx_lots_state     ON stock_lots (state);

-- POHYBY ZÁSOB: príjemky (prijem), výdajky (vydaj) a korekcie z inventúry.
--  Každý príjem má doklad/faktúru; každý výdaj má doklad/objednávku/účel.
CREATE TYPE move_type AS ENUM ('prijem', 'vydaj', 'korekcia', 'presun');
CREATE TYPE move_via  AS ENUM ('fyzicky', 'zasielkou');

CREATE TABLE stock_movements (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    type         move_type NOT NULL,
    product_id   BIGINT REFERENCES products(id) ON DELETE SET NULL,
    lot_id       BIGINT REFERENCES stock_lots(id) ON DELETE SET NULL,
    quantity     NUMERIC NOT NULL,
    warehouse_id BIGINT REFERENCES warehouses(id) ON DELETE SET NULL,
    location_id  BIGINT REFERENCES warehouse_locations(id) ON DELETE SET NULL,
    user_id      BIGINT REFERENCES users(id) ON DELETE SET NULL,   -- kto
    happened_at  TIMESTAMPTZ NOT NULL DEFAULT now(),                -- kedy
    via          move_via,                                          -- fyzicky / zásielkou
    shipment_id  BIGINT,                                            -- ak cez zásielku (FK na shipments doplní ALTER nižšie)
    document     TEXT,                                              -- doklad / faktúra / objednávka
    purpose      TEXT,                                              -- účel výdaja
    note         TEXT
);
CREATE INDEX idx_moves_product ON stock_movements (product_id);
CREATE INDEX idx_moves_time    ON stock_movements (happened_at DESC);
CREATE INDEX idx_moves_type    ON stock_movements (type);

-- FIREMNÝ MAJETOK (inventár): tovar používaný na prácu, nie na predaj.
--  Môže odkazovať na existujúci produkt, alebo mať vlastný názov.
CREATE TABLE assets (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id   BIGINT REFERENCES products(id) ON DELETE SET NULL, -- voliteľne z katalógu
    name         TEXT,                        -- vlastný názov, ak nie je produkt
    assigned_to  TEXT,                         -- osoba alebo miesto
    location     TEXT,
    serial       TEXT,
    acquired_at  DATE,
    state        TEXT NOT NULL DEFAULT 'used', -- new / used / broken
    note         TEXT,
    CHECK (product_id IS NOT NULL OR name IS NOT NULL)
);

-- vlastné uložené filtre zásob (pre každého používateľa)
CREATE TABLE inventory_filters (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    definition JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- ---- ZÁSIELKY (zjednodušene) --------------------------------------
CREATE TABLE shipments (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tracking_number  TEXT UNIQUE NOT NULL,
    carrier          TEXT,
    direction        TEXT NOT NULL DEFAULT 'inbound', -- inbound / outbound / dropship
    status           TEXT,                    -- zisťuje sa automaticky z API prepravcu
    from_address     TEXT,
    to_address       TEXT,
    sender           TEXT,                    -- odosielateľ/dodávateľ (prichádzajúce)
    contents         TEXT,                    -- obsah zásielky (dopĺňaný priebežne)
    our_order        TEXT,                    -- naše číslo objednávky (odchádzajúce)
    expected_date    DATE,
    -- platba prichádzajúcich (my/dodávateľ)
    is_paid          BOOLEAN NOT NULL DEFAULT FALSE,
    paid_where       TEXT,                    -- kde/čím zaplatené
    invoice_number   TEXT,
    pay_amount       NUMERIC(18,8),
    pay_currency     TEXT REFERENCES currencies(code),   -- CZK/EUR/USD alebo krypto
    crypto_tx        TEXT,
    -- platba zákazníka (odchádzajúce)
    customer_payment TEXT,                    -- proforma / deposit (záloha+dobierka) / cod (dobierka)
    ship_cost        NUMERIC(18,8),           -- cena za prepravu (platíme my)
    ship_cost_cur    TEXT REFERENCES currencies(code) DEFAULT 'CZK',
    incoterm         TEXT,                    -- EXW/FCA/CPT/CIP/DAP/DPU/DDP/FOB/CIF ...
    -- colné konanie (môže byť aj mimo EU, napr. ČN→USA) — JDS
    customs          BOOLEAN NOT NULL DEFAULT FALSE,
    non_eu           BOOLEAN NOT NULL DEFAULT FALSE,
    jds_number       TEXT,                    -- napr. 26CZ600000CABG4DR4
    awb_number       TEXT,
    customs_value    NUMERIC(18,8),           -- colná hodnota tovaru (colný úrad má vlastné hodnoty)
    duty             NUMERIC(18,8),           -- clo
    processing_fee   NUMERIC(18,8),           -- poplatok prepravcu za spracovanie
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- obsah zásielky ako položky (produkt + množstvo); pri prebratí sa založia do skladu s QR
CREATE TABLE shipment_items (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    shipment_id BIGINT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    product_id  BIGINT REFERENCES products(id) ON DELETE SET NULL,
    quantity    NUMERIC NOT NULL DEFAULT 1
);

-- naše firmy (pre značku pod QR / web odkaz v QR)
CREATE TABLE companies (
    id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    web  TEXT
);
INSERT INTO companies (name, web) VALUES
 ('OneMiners','https://oneminers.com'),('Firma 2','https://firma2.example'),('Firma 3','https://firma3.example');

-- doplnenie FK pohyb -> zásielka (shipments je definované až tu)
ALTER TABLE stock_movements
  ADD CONSTRAINT fk_move_shipment FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE SET NULL;
-- doplnenie FK zásoba -> prichádzajúca zásielka (doručuje sa)
ALTER TABLE stock_lots
  ADD CONSTRAINT fk_lot_shipment FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE SET NULL;
-- pohyb má aj sériové číslo (kvôli detailu výdajky/príjemky)
ALTER TABLE stock_movements ADD COLUMN serial TEXT;

-- ---- SEED: meny a role --------------------------------------------
INSERT INTO currencies (code, name, type, decimals, is_primary) VALUES
 ('CZK','Česká koruna','fiat',2,TRUE),
 ('EUR','Euro','fiat',2,FALSE),
 ('USD','US dolár','fiat',2,FALSE),
 ('BTC','Bitcoin','crypto',8,FALSE),
 ('LTC','Litecoin','crypto',8,FALSE),
 ('KAS','Kaspa','crypto',8,FALSE),
 ('USDT','Tether','crypto',6,FALSE),
 ('USDC','USD Coin','crypto',6,FALSE),
 ('DOGE','Dogecoin','crypto',8,FALSE);

INSERT INTO roles (name) VALUES ('admin'),('user'),('visitor'),('external');

-- oprávnenia + predvolené mapovanie rolám
INSERT INTO permissions (code, module, description) VALUES
 ('product.view','sklad','Zobraziť produkty'),('product.edit','sklad','Pridať / upraviť produkt'),
 ('product.delete','sklad','Zmazať produkt'),('product.merge','sklad','Zlučovať duplicity'),
 ('price.edit','sklad','Upraviť cenu'),('inventory.view','sklad','Zobraziť zásoby'),
 ('inventory.move','sklad','Presun / transfer / príjem / výdaj'),('qr.scan','sklad','Skenovať QR / SN'),
 ('premium.view','sklad','Vidieť prémiové produkty'),('shipment.view','zasielky','Zobraziť zásielky'),
 ('shipment.edit','zasielky','Pridať / upraviť zásielku'),('shipment.payment','zasielky','Platba / faktúra'),
 ('user.manage','system','Správa používateľov'),('role.manage','system','Správa rolí'),('api.query','system','API dotaz (external)');

INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name='admin'), p.id FROM permissions p;
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name='user'), p.id FROM permissions p
WHERE p.code IN ('product.view','product.edit','price.edit','inventory.view','inventory.move','qr.scan','shipment.view','shipment.edit','shipment.payment');
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name='visitor'), p.id FROM permissions p
WHERE p.code IN ('product.view','inventory.view','shipment.view');
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name='external'), p.id FROM permissions p
WHERE p.code IN ('api.query');

-- hlavné kategórie
INSERT INTO categories (name) VALUES
 ('Spotrebný materiál'),('Komponenty'),('ASIC minery');
-- podkategórie (parent_id odkazuje na hlavné vyššie)
INSERT INTO categories (name, parent_id) VALUES
 ('Káble',           (SELECT id FROM categories WHERE name='Spotrebný materiál')),
 ('Konektory',       (SELECT id FROM categories WHERE name='Spotrebný materiál')),
 ('Pamäte',          (SELECT id FROM categories WHERE name='Komponenty')),
 ('Disky',           (SELECT id FROM categories WHERE name='Komponenty')),
 ('Základné dosky',  (SELECT id FROM categories WHERE name='Komponenty')),
 ('Kaspa',           (SELECT id FROM categories WHERE name='ASIC minery')),
 ('Bitcoin',         (SELECT id FROM categories WHERE name='ASIC minery'));

-- sklady + ich rozmiestnenie (code = krátke označenie, description = presný popis)
INSERT INTO warehouses (name, color) VALUES
 ('Rostovská 260/2b, Praha','#3b6fd4'),('Sklad Poděbrady','#2e9e5b'),('Sklad Michal střecha','#7a4fc0');

INSERT INTO warehouse_locations (warehouse_id, code, description, sort_order)
SELECT w.id, x.code, x.descr, x.ord FROM warehouses w
JOIN (VALUES
  ('Rostovská 260/2b, Praha','1','Rada 1',1),('Rostovská 260/2b, Praha','2','Rada 2',2),
  ('Rostovská 260/2b, Praha','3','Rada 3',3),('Rostovská 260/2b, Praha','4','Rada 4',4),
  ('Rostovská 260/2b, Praha','5','Rada 5',5),('Rostovská 260/2b, Praha','6','Rada 6',6),
  ('Rostovská 260/2b, Praha','Garáž','Garáž pri vjazde',7),('Rostovská 260/2b, Praha','Kancl','Kancelária na poschodí — u výťahu',8),
  ('Rostovská 260/2b, Praha','Reg. horný','Regál horný',9),('Rostovská 260/2b, Praha','Reg. spodný','Regál spodný',10),
  ('Sklad Poděbrady','A','Regál A',1),('Sklad Poděbrady','B','Regál B',2),('Sklad Poděbrady','Sklad','Hlavný priestor',3),
  ('Sklad Michal střecha','M1','Miestnosť 1',1),('Sklad Michal střecha','Polica','Polica pri vchode',2)
) AS x(wh,code,descr,ord) ON x.wh=w.name;

COMMIT;
