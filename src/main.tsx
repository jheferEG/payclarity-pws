import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";
import { completeBitrixSignIn } from "./lib/bitrix-sso";
import "./styles.css";

// After a new deploy, a tab left open still references JS chunk filenames
// from the old build (Vite content-hashes them per build, so old ones stop
// existing on the server). The SPA rewrite then serves index.html for that
// missing file, which the browser rejects as "not a JS module" — Vite fires
// this exact event for that case. Reload once to pick up the new build
// instead of leaving the user stuck looking at console errors.
window.addEventListener("vite:preloadError", () => {
  if (sessionStorage.getItem("reloaded-after-preload-error")) return;
  sessionStorage.setItem("reloaded-after-preload-error", "1");
  window.location.reload();
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  scrollRestoration: true,
  defaultPreloadStaleTime: 0,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Resolve any pending Bitrix24 SSO exchange before the router's auth guard
// runs its first `getSession()` check — otherwise a Bitrix accountant would
// briefly hit the guard with no session yet and get bounced to /login.
completeBitrixSignIn().then(() => {
  const root = document.getElementById("root");
  if (!root) throw new Error("Root element not found");

  createRoot(root).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  );
});
