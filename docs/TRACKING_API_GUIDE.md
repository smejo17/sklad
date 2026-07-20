# Čo sa dá zistiť cez API prepravcov a čo si u nich treba zapnúť

Zhrnutie z prieskumu developer portálov a komunitných reportov (stav 2026-07).
Nadväzuje na [TRACKING_REVIEW.md](TRACKING_REVIEW.md) (podrobné endpointy a zdroje).

---

## 1. Matica — aké dáta vieš získať cez tracking API

| Dáta | UPS | FedEx | DHL Express | GLS | Zásilkovna | Česká pošta / Balíkovňa |
|---|---|---|---|---|---|---|
| Aktuálny stav | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| História udalostí (čas + miesto + popis) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (čas + český popis) |
| Dátum vytvorenia (štítok/podanie) | ✅ | ✅ | ✅ | ~ | ✅ | ~ |
| Adresy od → komu | ✅ | ✅ | ~ | ~ | výdajné miesto | pošta/miesto |
| Príjemca + podpis | ✅ | (SPOD samostatne) | ~ | v POD PDF | – | ~ |
| Proof of Delivery (na tlač) | ✅ | ✅ (SPOD, base64) | ✅ | ✅ (PDF) | – | ~ |
| Váha (+ rozmery) | ✅ | ✅ (+rozmery) | ~ | ✅ | invoiced weight | ~ |
| Služba / produkt | ✅ | ✅ | ✅ | ✅ | carrierName | ~ |
| Počet kusov | ✅ | ✅ | ✅ | – | – | ~ |
| Odhad doručenia (ETA) | ✅ | ✅ (len US/CA/BE/DE/NL) | ✅ | ❌ | – | ~ |
| Dobierka — SUMA | ✅ | ~ | ~ | ❌ (nie v trackingu) | ❌ (v klient. zóne) | ~ |
| Dobierka — VYBRANÁ (collected) | len Quantum View | ~ | ~ | ❌ | ❌ | ❌ |
| Referenčné čísla | ✅ | ✅ | ✅ | – | externalTrackingCode | ~ |
| **Cena prepravy (čo si zaplatil)** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

✅ = áno · ~ = čiastočne / závisí od autorizácie · ❌ = nie · – = nedostupné

> **Cena prepravy nie je NIKDE v trackingu** — je to fakturačný údaj. Viď sekciu 4.

---

## 2. Čo si treba u prepravcu ZAPNÚŤ (a aké secrets)

### UPS
- Účet UPS + účet na **developer.ups.com** → vytvoriť **App** s auth typom **Client Credentials** → získať **Client ID + Secret**.
- **K App PRIDAŤ produkt „Tracking".** Ak chceš aj potvrdenie vybratia dobierky, pridať navyše produkt **„Quantum View"** + aktivovať Quantum View subscription na účte.
- ⚠️ **Najčastejšia chyba „Invalid Authentication Information (250002)"** = produkt nie je pridaný k App (token prejde, volanie zlyhá). Po pridaní počkať ~10 min.
- Secrets: `UPS_CLIENT_ID`, `UPS_CLIENT_SECRET` (+ `UPS_QV_SUBSCRIPTION`, `UPS_ACCESS_LICENSE` pre Quantum View). Zdarma, dáta 120 dní.

### FedEx
- FedEx účet + **projekt na developer.fedex.com** → **Client ID (API Key) + Secret**. Sandbox a produkcia majú **zvlášť** kľúče — projekt treba presunúť do produkcie.
- Aktivovať **Track API** (Basic Integrated Visibility). OAuth2 client_credentials.
- Secrets: `FEDEX_CLIENT_ID`, `FEDEX_CLIENT_SECRET` (+ `FEDEX_ENV`). Limit 100k/deň, dáta 90 dní.
- Pozn.: **podpis (SPOD)** = samostatné volanie a vyžaduje **číslo účtu odosielateľa** (pri prichádzajúcich od dodávateľa ho nemáš).

### DHL Express
- Účet na **developer.dhl.com** → vytvoriť **App** → **Consumer Key** pre produkt **„Shipment Tracking – Unified"** (jeden kľúč trackuje Express/Parcel DE/eCommerce/Freight).
- ⚠️ **Demo kľúč vracia len fiktívne dáta** — na reálne čísla treba vlastný App kľúč.
- Secret: `DHL_API_KEY`. Free tier **250 volaní/deň** (dá sa navýšiť), 1 volanie / 5 s.

### GLS (pre ČR = MyGLS)
- **Podpísaná zmluva s GLS** + **MyGLS účet** (username/heslo). Žiadny self-service — cez obchodného zástupcu.
- Auth netypická: v **každom** requeste `Username` + **heslo hashované SHA-512** + `ClientNumberList`.
- Secrets: `GLS_USER`, `GLS_PASSWORD`, číslo klienta. Sandbox `api.test.mygls.cz`.
- Bez odhadu doručenia, bez štruktúrovaného podpisu, bez sumy dobierky v trackingu. CZ+EU, **nie Ázia**.

### Zásilkovna / Packeta
- **Biznis účet** na zasilkovna.cz → v **Klientskej sekcii** získať **`apiPassword`** (32-znakový hex).
- Secret: `PACKETA_API_PASSWORD`. Bez webhookov (poll; externé stavy sa synchronizujú 3× denne).
- Dobierka nie je v trackingu (rieši sa vo výplatných dokladoch).

### Česká pošta + Balíkovňa
- **NIČ netreba zapínať** — verejný endpoint, **bez kľúča**:
  `GET https://b2c.cpost.cz/services/ParcelHistory/getDataAsJson?idParcel=<číslo>&language=cs`
- Zdarma, ≤ 10 čísel na volanie. **Balíkovňa = tá istá sieť ČP → pokrytá tým istým konektorom.**
- (B2B nAPI „ZSKService" s HMAC + zmluvou treba len ak chceš zásielky aj **vytvárať**, nie len sledovať.)

---

## 3. Neznámy prepravca / Ázia od výrobcu → agregátor
Pre zásielky, kde nevieš prepravcu (Čína→…), použiť **17TRACK** alebo **Ship24**: jeden API kľúč, auto-detekcia prepravcu, ~1500–3400 kuriérov vrátane čínskych (Cainiao, YunExpress, SF, China Post). Vracia zjednotený stav + checkpointy + webhooky. Detaily v TRACKING_REVIEW.md.

---

## 4. Cena prepravy (postage) — samostatne, NIE z trackingu
Žiaden prepravca nevracia cenu prepravy cez tracking ani cez REST „billing" API. Reálne zdroje:
- **UPS** – UPS Billing Center (web) / EDI 210 feed.
- **DHL** – MyBill portál → export **PDF/XML/CSV** (CSV sa importuje najľahšie).
- **FedEx** – FedEx Billing Online (web) / EDI.
- **Rating/Rate API** (UPS/DHL/FedEx) = len **odhad**, nie účtovaná suma.
- **Prichádzajúce / od výrobcu** = z prepravcu vôbec, len z **faktúry dodávateľa**.

→ V appke: ručné pole `ship_cost` (existuje) + neskôr voliteľný dávkový import faktúr (DHL MyBill CSV) pre odchádzajúce na vlastnom účte.

---

## 5. Stav implementácie v appke
| Prepravca | Edge funkcia | Čo treba k aktivácii |
|---|---|---|
| UPS | `ups-track` (hotová, bohatá) | nasadiť + UPS kľúče |
| FedEx | `fedex-track` (hotová) | nasadiť + FedEx kľúče |
| DHL Express | `dhl-track` (hotová) | nasadiť + `DHL_API_KEY` |
| GLS | `gls-track` (provizórna) | GLS zmluvné údaje |
| Zásilkovna | — (postaviť) | `apiPassword` |
| Česká pošta + Balíkovňa | — (postaviť) | **nič — verejné API** |
