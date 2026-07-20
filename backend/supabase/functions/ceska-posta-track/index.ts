// =====================================================================
//  Supabase Edge Function: ceska-posta-track
//  Sledovanie zásielok Českej pošty A Balíkovne (rovnaká sieť).
//  Verejné API Českej pošty — BEZ kľúča, bez zmluvy.
//    GET https://b2c.cpost.cz/services/ParcelHistory/getDataAsJson?idParcel=<č.>&language=cs
//
//  NASADENIE:  supabase functions deploy ceska-posta-track
//  VOLANIE:    sb.functions.invoke("ceska-posta-track",{ body:{ tracking:"..." }})
//    -> { found, carrier, status, delivered, deliveredAt, eta, activity:[{date,status,location}],
//         weight, cod, from, to, pieces, storedUntil, raw }
// =====================================================================
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const isDelivered = (t: string) => /doru[čc]|dodán|vydán|vyzved|p[řr]edán[ao] p[řr][íi]jemci/i.test(t || "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { tracking } = await req.json();
    if (!tracking) return json({ error: "Chýba tracking číslo." }, 400);
    const num = String(tracking).trim().replace(/\s/g, "");
    const url = "https://b2c.cpost.cz/services/ParcelHistory/getDataAsJson?idParcel=" + encodeURIComponent(num) + "&language=cs";
    const r = await fetch(url, { headers: { "Accept": "application/json" } });
    const d = await r.json();
    const rec = Array.isArray(d) ? d[0] : d;
    const states: any[] = rec?.states?.state || [];
    // chybové stavy: -3 = nie je v evidencii, -4 = tento druh sa nezobrazuje
    if (!states.length || (states.length === 1 && (String(states[0].id) === "-3" || String(states[0].id) === "-4"))) {
      return json({ found: false, carrier: "Česká pošta", error: states[0]?.text || "Zásielka sa nenašla v evidencii." });
    }
    const at = rec.attributes || {};
    // stavy sú chronologicky (najstarší → najnovší); pre zobrazenie otočíme na najnovší prvý
    const activity = states.slice().reverse().map((s) => ({
      date: s.date || "",
      status: s.text || "",
      location: [s.postoffice, s.postcode].filter(Boolean).join(", "),
    }));
    const last = states[states.length - 1] || {};
    const delState = states.filter((s) => isDelivered(s.text)).pop();
    const delivered = !!delState;
    const cod = at.dobirka && Number(at.dobirka) > 0 ? (Number(at.dobirka) + " " + (at.currency || "CZK")) : "";
    return json({
      found: true,
      carrier: "Česká pošta",
      status: last.text || "",
      delivered,
      deliveredAt: delState ? (delState.date || null) : null,
      eta: at.dorucovaniDate || null,
      weight: at.weight && Number(at.weight) > 0 ? (at.weight + " kg") : "",
      cod,
      from: at.zemePuvodu || "",
      to: at.zemeUrceni || "",
      pieces: at.kusu || null,
      storedUntil: at.ulozeniDo || null,
      activity,
      raw: rec,
    });
  } catch (e) {
    return json({ found: false, error: String((e as Error).message || e) });
  }
});
