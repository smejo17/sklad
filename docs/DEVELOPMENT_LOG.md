# História vývoja (destilát z chatu)

Zhrnutie vývoja aplikácie z pracovného chatu. Pôvodný surový prepis (`sklad chat.rtf`)
nie je verzovaný — toto je jeho vyčistená a utriedená podoba.

---

## Verzie (chronologicky)

- **v0.6** — Zásoby: reset filtrov + indikátor, stav „na ceste", farby skladov, poznámky,
  2-stĺpcové pozície, mobilný príjem.
- **v0.7** — Výdaj zo skladu; Doklady (história príjemiek/výdajok); Inventúra s cyklom;
  nový produkt priamo z príjmu.
- **v0.8** — Stránka Inventár (firemný majetok).
- **v0.9** — Import ASIC produktov + hmotnosť; náhodné doklady; filter podľa tagov;
  Doklady (filter/farby, príjem/výdaj); výdaj cez QR/hľadanie; stav pri príjme;
  Zásielky (platby, colné JDS, obsah, filtre).
- **v1.0** — Produkty bez stĺpca Typ (badge zostava); detail dokladu (SN…);
  Zásielky (viac, farby smeru, stav); prichádzajúce zobrazené v Zásobách ako „doručuje sa".
- **v1.1** — Obsah zásielky ako položky (produkt + ks) + prijatie zakladá QR položky;
  stránka Tlač QR.

## Neskoršie dávky (po v1.1)

### Skenovanie a rozpoznávanie
- **Dva kódy na štítku (EAN + sériové):** skener rozlišuje typ kódu, pri pridávaní
  produktu preferuje EAN/UPC a sériové (Code128/39) ignoruje s možnosťou „Použiť aj tak".
- **EAN lookup dopĺňa kategóriu + parametre:** Icecat vracia kategóriu aj štruktúrovaný
  zoznam parametrov; namapujú sa na atribúty kategórie (bez AI, podľa názvu; z čísel
  vytiahne hodnotu). Mapovanie funguje len ak sa názvy atribútov aspoň čiastočne zhodujú
  s Icecat (SK/EN synonymá boli navrhované ako ďalší krok).
- **OCR prepracované:** predspracovanie fotky (zväčšenie, odtiene sivej, kontrast),
  čistenie výstupu po riadkoch (zahodenie šumu/čiarových kódov), overenie dĺžky EAN.
  Surový OCR text sa **už nevkladá do parametrov** — zobrazí sa len na kontrolu.

### Opravy a reklamácie — 8-krokový workflow
Stavy: prijaté → diagnostika → cena (zákazník schválil) → objednané diely →
čaká na diely → oprava → hotovo (informovaný) → čaká na platbu → uzavreté.
- Panel „Zaznamenať krok" zobrazuje polia podľa stavu (diagnóza, cena+mena+kto schválil,
  diely + č. objednávky + dodávateľ, očak. dodanie, práce, dátum informovania, platba…).
- Kroky idú do **nemenného (append-only) denníka** — poznámky sa po uložení nedajú
  meniť ani mazať (vynútené aj na úrovni DB: len INSERT). Denník je aj v tlačenom protokole.
- Reklamácie fungujú rovnako.

### Zobrazenie po sekciách
Zásielky aj opravy/reklamácie sú zoradené do sekcií podľa stavu
(zadané → na ceste/rozpracované → doručené → uzavreté).

### Modul Majetok
Firemné zásoby: každá položka má užívateľa, správcu a budovu/miestnosť; výpisy zoskupené
podľa miestnosti/užívateľa/správcu s filtrami. „Presunúť zo skladu" založí kartu majetku
a kus vyskladní; „Vrátiť na sklad" spraví opak. Export CSV.

### Role a oprávnenia
Sada rolí: admin, skladník, technik, visitor, zamestnanec, dočasný, externý — s rozumnými
predvolenými právami. Klient načíta oprávnenia podľa roly (už nie natvrdo „user"),
takže matica oprávnení v Správe funguje dynamicky.

### Správa používateľov (admin)
Pridať (pozvánka e-mailom bez hesla / dočasné heslo), ban/odblokovanie, zmena roly,
info/pozícia (inline), zmazať. Beží cez Edge Function `admin-users` so **service_role**
na serveri, ktorá najprv overí, že volajúci je admin. Pozvánka e-mailom vyžaduje
nastavené SMTP v Supabase.

---

## Otvorené / známe problémy a nápady
- **Synonymá atribútov (SK/EN)** pre lepšie automatické mapovanie parametrov z Icecat.
- **UPS Quantum View — „Invalid Authentication Information":** token je platný, ale nie je
  oprávnený volať Quantum View. Najpravdepodobnejšia príčina: Quantum View nie je pridaný
  ako produkt k UPS aplikácii (client_id) na developer.ups.com. Ďalšie možnosti: zlá
  cesta/verzia endpointu (`UPS_QV_PATH`), chýbajúci Access License Number
  (`UPS_ACCESS_LICENSE`, `UPS_ACCOUNT`). Funkcia bola upravená, aby vracala surovú odpoveď
  UPS na diagnostiku.
- **Audit „kto/kedy/čo":** pohyby zatiaľ neukladajú prihláseného používateľa (nesúlad
  typov `profiles.id` UUID vs. staré `stock_movements.user_id` BIGINT) — viď
  PRODUKCNA_PRIPRAVENOST.md.
- **Nápady:** história pohybov majetku (prevzatie/vrátenie/presun), audit akcií admina
  nad používateľmi, pole modul/scope na obmedzenie viditeľnosti.

## Poradie nasadenia SQL pre servis/majetok/role (z chatu)
```
supabase_repair_events.sql            -- nemenný denník krokov
supabase_assets_v2.sql                -- stĺpce majetku
supabase_roles_v2.sql                 -- nové role + oprávnenia + RLS
supabase_user_admin.sql               -- rozšírenie profilov
supabase_demo_repairs_shipments.sql   -- demo dáta (voliteľné)
```
