import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, AlertCircle, Clock, Zap } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
type FormValues = z.infer<typeof schema>;

function LoginPage() {
  const navigate = useNavigate();
  const [showPass, setShowPass] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pendingUser, setPendingUser] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    setPendingUser(false);

    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });

    if (error) {
      setServerError(
        error.message === "Invalid login credentials"
          ? "Incorrect email or password."
          : error.message,
      );
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("status, role, is_superadmin")
        .eq("id", user.id)
        .single();

      if (profile?.status === "rejected") {
        await supabase.auth.signOut();
        setServerError("Your account has been rejected. Contact your administrator.");
        return;
      }

      const isSuperadmin = profile?.is_superadmin === true && profile?.status === "active";
      const isApproved   = profile?.status === "active" && profile?.role != null;

      if (!isSuperadmin && !isApproved) {
        await supabase.auth.signOut();
        setPendingUser(true);
        return;
      }

      navigate({ to: isSuperadmin ? "/superadmin" : "/" });
      return;
    }

    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel: dark hero ─────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-hero relative overflow-hidden flex-col justify-between p-12">
        {/* dot grid overlay */}
        <div className="absolute inset-0 dot-grid opacity-40" />

        {/* floating accent circles */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute top-1/2 left-1/3 w-48 h-48 rounded-full bg-blue-600/10 blur-2xl" />
        <div className="absolute bottom-1/4 left-0 w-64 h-64 rounded-full bg-orange-500/10 blur-3xl" />

        {/* logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-orange shadow-orange flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="text-white text-xl font-bold tracking-tight">PayClarity</span>
        </div>

        {/* hero copy */}
        <div className="relative z-10 space-y-6">
          <div>
            <h2 className="text-4xl font-bold text-white leading-tight">
              Claridad en cada<br />
              <span className="text-orange">comisión.</span>
            </h2>
            <p className="mt-4 text-sky-200/80 text-lg leading-relaxed max-w-sm">
              Gestiona pagos, splits y reportes de todo tu equipo en un solo lugar.
            </p>
          </div>

          {/* feature pills */}
          <div className="flex flex-wrap gap-3">
            {["Commission Wallet", "Payout Calendar", "Split Rules", "Team Reports"].map((f) => (
              <span
                key={f}
                className="px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-white/90 text-xs font-medium backdrop-blur-sm"
              >
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* bottom tagline */}
        <p className="relative z-10 text-sky-300/60 text-sm">
          Claridad en cada comisión.
        </p>
      </div>

      {/* ── Right panel: login form ───────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md space-y-8">
          {/* mobile logo */}
          <div className="lg:hidden text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-orange shadow-orange mb-4">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">PayClarity</h1>
          </div>

          {/* heading */}
          <div>
            <h2 className="text-2xl font-bold text-foreground">Bienvenido</h2>
            <p className="text-muted-foreground mt-1 text-sm">Inicia sesión en tu cuenta</p>
          </div>

          {/* alerts */}
          {pendingUser && (
            <div className="flex gap-3 p-4 rounded-2xl bg-amber-50 border-2 border-amber-200 text-amber-800">
              <Clock className="w-5 h-5 mt-0.5 flex-shrink-0 text-amber-500" />
              <div>
                <p className="text-sm font-semibold">Cuenta pendiente de aprobación</p>
                <p className="text-sm mt-0.5 text-amber-700">
                  Un administrador debe activar tu cuenta. Te notificaremos cuando tengas acceso.
                </p>
              </div>
            </div>
          )}

          {serverError && !pendingUser && (
            <div className="flex gap-3 p-4 rounded-2xl bg-red-50 border-2 border-red-200 text-red-700">
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <p className="text-sm">{serverError}</p>
            </div>
          )}

          {/* form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold text-foreground">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@empresa.com"
                autoComplete="email"
                {...register("email")}
                className={errors.email ? "border-destructive focus-visible:border-destructive" : ""}
              />
              {errors.email && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold text-foreground">
                Contraseña
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPass ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  {...register("password")}
                  className={
                    errors.password
                      ? "border-destructive focus-visible:border-destructive pr-11"
                      : "pr-11"
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-accent transition-colors"
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.password.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full mt-2 bg-gradient-orange shadow-orange text-white hover:opacity-90"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Iniciando sesión…
                </span>
              ) : (
                "Iniciar sesión"
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            ¿No tienes cuenta?{" "}
            <Link
              to="/register"
              className="text-orange font-semibold hover:opacity-80 transition-opacity"
            >
              Regístrate
            </Link>
          </p>

          <p className="text-center text-xs text-muted-foreground/60">
            © 2026 PayClarity. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </div>
  );
}
