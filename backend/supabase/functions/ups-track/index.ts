// =====================================================================
//  Supabase Edge Function: ups-track
//  Zistí stav zásielky z UPS podľa tracking čísla.
//
//  PREČO edge funkcia (a nie priamo frontend):
//   - UPS API vyžaduje OAuth 2.0 (client credentials) so Client Secret,
//     ktorý NESMIE byť v prehliadači.
//   - UPS API nepovoľuje volania priamo z prehliadača (CORS).
//   Preto secret drží server (edge funkcia) a appka volá len ju.
//
//  NASTAVENIE:
//   1) Na https://developer.ups.com vytvor appku → získaj Client ID a Secret.
//   2) V Supabase nastav secrets (NIKDY nie do frontendu):
//        supabase secrets set UPS_CLIENT_ID=...
//        supabase secrets set UPS_CLIENT_SECRET=...
//        # voliteľne prostredie: UPS_ENV=prod  (alebo cie = testovacie)
//   3) supabase functions deploy ups-track
//
//  VOLANIE z appky (prihlásený user):
//    const {data}=await sb.functions.invoke("ups-track",{body:{tracking:"1Z..."}})
//    -> { found, status, delivered, eta, activity:[{date,status,location}], carrier:"UPS" }
//
//  Pozn.: presné endpointy over na developer.ups.com (znalosť k 05/2025).
// =====================================================================
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// jednoduchá pamäť tokenu medzi volaniami (best-effort)
let TOKEN = "", TOKEN_EXP = 0;

function base() {
  return (Deno.env.get("UPS_ENV") || "prod") === "cie"
    ? "https://wwwcie.ups.com"   // testovacie prostredie (CIE)
    : "https://onlinetools.ups.com"; // produkcia
}

async function getToken(): Promise<string> {
  const now = Date.now();
  if (TOKEN && now < TOKEN_EXP - 60000) return TOKEN;
  const id = Deno.env.get("UPS_CLIENT_ID"), secret = Deno.env.get("UPS_CLIENT_SECRET");
  if (!id || !secret) throw new Error("Chýbajú UPS_CLIENT_ID / UPS_CLIENT_SECRET (supabase secrets).");
  const r = await fetch(base() + "/security/v1/oauth/token", {
    method: "POST",
    headers: {
      "Authorization": "Basic " + btoa(id + ":" + secret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const d = await r.json();
  if (!r.ok) throw new Error("UPS OAuth chyba: " + (d?.response?.errors?.[0]?.message || r.status));
  TOKEN = d.access_token;
  TOKEN_EXP = now + (Number(d.expires_in || 3600) * 1000);
  return TOKEN;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { tracking } = await req.json();
    if (!tracking) return json({ error: "Chýba tracking číslo." }, 400);
    const trk = String(tracking).trim();
    const token = await getToken();
    const url = base() + "/api/track/v1/details/" + encodeURIComponent(trk) + "?locale=en_US&returnSignature=false";
    const r = await fetch(url, {
      headers: {
        "Authorization": "Bearer " + token,
        "transId": crypto.randomUUID(),
        "transactionSrc": "sklad-app",
        "Content-Type": "application/json",
      },
    });
    const d = await r.json();
    if (!r.ok) return json({ found: false, error: d?.response?.errors?.[0]?.message || ("UPS chyba " + r.status) }, 200);

    const shipment = d?.trackResponse?.shipment?.[0];
    const pkg = shipment?.package?.[0];
    if (!pkg) return json({ found: false, carrier: "UPS", raw: d });

    const acts = (pkg.activity || []).map((a: any) => ({
      date: fmtDate(a.date, a.time),
      status: a?.status?.description || "",
      location: [a?.location?.address?.city, a?.location?.address?.stateProvince, a?.location?.address?.countryCode].filter(Boolean).join(", "),
    }));
    const cur = pkg.currentStatus || pkg.activity?.[0]?.status || {};
    const status = cur.description || "";
    // POZOR: "Out for Delivery" obsahuje "Delivery" — nesmie sa počítať ako doručené.
    // Doručené = stavový typ "D" (Delivered) alebo popis obsahujúci slovo "delivered".
    const delivered = (cur.type || "").toUpperCase() === "D" || /\bdelivered\b/i.test(status);
    // dátumy: doručenie / plánované
    const dArr = pkg.deliveryDate || shipment?.deliveryDate || [];
    const del = dArr.find((x: any) => /DEL/i.test(x.type || "")) || dArr[0];
    const sch = dArr.find((x: any) => /SDD|scheduled|EDW|RDD/i.test(x.type || ""));
    // adresy pôvod/cieľ (meno + celá adresa)
    const findAddr = (starts: string[]) => (pkg.packageAddress || shipment?.shipmentAddress || [])
      .find((x: any) => starts.some(t => (x.type || "").toUpperCase().startsWith(t)));
    const nameOf = (a: any) => a ? (a.name || a.attentionName || "") : "";
    const fullAddr = (a: any) => {
      if (!a) return ""; const ad = a.address || a;
      return [ad.addressLine1 || (ad.addressLine && ad.addressLine[0]), ad.city, ad.stateProvince, ad.postalCode, ad.countryCode].filter(Boolean).join(", ");
    };
    const orig = findAddr(["ORIG", "SHIPPER"]);
    const dest = findAddr(["DEST", "SHIP TO", "SHIPTO", "CONSIGNEE"]);
    const di = pkg.deliveryInformation || {};
    const refs = (pkg.referenceNumber || []).map((r: any) => r.number).filter(Boolean);
    // C.O.D. (dobierka) — hĺbkové hľadanie v odpovedi (názvy polí sa líšia)
    const cod = findCod(d) || findCod(shipment) || "";
    // dátum vytvorenia štítku — najstaršia udalosť / "label created"
    const labelEv = (pkg.activity || []).find((a: any) => /label created|order processed|shipper created a label|billing information received/i.test(a?.status?.description || ""));
    const oldest = acts.length ? acts[acts.length - 1].date : "";
    const labelDate = (labelEv && fmtDate(labelEv.date)) || (shipment?.pickupDate ? fmtDate(shipment.pickupDate) : "") || (oldest ? String(oldest).slice(0, 10) : "");
    const pod = {
      trackingNumber: pkg.trackingNumber || trk,
      service: pkg.service?.description || "",
      weight: pkg.weight?.weight ? (pkg.weight.weight + " " + (pkg.weight.unitOfMeasurement?.code || "")) : "",
      category: pkg.packageCount ? "Parcel" : (shipment?.service?.description || "Parcel"),
      shipFromName: nameOf(orig), shipFromAddr: fullAddr(orig),
      deliveredToName: nameOf(dest), deliveredToAddr: fullAddr(dest),
      shippedBilledOn: shipment?.pickupDate ? fmtDate(shipment.pickupDate) : (pkg.pickupDate ? fmtDate(pkg.pickupDate) : ""),
      deliveredOn: delivered && del?.date ? fmtDate(del.date, pkg.deliveryTime?.endTime || pkg.deliveryTime?.startTime) : "",
      deliveryLocation: di.location || "",
      receivedBy: di.receivedBy || "",
      cod, references: refs, labelDate,
    };
    return json({
      found: true, carrier: "UPS", status, delivered,
      eta: sch?.date ? fmtDate(sch.date) : (del?.date ? fmtDate(del.date) : null),
      deliveredAt: pod.deliveredOn || null,
      service: pod.service, weight: pod.weight,
      packages: shipment?.package?.length || 1,
      from: [pod.shipFromName, pod.shipFromAddr].filter(Boolean).join(" · "),
      to: [pod.deliveredToName, pod.deliveredToAddr].filter(Boolean).join(" · "),
      receivedBy: pod.receivedBy, deliveryLocation: pod.deliveryLocation,
      signature: di.signature ? "áno" : "", cod: pod.cod, references: refs,
      pod, activity: acts.slice(0, 30), raw: d,
    });
  } catch (e) {
    return json({ found: false, error: String(e && (e as Error).message || e) }, 200);
  }
});

// hĺbkové hľadanie sumy dobierky (C.O.D.) v odpovedi — názvy polí sa líšia
function findCod(obj: any): string {
  let out = "";
  const seen = new Set<any>();
  const walk = (o: any) => {
    if (!o || typeof o !== "object" || seen.has(o) || out) return; seen.add(o);
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (/cod/i.test(k) && v && typeof v === "object") {
        const amt = v.monetaryValue ?? v.amount ?? v.value ?? (v.currencyMonetaryValue && v.currencyMonetaryValue.monetaryValue);
        const cur = v.currencyCode ?? v.currency ?? (v.currencyMonetaryValue && v.currencyMonetaryValue.currencyCode) ?? "";
        if (amt) { out = String(amt) + (cur ? " " + cur : ""); return; }
      }
      if (v && typeof v === "object") walk(v);
    }
  };
  walk(obj); return out;
}
function fmtDate(d?: string, t?: string) {
  if (!d || d.length < 8) return d || "";
  const s = d.slice(0, 4) + "-" + d.slice(4, 6) + "-" + d.slice(6, 8);
  return t && t.length >= 4 ? s + " " + t.slice(0, 2) + ":" + t.slice(2, 4) : s;
}
