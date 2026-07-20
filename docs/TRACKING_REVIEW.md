# Trackovanie zásielok — hĺbková kontrola a návrh

Dátum: 2026-07-20. Pokrýva prepravcov **UPS, FedEx, DHL, GLS, Zásilkovna/Packeta,
Česká pošta** a riešenie pre **priame zásielky od výrobcu z Ázie** (Čína → USA/Taiwan/Nigéria).
Ceny a limity over pred nasadením — u prepravcov sa menia.

---

## 1. Zhrnutie (pre netrpezlivých)

- **Ako sa tracking robí:** appka nikdy nedrží prihlasovacie údaje prepravcu. Každý prepravca má
  **Supabase Edge Function**, ktorá drží tajné kľúče na serveri; frontend volá len ju
  (`sb.functions.invoke`). Výsledok sa uloží do riadku zásielky (`tracking_json`, `status`, `tracking_at`).
- **Čo už máte hotové:** UPS (bohaté dáta vrátane dobierky), FedEx, DHL Express, GLS (provizórne),
  UPS Quantum View (dobierka), automatická 2× denná synchronizácia UPS.
- **Hlavné medzery:** **Zásilkovna a Česká pošta nie sú napojené**; **DHL Freight** sa v kóde spomína,
  ale funkcia neexistuje; pre **ázijské zásielky od výrobcu s neznámym prepravcom** nie je nič.
- **Odporúčanie:** ostať pri **hybridnom modeli** — vlastné API pre 6 známych prepravcov +
  **jeden agregátor (17TRACK alebo Ship24) ako záloha** pre neznáme/ázijské zásielky. Všetko
  namapovať na **jeden interný stavový model**.

---

## 2. Ako funguje trackovanie (model)

Každý prepravca poskytuje API, kde **pošleš tracking číslo** a dostaneš **stav + históriu udalostí**.
Rozdiely sú v troch veciach:

1. **Autentifikácia** — OAuth2 (UPS, FedEx), API kľúč v hlavičke (DHL), hash hesla v každom
   requeste (GLS, Packeta), HMAC podpis (Česká pošta B2B).
2. **Aké dáta vráti** — každý má iný rozsah (stav, udalosti, doručenie, podpis/POD, hmotnosť,
   dobierka…).
3. **Pokrytie** — kuriéri (UPS/FedEx/DHL) trackujú **celosvetovo** podľa svojho čísla; poštové/
   parcelové siete (GLS, Zásilkovna, Česká pošta) trackujú len zásielky **vo svojej sieti**.

Kľúčový princíp: **trackuješ podľa čísla + prepravcu.** Ak prepravcu nepoznáš (zásielka priamo od
výrobcu), potrebuješ buď rozpoznať prepravcu podľa tvaru čísla, alebo **agregátor**, ktorý to
urobí za teba.

---

## 3. Audit súčasného stavu v appke

Architektúra je správna (secrets len na serveri, cache do DB, `carrier_sync` loguje poslednú
synchronizáciu). Automatické rozpoznanie prepravcu je vo funkcii `detectCarrierName`
(`frontend/app.js`) — najprv podľa poľa „Prepravca", inak podľa tvaru tracking čísla.

| Prepravca | Edge Function | Auth (secrets) | Auto-detekcia čísla | Stav |
|---|---|---|---|---|
| **UPS** | `ups-track` | OAuth2 (`UPS_CLIENT_ID/SECRET`) | `1Z…` | ✅ bohaté (stav, udalosti, POD, hmotnosť, podpis, **dobierka**, referencie) |
| **FedEx** | `fedex-track` | OAuth2 (`FEDEX_CLIENT_ID/SECRET`, `FEDEX_ENV`) | 12/15/20/22 číslic | ✅ implementované |
| **DHL Express** | `dhl-track` | API kľúč (`DHL_API_KEY`, Unified API) | `JJD/JVGL/JD/GM/LX…` | ✅ implementované |
| **GLS** | `gls-track` | konfigurovateľné (`GLS_*`) | `ZBA/GLS…` | ⚠️ provizórne (auth neistá — viď nižšie) |
| **UPS Quantum View** | `ups-quantumview` | OAuth2 + `UPS_QV_SUBSCRIPTION` + access license | — | ⚠️ dobierka; problém „Invalid Auth" |
| **DHL Freight** | `dhl-freight-track` (odkaz) | — | — | ❌ **funkcia neexistuje** |
| **Zásilkovna / Packeta** | — | — | — | ❌ **nenapojené** |
| **Česká pošta** | — | — | — | ❌ **nenapojené** |

**Ďalšie:** `ups-refresh-all` je cron (2× denne), ktorý obnovuje UPS zásielky; univerzálna funkcia
`shipUpsTrack()` navyše odvodí **smer** (inbound/outbound podľa toho, či je Kentino odosielateľ/
príjemca) a pri dobierke označí zásielku ako zaplatenú.

### Medzery
1. **2 zo 6 prepravcov nie sú napojené:** Zásilkovna a Česká pošta.
2. **DHL Freight** sa volá, ale funkcia nikdy nevznikla.
3. **Ázijské zásielky od výrobcu** — auto-detekcia pozná len tvary UPS/FedEx/DHL/GLS; čínski kuriéri
   (SF, YunExpress, Cainiao, China Post/EMS, 4PX) sa nerozpoznajú ani netrackujú.
4. Auto-detekcia nepozná čísla Zásilkovny (`Z…`) ani Českej pošty.

---

## 4. Prepravcovia — detail

### UPS
- **Track API v1** — `GET /track/v1/details/{cislo}`. Base: test `wwwcie.ups.com`, prod `onlinetools.ups.com`.
- **Auth:** OAuth2 client_credentials → `POST /security/v1/oauth/token` (Basic `client_id:secret`), token ~1 h.
- **Dáta:** aktuálny stav (`currentStatus`, milestones), história `activity[]` (dátum/čas/miesto/popis),
  doručenie (`deliveryDate` SDD/RDD/DEL), **POD + podpis** (`deliveryInformation`: receivedBy, signature),
  hmotnosť, služba, počet balíkov, referencie, **dobierka** (`paymentInformation`).
- **Dobierka (dôkladne):** bohatšie dáta dáva **Quantum View v3** (`POST /quantumview/v3/events`) — je to
  **samostatný produkt**, musí sa pridať k appke na developer.ups.com a mať aktívnu subscription.
- **Pozor — „Invalid Authentication Information" (250002):** token prejde, ale volanie zlyhá, ak produkt
  (Tracking / Quantum View) **nie je pridaný k appke**. Riešenie: Edit App → pridať produkt → počkať ~10 min.
  (Presne to je váš aktuálny problém s Quantum View.)
- **Pokrytie:** ľubovoľné UPS číslo celosvetovo (Čína→USA/Taiwan/Nigéria OK). Zdarma. Dáta 120 dní.

### FedEx
- **Track API v1** — `POST /track/v1/trackingnumbers` (max 30 čísel/request). Base: `apis-sandbox.fedex.com` / `apis.fedex.com`.
- **Auth:** OAuth2 client_credentials → `POST /oauth/token`, token 1 h (cachovať — token endpoint je limitovaný).
- **Dáta:** `latestStatusDetail`, `scanEvents[]` (čas/miesto/popis/výnimky), dátumy (odhad + skutočné doručenie),
  **okno doručenia len US/CA/BE/DE/NL**, `delayDetail` (meškanie), služba, **hmotnosť + rozmery**, počet kusov,
  odosielateľ/príjemca. **Podpis (SPOD)** je samostatné volanie a **vyžaduje číslo účtu odosielateľa**
  (pri zásielkach od dodávateľa ho zvyčajne nemáš).
- **Limity:** 100 000/deň, 1 400/10 s. Dáta 90 dní. Zdarma s FedEx účtom.
- **Pokrytie:** celosvetovo podľa FedEx čísla; granularita v niektorých krajinách (napr. Nigéria) závisí od lokálnej prevádzky.

### DHL
- **Odporúčané: Shipment Tracking – Unified API** — `GET /track/shipments`, base `api-eu.dhl.com`,
  auth hlavička **`DHL-API-Key`**. Jedným kľúčom trackuje Express, Parcel DE, eCommerce, Global Forwarding, Freight.
- **Dáta:** `status`, `events[]` (čas/miesto/popis), `estimatedTimeOfDelivery`, `proofOfDelivery`,
  hmotnosť (len pri vyššej autorizácii), služba, počet kusov.
- **Limity:** free tier **250 volaní/deň**, 1 volanie / 5 s (dá sa navýšiť na požiadanie). **Demo kľúč vracia
  len fiktívne dáta** — na test reálnych čísel treba vlastný kľúč.
- **China-origin express** rieši **DHL Express** (najlepšia granularita). MyDHL API (Basic auth) treba len ak
  chceš zásielky aj **vytvárať** (štítky), nie len čítať stav.
- **Pokrytie:** celosvetovo, ak zásielka ide cez DHL. Vaša `dhl-track` už používa práve túto Unified API. ✅

### GLS
- **Žiadne jednotné „GLS Group API".** Pre **ČR platí MyGLS API** — `api.mygls.cz`, SOAP aj REST,
  `POST /ParcelService.svc/json/GetParcelStatuses` (alebo `GetParcelListStatuses`, ≤100 kusov).
- **Auth (netypická):** v **každom** requeste `Username` (e-mail) + **heslo hashované SHA-512 (byte pole)** +
  `ClientNumberList`. Nie OAuth, nie API kľúč. **Prístup len so zmluvou GLS** — cez obchodného zástupcu, žiadny self-service.
- **Dáta:** `ParcelStatusList` (StatusCode, StatusDescription, **StatusDate**, DepotCity), hmotnosť,
  **POD ako PDF** (`ReturnPOD=true`). **Nemá** odhad doručenia, **nemá** štruktúrovaný podpis, **nemá** sumu dobierky v trackingu.
- **Sandbox:** `api.test.mygls.cz`. Bez webhookov (poll).
- **Pokrytie:** CZ + EU. **Nie Ázia.** Núdzovo existuje web tracking (číslo + PSČ), ale to nie je oficiálne API.
- *Pozn.:* vaša `gls-track` je preto písaná „konfigurovateľne" (`GLS_TRACK_URL`, `GLS_USER`, `GLS_PASSWORD`…),
  lebo reálny prístup ku GLS API je administratívne náročný.

### Zásilkovna / Packeta
- **Jedno API v dvoch formách** — SOAP a „REST/XML" (POST XML na `zasilkovna.cz/api/rest`; **nie JSON**).
- **Auth:** `apiPassword` (32-znakový hex), per e-shop účet (v Klientskej sekcii). Bez OAuth/tokenov.
- **Metódy trackovania:** `packetTracking(packetId)` → celá história; `packetStatus(packetId)` → posledný stav
  + `isReturning`, `storedUntil`, `carrierName`; `packetCourierTracking` / `packetInfo` → údaje o poslednej míli.
- **Dáta:** `statusCode` (1–17, 999) + `codeText` + `statusText`, `dateTime`, `branchId` (výdajné miesto),
  `externalTrackingCode`. **Dobierka NIE je v trackingu** — rieši sa vo výplatných dokladoch Klientskej sekcie.
- **Bez webhookov** (poll; stavy od externého kuriéra sa synchronizujú len 3× denne). Bez samostatného sandboxu.
- **Pokrytie:** CZ + stredná Európa/EU. **Nie ázijské zásielky od výrobcu** — trackuje len packety, ktoré **ty** posielaš cez Packeta.

### Česká pošta
- **Dva kanály:**
  - **B2C verejná služba** — jednoduché, napr. `b2c.cpost.cz/services/ParcelHistory/getDataAsJson?idParcel=…`
    (takmer bez bariéry, na jednotlivé lookupy). Vhodné na rýchly štart.
  - **B2B nAPI REST (ZSKService v1.5.0)** — `b2b.postaonline.cz:444/restservices/ZSKService/v1`,
    `POST /parcelStatus` alebo `GET /parcelStatuses/current/idParcel/{id}`. **Auth:** `Api-Token` +
    **HMAC-SHA256 podpis** (nonce + timestamp). Len pre **zmluvných zákazníkov**.
- **Dáta:** `ParcelStatus` (id, `date`, **`text` po česky**, `postCode`, `name` pošty), hmotnosť,
  **dobierka** (suma + mena + výplatná suma), krajina pôvodu/určenia.
- **Sandbox:** `b2b-test.postaonline.cz:444`. Jazyk: čeština.
- **Pokrytie:** CZ vnútroštátne plne; medzinárodné len **CZ úsek** (colné, triedenie, doručenie).
  **Nie ázijské kuriérske zásielky** — kým nevstúpia do siete Českej pošty ako poštová/EMS zásielka.

---

## 5. Pokrytie podľa vašich trás

| Trasa / prípad | Čím trackovať | Poznámka |
|---|---|---|
| **ČR vnútroštátne** (od/do Kentino) | Zásilkovna, Česká pošta, GLS CZ | ich vlastné API; dobierku riešiť mimo trackingu (Packeta/GLS) |
| **ČR → svet** (cez Kentino, kuriér) | UPS / FedEx / DHL Express API | celosvetové, bohaté dáta vrátane POD |
| **Svet → ČR** (inbound) | UPS/FedEx/DHL (ak kuriér); Česká pošta (poštové) | smer sa už odvodí automaticky |
| **Výrobca priamo, Ázia** (Čína→USA/Taiwan/Nigéria) | ak UPS/FedEx/DHL číslo → ich API; inak **agregátor** | často **neznámy prepravca** = kľúčový dôvod pre agregátor |

---

## 6. Ázijské zásielky od výrobcu — problém a riešenie

Problém je dvojaký: (1) často **nevieš, ktorý prepravca** to viezol, a (2) čínska preprava jazdí na
kuriéroch (Cainiao, YunExpress, SF Express, China Post/EMS, 4PX, Yanwen), ktoré západné API pokrývajú slabo.
To presne rieši **agregátor** so silnou auto-detekciou a hlbokým pokrytím Ázie.

| Agregátor | Pokrytie | Ázia (Cainiao/YunExpress/SF/China Post) | Model | Webhooky | Cena (orientačne, over) |
|---|---|---|---|---|---|
| **17TRACK** | ~3 400+ prepravcov | **najlepšie** (čínska firma) | pošli číslo (auto-detekcia), `17token` | áno | free ~200/mes; predplatená ročná kvóta od ~$119/5 000 |
| **Ship24** | ~1 500+ | silné | REST/JSON, auto-detekcia | áno | free plán; od ~$39/1 000/mes |
| **AfterShip** | ~1 300+ | široké | POST číslo, detect-courier | áno | API/webhook od ~$70/mes |
| **TrackingMore** | ~1 600+ | široké | POST číslo, auto-detekcia | áno | od ~$11/mes (200 kreditov) |
| **EasyPost** | ~80–100 (US) | **slabé** | POST tracker | áno | nevhodné pre Áziu |

**Odporúčanie: hybrid (možnosť c).** Vlastné API pre 6 známych prepravcov (najčerstvejšie a najbohatšie dáta,
bez poplatku za tracking) + **jeden agregátor ako záloha** pre neznáme/ázijské zásielky. Ako agregátor
**17TRACK** (najlepšia Ázia) alebo **Ship24/TrackingMore** (mesačné platby, čistejšie REST/webhook).
Všetky zdroje namapovať na **jeden interný stavový model**, aby zvyšok appky videl jednotné stavy.

---

## 7. Odporúčaná roadmapa

1. **Sprevádzkovať to, čo už je** — nasadiť edge funkcie a nastaviť secrets:
   - `supabase functions deploy ups-track fedex-track dhl-track gls-track ups-quantumview`
   - secrets: `UPS_CLIENT_ID/SECRET`, `FEDEX_CLIENT_ID/SECRET`, `DHL_API_KEY`, `GLS_*`, `UPS_QV_SUBSCRIPTION`.
   - **UPS:** v developer.ups.com pridať k appke produkty **Tracking** aj **Quantum View** (rieši „Invalid Auth").
2. **Doplniť chýbajúcich prepravcov:**
   - `zasilkovna-track` (Packeta API, `apiPassword`, `packetStatus`/`packetTracking`).
   - `ceska-posta-track` (začať B2C JSON endpointom; neskôr B2B nAPI ZSKService s HMAC).
   - rozšíriť `detectCarrierName` o tvary Zásilkovny (`Z…`) a bežné formáty Českej pošty.
3. **Odstrániť/­dorobiť `dhl-freight-track`** (buď funkciu doplniť, alebo odkaz z frontendu odstrániť).
4. **Agregátor ako fallback** — `aggregator-track` (17TRACK/Ship24): keď `detectCarrierName` vráti prázdno
   alebo priame API zlyhá, zaregistrovať číslo v agregátore a konzumovať webhook.
5. **Jednotný stavový model** — všetky prepravcov namapovať na interné stavy
   (zadané → na ceste → colné → doručené → uzavreté), nech UI a filtre nezávisia od konkrétneho prepravcu.
6. **Dobierka:** kde API dobierku v trackingu nedáva (GLS, Zásilkovna, Česká pošta B2C), reconciliovať
   z vlastných dát / výplatných dokladov; UPS cez Quantum View.

---

### Zdroje
UPS: developer.ups.com, github.com/UPS-API/api-documentation · FedEx: developer.fedex.com/api/en-us/catalog/track ·
DHL: developer.dhl.com/api-reference/shipment-tracking · GLS: api.mygls.cz/docs · Packeta: docs.packeta.com ·
Česká pošta: postaonline.cz (nAPI ZSKService), b2c.cpost.cz · Agregátory: 17track.net/en/api, ship24.com/tracking-api,
aftership.com/docs, trackingmore.com/tracking-api.
