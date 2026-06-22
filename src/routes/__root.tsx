import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  redirect,
} from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AuthProvider } from "@/lib/auth-context";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong. Try refreshing or go back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

const AUTH_ROUTES = ["/login", "/register"];

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async ({ location }) => {
    const isAuthRoute = AUTH_ROUTES.includes(location.pathname);
    const { data: { session } } = await supabase.auth.getSession();

    if (!session && !isAuthRoute) {
      throw redirect({ to: "/login" });
    }

    if (session) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("status, role, company_id")
        .eq("id", session.user.id)
        .single();

      // Superadmin must be active (status=active) — pending superadmins wait for approval
      const isSuperadmin = profile?.role === "superadmin" && profile?.status === "active";
      const hasCompany   = !!profile?.company_id;
      const isApproved   = profile?.status === "active" && profile?.role != null;

      if (!isApproved && !isSuperadmin) {
        await supabase.auth.signOut();
        if (!isAuthRoute) throw redirect({ to: "/login" });
        return;
      }

      if (isAuthRoute) {
        // Superadmin con empresa → app principal; sin empresa → panel superadmin
        throw redirect({ to: isSuperadmin ? (hasCompany ? "/" : "/superadmin") : "/" });
      }

      // Block non-superadmins from /superadmin
      if (location.pathname.startsWith("/superadmin") && !isSuperadmin) {
        throw redirect({ to: "/" });
      }
    }
  },
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    </QueryClientProvider>
  );
}
