# SQL — poradie spúšťania

Súbory sú ponechané pod pôvodnými názvami (nie sú premenované na časové migrácie), aby sa
zhodovali s históriou vývoja. Spúšťaj ich v Supabase **SQL editore** v tomto poradí.

## 1. Schéma a oprávnenia (povinné)
1. `schema_basic.sql` — celá schéma (kanonická)
2. `supabase_auth_rls.sql` — profily, prihlásenie, RLS oprávnenia podľa rolí

## 2. Seedy taxonómie (odporúčané)
3. `supabase_categories_seed.sql` — kategórie/podkategórie + tagy
4. `supabase_attributes_seed.sql` — parametre podľa kategórie
5. `supabase_seed_products.sql` — ukážkové produkty (voliteľné)

## 3. Doplnky funkcií (podľa potreby, v tomto poradí)
6. `supabase_price_source.sql` — zdroj + dátum ceny
7. `supabase_lot_serials.sql` — sériové čísla položky (viac + fotka)
8. `supabase_photos.sql` — bucket fotiek + `lot_photos`
9. `supabase_qr_codes.sql` — predpripravené QR kódy
10. `supabase_carrier_sync.sql` — tabuľka synchronizácie prepravcov
11. `supabase_shipment_tracking.sql`
12. `supabase_shipment_extra.sql`
13. `supabase_shipment_label.sql`
14. `supabase_repairs.sql` — opravy/reklamácie
15. `supabase_repair_events.sql` — nemenný (append-only) denník krokov
16. `supabase_assets_v2.sql` — firemný majetok (správca/miestnosť/užívateľ)
17. `supabase_roles_v2.sql` — rozšírená sada rolí + oprávnenia + RLS
18. `supabase_user_admin.sql` — rozšírenie profilov pre správu používateľov

## 4. Opravné skripty (spusti len ak treba)
- `supabase_fix_rbac.sql`
- `supabase_fix_policies.sql`
- `supabase_fix_moves_update.sql`
- `supabase_fix_moves_delete.sql`
- `supabase_fix_states.sql`

## 5. Demo dáta (voliteľné, testovacie prostredie)
- `supabase_demo_data.sql`
- `supabase_demo_repairs_shipments.sql`

## 6. Údržba (POZOR — deštruktívne)
- `supabase_wipe_data.sql` — zmaže dáta. Spúšťať iba v testovacom prostredí.

---

### Staršie súbory (nepoužívať v novom nasadení)
- `schema.sql` — staršia verzia schémy (nahradená `schema_basic.sql`)
- `seed.sql` — starší seed
