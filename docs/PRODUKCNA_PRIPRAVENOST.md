# Produkčná pripravenosť — sklad & zásielky

Cieľ: z testovacej appky (`index.html` + Supabase) spraviť ostrú verziu, kde je **každá funkcia 100 % funkčná a otestovaná**. Tento dokument je kontrolný zoznam, čo je hotové, čo treba dorobiť a čo overiť.

---

## 1. Čo je hotové a beží naživo (Supabase + GitHub Pages)

- Prihlásenie (Supabase Auth) + role (admin/user/visitor/external) s RLS oprávneniami.
- **Príjem** na sklad (kus/množstvo, SN, QR, doklad) → zápis do `stock_lots` + príjemka do `stock_movements`.
- **Výdaj** (nájdenie položky, množstvo, spôsob, účel, doklad) → úprava/odobratie + výdajka.
- **Zásoby** — zoskupené podľa produktu.
- **Produkty** — zoznam, filtre (kategória, značka), pridanie/úprava; nový produkt aj počas príjmu.
- **Doklady** — história pohybov (príjemky/výdajky).
- **Správa (admin)** — sklady, pozície, kategórie, role používateľov (data-driven, bez uploadu).
- **Skenovanie** — QR aj čiarové kódy; zoom, prisvietenie, dekódovanie z fotky.

## 2. Musí sa dorobiť do ostrej verzie (funkčné medzery)

- [ ] **Audit „kto, kedy, čo"** — pohyby aktuálne neukladajú prihláseného používateľa (nesúlad typov: `profiles.id` je UUID, `stock_movements.user_id` je BIGINT zo starej tabuľky `users`). Riešenie: pridať `created_by uuid references auth.users` do `stock_lots` aj `stock_movements` a appka ho nastaví. (kľúčové pre ostrú prevádzku)
- [ ] **Zásielky** — celý modul zatiaľ nie je v online appke (je len v lokálnom `prototyp.html`). Doplniť: príchodzie/odchádzajúce/dropship, platby, colné (JDS/AWB/incoterm), obsah = položky, prijatie na sklad s QR, filtre.
- [ ] **Inventúra** — cyklus (mesačne/ročne), spočítanie, korekcie do histórie.
- [ ] **Firemný majetok (inventár)**.
- [ ] **Tlač QR** — listy predtlačených kódov (jedinečné/rovnaké, rezacie čiary, značka firmy/web).
- [ ] **História cien** produktu (kto/kedy/zdroj).
- [ ] **Zlučovanie duplicít** + aliasy (v online verzii).
- [ ] **Rozpoznanie z fotky (AI)** — Edge Function `identify-product` (návrh priložený) + napojenie v appke.
- [ ] **Presuny** medzi skladmi/pozíciami a hromadné úpravy v online verzii.

## 3. Dátový model — úpravy pred produkciou

- [ ] `created_by uuid` na `stock_lots`, `stock_movements` (audit).
- [ ] Zvážiť `barcode`/`ean` ako samostatné pole produktu (teraz sa používa `sku`).
- [ ] Zjednotiť „používateľov": buď zrušiť starú `users` (BIGINT) a všade používať `profiles` (UUID), alebo jasne oddeliť.
- [ ] Indexy pre vyhľadávanie (SKU, názov, tracking, SN) — časť je v schéme, doplniť podľa reálnych dotazov.

## 4. Bezpečnosť (pred ostrým nasadením — revízia od odborníka)

- [ ] Prejsť **všetky RLS politiky** (čítanie/zápis podľa rolí; žiadny únik dát pre visitor/external).
- [ ] Overiť, že `external` nemá prístup k interným tabuľkám (len povolené dotazy).
- [ ] V appke je len **publishable/anon kľúč** (OK). `service_role` NIKDY vo frontende ani v repozitári.
- [ ] Zapnúť zálohy (na free tieri nie sú — na platenom Pro áno: denné zálohy).
- [ ] Rate-limiting a validácia vstupov v Edge Functions.
- [ ] Politika hesiel, potvrdenie e-mailu, prípadne 2FA pre admina.

## 5. Testovanie (reálne zariadenia)

- [ ] Skenovanie na **reálnych telefónoch** (Android Chrome, iOS Safari) — malé čiarové kódy, zoom, torch, „odfotiť kód".
- [ ] Príjem/výdaj/inventúra end-to-end na mobile aj PC so zdieľanými dátami.
- [ ] Súbežná práca viacerých používateľov (dvaja naraz menia zásoby).
- [ ] Chybové stavy (výpadok siete, neplatné dáta) — appka nesmie „spadnúť" ticho.

## 6. Prechod test → ostrá verzia

1. V platenom Supabase spusti: `schema_basic.sql` → `supabase_auth_rls.sql` → (voliteľne) `supabase_seed_products.sql`.
2. Spusti migračné doplnky (audit `created_by`, prípadne `barcode`).
3. V `index.html` vymeň `SUPA_URL` a `SUPA_KEY` na ostrý projekt.
4. Vymaž testovacie dáta (`stock_lots`, `stock_movements`, testovacie produkty) — alebo začni s čistou DB.
5. Nasadenie appky (GitHub Pages / Vercel / Netlify) + doména.
6. Bezpečnostná revízia (bod 4) → až potom ostrá prevádzka.

---

### Odporúčané poradie prác
1. Audit `created_by` (rýchle, dôležité).
2. Doplniť moduly do online appky: Zásielky → Inventúra → Tlač QR → Majetok → História cien → Duplicity.
3. AI Edge Function (rozpoznanie z fotky).
4. Reálne testovanie na zariadeniach.
5. Bezpečnostná revízia a prechod na ostrú DB.
