// =====================================================================
//  Supabase Edge Function: dhl-track
//  Zistí stav zásielky z DHL podľa tracking čísla.
//  Používa DHL „Shipment Tracking – Unified" API (developer.dhl.com),
//  ktoré pokrýva DHL Express, Parcel, eCommerce aj Global Forwarding
//  cez jedno tracking číslo. Autentifikácia je len API kľúč (jednoduchšie
//  než UPS OAuth).
//
//  NASTAVENIE:
//   1) developer.dhl.com → zaregistruj appku pre „Shipment Tracking - Unified"
//      → dostaneš API Key.
//   2) V Supabase secrets:  supabase secrets set DHL_API_KEY=...
//   3) supabase functions deploy dhl-track
//
//  Vracia rovnaký tvar ako ups-track (aby appka fungovala rovnako):
//   { found, carrier:"DHL", status, delivered, eta, deliveredAt, service,
//     weight, from, to, activity:[...], pod:{...}, raw }
// =====================================================================
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function d2(x?: string) { return x ? String(x).replace("T", " ").slice(0, 16) : ""; }
function addr(a: any) { if (!a) return ""; const x = a.address || a; return [x.addressLocality, x.postalCode, x.countryCode].filter(Boolean).join(", "); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { tracking } = await req.json();
    if (!tracking) return json({ error: "Chýba tracking číslo." }, 400);
    const key = Deno.env.get("DHL_API_KEY");
    if (!key) return json({ found: false, error: "Chýba DHL_API_KEY (supabase secrets)." });
    const url = "https://api-eu.dhl.com/track/shipments?trackingNumber=" + encodeURIComponent(String(tracking).trim());
    const r = await fetch(url, { headers: { "DHL-API-Key": key, "Accept": "application/json" } });
    const d = await r.json();
    if (!r.ok) return json({ found: false, error: d?.title || d?.detail || ("DHL chyba " + r.status) });
    const sh = d?.shipments?.[0];
    if (!sh) return json({ found: false, carrier: "DHL", raw: d });

    const st = sh.status || {};
    const status = st.description || st.status || "";
    const delivered = /deliver/i.test((st.statusCode || "") + " " + status);
    const events = (sh.events || []).map((e: any) => ({
      date: d2(e.timestamp),
      status: e.description || e.status || "",
      location: addr(e.location),
    }));
    const eta = sh.estimatedTimeOfDelivery ? d2(sh.estimatedTimeOfDelivery) : "";
    const weight = sh.details?.weight ? (sh.details.weight.value + " " + (sh.details.weight.unitText || sh.details.weight.unit || "")) : "";
    const pod = {
      trackingNumber: sh.id || String(tracking),
      service: sh.service || "",
      weight,
      shipFromName: sh.origin?.address?.addressLocality || "",
      shipFromAddr: addr(sh.origin),
      deliveredToName: sh.destination?.address?.addressLocality || "",
      deliveredToAddr: addr(sh.destination),
      deliveredOn: delivered ? d2(st.timestamp) : "",
      shippedBilledOn: "",
      deliveryLocation: sh.details?.proofOfDelivery?.documentUrl ? "POD dostupné" : "",
      receivedBy: sh.details?.proofOfDeliverySignedAvailable ? "podpísané" : "",
      references: [], cod: "",
    };
    return json({
      found: true, carrier: "DHL", status, delivered,
      eta: eta || (delivered ? d2(st.timestamp) : null),
      deliveredAt: pod.deliveredOn || null,
      service: pod.service, weight,
      from: [pod.shipFromName, pod.shipFromAddr].filter(Boolean).join(" · "),
      to: [pod.deliveredToName, pod.deliveredToAddr].filter(Boolean).join(" · "),
      receivedBy: pod.receivedBy, deliveryLocation: pod.deliveryLocation,
      signature: pod.receivedBy ? "áno" : "", cod: "", references: [],
      pod, activity: events.slice(0, 30), raw: d,
    });
  } catch (e) {
    return json({ found: false, error: String((e as Error).message || e) }, 200);
  }
});
