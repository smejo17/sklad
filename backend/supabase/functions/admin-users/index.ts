// =====================================================================
//  Supabase Edge Function: admin-users
//  Správa používateľov pre ADMINA: zoznam, pozvať/vytvoriť, ban/unban,
//  zmena roly a informácií, zmazanie účtu.
//
//  PREČO edge funkcia: vytváranie/mazanie/ban účtov ide cez Auth Admin API,
//  ktoré vyžaduje SERVICE_ROLE kľúč — ten NESMIE byť v prehliadači.
//  Funkcia si overí, že volajúci je admin, až potom vykoná operáciu.
//
//  Premenné prostredia sú v Supabase edge funkciách dostupné automaticky:
//    SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//  Netreba nič nastavovať. Nasadenie:  supabase functions deploy admin-users
//
//  Volanie z appky (prihlásený admin):
//    sb.functions.invoke("admin-users",{body:{action:"list"}})
//    action: list | create | invite | ban | unban | delete | setRole
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Chýba prihlásenie." }, 401);

    const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

    // over, že volajúci je admin
    const { data: uinfo, error: uerr } = await admin.auth.getUser(jwt);
    if (uerr || !uinfo?.user) return json({ error: "Neplatné prihlásenie." }, 401);
    const callerId = uinfo.user.id;
    const { data: prof } = await admin.from("profiles").select("role").eq("id", callerId).maybeSingle();
    if (!prof || prof.role !== "admin") return json({ error: "Len admin môže spravovať používateľov." }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === "list") {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) return json({ error: error.message }, 200);
      const { data: profs } = await admin.from("profiles").select("*");
      const pmap: Record<string, any> = {};
      (profs || []).forEach((p: any) => { pmap[p.id] = p; });
      const users = (data.users || []).map((u: any) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        banned_until: u.banned_until || (u as any).ban_duration || null,
        profile: pmap[u.id] || null,
      }));
      return json({ users });
    }

    if (action === "create" || action === "invite") {
      const email = String(body.email || "").trim();
      if (!email) return json({ error: "Chýba e-mail." }, 200);
      let userId = "";
      if (action === "invite") {
        const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
        if (error) return json({ error: error.message }, 200);
        userId = data.user?.id || "";
      } else {
        const password = String(body.password || "");
        if (password.length < 6) return json({ error: "Heslo musí mať aspoň 6 znakov (alebo použi pozvánku)." }, 200);
        const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
        if (error) return json({ error: error.message }, 200);
        userId = data.user?.id || "";
      }
      if (userId) {
        await admin.from("profiles").upsert({
          id: userId,
          full_name: body.full_name || email,
          role: body.role || "visitor",
          position: body.position || null,
          phone: body.phone || null,
          note: body.note || null,
          is_active: true,
        }, { onConflict: "id" });
      }
      return json({ ok: true, id: userId });
    }

    if (action === "ban" || action === "unban") {
      const id = String(body.id || "");
      if (!id) return json({ error: "Chýba id." }, 200);
      const ban = action === "ban";
      const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: ban ? "876000h" : "none" });
      if (error) return json({ error: error.message }, 200);
      await admin.from("profiles").update({ is_active: !ban }).eq("id", id);
      return json({ ok: true });
    }

    if (action === "setRole") {
      const id = String(body.id || ""); const role = String(body.role || "");
      if (!id || !role) return json({ error: "Chýba id/rola." }, 200);
      const { error } = await admin.from("profiles").update({ role }).eq("id", id);
      if (error) return json({ error: error.message }, 200);
      return json({ ok: true });
    }

    if (action === "delete") {
      const id = String(body.id || "");
      if (!id) return json({ error: "Chýba id." }, 200);
      if (id === callerId) return json({ error: "Nemôžeš zmazať sám seba." }, 200);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return json({ error: error.message }, 200);
      // profil sa zmaže kaskádou (FK ON DELETE CASCADE na auth.users)
      return json({ ok: true });
    }

    return json({ error: "Neznáma akcia." }, 200);
  } catch (e) {
    return json({ error: String(e && (e as Error).message || e) }, 200);
  }
});
