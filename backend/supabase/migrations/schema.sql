-- =====================================================================
--  SKLADOVÝ A ZÁSIELKOVÝ SYSTÉM  –  databázová schéma (PostgreSQL)
--  Verzia 1.0  ·  podľa ER diagramu zo špecifikácie
--  Spustenie:  psql -d nazov_db -f schema.sql
-- =====================================================================

BEGIN;

-- rozšírenia -----------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";     -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";      -- fulltext / LIKE indexy
CREATE EXTENSION IF NOT EXISTS "citext";       -- case-insensitive email

-- =====================================================================
--  ENUM TYPY
-- =====================================================================
CREATE TYPE module_scope       AS ENUM ('sklad', 'zasielky', 'oboje');
CREATE TYPE permission_module  AS ENUM ('sklad', 'zasielky', 'system');
CREATE TYPE image_source       AS ENUM ('upload', 'internet');
CREATE TYPE price_source       AS ENUM ('manual', 'internet');
CREATE TYPE unit_status        AS ENUM ('skladom', 'pending', 'na_ceste', 'odpisane', 'vydane');
CREATE TYPE qr_status          AS ENUM ('volny', 'priradeny', 'poskodeny', 'pretlaceny');
CREATE TYPE movement_type      AS ENUM ('prijem', 'presun', 'transfer', 'vydaj', 'odpis');
CREATE TYPE shipment_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE status_source      AS ENUM ('api', 'manual');
CREATE TYPE customs_type       AS ENUM ('import', 'export');
CREATE TYPE invoice_status     AS ENUM ('vystavena', 'zaplatena', 'stornovana');
CREATE TYPE actor_type         AS ENUM ('user', 'api_client', 'system');

-- =====================================================================
--  1) PRÍSTUP A ROLE (RBAC)
-- =====================================================================
CREATE TABLE users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name     TEXT        NOT NULL,
    email         CITEXT      UNIQUE NOT NULL,
    password_hash TEXT        NOT NULL,
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE roles (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        TEXT UNIQUE NOT NULL,
    description TEXT,
    is_system   BOOLEAN NOT NULL DEFAULT FALSE       -- admin/user/visitor/external
);

CREATE TABLE permissions (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        TEXT UNIQUE NOT NULL,                 -- napr. 'product.edit'
    module      permission_module NOT NULL,
    description TEXT
);

CREATE TABLE role_permissions (
    role_id       BIGINT NOT NULL REFERENCES roles(id)       ON DELETE CASCADE,
    permission_id BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
    user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id      BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    module_scope module_scope NOT NULL DEFAULT 'oboje',
    PRIMARY KEY (user_id, role_id)
);

-- ktorý používateľ vidí ktorý sklad (ak prázdne = všetky podľa oprávnení)
CREATE TABLE user_warehouse_access (
    user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    warehouse_id BIGINT NOT NULL,                     -- FK doplnené po vytvorení warehouses
    PRIMARY KEY (user_id, warehouse_id)
);

-- externé aplikácie / external prístup
CREATE TABLE api_clients (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name         TEXT NOT NULL,
    api_key_hash TEXT NOT NULL,
    role_id      BIGINT NOT NULL REFERENCES roles(id),
    allowed_ips  TEXT[],                              -- whitelist IP
    scope_json   JSONB NOT NULL DEFAULT '{}'::jsonb,  -- na čo sa smie pýtať
    rate_limit   INTEGER NOT NULL DEFAULT 1000,       -- req / hod
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
--  2) ADRESY  (zdieľané skladom aj zásielkami)
-- =====================================================================
CREATE TABLE addresses (
    id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name     TEXT,
    company  TEXT,
    street   TEXT,
    city     TEXT,
    zip      TEXT,
    country  TEXT,
    contact  TEXT,
    phone    TEXT,
    email    TEXT
);

-- =====================================================================
--  3) SKLAD
-- =====================================================================
CREATE TABLE warehouses (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name       TEXT NOT NULL,
    address_id BIGINT REFERENCES addresses(id),
    is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

-- dodatočný FK z user_warehouse_access
ALTER TABLE user_warehouse_access
    ADD CONSTRAINT fk_uwa_warehouse
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE;

-- pozície v sklade (strom + súradnice na vizualizáciu)
CREATE TABLE locations (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    warehouse_id       BIGINT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    code               TEXT NOT NULL,                 -- napr. 'A-03'
    name               TEXT,                          -- napr. 'Regál A, polica 3'
    parent_location_id BIGINT REFERENCES locations(id) ON DELETE SET NULL,
    pos_x              NUMERIC,
    pos_y              NUMERIC,
    UNIQUE (warehouse_id, code)
);

CREATE TABLE categories (
    id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name      TEXT NOT NULL,
    parent_id BIGINT REFERENCES categories(id) ON DELETE SET NULL
);

-- katalógová položka (typ produktu)
CREATE TABLE products (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sku          TEXT UNIQUE,
    name         TEXT NOT NULL,
    description  TEXT,
    category_id  BIGINT REFERENCES categories(id) ON DELETE SET NULL,
    is_virtual   BOOLEAN NOT NULL DEFAULT FALSE,
    is_composite BOOLEAN NOT NULL DEFAULT FALSE,
    is_premium   BOOLEAN NOT NULL DEFAULT FALSE,      -- skrytie pred časťou rolí
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE product_images (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    path       TEXT NOT NULL,                         -- cesta v úložisku alebo URL
    source     image_source NOT NULL DEFAULT 'upload',
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0
);

-- história cien + kto / odkiaľ / kedy  (obsah ikony "i")
CREATE TABLE product_prices (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id    BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    price         NUMERIC(14,2) NOT NULL,
    currency      CHAR(3) NOT NULL DEFAULT 'EUR',
    source        price_source NOT NULL DEFAULT 'manual',
    set_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    source_url    TEXT,
    valid_from    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- kusovník (BOM) – zložené produkty
CREATE TABLE product_components (
    parent_product_id    BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    component_product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity             NUMERIC NOT NULL DEFAULT 1,
    PRIMARY KEY (parent_product_id, component_product_id),
    CHECK (parent_product_id <> component_product_id)
);

-- konkrétny fyzický kus (identifikovaný QR, môže mať status na ceste)
CREATE TABLE inventory_units (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id            BIGINT NOT NULL REFERENCES products(id)   ON DELETE RESTRICT,
    warehouse_id          BIGINT REFERENCES warehouses(id)          ON DELETE SET NULL,
    location_id           BIGINT REFERENCES locations(id)           ON DELETE SET NULL,
    status                unit_status NOT NULL DEFAULT 'skladom',
    expected_delivery_date DATE,
    shipment_id           BIGINT,                     -- FK doplnené po shipments
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- jeden kus môže mať viac sériových čísel
CREATE TABLE serial_numbers (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    inventory_unit_id BIGINT NOT NULL REFERENCES inventory_units(id) ON DELETE CASCADE,
    serial            TEXT NOT NULL,
    type              TEXT,                            -- napr. 'výrobné', 'MAC', ...
    UNIQUE (serial, type)
);

-- várky predpripravených QR kódov
CREATE TABLE qr_batches (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name       TEXT,
    count      INTEGER NOT NULL DEFAULT 0,
    printed_at TIMESTAMPTZ,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE qr_codes (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code              TEXT UNIQUE NOT NULL,
    batch_id          BIGINT REFERENCES qr_batches(id) ON DELETE SET NULL,
    status            qr_status NOT NULL DEFAULT 'volny',
    inventory_unit_id BIGINT UNIQUE REFERENCES inventory_units(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- hromadné (nesériové) zásoby – množstevne
CREATE TABLE stock_levels (
    product_id   BIGINT NOT NULL REFERENCES products(id)   ON DELETE CASCADE,
    warehouse_id BIGINT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    location_id  BIGINT REFERENCES locations(id)           ON DELETE SET NULL,
    quantity     NUMERIC NOT NULL DEFAULT 0,
    PRIMARY KEY (product_id, warehouse_id, location_id)
);

-- pohyby: príjem, presun, transfer, výdaj, odpis
CREATE TABLE stock_movements (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    inventory_unit_id BIGINT REFERENCES inventory_units(id) ON DELETE SET NULL,
    product_id        BIGINT REFERENCES products(id)        ON DELETE SET NULL,
    quantity          NUMERIC NOT NULL DEFAULT 1,
    type              movement_type NOT NULL,
    from_warehouse_id BIGINT REFERENCES warehouses(id),
    from_location_id  BIGINT REFERENCES locations(id),
    to_warehouse_id   BIGINT REFERENCES warehouses(id),
    to_location_id    BIGINT REFERENCES locations(id),
    user_id           BIGINT REFERENCES users(id) ON DELETE SET NULL,
    shipment_id       BIGINT,                     -- FK doplnené po shipments
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (inventory_unit_id IS NOT NULL OR product_id IS NOT NULL)
);

-- uložené / zdieľané filtre (používateľské aj adminom definované)
CREATE TABLE saved_filters (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name            TEXT NOT NULL,
    user_id         BIGINT REFERENCES users(id) ON DELETE CASCADE,
    role_id         BIGINT REFERENCES roles(id) ON DELETE CASCADE,
    definition_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_shared       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
--  4) ZÁSIELKY
-- =====================================================================
CREATE TABLE carriers (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name                  TEXT NOT NULL,
    api_type              TEXT,                        -- 'dhl','ups','gls','packeta','aggregator'...
    tracking_url_template TEXT,                        -- napr. https://.../{tracking}
    api_config_json       JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE invoices (
    id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number    TEXT UNIQUE NOT NULL,
    amount    NUMERIC(14,2),
    currency  CHAR(3) NOT NULL DEFAULT 'EUR',
    status    invoice_status NOT NULL DEFAULT 'vystavena',
    issued_at DATE
);

CREATE TABLE shipments (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tracking_number       TEXT UNIQUE NOT NULL,
    carrier_id            BIGINT REFERENCES carriers(id),
    direction             shipment_direction NOT NULL,
    status                TEXT,                        -- posledný známy stav
    status_source         status_source NOT NULL DEFAULT 'api',
    from_address_id       BIGINT REFERENCES addresses(id),
    to_address_id         BIGINT REFERENCES addresses(id),
    expected_delivery_date DATE,
    delivered_at          TIMESTAMPTZ,
    is_paid               BOOLEAN NOT NULL DEFAULT FALSE,
    invoice_id            BIGINT REFERENCES invoices(id) ON DELETE SET NULL,
    replaced_by_shipment_id BIGINT REFERENCES shipments(id) ON DELETE SET NULL,
    created_by            BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- história stavov (z API prepravcu alebo ručne)
CREATE TABLE shipment_events (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    shipment_id BIGINT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    status      TEXT NOT NULL,
    description TEXT,
    location    TEXT,
    event_time  TIMESTAMPTZ NOT NULL,
    source      status_source NOT NULL DEFAULT 'api',
    raw_payload JSONB
);

-- čo je v zásielke (väzba na sklad – pending položky)
CREATE TABLE shipment_items (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    shipment_id       BIGINT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    product_id        BIGINT REFERENCES products(id) ON DELETE SET NULL,
    inventory_unit_id BIGINT REFERENCES inventory_units(id) ON DELETE SET NULL,
    quantity          NUMERIC NOT NULL DEFAULT 1
);

CREATE TABLE customs_declarations (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    shipment_id        BIGINT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    declaration_number TEXT,
    type               customs_type NOT NULL,
    value              NUMERIC(14,2),
    currency           CHAR(3) DEFAULT 'EUR',
    duty               NUMERIC(14,2),
    vat                NUMERIC(14,2),
    status             TEXT,
    document_path      TEXT,
    created_by         BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- doplnenie FK, ktoré záviseli na shipments
ALTER TABLE inventory_units
    ADD CONSTRAINT fk_iu_shipment FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE SET NULL;
ALTER TABLE stock_movements
    ADD CONSTRAINT fk_sm_shipment FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE SET NULL;

-- =====================================================================
--  5) LOGY A AUDIT
-- =====================================================================
CREATE TABLE audit_logs (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_type   TEXT NOT NULL,
    entity_id     BIGINT,
    action        TEXT NOT NULL,                       -- create/update/delete
    actor_type    actor_type NOT NULL DEFAULT 'user',
    user_id       BIGINT REFERENCES users(id)      ON DELETE SET NULL,
    api_client_id BIGINT REFERENCES api_clients(id) ON DELETE SET NULL,
    old_values    JSONB,
    new_values    JSONB,
    ip            INET,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE activity_logs (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
    action     TEXT NOT NULL,
    context    JSONB,
    ip         INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
--  6) INDEXY  (vyhľadávanie podľa viacerých kritérií)
-- =====================================================================
CREATE INDEX idx_products_name_trgm    ON products     USING gin (name gin_trgm_ops);
CREATE INDEX idx_products_category     ON products     (category_id);
CREATE INDEX idx_units_product         ON inventory_units (product_id);
CREATE INDEX idx_units_warehouse       ON inventory_units (warehouse_id);
CREATE INDEX idx_units_status          ON inventory_units (status);
CREATE INDEX idx_serial_serial_trgm    ON serial_numbers USING gin (serial gin_trgm_ops);
CREATE INDEX idx_qr_code               ON qr_codes     (code);
CREATE INDEX idx_movements_unit        ON stock_movements (inventory_unit_id);
CREATE INDEX idx_movements_created     ON stock_movements (created_at);
CREATE INDEX idx_shipments_tracking    ON shipments    (tracking_number);
CREATE INDEX idx_shipments_status      ON shipments    (status);
CREATE INDEX idx_shipment_events_ship  ON shipment_events (shipment_id, event_time);
CREATE INDEX idx_prices_product        ON product_prices (product_id, valid_from DESC);
CREATE INDEX idx_audit_entity          ON audit_logs   (entity_type, entity_id);
CREATE INDEX idx_activity_user         ON activity_logs (user_id, created_at);

COMMIT;
