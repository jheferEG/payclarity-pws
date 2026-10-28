// Vercel serverless function — register THIS endpoint's URL as the Bitrix24
// "Local application" handler/installation path. Bitrix24 loads it inside
// an iframe every time the app is opened (not only on first install), so it
// must run before our SPA bundle does — that's why it's a small hand-written
// HTML/JS bootstrap instead of a React route. All the real work (validating
// the Bitrix session, checking the account exists, minting a Supabase
// sign-in code) happens server-side in /api/bitrix/session.ts; this page's
// only job is to run Bitrix24's own JS SDK (which only works inside their
// iframe) and hand its result to that endpoint.
export default function handler(req: any, res: any) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(`<!doctype html>
<html lang="es">
<head><meta charset="utf-8" /><title>Transpare</title></head>
<body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#475569;background:#f8fafc">
  <p>Conectando con Bitrix24&hellip;</p>
  <script src="https://api.bitrix24.com/api/v1/"></script>
  <script>
    function fail(msg) {
      window.location.href = "/login?bx_error=" + encodeURIComponent(msg);
    }

    function proceed(domain, authId) {
      fetch("/api/bitrix/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain, authId: authId }),
      })
        .then(function (r) {
          return r.text().then(function (text) {
            var body;
            try {
              body = JSON.parse(text);
            } catch (e) {
              throw new Error("HTTP " + r.status + ", respuesta no-JSON: " + text.slice(0, 300));
            }
            return { ok: r.ok, status: r.status, body: body };
          });
        })
        .then(function (result) {
          if (!result.ok) {
            var msg = result.body && result.body.error ? result.body.error : "No tienes acceso desde Bitrix24.";
            fail(msg + " (HTTP " + result.status + ")");
            return;
          }
          // "view" lets a caller (e.g. the Bitrix24 Widget Master's
          // "Instalaciones" tile) deep-link straight into a tab instead of
          // each role's usual starting tab — forwarded as-is from this
          // page's own query string.
          var view = new URLSearchParams(window.location.search).get("view");
          window.location.href =
            "/?bx_email=" + encodeURIComponent(result.body.email) +
            "&bx_otp=" + encodeURIComponent(result.body.otp) +
            (view ? "&view=" + encodeURIComponent(view) : "");
        })
        .catch(function (err) {
          fail("Error de conexión: " + (err && err.message ? err.message : String(err)));
        });
    }

    // Cuando esta página queda anidada dentro de otra app (el Widget Master
    // de Bitrix24, widget-pws.vercel.app) en vez de ser el iframe directo de
    // Bitrix24, BX24.init() no tiene con quién hacer su propio handshake —
    // Bitrix24 sale como null. El Master ya validó su propia sesión de
    // Bitrix24 (sí es su iframe directo) y nos retransmite ese domain/token
    // por postMessage; lo usamos igual que si lo hubiéramos obtenido nosotros.
    var TRUSTED_RELAY_ORIGIN = "https://widget-pws.vercel.app";

    function waitForRelay() {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        window.removeEventListener("message", onMessage);
        fail("No se pudo conectar con Bitrix24 (directo ni desde el Widget Master).");
      }, 10000);

      function onMessage(e) {
        if (settled || e.origin !== TRUSTED_RELAY_ORIGIN) return;
        var data = e.data;
        if (!data || data.type !== "pws-bitrix-identity" || !data.domain || !data.authId) return;
        settled = true;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        proceed(data.domain, data.authId);
      }
      window.addEventListener("message", onMessage);
    }

    try {
      if (window.BX24) {
        BX24.init(function () {
          // Safe to call on every open, not just the first install — Bitrix24
          // treats a repeat call as a no-op.
          BX24.installFinish();

          var auth = BX24.getAuth();
          if (!auth || !auth.access_token || !auth.domain) {
            fail("No se pudo leer la sesión de Bitrix24.");
            return;
          }
          proceed(auth.domain, auth.access_token);
        });
      } else {
        waitForRelay();
      }
    } catch (e) {
      fail("No se pudo cargar el SDK de Bitrix24: " + (e && e.message ? e.message : String(e)));
    }
  </script>
</body>
</html>`);
}
