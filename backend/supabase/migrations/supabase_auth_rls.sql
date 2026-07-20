-- =====================================================================
--  SUPABASE — AUTH PROFILY + RLS OPRÁVNENIA (podľa rolí)
--  Poradie spustenia v Supabase SQL editore:
--    1) schema_basic.sql   (dátové tabuľky + seed rolí/oprávnení)
--    2) tento súbor        (profily naviazané na prihlásenie + RLS)
--
--  Model prístupu:
--    - Každý prihlásený používateľ má záznam v `profiles` (naviazaný na auth.users).
--    - profiles.role = 'admin' | 'user' | 'visitor' | 'external'
--    - Oprávnenia sa odvodzujú z tabuliek roles + role_permissions + permissions
--      (naplnené v schema_basic.sql). Rolu meníš zmenou profiles.role.
--    - Čítanie: každý prihlásený vidí katalóg/zásoby (visitor = len čítanie).
--    - Zápis: iba ak rola má príslušné oprávnenie (product.edit, inventory.move, ...).
--    - Admin tabuľky (roly, oprávnenia, profily, meny, firmy) mení len admin.
-- =====================================================================

-- =========================================================
--  1) PROFILY (naviazané na Supabase Auth)
-- =========================================================
CREATE TABLE IF NOT EXISTS profiles (
    id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name    TEXT,
    role         TEXT NOT NULL DEFAULT 'visitor',   -- admin / user / visitor / external
    module_scope TEXT NOT NULL DEFAULT 'oboje',      -- sklad / zasielky / oboje
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- automatické založenie profilu po registrácii (predvolene visitor)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), 'visitor')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =========================================================
--  2) POMOCNÉ FUNKCIE (rola a oprávnenia prihláseného)
-- =========================================================
CREATE OR REPLACE FUNCTION current_role_name()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(current_role_name() = 'admin', FALSE);
$$;

-- má prihlásený používateľ dané oprávnenie? (podľa jeho roly)
CREATE OR REPLACE FUNCTION has_perm(p_code TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles pr
    JOIN public.roles r            ON r.name = pr.role
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p       ON p.id = rp.permission_id
    WHERE pr.id = auth.uid() AND p.code = p_code
  );
$$;

-- =========================================================
--  3) ZAPNUTIE RLS
-- =========================================================
ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE currencies            ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies             ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands                ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories            ENABLE ROW LEVEL SECURITY;
ALTER TABLE attribute_defs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag_categories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE products              ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_aliases       ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_tags          ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_attributes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_components    ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_locations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_lots            ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_filters     ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets                ENABLE ROW LEVEL SECURITY;

-- =========================================================
--  4) POLITIKY
--  Konvencia: SELECT = každý prihlásený (authenticated).
--             Zápis = podľa oprávnenia; admin tabuľky len admin.
-- =========================================================

-- ---- profiles: každý vidí a upravuje svoj profil; admin všetko ----
CREATE POLICY profiles_self_select ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR is_admin());
CREATE POLICY profiles_self_update ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR is_admin()) WITH CHECK (id = auth.uid() OR is_admin());
CREATE POLICY profiles_admin_all ON profiles FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- ---- číselníky viditeľné všetkým prihláseným ----
CREATE POLICY currencies_read   ON currencies         FOR SELECT TO authenticated USING (true);
CREATE POLICY brands_read       ON brands             FOR SELECT TO authenticated USING (true);
CREATE POLICY categories_read   ON categories         FOR SELECT TO authenticated USING (true);
CREATE POLICY attrdefs_read     ON attribute_defs     FOR SELECT TO authenticated USING (true);
CREATE POLICY tags_read         ON tags               FOR SELECT TO authenticated USING (true);
CREATE POLICY tagcats_read      ON tag_categories     FOR SELECT TO authenticated USING (true);
CREATE POLICY companies_read    ON companies          FOR SELECT TO authenticated USING (true);
CREATE POLICY roles_read        ON roles              FOR SELECT TO authenticated USING (true);
CREATE POLICY perms_read        ON permissions        FOR SELECT TO authenticated USING (true);
CREATE POLICY roleperms_read    ON role_permissions   FOR SELECT TO authenticated USING (true);

-- ---- admin-only zápis do číselníkov a nastavení ----
CREATE POLICY currencies_admin  ON currencies       FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY brands_admin      ON brands           FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY categories_admin  ON categories       FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY attrdefs_admin    ON attribute_defs   FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY tags_admin        ON tags             FOR ALL TO authenticated USING (has_perm('product.edit')) WITH CHECK (has_perm('product.edit'));
CREATE POLICY tagcats_admin     ON tag_categories   FOR ALL TO authenticated USING (has_perm('product.edit')) WITH CHECK (has_perm('product.edit'));
CREATE POLICY companies_admin   ON companies        FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY roles_admin       ON roles            FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY perms_admin       ON permissions      FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY roleperms_admin   ON role_permissions FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- ---- PRODUKTY ----
CREATE POLICY products_read   ON products FOR SELECT TO authenticated USING (has_perm('product.view'));
CREATE POLICY products_ins    ON products FOR INSERT TO authenticated WITH CHECK (has_perm('product.edit'));
CREATE POLICY products_upd    ON products FOR UPDATE TO authenticated USING (has_perm('product.edit')) WITH CHECK (has_perm('product.edit'));
CREATE POLICY products_del    ON products FOR DELETE TO authenticated USING (has_perm('product.delete'));

-- súvisiace tabuľky produktov (read = view, zápis = product.edit)
CREATE POLICY palias_read ON product_aliases    FOR SELECT TO authenticated USING (has_perm('product.view'));
CREATE POLICY palias_wr   ON product_aliases    FOR ALL    TO authenticated USING (has_perm('product.edit')) WITH CHECK (has_perm('product.edit'));
CREATE POLICY ptags_read  ON product_tags       FOR SELECT TO authenticated USING (has_perm('product.view'));
CREATE POLICY ptags_wr    ON product_tags       FOR ALL    TO authenticated USING (has_perm('product.edit')) WITH CHECK (has_perm('product.edit'));
CREATE POLICY pattr_read  ON product_attributes FOR SELECT TO authenticated USING (has_perm('product.view'));
CREATE POLICY pattr_wr    ON product_attributes FOR ALL    TO authenticated USING (has_perm('product.edit')) WITH CHECK (has_perm('product.edit'));
CREATE POLICY pcomp_read  ON product_components FOR SELECT TO authenticated USING (has_perm('product.view'));
CREATE POLICY pcomp_wr    ON product_components FOR ALL    TO authenticated USING (has_perm('product.edit')) WITH CHECK (has_perm('product.edit'));

-- ---- SKLADY A ROZMIESTNENIE ----
CREATE POLICY wh_read     ON warehouses          FOR SELECT TO authenticated USING (has_perm('inventory.view'));
CREATE POLICY wh_admin    ON warehouses          FOR ALL    TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY loc_read    ON warehouse_locations FOR SELECT TO authenticated USING (has_perm('inventory.view'));
CREATE POLICY loc_wr      ON warehouse_locations FOR ALL    TO authenticated USING (has_perm('inventory.move')) WITH CHECK (has_perm('inventory.move'));

-- ---- ZÁSOBY (šarže) ----
CREATE POLICY lots_read ON stock_lots FOR SELECT TO authenticated USING (has_perm('inventory.view'));
CREATE POLICY lots_ins  ON stock_lots FOR INSERT TO authenticated WITH CHECK (has_perm('inventory.move'));
CREATE POLICY lots_upd  ON stock_lots FOR UPDATE TO authenticated USING (has_perm('inventory.move')) WITH CHECK (has_perm('inventory.move'));
CREATE POLICY lots_del  ON stock_lots FOR DELETE TO authenticated USING (has_perm('inventory.move'));

-- ---- POHYBY (príjemky/výdajky) — vkladajú sa, nemažú ----
CREATE POLICY moves_read ON stock_movements FOR SELECT TO authenticated USING (has_perm('inventory.view'));
CREATE POLICY moves_ins  ON stock_movements FOR INSERT TO authenticated WITH CHECK (has_perm('inventory.move'));

-- ---- ULOŽENÉ FILTRE ----
-- pozn.: inventory_filters.user_id je bigint (app users), nie auth uuid,
--        preto gate cez oprávnenie, nie cez auth.uid().
CREATE POLICY invf_read ON inventory_filters FOR SELECT TO authenticated USING (has_perm('inventory.view'));
CREATE POLICY invf_wr   ON inventory_filters FOR ALL    TO authenticated USING (has_perm('inventory.view')) WITH CHECK (has_perm('inventory.view'));

-- ---- ZÁSIELKY ----
CREATE POLICY ship_read  ON shipments FOR SELECT TO authenticated USING (has_perm('shipment.view'));
CREATE POLICY ship_wr    ON shipments FOR ALL    TO authenticated USING (has_perm('shipment.edit')) WITH CHECK (has_perm('shipment.edit'));
CREATE POLICY shipit_read ON shipment_items FOR SELECT TO authenticated USING (has_perm('shipment.view'));
CREATE POLICY shipit_wr   ON shipment_items FOR ALL    TO authenticated USING (has_perm('shipment.edit')) WITH CHECK (has_perm('shipment.edit'));

-- ---- FIREMNÝ MAJETOK ----
CREATE POLICY assets_read ON assets FOR SELECT TO authenticated USING (has_perm('product.view'));
CREATE POLICY assets_wr   ON assets FOR ALL    TO authenticated USING (has_perm('product.edit')) WITH CHECK (has_perm('product.edit'));

-- =====================================================================
--  5) NASTAVENIE PRVÉHO ADMINA (po prvom prihlásení)
--     Zaregistruj sa v aplikácii, potom spusti (nahraď email):
--       UPDATE profiles SET role='admin'
--       WHERE id = (SELECT id FROM auth.users WHERE email='ty@firma.cz');
-- =====================================================================
