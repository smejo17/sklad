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

const PROMPT = `Na fotke (alebo fotkách) je zásielka/balík s VIACERÝMI nálepkami, štítkami a čiarovými/QR kódmi.
Rozpoznaj všetky kódy a ROZLÍŠ ich typy. Vráť IBA čisté JSON v tomto tvare:
{
  "tracking_number": "",   // sledovacie číslo PREPRAVCU (napr. UPS 1Z..., DHL JJD/JD/JVGL..., FedEx 12-22 číslic, GLS, Packeta Z..., Česká pošta). Kód, ktorým sa sleduje zásielka.
  "carrier": "",           // najlepší odhad prepravcu: UPS / FedEx / DHL Express / GLS / Packeta / Česká pošta / ... (podľa tvaru čísla alebo loga)
  "serial": "",            // SÉRIOVÉ ČÍSLO produktu (SN zariadenia), ak je na štítku
  "ean": "",               // EAN/UPC čiarový kód produktu (8/12/13 číslic), ak je
  "invoice_number": "",    // číslo faktúry / dokladu (napr. F2026-03-006, INV-..., FA...), ak je na štítku
  "order_number": "",      // číslo objednávky (napr. OBJ-..., ORDER..., PO...), ak je
  "references": [],        // ostatné viditeľné kódy/čísla, ktoré nevieš zaradiť
  "notes": ""              // krátka poznámka (napr. čo je na ktorej nálepke)
}
Pravidlá:
- ODLÍŠ sledovacie číslo prepravcu od sériového čísla produktu a od EAN. Nezamieňaj ich.
- Ak si nie si istý typom kódu, daj ho do "references".
- Kódy vráť presne ako sú (bez medzier/pomlčiek navyše). Ak niečo chýba, nechaj prázdny reťazec.
- Nevymýšľaj kódy, ktoré na fotke nie sú.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const imgs: string[] = Array.isArray(body.images) ? body.images : (body.labelImage ? [body.labelImage] : []);
    if (!imgs.length) return json({ error: "Chýba fotka (labelImage / images)." }, 400);

    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ error: "Chýba ANTHROPIC_API_KEY (supabase secrets)." });
    const model = Deno.env.get("AI_MODEL") || "claude-haiku-4-5";

    const content: any[] = imgs.map(toImageBlock);
    content.push({ type: "text", text: PROMPT });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 600, messages: [{ role: "user", content }] }),
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
      serial: (p.serial || "").toString().trim(),
      ean: (p.ean || "").toString().trim(),
      invoice_number: (p.invoice_number || "").toString().trim(),
      order_number: (p.order_number || "").toString().trim(),
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
