# Skladový a zásielkový systém

Skladová, zásielková, servisná (opravy/reklamácie) a majetková evidencia pre PC e-shop
a ASIC hardvér. Frontend je jednostránková webová aplikácia; backend beží na **Supabase**
(PostgreSQL + Auth + Row Level Security + Edge Functions).

## Štruktúra repozitára

```
frontend/                web aplikácia (statická SPA)
  index.html             hlavná appka
  styles.css             štýly (vyňaté z index.html)
  app.js                 aplikačná logika (vyňatá z index.html)
  legacy/                staršie prototypy (app.html, prototyp.html, mapa.html)

backend/
  supabase/
    functions/<meno>/index.ts   Edge Functions (Deno) — tracking prepravcov, AI, admin
    migrations/                 SQL schéma, seedy, migrácie a opravy (viď migrations/README.md)

docs/                    špecifikácia (.pdf/.docx), ER diagram, mapa štruktúry, dev log
tools/docx-builder/      generovanie špecifikácie do .docx (Node)
```

Prehľad **frontendu** (stránky, funkcie, kódy sekcií) je v [docs/STRUKTURA.md](docs/STRUKTURA.md).
Stav pripravenosti do produkcie je v [docs/PRODUKCNA_PRIPRAVENOST.md](docs/PRODUKCNA_PRIPRAVENOST.md).
História vývoja je v [docs/DEVELOPMENT_LOG.md](docs/DEVELOPMENT_LOG.md).

## Frontend

`frontend/index.html` je samostatná SPA. Externé závislosti sa načítavajú z CDN
(`@supabase/supabase-js`, `html5-qrcode`, `tesseract.js`). Konfigurácia pripojenia na
Supabase (`SUPA_URL`, `SUPA_KEY`) je v `frontend/app.js` — používa sa iba **verejný
publishable/anon kľúč**, čo je zámerné a bezpečné.

Spustenie lokálne (kvôli CDN a kamere stačí ľubovoľný statický server):

```bash
cd frontend
python3 -m http.server 8080   # → http://localhost:8080
```

Nasadenie: GitHub Pages / Vercel / Netlify (statický hosting priečinka `frontend/`).

## Backend (Supabase)

### SQL
Poradie spúšťania v Supabase SQL editore je popísané v
[backend/supabase/migrations/README.md](backend/supabase/migrations/README.md).
Základ: `schema_basic.sql` → `supabase_auth_rls.sql` → seedy → doplnky/opravy.

### Edge Functions
Každá funkcia je v `backend/supabase/functions/<meno>/index.ts` (Deno). Nasadenie:

```bash
supabase functions deploy <meno>
```

| Funkcia | Účel | Potrebné secrets |
|---|---|---|
| `lookup-barcode` | dohľadanie produktu podľa EAN (Icecat) | `ICECAT_USER` |
| `identify-product` | rozpoznanie produktu z fotky (AI) | `ANTHROPIC_API_KEY` |
| `product-specs` | doplnenie parametrov produktu (AI) | `ANTHROPIC_API_KEY` |
| `ups-track` / `ups-refresh-all` / `ups-quantumview` | UPS tracking a dobierky | `UPS_CLIENT_ID`, `UPS_CLIENT_SECRET`, `UPS_QV_SUBSCRIPTION` |
| `dhl-track` | DHL tracking | `DHL_API_KEY` |
| `fedex-track` | FedEx tracking | `FEDEX_CLIENT_ID`, `FEDEX_CLIENT_SECRET` |
| `gls-track` | GLS tracking | (viď funkcia) |
| `admin-users` | správa používateľov (create/ban/delete) | používa `service_role` z prostredia |

> **Secrets** sa nastavujú cez `supabase secrets set KEY=hodnota` a **nikdy** nepatria do
> repozitára ani do frontendu. `service_role` kľúč sa používa výlučne v Edge Functions.

## Git / verzie
Repozitár je verzovaný, takže sa dá kedykoľvek vrátiť späť (`git log`, `git revert`,
`git checkout <commit>`). Veľké/generované súbory (`audit.jsonl`, `node_modules/`,
`uploads/`) sú vylúčené cez `.gitignore`.
