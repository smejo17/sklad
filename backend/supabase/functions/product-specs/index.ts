// =====================================================================
//  Supabase Edge Function: product-specs
//  Automaticky doplní PARAMETRE produktu podľa kategórie pomocou AI
//  (z názvu / značky / modelu — funguje aj bez EAN, napr. pre ASIC).
//
//  NASADENIE:
//    supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//    # voliteľne: supabase secrets set AI_MODEL=claude-3-5-sonnet-20241022
//    supabase functions deploy product-specs
//
//  Volanie z appky:
//    sb.functions.invoke("product-specs",{ body:{
//      name, brand, model, category,
//      attributes:[{key,label,type,unit,options}] }})
//    -> { attrs:{ <key>: <hodnota>, ... } }
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
    const { name, brand, model, category, attributes } = await req.json();
    if (!name) return json({ error: "Chýba názov produktu." }, 400);
    const attrs = Array.isArray(attributes) ? attributes : [];
    if (!attrs.length) return json({ error: "Žiadne parametre na doplnenie." }, 400);

    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ error: "Chýba ANTHROPIC_API_KEY (supabase secrets)." });
    const aiModel = Deno.env.get("AI_MODEL") || "claude-haiku-4-5";

    const attrList = attrs.map((a: any) => {
      let line = `- ${a.key} (${a.label}${a.unit ? ", jednotka " + a.unit : ""}, typ ${a.type})`;
      if (a.type === "enum" && Array.isArray(a.options) && a.options.length) line += ` — vyber z: ${a.options.join(", ")}`;
      return line;
    }).join("\n");

    const prompt = `Si expert na IT hardvér a ASIC minery. Pre produkt nižšie doplň technické parametre.
Produkt: ${[brand, name, model].filter(Boolean).join(" ")}
Kategória: ${category || "-"}

Parametre na doplnenie:
${attrList}

Pravidlá:
- Vráť IBA čisté JSON: {"attrs": { "<key>": <hodnota>, ... }}.
- Vyplň len tie, ktoré vieš spoľahlivo určiť z názvu/modelu (napr. Antminer S21, RTX 4090). Ostatné vynechaj.
- Číselné hodnoty daj ako číslo bez jednotky. Pri type enum použi presne jednu z ponúknutých možností.
- Nevymýšľaj; ak si nie si istý, kľúč vynechaj.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: aiModel, max_tokens: 700, messages: [{ role: "user", content: prompt }] }),
    });
    const d = await res.json();
    if (!res.ok) return json({ error: "AI chyba: " + (d?.error?.message || res.status) });
    const text = d?.content?.[0]?.text || "{}";
    let parsed: any = {};
    try { const a = text.indexOf("{"), b = text.lastIndexOf("}"); parsed = JSON.parse(text.slice(a, b + 1)); } catch { parsed = {}; }
    const out = parsed.attrs || parsed || {};
    // ponechaj len známe kľúče
    const allowed: Record<string, unknown> = {};
    for (const a of attrs) { if (out[a.key] != null && out[a.key] !== "") allowed[a.key] = out[a.key]; }
    const usage = d?.usage ? { input_tokens: d.usage.input_tokens, output_tokens: d.usage.output_tokens, model: aiModel } : null;
    return json({ attrs: allowed, usage });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
