// =====================================================================
//  Supabase Edge Function: gls-track
//  Zistí stav zásielky z GLS podľa tracking čísla.
//
//  POZOR: GLS tracking API je NÁRODNE ŠPECIFICKÉ (iné pre GLS CZ, GLS
//  Group, ...) a beží na prihlásení z tvojej GLS zmluvy. Preto je funkcia
//  KONFIGUROVATEĽNÁ — presnú URL a prihlásenie zadáš ako secrets:
//
//    GLS_TRACK_URL   – URL šablóna s {TRACKING}, napr.
//                      https://api.gls-group.eu/public/v1/tracking/{TRACKING}
//                      (presnú adresu nájdeš v dokumentácii svojej GLS zmluvy)
//    GLS_USER        – (voliteľné) meno pre Basic auth
//    GLS_PASSWORD    – (voliteľné) heslo pre Basic auth
//    GLS_API_KEY     – (voliteľné) ak GLS používa hlavičku s kľúčom
//    GLS_KEY_HEADER  – (voliteľné) názov hlavičky pre kľúč (default: x-api-key)
//
//  NASADENIE:
//    supabase secrets set GLS_TRACK_URL=... GLS_USER=... GLS_PASSWORD=...
//    supabase functions deploy gls-track
//
//  Vracia rovnaký tvar ako ups-track / dhl-track (aby appka fungovala
//  rovnako). Ak sa štruktúra GLS odpovede líši, uloží sa aj celé `raw`.
// =====================================================================
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const pick = (o: any, keys: string[]) => { for (const k of keys) { if (o && o[k] != null && o[k] !== "") return o[k]; } return ""; };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { tracking } = await req.json();
    if (!tracking) return json({ error: "Chýba tracking číslo." }, 400);
    const tmpl = Deno.env.get("GLS_TRACK_URL");
    if (!tmpl) return json({ found: false, error: "Chýba GLS_TRACK_URL (nastav URL tracking API z tvojej GLS zmluvy)." });
    const url = tmpl.replace("{TRACKING}", encodeURIComponent(String(tracking).trim()));

    const headers: Record<string, string> = { "Accept": "application/json" };
    const user = Deno.env.get("GLS_USER"), pass = Deno.env.get("GLS_PASSWORD");
    if (user && pass) headers["Authorization"] = "Basic " + btoa(user + ":" + pass);
    const apiKey = Deno.env.get("GLS_API_KEY");
    if (apiKey) headers[Deno.env.get("GLS_KEY_HEADER") || "x-api-key"] = apiKey;

    const r = await fetch(url, { headers });
    const text = await r.text();
    let d: any = null; try { d = JSON.parse(text); } catch { d = { _text: text }; }
    if (!r.ok) return json({ found: false, error: "GLS chyba " + r.status + (d?.message ? ": " + d.message : ""), raw: d });

    // heuristické parsovanie – GLS vracia rôzne štruktúry podľa krajiny
    const parcel = d?.parcels?.[0] || d?.tuStatus?.[0] || d?.shipments?.[0] || d;
    const histRaw = parcel?.history || parcel?.events || parcel?.progressBar?.statusInfo || d?.history || [];
    const activity = (Array.isArray(histRaw) ? histRaw : []).map((e: any) => ({
      date: String(pick(e, ["date", "time", "timestamp", "eventDate"]) || "") + (e.time && e.date ? " " + e.time : ""),
      status: pick(e, ["status", "statusText", "description", "evtDscr", "text"]),
      location: pick(e, ["location", "city", "place"]) || pick(e.address || {}, ["city", "countryName", "countryCode"]),
    })).filter((x: any) => x.status || x.date);
    const last = activity[0] || {};
    const status = pick(parcel, ["status", "statusText", "currentStatus"]) || last.status || "";
    const delivered = /deliver|doru[čc]/i.test(status);
    return json({
      found: true, carrier: "GLS", status: status || "—", delivered,
      eta: pick(parcel, ["estimatedDelivery", "deliveryDate", "expectedDelivery"]) || null,
      deliveredAt: delivered ? (last.date || null) : null,
      service: pick(parcel, ["product", "service"]) || "",
      weight: pick(parcel, ["weight"]) || "",
      from: pick(parcel, ["shipperCity", "origin"]) || "",
      to: pick(parcel, ["consigneeCity", "destination"]) || "",
      receivedBy: pick(parcel, ["signature", "receivedBy"]) || "",
      deliveryLocation: "", signature: "", cod: pick(parcel, ["codAmount", "cod"]) || "", references: [],
      pod: {
        trackingNumber: pick(parcel, ["trackId", "parcelNumber", "id"]) || String(tracking),
        service: pick(parcel, ["product", "service"]) || "",
        shipFromName: "", shipFromAddr: pick(parcel, ["shipperCity", "origin"]) || "",
        deliveredToName: "", deliveredToAddr: pick(parcel, ["consigneeCity", "destination"]) || "",
        deliveredOn: delivered ? (last.date || "") : "", references: [], cod: "",
      },
      activity: activity.slice(0, 30), raw: d,
    });
  } catch (e) {
    return json({ found: false, error: String((e as Error).message || e) }, 200);
  }
});
