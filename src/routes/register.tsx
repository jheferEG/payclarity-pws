import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Eye, EyeOff, AlertCircle, CheckCircle2, HelpCircle, Globe } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useStore } from "@/lib/commission-store";
import { useT } from "@/lib/i18n";

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
  inviteCode: z.string().optional(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});
type FormValues = z.infer<typeof schema>;

function RegisterPage() {
  const navigate = useNavigate();
  const { superadmin_invite: saInvite } = Route.useSearch();
  const { language, setLanguage } = useStore();
  const T = useT();

  const langBtn = (
    <button
      onClick={() => setLanguage(language === "es" ? "en" : "es")}
      className="fixed top-4 right-4 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/90 backdrop-blur-sm border border-border text-foreground text-xs font-semibold shadow-sm hover:bg-white transition-colors"
    >
      <Globe className="w-3.5 h-3.5" />
      {language === "es" ? "EN" : "ES"}
    </button>
  );
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
        setServerError(T("reg_error_invalid_code"));
        return;
      }

      const { error: signUpError } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: { data: { full_name: values.fullName }, emailRedirectTo: undefined },
      });

      if (signUpError) {
        setServerError(signUpError.message.includes("already registered")
          ? T("reg_error_email_exists")
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
      code: values.inviteCode ?? "",
    });

    if (rpcError || !companyId) {
      setServerError(T("reg_error_invalid_code"));
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
        ? T("reg_error_email_exists")
        : signUpError.message);
      return;
    }

    setSuccess(true);
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
        {langBtn}
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-success/10 mb-4">
            <CheckCircle2 className="w-8 h-8 text-success" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">
            {T(isSuperadminInvite ? "reg_success_title_superadmin" : "reg_success_title")}
          </h2>
          <p className="text-muted-foreground mb-6">
            {T(isSuperadminInvite ? "reg_success_msg_superadmin" : "reg_success_msg")}
          </p>
          <Button
            variant="outline"
            onClick={() => navigate({ to: "/login" })}
            className="w-full"
          >
            {T("reg_back_login")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
      {langBtn}
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-orange shadow-orange mb-4">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">CompensaFlow</h1>
          <p className="text-sm text-muted-foreground mt-1">{T("reg_platform_subtitle")}</p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl shadow-card p-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-foreground">
              {T(isSuperadminInvite ? "reg_title_superadmin" : "reg_title")}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {T(isSuperadminInvite ? "reg_subtitle_superadmin" : "reg_subtitle")}
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
              <Label htmlFor="fullName">{T("reg_fullname")}</Label>
              <Input
                id="fullName"
                type="text"
                placeholder={T("reg_fullname_placeholder")}
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
                placeholder={T("email_placeholder")}
                autoComplete="email"
                {...register("email")}
                className={errors.email ? "border-destructive" : ""}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">{T("reg_password")}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPass ? "text" : "password"}
                  placeholder={T("reg_password_placeholder")}
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
              <Label htmlFor="confirmPassword">{T("reg_confirm_password")}</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  placeholder={T("reg_confirm_placeholder")}
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
                  <Label htmlFor="inviteCode">{T("reg_company_code")}</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">{T("reg_company_code_tooltip")}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input
                  id="inviteCode"
                  type="text"
                  placeholder={T("reg_company_code_placeholder")}
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
              className="w-full mt-6 bg-gradient-orange shadow-orange text-white hover:opacity-90"
              disabled={isSubmitting}
            >
              {T(isSubmitting ? "reg_btn_loading" : "reg_btn")}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            {T("reg_have_account")}{" "}
            <Link to="/login" className="text-orange font-medium hover:opacity-80 transition-opacity">
              {T("reg_signin_link")}
            </Link>
          </p>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          © {new Date().getFullYear()} CompensaFlow. {T("copyright")}
        </p>
      </div>
    </div>
  );
}
