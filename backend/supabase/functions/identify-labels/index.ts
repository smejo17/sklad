// =====================================================================
//  Supabase Edge Function: identify-labels
//  Z fotky zásielky (viac nálepiek/kódov) rozpozná a ROZLÍŠI:
//   - tracking number prepravcu (+ prepravca)
//   - sériové číslo produktu (SN)
//   - EAN/UPC produktu
//   - ostatné kódy (references)
//
//  NASADENIE:
//    supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   (spoločné pre AI funkcie)
//    # voliteľne: supabase secrets set AI_MODEL=claude-haiku-4-5
//    supabase functions deploy identify-labels
//
//  Volanie z appky (prihlásený user):
//    sb.functions.invoke("identify-labels",{ body:{ labelImage:"data:image/...;base64,..." }})
//    (alebo { images:[dataUrl, ...] } pre viac fotiek)
//    -> { found, tracking_number, carrier, serial, ean, references:[], notes, usage }
// =====================================================================
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const PROMPT = `Na fotke je zásielka/balík. Fotka môže byť OTOČENÁ (text nabok/hore nohami) a býva na nej VIAC nálepiek:
- PREPRAVNÁ nálepka (DHL / UPS / FedEx / GLS ...) so sledovacím číslom,
- VÝROBNÁ/PRODUKTOVÁ nálepka (napr. Canaan/Avalon, Bitmain) so sériovým číslom, názvom a parametrami.

Prepíš údaje PRESNE (znak po znaku) a vráť IBA čisté JSON v tomto tvare:
{
  "tracking_number": "",  // SLEDOVACIE číslo prepravcu. UPS = "1Z"+16 znakov (18 spolu). DHL Express = 10-miestne číslo (často pri "WAYBILL") alebo JJD/JVGL/JD… FedEx = 12 číslic. GLS = 11–14 číslic. Packeta/Zásilkovna = Z + 9–10 číslic. Česká pošta = 2 písmená+9 číslic+2 písmená (napr. RR…CZ). NIE je to smerovací kód (napr. "CZ-PRG-GTW"), NIE mesto (HKG), NIE počet kusov (3/5).
  "carrier": "",          // UPS / FedEx / DHL Express / GLS / Packeta / Česká pošta / Balíkovna ... (podľa loga alebo tvaru čísla)
  "awb": "",              // Air Waybill (letecký nákladný list) — 11 číslic vo formáte "XXX-XXXXXXXX" (3-cifrová letecká predpona + 7 + kontrolná). Býva pri "AWB", "MAWB", "HAWB". NIE je to bežné tracking číslo kuriéra.
  "serial": "",           // SÉRIOVÉ číslo PRODUKTU — označené "SN"/"Serial No" na výrobnej nálepke (dlhý alfanumerický kód, napr. AMF...). NIE je to číslo dokladu/objednávky.
  "ean": "",              // EAN/UPC čiarový kód produktu (8/12/13 číslic), ak je
  "invoice_number": "",   // číslo FAKTÚRY / dokladu (napr. "SLGJ...", "Invoice No", čínske "单号", "Ref No: V-...")
  "customs_doc": "",      // colný doklad — JDS / JSD / MRN (napr. "MRN 24CZ..."), colné vyhlásenie
  "order_number": "",     // číslo objednávky, ak je odlíšené od faktúry
  "product": { "name": "", "brand": "", "model": "" },  // názov / značka / model produktu
  "specs": {},            // technické parametre ako kľúč:hodnota — napr. {"Power consumption":"1800 W","Hash rate":"90 TH/s"}
  "references": [],       // ostatné kódy, ktoré nevieš zaradiť
  "notes": ""             // krátka poznámka (čo je na ktorej nálepke)
}
Pravidlá:
- NEZAMIEŇAJ: tracking prepravcu ≠ AWB (letecký, XXX-XXXXXXXX) ≠ sériové číslo (SN) ≠ faktúra ≠ colný doklad (JDS/MRN) ≠ objednávka.
- Kódy prepíš presne ako sú; pri nejasnom znaku daj najlepší odhad, ale needituj dĺžku.
- Ak niečo na fotke nie je, nechaj prázdny reťazec (alebo prázdny objekt). Nevymýšľaj.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const imgs: string[] = Array.isArray(body.images) ? body.images : (body.labelImage ? [body.labelImage] : []);
    if (!imgs.length) return json({ error: "Chýba fotka (labelImage / images)." }, 400);

    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ error: "Chýba ANTHROPIC_API_KEY (supabase secrets)." });
    // OCR hustých/otočených štítkov je náročné → silnejší model (override cez AI_MODEL_LABELS)
    const model = Deno.env.get("AI_MODEL_LABELS") || "claude-opus-4-8";

    const content: any[] = imgs.map(toImageBlock);
    content.push({ type: "text", text: PROMPT });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 900, messages: [{ role: "user", content }] }),
    });
    const d = await res.json();
    if (!res.ok) return json({ error: "AI chyba: " + (d?.error?.message || res.status) });
    const text = d?.content?.[0]?.text || "{}";
    const p = safeJson(text);
    const usage = d?.usage ? { input_tokens: d.usage.input_tokens, output_tokens: d.usage.output_tokens, model } : null;
    return json({
      found: true,
      tracking_number: (p.tracking_number || "").toString().trim(),
      carrier: (p.carrier || "").toString().trim(),
      awb: (p.awb || "").toString().trim(),
      serial: (p.serial || "").toString().trim(),
      ean: (p.ean || "").toString().trim(),
      invoice_number: (p.invoice_number || "").toString().trim(),
      customs_doc: (p.customs_doc || "").toString().trim(),
      order_number: (p.order_number || "").toString().trim(),
      product: {
        name: (p.product?.name || "").toString().trim(),
        brand: (p.product?.brand || "").toString().trim(),
        model: (p.product?.model || "").toString().trim(),
      },
      specs: (p.specs && typeof p.specs === "object") ? p.specs : {},
      references: Array.isArray(p.references) ? p.references.filter(Boolean) : [],
      notes: (p.notes || "").toString().trim(),
      usage,
    });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});

function toImageBlock(dataUrl: string) {
  const m = /^data:(.*?);base64,(.*)$/s.exec(dataUrl);
  return { type: "image", source: { type: "base64", media_type: m ? m[1] : "image/jpeg", data: m ? m[2] : dataUrl } };
}
function safeJson(t: string) {
  try { const s = t.indexOf("{"), e = t.lastIndexOf("}"); return JSON.parse(t.slice(s, e + 1)); }
  catch { return {}; }
}
