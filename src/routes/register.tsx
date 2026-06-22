import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Eye, EyeOff, AlertCircle, CheckCircle2, HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const Route = createFileRoute("/register")({
  validateSearch: (s: Record<string, unknown>) => ({
    superadmin_invite: typeof s.superadmin_invite === "string" ? s.superadmin_invite : undefined,
  }),
  component: RegisterPage,
});

const schema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Enter a valid email"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[0-9]/, "Must contain a number"),
  confirmPassword: z.string(),
  inviteCode: z.string().min(1, "Company code is required"),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});
type FormValues = z.infer<typeof schema>;

function RegisterPage() {
  const navigate = useNavigate();
  const { superadmin_invite: saInvite } = Route.useSearch();
  const isSuperadminInvite = !!saInvite;

  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setServerError(null);

    // ── Superadmin invite flow ────────────────────────────────────────────────
    if (isSuperadminInvite) {
      const { data: valid } = await supabase.rpc("verify_superadmin_invite", {
        p_token: saInvite,
      });
      if (!valid) {
        setServerError("El enlace de invitación no es válido o ya fue usado.");
        return;
      }

      const { error: signUpError } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: { data: { full_name: values.fullName }, emailRedirectTo: undefined },
      });

      if (signUpError) {
        setServerError(signUpError.message.includes("already registered")
          ? "Ya existe una cuenta con este correo."
          : signUpError.message);
        return;
      }

      // Consume invite → sets role=superadmin / status=pending
      await supabase.rpc("consume_superadmin_invite", { p_token: saInvite });
      setSuccess(true);
      return;
    }

    // ── Normal company flow ───────────────────────────────────────────────────
    const { data: companyId, error: rpcError } = await supabase.rpc("verify_invite_code", {
      code: values.inviteCode,
    });

    if (rpcError || !companyId) {
      setServerError("Invalid company code. Contact your administrator to get the correct code.");
      return;
    }

    const { error: signUpError } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: { full_name: values.fullName, company_id: companyId },
        emailRedirectTo: undefined,
      },
    });

    if (signUpError) {
      setServerError(signUpError.message.includes("already registered")
        ? "An account with this email already exists."
        : signUpError.message);
      return;
    }

    setSuccess(true);
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-success/10 mb-4">
            <CheckCircle2 className="w-8 h-8 text-success" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">
            {isSuperadminInvite ? "¡Solicitud enviada!" : "Registration complete!"}
          </h2>
          <p className="text-muted-foreground mb-6">
            {isSuperadminInvite
              ? "Tu cuenta de superadmin fue creada y está pendiente de aprobación. Un superadmin existente debe aprobarla antes de que puedas entrar."
              : "Your account has been created and is waiting for an administrator to approve it. You'll be able to sign in once your access is granted."}
          </p>
          <Button
            variant="outline"
            onClick={() => navigate({ to: "/login" })}
            className="w-full"
          >
            {isSuperadminInvite ? "Ir al login" : "Back to sign in"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-primary shadow-elegant mb-4">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">PayClarity</h1>
          <p className="text-sm text-muted-foreground mt-1">Commission management platform</p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl shadow-card p-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-foreground">
              {isSuperadminInvite ? "Crear cuenta de Superadmin" : "Create an account"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {isSuperadminInvite
                ? "Tu acceso será revisado y aprobado por un superadmin existente."
                : "You'll need a company code from your administrator."}
            </p>
          </div>

          {serverError && (
            <div className="mb-5 flex gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive">
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <p className="text-sm">{serverError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="Jane Smith"
                autoComplete="name"
                {...register("fullName")}
                className={errors.fullName ? "border-destructive" : ""}
              />
              {errors.fullName && (
                <p className="text-xs text-destructive">{errors.fullName.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                autoComplete="email"
                {...register("email")}
                className={errors.email ? "border-destructive" : ""}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPass ? "text" : "password"}
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                  {...register("password")}
                  className={errors.password ? "border-destructive pr-10" : "pr-10"}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  placeholder="Repeat password"
                  autoComplete="new-password"
                  {...register("confirmPassword")}
                  className={errors.confirmPassword ? "border-destructive pr-10" : "pr-10"}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
              )}
            </div>

            {!isSuperadminInvite && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="inviteCode">Company code</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">Ask your administrator for the company access code.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input
                  id="inviteCode"
                  type="text"
                  placeholder="Enter your company code"
                  autoComplete="off"
                  {...register("inviteCode")}
                  className={errors.inviteCode ? "border-destructive uppercase tracking-widest" : "uppercase tracking-widest"}
                />
                {errors.inviteCode && (
                  <p className="text-xs text-destructive">{errors.inviteCode.message}</p>
                )}
              </div>
            )}

            <Button
              type="submit"
              className="w-full mt-6 bg-gradient-primary text-white shadow-elegant hover:opacity-90"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Creating account…" : "Create account"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Already have an account?{" "}
            <Link to="/login" className="text-accent font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          © {new Date().getFullYear()} PayClarity. All rights reserved.
        </p>
      </div>
    </div>
  );
}
