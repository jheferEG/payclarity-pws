import { supabase } from "@/integrations/supabase/client";

/**
 * Bitrix24 opens this app in an iframe pointed at /api/bitrix/install, which
 * identifies the Bitrix user server-side (validated against Bitrix24's own
 * REST API — never trusting the browser) and redirects here with a
 * one-time Supabase sign-in code. Finishing that exchange before the
 * router's auth guard runs means a Bitrix accountant lands on the exact
 * same app a normal password login would show — nothing else in the app
 * needs to know it came from Bitrix.
 */
export async function completeBitrixSignIn(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const email = params.get("bx_email");
  const otp = params.get("bx_otp");
  if (!email || !otp) return;

  // Drop the one-time code from the URL immediately — before it can be
  // reused, bookmarked, or left sitting in browser history — regardless of
  // whether the exchange below succeeds.
  params.delete("bx_email");
  params.delete("bx_otp");
  const rest = params.toString();
  window.history.replaceState({}, "", window.location.pathname + (rest ? `?${rest}` : ""));

  const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: "email" });
  if (error) {
    window.location.replace(`/login?bx_error=${encodeURIComponent(error.message)}`);
    await new Promise(() => {}); // navigating away — never resolve into app boot
  }
}
