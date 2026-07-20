# Štruktúra aplikácie (index.html) — mapa na odkazovanie

Keď chceš niečo zmeniť, staačí napísať kód sekcie, napr. **„Z3 filter skladu"** alebo
**„PF-EAN"**. Nižšie je mapa stránok, ich častí a názvov funkcií v kóde.

---

## Rozloženie
- **Bočné menu (PC)** = `#sidebar` — skupiny: Sklad / Zásielky / Doklady / Administrácia.
- **Horné taby (mobil)** = `.tabs` (zjednodušené: Príjem, Zásoby, Zásielky, + Produkty pre admina).
- **Hlavička stránky** = `#pageTitle` + `#pageSub`.
- **Obsah** = `#view`. Prepínanie: `setTab("<kód>")`.

Kódy tabov: `recv` (Príjem), `issue` (Výdaj), `stock` (Zásoby), `prods` (Produkty),
`ship` (Zásielky), `docs` (Doklady), `qr` (Tlač QR), `cats` (Kategórie a tagy),
`dupes` (Duplicity), `admin` (Správa).

---

## PR — Príjem na sklad  (funkcia `renderRecv`)
- **PR1 Vyhľadanie/sken produktu** — `#r_q`, `rSearch()`, `rScanSearch()`
- **PR2 + Nový produkt** — `recvNewProduct()` → otvorí plný formulár produktu (rovnaký ako v Produktoch), po uložení sa vráti do príjmu
- **PR3 Rozpoznať z fotky (AI)** — `aiPick()` (potrebuje edge funkciu `identify-product`)
- **PR4 Formulár príjmu** — sklad/pozícia, evidencia (kus/množstvo), stav + popis stavu, SN, QR, doklad, fotodokumentácia
- **PR5 Sériové čísla (viac)** — `rAddSerial()`, `rSerialCrop()` (orezaná fotka SN → `lot_serials`)
- **PR6 Opakovaný príjem** — checkbox `#r_again`
- **PR7 História príjemiek** — `loadRecvHistory()`
- Uloženie: `rSave()`

## VY — Výdaj  (funkcia `renderIssue`)
- **VY1 Hľadať položku** — `#i_q`, `iSearch()`, `iPick()`
- **VY2 Formulár výdaja** — množstvo, spôsob, účel, doklad → `iDo()`

## Z — Zásoby  (funkcie `loadStock` → `renderStock`)
- **Z1 Akčné tlačidlá** — + Príjem, − Výdaj, 🗺️ Rozmiestnenie (`openPlacement`), Export (`stockExport`)
- **Z2 Filtre** — hľadať, sklad, kategória, podkategória, stav, značka, tag  (objekt `sf`)
- **Z3 Uložené filtre** — `sfSaveNew` / `sfLoad` / `sfManage` / `sfReset`
- **Z4 Výber (checkboxy)** — `toggleStockSel`, „Označiť filtrované" `stockSelAll`
- **Z5 Tabuľka** — zoskupené po produkte, rozbaliteľné šarže (`toggleExp`), stĺpce Produkt/Sklad/Pozícia/Množstvo/Stav/Nákup
- **Z6 Podfarbenie skladov** — `whChip()`
- Klik na produkt → **detail** `prodDetail()`

## PD — Detail produktu  (funkcia `prodDetail`)
- fotka, značka, kategória, cena s **ⓘ** (`priceInfo`) + **💰 Zmeniť cenu** (`prodChangePrice`)
- parametre podľa kategórie (`productAttrList`), tagy, šarže na sklade
- **✏️ Upraviť** → `prodForm`

## P — Produkty  (funkcia `renderProds`)
- **P1 Akcie** — + Nový produkt (`prodForm(0)`), Export CSV (`prodExport`)
- **P2 Filtre** — hľadať, kategória, podkategória, značka, tag  (objekt `pf`)
- **P3 Tabuľka** — fotka (hover-zoom), názov, značka, kategória, cena (ⓘ), Upraviť/Zmazať
- klik na riadok → detail

## PF — Formulár produktu  (funkcia `prodForm`)
- **PF-EAN** — pole EAN + 📷 Skenovať (`pScanBarcode`) + 🌐 Dohľadať (`pLookupNow`) + 🔍 AI (`pAiPhoto`)
  - auto-doplní názov, značku, fotku, cenu, parametre-text; auto-vyberie kategóriu a tagy (`pApplyClassify`, `classifyProduct`)
- **PF1** názov, značka, model
- **PF2** kategória → dynamické **parametre** (`renderProdAttrs`, `attrDefsForCat`)
- **PF3** cena/mena, hmotnosť, krátky + podrobný popis
- **PF4** fotka (`pPhoto`)
- **PF5** tagy s vyhľadávaním (`renderPTags`, `#p_tagq`)
- Uloženie: `pSave()`

## ZA — Zásielky  (funkcia `renderShip`)
- **ZA1 Zoznam + filtre** — smer, hľadanie (`shipList`)
- **ZA2 Nová zásielka** — `shipForm` (tracking, prepravca, ETA, obsah, položky, colné JDS/incoterm/AWB, platba)
- **ZA3 Detail** — `shipDetail`, mazanie `shipDelete`

## DO — Doklady  (funkcia `loadDocs`)
- filtre Všetko / Príjemky / Výdajky (`docFilter`)

## QR — Tlač QR kódov  (funkcia `renderQR`)
- **QR1 Nastavenie tlače** — veľkosť 2/3/4 cm, počet rovnakých (1–4), rezacie čiary
- **QR2 Zásobník** — pridať všeobecné (`qrAddGeneric`) alebo pre produkt (`qrAddProduct`)
- **QR3 Údržba** — voľné kódy (`qrPrintFree`), premazať nepoužité (`qrDeleteFree`)
- Hárok na tlač: `qrRenderSheet()`

## KT — Kategórie a tagy (admin)  (funkcia `renderCats`)
- **KT1 Strom kategórií** — pridať podkat. (`catAddChild`), premenovať (`catRename`), zmazať (`catDelete`)
- **KT2 Presunúť** — `catMove`; **KT3 Zlúčiť** — `catMerge`
- **KT4 Parametre kategórie** — `caAdd` / `caDel` (definície polí `attribute_defs`)
- **KT5 Tagy** — `tagAdd` / `tagRename` / `tagDelete` / `tagMerge`

## DU — Duplicity (admin)  (funkcia `renderDupes`)
- nájde produkty s rovnakým názvom, zlúčenie `dupMergeGroup` → `prodMerge`

## SP — Správa (admin)  (funkcia `renderSettings`)
- sklady, pozície, používatelia + role (`sSetRole`)

## RM — Rozmiestnenie skladu (modal)  (funkcia `renderPlacement`)
- sklady (`plAddWh`/`plDelWh`), farba (`plColor`), pozície (`plAddLoc`/`plEditLoc`/`plDelLoc`)

---

## Databáza (Supabase) — hlavné tabuľky
`products`, `product_attributes`, `attribute_defs`, `product_tags`, `product_aliases`,
`categories`, `brands`, `tags`, `warehouses`, `warehouse_locations`,
`stock_lots`, `lot_serials`, `lot_photos`, `stock_movements`,
`shipments`, `shipment_items`, `qr_codes`, `assets`, `profiles`, `roles`, `permissions`, `role_permissions`.

## SQL súbory (spustiť v Supabase SQL editore)
- `schema_basic.sql` — celá schéma
- `supabase_auth_rls.sql` — profily, prihlásenie, RLS oprávnenia
- `supabase_categories_seed.sql` — kategórie/podkategórie + tagy
- `supabase_attributes_seed.sql` — parametre podľa kategórie
- `supabase_price_source.sql` — zdroj + dátum ceny
- `supabase_lot_serials.sql` — sériové čísla položky (viac + fotka)
- `supabase_photos.sql` — bucket fotiek + `lot_photos`
- `supabase_qr_codes.sql` — predpripravené QR kódy
- `supabase_fix_moves_update.sql` — presun pohybov pri zlučovaní duplicít
- `supabase_wipe_data.sql` — premazanie dát (test)

## Edge funkcie
- `lookup-barcode` (`edge_function_lookup-barcode.ts`) — dohľadanie podľa EAN (názov, značka, fotka, cena, parametre); secret `ICECAT_USER`
- `identify-product` (`edge_function_identify-product.ts`) — rozpoznanie z fotky (AI); secret `ANTHROPIC_API_KEY`
