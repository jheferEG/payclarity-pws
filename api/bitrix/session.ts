// Vercel serverless function — called from the bootstrap page in
// /api/bitrix/install.ts with whatever Bitrix24's own JS SDK handed the
// browser. The browser's claims are never trusted on their own: this
// handler calls Bitrix24's REST API itself, server-to-server, with the
// supplied token to find out who it actually belongs to, before ever
// looking anyone up in our own database.
import { supabaseAdmin } from "../../src/integrations/supabase/client.server";

const ALLOWED_DOMAINS = (process.env.BITRIX_ALLOWED_DOMAINS || "")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

export default async function handler(req: any, res: any) {
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
  try {
    const bxRes = await fetch(`https://${domain}/rest/user.current.json?auth=${encodeURIComponent(authId)}`);
    const bxBody: any = await bxRes.json();
    email = bxBody?.result?.EMAIL;
  } catch {
    res.status(502).json({ error: "No se pudo verificar la sesión con Bitrix24." });
    return;
  }

  if (!email) {
    res.status(401).json({ error: "Token de Bitrix24 inválido o expirado." });
    return;
  }

  // Deliberately no auto-provisioning: a Bitrix24 email with no matching,
  // active accountant profile here is rejected outright.
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, role, status")
    .ilike("email", email)
    .maybeSingle();

  if (!profile || profile.role !== "accountant" || profile.status !== "active") {
    res.status(403).json({
      error: "Tu correo de Bitrix24 no está vinculado a una cuenta de contador activa en Transpare. Pide a un administrador que te registre.",
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
}
