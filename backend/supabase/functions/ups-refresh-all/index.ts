// =====================================================================
//  Supabase Edge Function: ups-refresh-all
//  Prejde VŠETKY nedokončené UPS zásielky, aktualizuje ich stav z UPS
//  a zapíše čas synchronizácie do carrier_sync. Spúšťať 2× denne (cron)
//  alebo ručne tlačidlom „Skontrolovať teraz".
//
//  NASADENIE:
//    supabase functions deploy ups-refresh-all
//    (používa rovnaké secrets UPS_CLIENT_ID / UPS_CLIENT_SECRET / UPS_ENV
//     ako ups-track; SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY sú dostupné
//     automaticky.)
//
//  CRON (2× denne) — pozri supabase_carrier_sync.sql (Dashboard → Cron).
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function base() {
  return (Deno.env.get("UPS_ENV") || "prod") === "cie" ? "https://wwwcie.ups.com" : "https://onlinetools.ups.com";
}
async function upsToken() {
  const id = Deno.env.get("UPS_CLIENT_ID"), secret = Deno.env.get("UPS_CLIENT_SECRET");
  if (!id || !secret) throw new Error("Chýbajú UPS_CLIENT_ID / UPS_CLIENT_SECRET.");
  const r = await fetch(base() + "/security/v1/oauth/token", {
    method: "POST",
    headers: { "Authorization": "Basic " + btoa(id + ":" + secret), "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const d = await r.json();
  if (!r.ok) throw new Error("UPS OAuth: " + (d?.response?.errors?.[0]?.message || r.status));
  return d.access_token as string;
}
function fmtDate(d?: string) { return d && d.length >= 8 ? d.slice(0,4)+"-"+d.slice(4,6)+"-"+d.slice(6,8) : null; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // nedokončené UPS zásielky (nie doručené/vrátené)
    const { data: ships } = await supa.from("shipments")
      .select("id,tracking_number,status")
      .ilike("carrier", "%UPS%")
      .not("tracking_number", "is", null)
      .limit(500);
    const open = (ships || []).filter((s: any) => !/doru[čc]|vr[áa]t|uzav/i.test(s.status || ""));
    let checked = 0, updated = 0;
    if (open.length) {
      const token = await upsToken();
      for (const s of open) {
        checked++;
        try {
          const r = await fetch(base() + "/api/track/v1/details/" + encodeURIComponent(s.tracking_number) + "?locale=en_US", {
            headers: { "Authorization": "Bearer " + token, "transId": crypto.randomUUID(), "transactionSrc": "sklad-app" },
          });
          const d = await r.json();
          const pkg = d?.trackResponse?.shipment?.[0]?.package?.[0];
          if (!pkg) continue;
          const cur = pkg.currentStatus || pkg.activity?.[0]?.status || {};
          const status = cur.description || null;
          const dd = (pkg.deliveryDate || [])[0]?.date;
          const upd: any = {};
          if (status && status !== s.status) upd.status = status;
          if (dd) upd.expected_date = fmtDate(dd);
          if (Object.keys(upd).length) { await supa.from("shipments").update(upd).eq("id", s.id); updated++; }
        } catch (_) { /* preskoč jednu zásielku */ }
      }
    }
    await supa.from("carrier_sync").upsert({ carrier: "UPS", last_run: new Date().toISOString(), checked, updated, note: "OK" });
    return json({ ok: true, carrier: "UPS", checked, updated });
  } catch (e) {
    try {
      const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await supa.from("carrier_sync").upsert({ carrier: "UPS", last_run: new Date().toISOString(), note: "CHYBA: " + String((e as Error).message || e) });
    } catch (_) {}
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
