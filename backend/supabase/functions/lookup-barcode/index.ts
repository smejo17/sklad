// =====================================================================
//  Supabase Edge Function: lookup-barcode
//  Dohľadá produkt podľa EAN/UPC čiarového kódu vrátane názvu, značky,
//  OBRÁZKA, orientačnej CENY a PARAMETROV (špecifikácií).
//
//  Zdroje (v poradí):
//    1) Open Icecat  — výborné pre IT/elektroniku a EÚ značky.
//       Zadarmo, treba bezplatnú registráciu a secret ICECAT_USER.
//       Vracia názov, značku, obrázok a technické parametre.
//    2) UPCitemdb (trial) — záloha, bez kľúča. Navyše vie orientačnú cenu.
//
//  NASADENIE, názov funkcie: lookup-barcode
//    supabase functions deploy lookup-barcode
//  Secret (pre Icecat):  ICECAT_USER = tvoj bezplatný Open Icecat username
//
//  Volanie:
//    const {data}=await sb.functions.invoke("lookup-barcode",{body:{code:"4044953501302"}})
//    -> { found, name, brand, code, source, image, price, currency, specs }
// =====================================================================
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { code } = await req.json();
    if (!code) return json({ error: "Chýba kód." }, 400);
    const ean = String(code).trim();

    // 1) Open Icecat (názov, značka, obrázok, parametre)
    const icecatUser = Deno.env.get("ICECAT_USER");
    if (icecatUser) {
      try {
        const url = `https://live.icecat.biz/api?UserName=${encodeURIComponent(icecatUser)}&Language=EN&GTIN=${encodeURIComponent(ean)}&Content=GeneralInfo,Gallery,Image,FeaturesGroups`;
        const r = await fetch(url, { headers: { "Accept": "application/json" } });
        const d = await r.json();
        const data = d?.data ?? {};
        const gi = data.GeneralInfo ?? {};
        const brand = gi.BrandName ?? gi.Brand ?? "";
        const name = gi.Title ?? gi.ProductName ?? [brand, gi.ProductName].filter(Boolean).join(" ") ?? "";
        let image = "";
        if (Array.isArray(data.Gallery) && data.Gallery.length) image = data.Gallery[0].Pic ?? data.Gallery[0].LowPic ?? "";
        if (!image && data.Image) image = data.Image.HighPic ?? data.Image.Pic ?? data.Image.LowPic ?? "";
        const specList = extractIcecatSpecList(data.FeaturesGroups);
        const specs = specList.map((s) => `${s.label}: ${s.value}`).join("\n");
        const category = gi?.Category?.Name?.Value ?? gi?.Category?.Name ?? gi?.CategoryName ?? "";
        if (name) return json({ found: true, name, brand, code: ean, source: "icecat", image, price: null, currency: null, specs, specList, category });
      } catch (_) { /* pokračuj na zálohu */ }
    }

    // 2) UPCitemdb trial (názov, značka, obrázok, orientačná cena)
    try {
      const r = await fetch("https://api.upcitemdb.com/prod/trial/lookup?upc=" + encodeURIComponent(ean),
        { headers: { "Accept": "application/json" } });
      const d = await r.json();
      if (d && Array.isArray(d.items) && d.items.length) {
        const it = d.items[0];
        if (it.title) {
          const image = Array.isArray(it.images) && it.images.length ? it.images[0] : "";
          const price = typeof it.lowest_recorded_price === "number" ? it.lowest_recorded_price : null;
          const specs = it.description ? String(it.description).slice(0, 1500) : "";
          return json({ found: true, name: it.title, brand: it.brand ?? "", code: ean, source: "upcitemdb", image, price, currency: price != null ? "USD" : null, specs });
        }
      }
    } catch (_) { /* nič */ }

    return json({ found: false, code: ean, source: icecatUser ? "icecat+upcitemdb" : "upcitemdb" });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

// z Icecat FeaturesGroups vytiahne štruktúrovaný zoznam parametrov [{label,value}]
function extractIcecatSpecList(groups: any): { label: string; value: string }[] {
  try {
    if (!Array.isArray(groups)) return [];
    const out: { label: string; value: string }[] = [];
    for (const g of groups) {
      const feats = g?.Features ?? [];
      for (const f of feats) {
        const label = f?.Feature?.Name?.Value ?? f?.LocalName ?? "";
        const val = f?.PresentationValue ?? f?.Value ?? "";
        if (label && val) out.push({ label: String(label), value: String(val) });
      }
      if (out.length > 60) break;
    }
    return out;
  } catch { return []; }
}
