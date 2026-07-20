// =====================================================================
//  Supabase Edge Function: identify-product
//  Rozpoznanie produktu z fotky (štítok / celý produkt) cez vision AI,
//  potom hľadanie v INTERNEJ databáze; ak nie je, vráti návrh na potvrdenie.
//
//  NASADENIE (vývojár, cez Supabase CLI):
//    1) supabase functions new identify-product   (a nahraď index.ts týmto)
//    2) supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   (AI kľúč)
//       # voliteľne: supabase secrets set AI_MODEL=claude-3-5-sonnet-20241022
//    3) supabase functions deploy identify-product
//
//  Volanie z appky (prihlásený používateľ):
//    const {data,error}=await sb.functions.invoke("identify-product",
//        {body:{ labelImage: dataUrl, productImage: dataUrl2 }});
//
//  Poznámka: SUPABASE_URL a SUPABASE_ANON_KEY sú v Edge Functions dostupné
//  automaticky. AI kľúč nastav ako secret (nikdy do frontendu!).
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const PROMPT = `Si asistent v sklade s ASIC minermi a IT tovarom.
Z priložených fotiek (štítok a/alebo produkt) prečítaj údaje o produkte.
Vráť IBA čisté JSON (bez textu navyše) s kľúčmi:
{"brand":"", "model":"", "serial":"", "barcode":"", "name":"", "specs":""}
- barcode = hodnota z čiarového kódu / EAN, ak je čitateľná, inak "".
- serial = sériové číslo zo štítka, ak je, inak "".
- name = ľudsky čitateľný názov (napr. "Antminer S21 Pro").
- specs = ostatné čitateľné parametre zo štítka ako krátky text (napr. "Hashrate 200 TH/s, 3500 W, 230 V"), inak "".
Ak niečo nevidno, daj prázdny reťazec.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { labelImage, productImage } = await req.json();
    if (!labelImage && !productImage) return json({ error: "Chýba fotka." }, 400);

    // vision extrakcia
    const extracted = await visionExtract([labelImage, productImage].filter(Boolean));

    // klient s právami prihláseného používateľa (RLS)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );

    // 1) interná DB — najprv podľa čiarového kódu (SKU)
    let match: any = null;
    const sel = "id,name,model,sku,category_id,price,currency,weight_g,brand_id,brands(name)";
    if (extracted.barcode) {
      const { data } = await supabase.from("products").select(sel).eq("sku", extracted.barcode).limit(1);
      if (data && data.length) match = data[0];
    }
    // 2) inak podľa modelu / názvu
    if (!match && (extracted.model || extracted.name)) {
      const needle = (extracted.model || extracted.name).trim();
      const { data } = await supabase.from("products").select(sel).ilike("name", `%${needle}%`).limit(5);
      if (data && data.length) match = data[0];
    }
    if (match) return json({ source: "internal", extracted, product: match });

    // 3) nie je interne -> návrh na potvrdenie (produkt sa NEzakladá automaticky)
    return json({
      source: "suggestion",
      extracted,
      suggestion: {
        name: (extracted.name || `${extracted.brand} ${extracted.model}`).trim(),
        brand: extracted.brand, model: extracted.model, barcode: extracted.barcode,
      },
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

// ---- vision cez Anthropic Messages API ----
async function visionExtract(images: string[]) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("Chýba ANTHROPIC_API_KEY (nastav cez supabase secrets set).");
  const model = Deno.env.get("AI_MODEL") || "claude-3-5-sonnet-20241022";
  const content: any[] = images.map(toImageBlock);
  content.push({ type: "text", text: PROMPT });
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 400, messages: [{ role: "user", content }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("AI chyba: " + (data?.error?.message || res.status));
  const text = data?.content?.[0]?.text || "{}";
  return safeJson(text);
}
function toImageBlock(dataUrl: string) {
  const m = /^data:(.*?);base64,(.*)$/s.exec(dataUrl);
  return { type: "image", source: { type: "base64", media_type: m ? m[1] : "image/jpeg", data: m ? m[2] : dataUrl } };
}
function safeJson(t: string) {
  try { const s = t.indexOf("{"), e = t.lastIndexOf("}"); return JSON.parse(t.slice(s, e + 1)); }
  catch { return { brand: "", model: "", serial: "", barcode: "", name: "", specs: "" }; }
}
