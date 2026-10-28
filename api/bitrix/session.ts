// Vercel serverless function — called from the bootstrap page in
// /api/bitrix/install.ts with whatever Bitrix24's own JS SDK handed the
// browser. The browser's claims are never trusted on their own: this
// handler calls Bitrix24's REST API itself, server-to-server, with the
// supplied token to find out who it actually belongs to, before ever
// looking anyone up in our own database.
// Dynamic import, not a top-level one: client.server.ts's own comment warns
// a static import of it is only safe from other *.server.ts modules — a
// top-level import here was crashing this whole function before the
// handler's own try/catch ever got a chance to run (every request, even
// with garbage input, failed with a raw FUNCTION_INVOCATION_FAILED instead
// of a JSON error).

const ALLOWED_DOMAINS = (process.env.BITRIX_ALLOWED_DOMAINS || "")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

// A Bitrix24 user's own email doesn't always match the email their Transpare
// account was created with (e.g. a personal vs. corporate address for the
// same person). BITRIX_USER_EMAIL_OVERRIDES lets an admin force a specific
// Bitrix user id to sign in as a specific Transpare email instead, as a
// comma-separated "bitrixUserId:email" list, e.g. "8:it@egconnects.com".
const USER_EMAIL_OVERRIDES: Record<string, string> = Object.fromEntries(
  (process.env.BITRIX_USER_EMAIL_OVERRIDES || "")
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const [id, email] = pair.split(":").map((s) => s.trim());
      return [id, email];
    })
    .filter(([id, email]) => id && email)
);

export default async function handler(req: any, res: any) {
  try {
    const { supabaseAdmin } = await import("../../src/integrations/supabase/client.server");

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const { domain, authId } = req.body || {};
    if (typeof domain !== "string" || typeof authId !== "string" || !domain || !authId) {
      res.status(400).json({ error: "Missing domain or authId" });
      return;
    }

    if (ALLOWED_DOMAINS.length > 0 && !ALLOWED_DOMAINS.includes(domain.toLowerCase())) {
      res.status(403).json({ error: "Este portal de Bitrix24 no está autorizado." });
      return;
    }

    let email: string | undefined;
    let bitrixUserId: string | undefined;
    try {
      const bxRes = await fetch(`https://${domain}/rest/user.current.json?auth=${encodeURIComponent(authId)}`);
      const bxBody: any = await bxRes.json();
      email = bxBody?.result?.EMAIL;
      bitrixUserId = bxBody?.result?.ID != null ? String(bxBody.result.ID) : undefined;
    } catch {
      res.status(502).json({ error: "No se pudo verificar la sesión con Bitrix24." });
      return;
    }

    if (bitrixUserId && USER_EMAIL_OVERRIDES[bitrixUserId]) {
      email = USER_EMAIL_OVERRIDES[bitrixUserId];
    }

    if (!email) {
      res.status(401).json({ error: "Token de Bitrix24 inválido o expirado." });
      return;
    }

    // Deliberately no auto-provisioning: a Bitrix24 email with no matching,
    // active profile here is rejected outright. Any role is accepted — the
    // profile's own role (admin/rep/accountant/...) decides what the user
    // sees once signed in, via the app's existing role-based gating.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, role, status")
      .ilike("email", email)
      .maybeSingle();

    if (!profile || profile.status !== "active") {
      res.status(403).json({
        error: "Tu correo de Bitrix24 no está vinculado a una cuenta activa en Transpare. Pide a un administrador que te registre.",
      });
      return;
    }

    const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (linkError || !link?.properties?.email_otp) {
      res.status(500).json({ error: "No se pudo generar el acceso a Transpare." });
      return;
    }

    res.status(200).json({ email, otp: link.properties.email_otp });
  } catch (e: any) {
    // Anything unexpected (e.g. a missing env var) still has to come back as
    // JSON — the bootstrap page's fetch() expects to parse a body either way.
    console.error("[bitrix/session] unexpected error:", e);
    res.status(500).json({ error: e?.message || "Error interno en Transpare." });
  }
}
