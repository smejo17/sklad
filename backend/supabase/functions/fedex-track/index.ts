// =====================================================================
//  Supabase Edge Function: fedex-track
//  Zistí stav zásielky z FedEx podľa tracking čísla (Track API).
//  Autentifikácia: OAuth 2.0 client credentials (ako UPS).
//
//  NASTAVENIE:
//   1) developer.fedex.com → vytvor projekt/appku → povoľ „Track API"
//      → dostaneš API Key (client_id) a Secret Key (client_secret).
//   2) V Supabase secrets:
//        supabase secrets set FEDEX_CLIENT_ID=... FEDEX_CLIENT_SECRET=...
//        # voliteľne prostredie: FEDEX_ENV=prod  (alebo sandbox)
//   3) supabase functions deploy fedex-track
//
//  Vracia rovnaký tvar ako ups-track / dhl-track (aby appka fungovala
//  rovnako): { found, carrier:"FedEx", status, delivered, eta, ... , raw }
// =====================================================================
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

let TOKEN = "", TOKEN_EXP = 0, WORK_BASE = "";
const PROD = "https://apis.fedex.com", SAND = "https://apis-sandbox.fedex.com";
// poradie prostredí podľa FEDEX_ENV; ak zlyhá kvôli nesprávnemu prostrediu, skúsi druhé
function envBases(): string[] {
  return (Deno.env.get("FEDEX_ENV") || "prod") === "sandbox" ? [SAND, PROD] : [PROD, SAND];
}
function base() { return WORK_BASE || envBases()[0]; }

async function tryToken(b: string, id: string, secret: string) {
  const r = await fetch(b + "/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials&client_id=" + encodeURIComponent(id) + "&client_secret=" + encodeURIComponent(secret),
  });
  const d = await r.json();
  return { ok: r.ok, token: d?.access_token, exp: d?.expires_in, msg: d?.errors?.[0]?.message || r.status };
}

async function getToken(): Promise<string> {
  const now = Date.now();
  if (TOKEN && now < TOKEN_EXP - 60000) return TOKEN;
  const id = Deno.env.get("FEDEX_CLIENT_ID"), secret = Deno.env.get("FEDEX_CLIENT_SECRET");
  if (!id || !secret) throw new Error("Chýbajú FEDEX_CLIENT_ID / FEDEX_CLIENT_SECRET (supabase secrets).");
  let lastMsg = "";
  for (const b of envBases()) {
    const t = await tryToken(b, id, secret);
    if (t.ok && t.token) { TOKEN = t.token; TOKEN_EXP = now + (Number(t.exp || 3600) * 1000); WORK_BASE = b; return TOKEN; }
    lastMsg = String(t.msg || "");
    // ak to nie je problém prostredia, nemá zmysel skúšať druhé
    if (!/sandbox|production|environment|not allowed/i.test(lastMsg)) break;
  }
  // časté nedorozumenie: nastavené sú TESTOVACIE (sandbox) kľúče, ale sledujeme reálne zásielky (produkcia)
  if (/sandbox credentials not allowed/i.test(lastMsg))
    lastMsg += " — Máš nastavené TESTOVACIE (Test Key) kľúče. Na sledovanie reálnych zásielok treba PRODUKČNÉ kľúče z developer.fedex.com (projekt → Production → API Key + Secret).";
  else if (/production credentials not allowed/i.test(lastMsg))
    lastMsg += " — Produkčné kľúče idú na testovací endpoint. Odstráň secret FEDEX_ENV (alebo nastav FEDEX_ENV=prod).";
  throw new Error("FedEx OAuth chyba: " + lastMsg);
}
function iso(s?: string) { return s ? String(s).replace("T", " ").slice(0, 16) : ""; }
function fedAddr(a: any) { if (!a) return ""; return [a.city, a.stateOrProvinceCode, a.postalCode, a.countryCode].filter(Boolean).join(", "); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { tracking } = await req.json();
    if (!tracking) return json({ error: "Chýba tracking číslo." }, 400);
    const token = await getToken();
    const r = await fetch(base() + "/track/v1/trackingnumbers", {
      method: "POST",
      headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json", "x-locale": "en_US" },
      body: JSON.stringify({ includeDetailedScans: true, trackingInfo: [{ trackingNumberInfo: { trackingNumber: String(tracking).trim() } }] }),
    });
    const d = await r.json();
    if (!r.ok) return json({ found: false, error: d?.errors?.[0]?.message || ("FedEx chyba " + r.status), raw: d });
    const tr = d?.output?.completeTrackResults?.[0]?.trackResults?.[0];
    if (!tr || tr.error) return json({ found: false, carrier: "FedEx", error: tr?.error?.message || "Nenašlo sa", raw: d });

    const status = tr.latestStatusDetail?.description || tr.latestStatusDetail?.statusByLocale || "";
    const delivered = (tr.latestStatusDetail?.derivedCode === "DL") || /deliver/i.test(status);
    const dt = (t: string) => (tr.dateAndTimes || []).find((x: any) => x.type === t)?.dateTime;
    const eta = dt("ESTIMATED_DELIVERY") || dt("ESTIMATED_DELIVERY_WINDOW") || null;
    const delOn = dt("ACTUAL_DELIVERY");
    const scans = (tr.scanEvents || []).map((e: any) => ({
      date: iso(e.date),
      status: e.eventDescription || e.derivedStatus || "",
      location: fedAddr(e.scanLocation),
    }));
    const w = tr.packageDetails?.weightAndDimensions?.weight?.[0];
    const pod = {
      trackingNumber: tr.trackingNumberInfo?.trackingNumber || String(tracking),
      service: tr.serviceDetail?.description || "",
      weight: w ? (w.value + " " + (w.unit || "")) : "",
      shipFromName: tr.shipperInformation?.contact?.companyName || tr.shipperInformation?.contact?.personName || "",
      shipFromAddr: fedAddr(tr.shipperInformation?.address),
      deliveredToName: tr.recipientInformation?.contact?.companyName || tr.recipientInformation?.contact?.personName || "",
      deliveredToAddr: fedAddr(tr.recipientInformation?.address),
      deliveredOn: delivered ? iso(delOn) : "",
      receivedBy: tr.deliveryDetails?.receivedByName || "",
      deliveryLocation: tr.deliveryDetails?.deliveryAttempts ? "" : (tr.deliveryDetails?.locationDescription || ""),
      references: (tr.additionalTrackingInfo?.packageIdentifiers || []).map((x: any) => (x.values || []).join("/")).filter(Boolean),
      cod: "",
    };
    return json({
      found: true, carrier: "FedEx", status: status || "—", delivered,
      eta: eta ? iso(eta) : (delivered ? iso(delOn) : null),
      deliveredAt: pod.deliveredOn || null,
      service: pod.service, weight: pod.weight,
      from: [pod.shipFromName, pod.shipFromAddr].filter(Boolean).join(" · "),
      to: [pod.deliveredToName, pod.deliveredToAddr].filter(Boolean).join(" · "),
      receivedBy: pod.receivedBy, deliveryLocation: pod.deliveryLocation,
      signature: pod.receivedBy ? "áno" : "", cod: "", references: pod.references,
      pod, activity: scans.slice(0, 30), raw: d,
    });
  } catch (e) {
    return json({ found: false, error: String((e as Error).message || e) }, 200);
  }
});
