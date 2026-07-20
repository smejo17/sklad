// =====================================================================
//  Supabase Edge Function: ups-quantumview
//  Zisťuje OBCHODNÉ udalosti zásielok cez UPS Quantum View — najmä
//  „C.O.D. collected" (dobierka vybraná), doručenie a výnimky.
//
//  PREČO Quantum View (a nie Tracking API):
//   - Tracking API vracia POLOHU a STAV zásielky (scan events, doručenie).
//     Nie je určené na to, či bola dobierka VYBRATÁ.
//   - Quantum View je UPS produkt na obchodné udalosti: manifest, origin,
//     exception, DELIVERY vrátane COD. Toto používajú firmy na
//     automatické sledovanie platieb dobierkou — nie „externé hľadanie".
//
//  PREDPOKLADY (nastaví používateľ, NIKDY nie do frontendu):
//   supabase secrets set UPS_CLIENT_ID=...        (rovnaké ako pri ups-track)
//   supabase secrets set UPS_CLIENT_SECRET=...
//   supabase secrets set UPS_QV_SUBSCRIPTION=...  (názov Quantum View subscription z UPS účtu)
//   # voliteľné:
//   #   UPS_ENV=prod|cie
//   #   UPS_QV_PATH=/api/quantumview/v3/events   (over presnú cestu na developer.ups.com)
//   #   UPS_QV_DAYS=14                           (koľko dní dozadu)
//
//  V UPS účte treba mať aktívnu Quantum View subscription (Subscriptions).
//
//  VOLANIE z appky (prihlásený user):
//   const {data}=await sb.functions.invoke("ups-quantumview",{body:{tracking:"1Z..."}})
//    -> { found, events:[{tracking,type,codAmount,codCollected,deliveredAt,...}], codByTracking:{...}, raw }
//   Bez „tracking" vráti všetky udalosti za obdobie (na hromadné spárovanie).
//
//  Pozn.: presnú REST cestu a tvar odpovede over na developer.ups.com
//         (znalosť k 05/2025 — Quantum View je verzne špecifické).
// =====================================================================
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

let TOKEN = "", TOKEN_EXP = 0;
function base() {
  return (Deno.env.get("UPS_ENV") || "prod") === "cie"
    ? "https://wwwcie.ups.com"
    : "https://onlinetools.ups.com";
}
async function getToken(): Promise<string> {
  const now = Date.now();
  if (TOKEN && now < TOKEN_EXP - 60000) return TOKEN;
  const id = Deno.env.get("UPS_CLIENT_ID"), secret = Deno.env.get("UPS_CLIENT_SECRET");
  if (!id || !secret) throw new Error("Chýbajú UPS_CLIENT_ID / UPS_CLIENT_SECRET (supabase secrets).");
  const r = await fetch(base() + "/security/v1/oauth/token", {
    method: "POST",
    headers: { "Authorization": "Basic " + btoa(id + ":" + secret), "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const d = await r.json();
  if (!r.ok) throw new Error("UPS OAuth chyba: " + (d?.response?.errors?.[0]?.message || r.status));
  TOKEN = d.access_token; TOKEN_EXP = now + (Number(d.expires_in || 3600) * 1000);
  return TOKEN;
}

// UPS dátum-čas: YYYYMMDDHHMMSS
function stamp(d: Date) {
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return "" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const wantTrk = body?.tracking ? String(body.tracking).trim() : "";
    const sub = Deno.env.get("UPS_QV_SUBSCRIPTION") || "";
    if (!sub) return json({ found: false, error: "Chýba UPS_QV_SUBSCRIPTION (názov Quantum View subscription). Aktivuj Quantum View v UPS účte a nastav secret." }, 200);
    const token = await getToken();
    const days = Number(Deno.env.get("UPS_QV_DAYS") || (body?.days ?? 14));
    const end = new Date(), start = new Date(end.getTime() - days * 86400000);
    const path = Deno.env.get("UPS_QV_PATH") || "/api/quantumview/v3/events";
    const payload = {
      QuantumViewRequest: {
        Request: { RequestAction: "QVEvents" },
        SubscriptionRequest: {
          Name: sub,
          DateTimeRange: { BeginDateTime: stamp(start), EndDateTime: stamp(end) },
        },
      },
    };
    const headers: Record<string, string> = {
      "Authorization": "Bearer " + token,
      "transId": crypto.randomUUID(),
      "transactionSrc": "sklad-app",
      "Content-Type": "application/json",
      "Accept": "application/json",
    };
    // niektoré UPS API vyžadujú popri OAuth aj Access License Number / číslo účtu
    const acc = Deno.env.get("UPS_ACCESS_LICENSE");
    if (acc) headers["AccessLicenseNumber"] = acc;
    const merch = Deno.env.get("UPS_ACCOUNT");
    if (merch) headers["x-merchant-id"] = merch;

    const r = await fetch(base() + path, { method: "POST", headers, body: JSON.stringify(payload) });
    const rawText = await r.text();
    let d: any = {}; try { d = JSON.parse(rawText); } catch { /* nie JSON */ }
    if (!r.ok) {
      const upsMsg = d?.response?.errors?.[0]?.message
        || d?.response?.errors?.[0]?.code
        || d?.Fault?.detail?.Errors?.ErrorDetail?.PrimaryErrorCode?.Description
        || (rawText ? rawText.slice(0, 300) : ("UPS QV chyba " + r.status));
      return json({ found: false, error: upsMsg, httpStatus: r.status, endpoint: path, raw: d, rawText: rawText.slice(0, 800) }, 200);
    }

    // odpoveď je stromová a verzne špecifická — vyzbierame všetky uzly s tracking číslom
    const events = collectEvents(d);
    const codByTracking: Record<string, any> = {};
    for (const e of events) {
      if (!e.tracking) continue;
      const prev = codByTracking[e.tracking];
      // uprednostni doručenie / COD collected
      if (!prev || e.codCollected || e.type === "Delivery") codByTracking[e.tracking] = e;
    }
    const filtered = wantTrk ? events.filter(e => e.tracking && e.tracking.toUpperCase() === wantTrk.toUpperCase()) : events;
    return json({
      found: filtered.length > 0,
      count: filtered.length,
      events: filtered.slice(0, 500),
      codByTracking: wantTrk ? (codByTracking[wantTrk] ? { [wantTrk]: codByTracking[wantTrk] } : {}) : codByTracking,
      subscription: sub, days, raw: d,
    });
  } catch (e) {
    return json({ found: false, error: String(e && (e as Error).message || e) }, 200);
  }
});

// prejde celý strom odpovede a vytiahne udalosti s tracking číslom + COD/doručenie
function collectEvents(root: any): any[] {
  const out: any[] = [];
  const seen = new Set<any>();
  const typeHint = (path: string[]) => {
    const j = path.join(" ").toLowerCase();
    if (/deliver/.test(j)) return "Delivery";
    if (/exception/.test(j)) return "Exception";
    if (/manifest/.test(j)) return "Manifest";
    if (/origin/.test(j)) return "Origin";
    if (/generic/.test(j)) return "Generic";
    return "";
  };
  const walk = (o: any, path: string[]) => {
    if (!o || typeof o !== "object" || seen.has(o)) return; seen.add(o);
    // tento uzol vyzerá ako "package/udalosť" ak má tracking číslo
    const trk = findTracking(o);
    if (trk) {
      const cod = findCodInfo(o);
      const type = typeHint(path) || (cod.amount ? "COD" : "");
      out.push({
        tracking: trk,
        type,
        codAmount: cod.amount || "",
        codCollected: type === "Delivery" && !!cod.amount ? true : cod.collected,
        deliveredAt: findDate(o, ["deliver", "date"]) || "",
        eventDate: findDate(o, ["date", "time"]) || "",
      });
    }
    for (const k of Object.keys(o)) { const v = o[k]; if (v && typeof v === "object") walk(v, path.concat(k)); }
  };
  walk(root, []);
  return out;
}
function findTracking(o: any): string {
  for (const k of Object.keys(o)) {
    if (/tracking\s*number|trackingnumber|packagetrackingnumber/i.test(k)) {
      const v = o[k]; if (typeof v === "string" && v.trim()) return v.trim();
      if (v && typeof v === "object" && typeof v.Value === "string") return v.Value.trim();
    }
  }
  return "";
}
function findCodInfo(o: any): { amount: string; collected: boolean } {
  let amount = "", collected = false;
  const seen = new Set<any>();
  const walk = (x: any) => {
    if (!x || typeof x !== "object" || seen.has(x) || amount) return; seen.add(x);
    for (const k of Object.keys(x)) {
      const v = x[k];
      if (/cod/i.test(k)) {
        if (v && typeof v === "object") {
          const amt = v.MonetaryValue ?? v.monetaryValue ?? v.Amount ?? v.amount ?? v.Value ?? (v.CODAmount && (v.CODAmount.MonetaryValue ?? v.CODAmount));
          const cur = v.CurrencyCode ?? v.currencyCode ?? (v.CODAmount && v.CODAmount.CurrencyCode) ?? "";
          if (amt) amount = String(amt) + (cur ? " " + cur : "");
          collected = true;
        } else if (typeof v === "string" && v.trim()) { amount = v.trim(); collected = true; }
      }
      if (v && typeof v === "object") walk(v);
    }
  };
  walk(o);
  return { amount, collected };
}
function findDate(o: any, hints: string[]): string {
  for (const k of Object.keys(o)) {
    if (hints.some(h => k.toLowerCase().includes(h))) {
      const v = o[k]; if (typeof v === "string" && /\d{6,}/.test(v)) return fmt(v);
      if (v && typeof v === "object" && typeof v.Date === "string") return fmt(v.Date);
    }
  }
  return "";
}
function fmt(s: string) {
  const d = (s.match(/\d{8}/) || [])[0]; if (!d) return s;
  return d.slice(0, 4) + "-" + d.slice(4, 6) + "-" + d.slice(6, 8);
}
