import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Trash2, Plus, FileDown, Sparkles, Users, Receipt, Layers, Building2, Banknote, AlertCircle,
  Wallet, Calculator, CalendarDays, BookTemplate, MessageSquare, HelpCircle, Shield, UserRound,
  LayoutDashboard, FileBarChart, FileSpreadsheet, Languages, Wand2, Settings2, Upload, Package,
  Split as SplitIcon, Activity, LogOut, ChevronDown, Users2, ShieldAlert,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStore, type Invoice, type LineItem } from "@/lib/commission-store";
import {
  calcInvoice, calcPayouts, fmtMoney, validateOverrides, validateTiers,
} from "@/lib/commission-calc";
import {
  buildSaleAndDownload, buildSaleInvoicePDF, buildAgentCommissionPDF,
  downloadAllCommissionPDFs, downloadSummary, makeBrandingSnapshot, INVOICE_TEMPLATES,
} from "@/lib/generate-invoices";
import {
  WalletPanel, SimulatorPanel, CalendarPanel, TemplatesPanel, DisputesPanel,
  ExplainDialog, DisputeDialog,
} from "@/components/ExtraPanels";
import { DashboardPanel, ReportsPanel, YearEnd1099Panel, TaxReserveByStateEditor } from "@/components/NewPanels";
import { UserManagementPanel } from "@/components/UserManagementPanel";
import { AdminGate } from "@/components/AdminGate";
import { AdjustmentsPanel, CsvImportPanel, SetupWizard } from "@/components/CompetitivePanels";
import { SplitsPanel, SplitEditorDialog, totalSplitPercent, isSplitValid } from "@/components/SplitsPanel";
import { NotificationsBell } from "@/components/NotificationsBell";
import { InvoiceTimelineDialog } from "@/components/InvoiceTimelineDialog";
import { useT } from "@/lib/i18n";
import { useSupabaseSync } from "@/hooks/useSupabaseSync";

type NavTab = { id: string; label: string; icon: any };
type NavGroup = { id: string; label: string; tabs: NavTab[] };

function makeNavGroups(t: (key: any) => string): NavGroup[] {
  return [
    { id: "dashboard", label: t("nav_dashboard"), tabs: [{ id: "dashboard", label: t("tab_dashboard"), icon: LayoutDashboard }] },
    { id: "invoices", label: t("nav_invoices"), tabs: [{ id: "invoices", label: t("tab_invoices"), icon: Receipt }] },
    { id: "team", label: t("nav_team"), tabs: [
      { id: "agents", label: t("tab_team"), icon: Users },
      { id: "wallet", label: t("tab_wallet"), icon: Wallet },
    ]},
    { id: "compensation", label: t("nav_compensation"), tabs: [
      { id: "plan", label: t("tab_plan"), icon: Layers },
      { id: "splits", label: t("tab_splits"), icon: SplitIcon },
      { id: "finance", label: t("tab_finance"), icon: Banknote },
      { id: "products", label: t("tab_products"), icon: Package },
    ]},
    { id: "payouts", label: t("nav_payouts"), tabs: [
      { id: "calendar", label: t("tab_calendar"), icon: CalendarDays },
      { id: "disputes", label: t("tab_approvals"), icon: MessageSquare },
      { id: "generate", label: t("tab_generate"), icon: FileDown },
      { id: "adjustments", label: t("tab_adjustments"), icon: Settings2 },
    ]},
    { id: "reports", label: t("nav_reports"), tabs: [
      { id: "reports", label: t("tab_reports"), icon: FileBarChart },
      { id: "yearend", label: t("tab_year_end"), icon: FileSpreadsheet },
      { id: "simulator", label: t("tab_simulator"), icon: Calculator },
    ]},
    { id: "settings", label: t("nav_settings"), tabs: [
      { id: "company", label: t("tab_company"), icon: Building2 },
      { id: "templates", label: t("tab_templates"), icon: BookTemplate },
      { id: "import", label: t("tab_import"), icon: Upload },
      { id: "users", label: t("tab_users"), icon: Users2 },
    ]},
  ];
}

function makeRepGroups(t: (key: any) => string): NavGroup[] {
  return [
    { id: "team", label: t("nav_wallet"), tabs: [{ id: "wallet", label: t("tab_my_wallet"), icon: Wallet }] },
    { id: "invoices", label: t("nav_invoices"), tabs: [{ id: "invoices", label: t("tab_my_invoices"), icon: Receipt }] },
    { id: "payouts", label: t("nav_payouts"), tabs: [
      { id: "calendar", label: t("tab_my_payouts"), icon: CalendarDays },
      { id: "disputes", label: t("tab_my_requests"), icon: MessageSquare },
    ]},
    { id: "reports", label: t("nav_tools"), tabs: [{ id: "simulator", label: t("tab_simulator"), icon: Calculator }] },
  ];
}

export default function CommissionTool() {
  const s = useStore();
  const t = useT();
  const navGroups = makeNavGroups(t);
  const repGroups = makeRepGroups(t);
  const { profile, signOut } = useAuth();
  const { dataLoaded } = useSupabaseSync();

  // Sync Zustand role with the authenticated user's role from Supabase
  useEffect(() => {
    if (profile?.role) {
      s.setRole(profile.role as any);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.role]);

  // For reps: auto-set activeAgentId to their own agent record after data loads
  useEffect(() => {
    if (!dataLoaded || profile?.role !== "rep") return;
    supabase.rpc("my_agent_id").then(({ data: agentId }) => {
      if (agentId) s.setActiveAgentId(agentId);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataLoaded, profile?.role]);

  const isAdmin = s.role === "admin";
  const isRep = s.role === "rep";
  const canManage = isAdmin; // accountant: view-only on management
  const [wizardOpen, setWizardOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Load pending user count and subscribe to realtime changes (admins only)
  useEffect(() => {
    if (!isAdmin) return;

    async function loadPending() {
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      setPendingCount(count ?? 0);
    }
    loadPending();

    const channel = supabase
      .channel("pending-users")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, loadPending)
      .subscribe();

    return () => { channel.unsubscribe(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);
  const [tab, setTab] = useState<string>(isRep ? "wallet" : "dashboard");
  const [group, setGroup] = useState<string>(isRep ? "team" : "dashboard");
  useEffect(() => {
    if (s.deepLink?.tab) {
      setTab(s.deepLink.tab);
      const g = navGroups.find((g) => g.tabs.some((t) => t.id === s.deepLink!.tab));
      if (g) setGroup(g.id);
    }
  }, [s.deepLink?.ts, s.deepLink?.tab]);

  // Open Setup Wizard after Supabase data loads, only if company has no data yet.
  useEffect(() => {
    if (!dataLoaded) return;
    if (isAdmin && s.agents.length === 0 && s.invoices.length === 0 && !s.wizard?.completed) {
      setWizardOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataLoaded]);

  void s; // reserved
  const payouts = useMemo(
    () => calcPayouts(s.agents, s.invoices, s.financeCompanies, s.personalTiers, s.overrides),
    [s.agents, s.invoices, s.financeCompanies, s.personalTiers, s.overrides]
  );
  const totalPayout = payouts.reduce((a, c) => a + c.grossPayout, 0);
  const totalSales = s.invoices.reduce((a, x) => a + Number(x.salesAmount || 0), 0);

  const effectiveAgentId =
    isRep
      ? s.activeAgentId && s.agents.some((a) => a.id === s.activeAgentId)
        ? s.activeAgentId
        : s.agents[0]?.id ?? null
      : null;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-sky-200/60 bg-white/95 backdrop-blur-md shadow-[0_1px_12px_rgb(14_165_233/0.08)]">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 flex items-center justify-between gap-2">
          {/* Logo */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-cta shadow-btn flex items-center justify-center shrink-0">
              <Sparkles className="w-4.5 h-4.5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold leading-tight tracking-tight truncate">{t("app_title")}</h1>
              <p className="text-[10px] text-muted-foreground hidden sm:block">{t("app_subtitle")}</p>
            </div>
          </div>

          {/* Desktop stats */}
          {!isRep && (
            <div className="hidden lg:flex items-center gap-3 mx-4">
              <Stat label={t("stat_salespeople")} value={s.agents.length} />
              <Stat label={t("stat_sales_total")} value={fmtMoney(totalSales, s.company.currency)} />
              <Stat label={t("stat_payout")} value={fmtMoney(totalPayout, s.company.currency)} accent />
            </div>
          )}

          {/* Right actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Language toggle – always visible */}
            <button
              onClick={() => s.setLanguage(s.language === "es" ? "en" : "es")}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-sky-50 border border-sky-200 hover:bg-sky-100 transition-all text-xs font-bold text-accent"
              title={t("language")}
            >
              <Languages className="w-3.5 h-3.5" />
              <span>{s.language === "es" ? "ES" : "EN"}</span>
            </button>

            {/* Admin button – icon on mobile */}
            {isAdmin && (
              <button
                onClick={() => setAdminOpen(true)}
                className="relative flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl bg-sky-50 border border-sky-200 hover:bg-sky-100 transition-all text-sm font-medium text-accent"
              >
                <ShieldAlert className="w-4 h-4" />
                <span className="hidden md:inline">Admin</span>
                {pendingCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none">
                    {pendingCount > 9 ? "9+" : pendingCount}
                  </span>
                )}
              </button>
            )}

            <NotificationsBell />

            {/* Rep selector – full width under header on mobile */}
            {isRep && (
              <Select value={effectiveAgentId || ""} onValueChange={(v) => s.setActiveAgentId(v)}>
                <SelectTrigger className="h-9 w-[130px] sm:w-[160px]">
                  <SelectValue placeholder={t("select_rep")} />
                </SelectTrigger>
                <SelectContent>
                  {s.agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 px-2 sm:px-3 py-2 rounded-xl bg-gradient-primary hover:opacity-90 transition-all shadow-elegant text-sm">
                  <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                    {isAdmin ? <Shield className="w-3.5 h-3.5 text-white" /> : <UserRound className="w-3.5 h-3.5 text-white" />}
                  </div>
                  <div className="text-left hidden sm:block">
                    <p className="font-semibold leading-tight text-white truncate max-w-[100px] text-xs">
                      {profile?.full_name ?? profile?.email?.split("@")[0] ?? "User"}
                    </p>
                    <p className="text-[10px] text-sky-300 capitalize leading-tight">{s.role}</p>
                  </div>
                  <ChevronDown className="w-3 h-3 text-white/70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-3 py-2">
                  <p className="text-sm font-semibold truncate">{profile?.full_name ?? "User"}</p>
                  <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
                  <p className="text-xs text-accent capitalize mt-0.5">{s.role}</p>
                </div>
                <DropdownMenuSeparator />
                {canManage && (
                  <DropdownMenuItem onClick={() => setWizardOpen(true)} className="cursor-pointer">
                    <Wand2 className="w-4 h-4 mr-2 text-accent" />
                    {t("wiz_title")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {profile?.is_superadmin === true && (
                  <>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => { window.location.href = "/superadmin"; }}
                    >
                      <ShieldAlert className="w-4 h-4 mr-2 text-orange" />
                      Panel Superadmin
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem className="text-destructive focus:text-destructive cursor-pointer" onClick={() => signOut()}>
                  <LogOut className="w-4 h-4 mr-2" />
                  {t("menu_sign_out")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
        {isRep && !effectiveAgentId ? (
          <Card className="p-8 text-center">
            <UserRound className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <h2 className="text-lg font-semibold mb-1">{t("no_rep_title")}</h2>
            <p className="text-sm text-muted-foreground">{t("no_rep_msg")}</p>
          </Card>
        ) : (
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          {(() => {
            const groups = isRep ? repGroups : navGroups;
            const currentGroup = groups.find((g) => g.id === group) ?? groups[0];
            const openRequests = s.disputes.filter(
              (d) => d.status === "submitted" || d.status === "needs_info"
            ).length;
            return (
              <>
                {/* Group nav — scrollable on mobile, wraps on desktop */}
                <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0 pb-0.5 sm:pb-0 [&::-webkit-scrollbar]:hidden">
                  <div className="flex gap-1.5 p-1.5 rounded-2xl bg-white border border-sky-200 shadow-card w-max sm:w-auto">
                    {groups.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => { setGroup(g.id); setTab(g.tabs[0].id); }}
                        className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl whitespace-nowrap transition-all duration-200 ${
                          g.id === currentGroup.id
                            ? "bg-gradient-cta text-white shadow-btn"
                            : "text-muted-foreground hover:bg-sky-50 hover:text-accent"
                        }`}
                      >
                        {g.label}
                        {g.id === "payouts" && !isRep && openRequests > 0 && (
                          <span className="ml-1.5 inline-flex items-center justify-center min-w-[1.125rem] h-[18px] px-1 rounded-full bg-white/30 text-white text-[10px] font-bold">
                            {openRequests}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sub-tabs — icon + label, scroll on mobile */}
                {currentGroup.tabs.length > 1 && (
                  <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0 [&::-webkit-scrollbar]:hidden">
                    <TabsList className="flex h-auto w-max sm:w-auto justify-start gap-1 p-1">
                      {currentGroup.tabs.map((tt) => {
                        const Icon = tt.icon;
                        return (
                          <TabsTrigger key={tt.id} value={tt.id} className="whitespace-nowrap text-xs sm:text-sm px-2.5 sm:px-3 py-1.5">
                            <Icon className="w-3.5 h-3.5 shrink-0" />
                            <span className="hidden xs:inline sm:inline ml-1.5">{tt.label}</span>
                            {tt.id === "disputes" && !isRep && openRequests > 0 && (
                              <span className="ml-1.5 inline-flex items-center justify-center min-w-[1.125rem] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
                                {openRequests}
                              </span>
                            )}
                          </TabsTrigger>
                        );
                      })}
                    </TabsList>
                  </div>
                )}
              </>
            );
          })()}

          {!isRep && (
            <TabsContent value="dashboard">
              <DashboardQuickActions onNav={(t, g) => { setGroup(g); setTab(t); }} onWizard={() => setWizardOpen(true)} />
              <div className="h-6" />
              <DashboardPanel />
            </TabsContent>
          )}
          <TabsContent value="invoices"><InvoicesPanel /></TabsContent>
          <TabsContent value="wallet"><WalletPanel /></TabsContent>
          <TabsContent value="simulator"><SimulatorPanel /></TabsContent>
          <TabsContent value="calendar"><CalendarPanel /></TabsContent>
          <TabsContent value="disputes"><DisputesPanel /></TabsContent>
          {!isRep && <>
            <TabsContent value="reports"><ReportsPanel /></TabsContent>
            <TabsContent value="yearend"><YearEnd1099Panel /></TabsContent>
          </>}
          {canManage && <>
            <TabsContent value="adjustments"><AdjustmentsPanel /></TabsContent>
            <TabsContent value="import"><CsvImportPanel /></TabsContent>
            <TabsContent value="templates"><TemplatesPanel /></TabsContent>
            <TabsContent value="agents"><AgentsPanel /></TabsContent>
            <TabsContent value="finance"><FinancePanel /></TabsContent>
            <TabsContent value="plan"><PlanPanel /></TabsContent>
            <TabsContent value="products"><ProductsPanel /></TabsContent>
            <TabsContent value="splits"><SplitsPanel /></TabsContent>
            <TabsContent value="company"><CompanyPanel /></TabsContent>
            <TabsContent value="generate"><GeneratePanel payouts={payouts} /></TabsContent>
            <TabsContent value="users"><UserManagementPanel /></TabsContent>
          </>}
        </Tabs>
        )}
      </main>
      {wizardOpen && <SetupWizard onClose={() => setWizardOpen(false)} />}
      <AdminGate open={adminOpen} onClose={() => setAdminOpen(false)} />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: any; accent?: boolean }) {
  return (
    <div className="px-3 py-1.5 rounded-xl bg-sky-50 border border-sky-200 text-right">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
      <div className={`font-mono font-bold text-sm ${accent ? "text-gradient-cta" : "text-foreground"}`}>{value}</div>
    </div>
  );
}

function DashboardQuickActions({
  onNav,
  onWizard,
}: {
  onNav: (tab: string, group: string) => void;
  onWizard: () => void;
}) {
  const s = useStore();
  const t = useT();
  const { profile } = useAuth();
  // Hide demo loader when connected to a real Supabase company
  const isLiveAccount = !!profile?.company_id;

  const generateTestPdf = () => {
    let inv = s.invoices[0];
    if (!inv) {
      if (!isLiveAccount) {
        s.loadDemoData();
        inv = useStore.getState().invoices[0];
      }
      if (!inv) {
        toast.error(t("err_pdf"));
        return;
      }
    }
    try {
      const fcs = useStore.getState().financeCompanies;
      const company = useStore.getState().company;
      const agents = useStore.getState().agents;
      const c = calcInvoice(inv, fcs);
      const agentName = agents.find((a) => a.id === inv!.agentId)?.name || "—";
      buildSaleAndDownload(c, company, agentName);
      toast.success(t("success_pdf"));
    } catch (e: any) {
      toast.error(e?.message || t("err_pdf"));
    }
  };

  return (
    <Card className="p-5 shadow-card border-primary/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{t("qa_quick_actions")}</h2>
          <p className="text-xs text-muted-foreground">
            {s.company.name} · {t("app_subtitle")}
          </p>
        </div>
        <Button
          size="lg"
          className="bg-gradient-orange shadow-orange text-white hover:opacity-90"
          onClick={() => onNav("invoices", "invoices")}
        >
          <Plus className="w-4 h-4 mr-2" />
          {t("qa_create_invoice")}
        </Button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => onNav("agents", "team")}>
          <Users className="w-4 h-4 mr-2" />
          {t("qa_add_rep")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => onNav("plan", "compensation")}>
          <Layers className="w-4 h-4 mr-2" />
          {t("qa_setup_plan")}
        </Button>
        <Button variant="outline" size="sm" onClick={generateTestPdf}>
          <FileDown className="w-4 h-4 mr-2" />
          {t("qa_test_pdf")}
        </Button>
        {!isLiveAccount && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              s.loadDemoData();
              toast.success(t("demo_loaded"));
            }}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {t("qa_load_demo")}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onWizard}>
          <Wand2 className="w-4 h-4 mr-2" />Setup wizard
        </Button>
      </div>
    </Card>
  );
}

function SectionCard({ title, desc, children, action }: any) {
  return (
    <Card className="p-6 shadow-card">
      <div className="flex items-start justify-between mb-5 gap-4">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {desc && <p className="text-sm text-muted-foreground mt-1">{desc}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="text-center py-12 text-sm text-muted-foreground border border-dashed border-border rounded-lg">{msg}</div>;
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/* ---------- Agents ---------- */
function AgentsPanel() {
  const { agents, addAgent, updateAgent, removeAgent } = useStore();
  const t = useT();
  const [form, setForm] = useState({ name: "", email: "", sponsorId: "", commissionPercent: "", level: "" });

  const submit = () => {
    if (!form.name.trim()) return toast.error(t("err_name_required"));
    if (!form.email.trim()) return toast.error(t("err_email_required"));
    // Sponsor is optional — the top of the tree (first rep / owner) has no upline.
    const pctRaw = form.commissionPercent.trim();
    if (pctRaw === "" || isNaN(Number(pctRaw))) return toast.error(t("err_commission_required"));
    if (!form.level.trim()) return toast.error(t("err_level_required"));
    addAgent({
      name: form.name.trim(),
      email: form.email.trim(),
      sponsorId: form.sponsorId || null,
      commissionPercent: Number(pctRaw) / 100,
      level: form.level.trim(),
    });
    setForm({ name: "", email: "", sponsorId: "", commissionPercent: "", level: "" });
    toast.success(t("success_rep_added"));
  };

  return (
    <SectionCard
      title={t("sect_team")}
      desc={t("sect_team_desc")}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 mb-6 p-4 bg-muted/40 rounded-lg">
        <div><Label>{t("lbl_name")} *</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Doe" />
        </div>
        <div><Label>{t("lbl_email")} *</Label>
          <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@…" />
        </div>
        <div><Label>{t("lbl_sponsor")}</Label>
          <Select value={form.sponsorId || "none"} onValueChange={(v) => setForm({ ...form, sponsorId: v === "none" ? "" : v })}>
            <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("lbl_none_dash")}</SelectItem>
              {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>{t("lbl_commission_pct")} *</Label>
          <Input type="number" step="0.1" value={form.commissionPercent} onChange={(e) => setForm({ ...form, commissionPercent: e.target.value })} placeholder="8" />
        </div>
        <div><Label>{t("lbl_level")} *</Label>
          <Select value={form.level || "none"} onValueChange={(v) => setForm({ ...form, level: v === "none" ? "" : v })}>
            <SelectTrigger><SelectValue placeholder="Select level" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Junior Rep">Junior Rep</SelectItem>
              <SelectItem value="Sales Rep">Sales Rep</SelectItem>
              <SelectItem value="Senior Rep">Senior Rep</SelectItem>
              <SelectItem value="Manager">Manager</SelectItem>
              <SelectItem value="Director">Director</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button onClick={submit} className="w-full"><Plus className="w-4 h-4 mr-2" />{t("btn_add")}</Button>
        </div>
      </div>

      {agents.length === 0 ? <Empty msg={t("empty_no_reps")} /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="py-2">{t("th_name")}</th><th>{t("th_email")}</th><th>{t("th_sponsor")}</th>
                <th>{t("th_commission")}</th><th>{t("th_level")}</th>
                <th>{t("th_state")}</th><th>{t("th_w9")}</th><th>{t("th_tax_pct")}</th><th>{t("th_pay_method")}</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id} className="border-t border-border/60">
                  <td className="py-2 font-medium">{a.name}</td>
                  <td className="text-muted-foreground">{a.email || "—"}</td>
                  <td>
                    <Select value={a.sponsorId || "none"} onValueChange={(v) => updateAgent(a.id, { sponsorId: v === "none" ? null : v })}>
                      <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("lbl_none_dash")}</SelectItem>
                        {agents.filter((x) => x.id !== a.id).map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td>
                    <Input
                      className="h-8 w-20"
                      type="number"
                      step="0.1"
                      value={a.commissionPercent != null ? (a.commissionPercent * 100).toFixed(1) : ""}
                      onChange={(e) => updateAgent(a.id, { commissionPercent: e.target.value === "" ? undefined : Number(e.target.value) / 100 })}
                      placeholder="8"
                    />
                  </td>
                  <td>
                    <Select value={a.level || "none"} onValueChange={(v) => updateAgent(a.id, { level: v === "none" ? "" : v })}>
                      <SelectTrigger className="h-8 w-32"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        <SelectItem value="Junior Rep">Junior Rep</SelectItem>
                        <SelectItem value="Sales Rep">Sales Rep</SelectItem>
                        <SelectItem value="Senior Rep">Senior Rep</SelectItem>
                        <SelectItem value="Manager">Manager</SelectItem>
                        <SelectItem value="Director">Director</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td>
                    <Input className="h-8 w-16" value={a.state ?? ""} onChange={(e) => updateAgent(a.id, { state: e.target.value.toUpperCase() })} placeholder="CA" />
                  </td>
                  <td>
                    <Select value={a.w9Status ?? "missing"} onValueChange={(v: any) => updateAgent(a.id, { w9Status: v })}>
                      <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="missing">{t("w9_missing_lbl")}</SelectItem>
                        <SelectItem value="pending">{t("w9_pending_lbl")}</SelectItem>
                        <SelectItem value="valid">{t("w9_valid_lbl")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td>
                    <Input
                      className="h-8 w-20"
                      type="number"
                      step="0.1"
                      value={((a.taxReservePercent ?? 0.2) * 100).toFixed(1)}
                      onChange={(e) => updateAgent(a.id, { taxReservePercent: Number(e.target.value) / 100 })}
                    />
                  </td>
                  <td>
                    <Input className="h-8 w-28" value={a.paymentMethod ?? ""} onChange={(e) => updateAgent(a.id, { paymentMethod: e.target.value })} placeholder="ACH" />
                  </td>
                  <td><Button variant="ghost" size="icon" onClick={() => removeAgent(a.id)}><Trash2 className="w-4 h-4" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

/* ---------- Finance Companies ---------- */
function FinancePanel() {
  const { financeCompanies, addFinanceCo, updateFinanceCo, removeFinanceCo } = useStore();
  const t = useT();
  const [form, setForm] = useState({
    name: "", defaultFee: 0, dealerFee: 0, adminFee: 0,
    usesApprovalDiscount: false, active: true, notes: "",
  });

  const submit = () => {
    if (!form.name.trim()) return toast.error(t("err_name_required"));
    addFinanceCo({ ...form, name: form.name.trim() });
    setForm({ name: "", defaultFee: 0, dealerFee: 0, adminFee: 0, usesApprovalDiscount: false, active: true, notes: "" });
    toast.success(t("success_finance_added"));
  };

  return (
    <SectionCard title={t("sect_finance")} desc={t("sect_finance_desc")}>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 mb-6 p-4 bg-muted/40 rounded-lg">
        <div className="md:col-span-2">
          <Label>{t("lbl_name")}</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Goodleap" />
        </div>
        <div><Label>{t("lbl_fee_pct")}</Label>
          <Input type="number" step="0.1" value={form.defaultFee * 100} onChange={(e) => setForm({ ...form, defaultFee: Number(e.target.value) / 100 })} />
        </div>
        <div><Label>{t("lbl_dealer_fee_lbl")}</Label>
          <Input type="number" step="0.01" value={form.dealerFee} onChange={(e) => setForm({ ...form, dealerFee: Number(e.target.value) })} />
        </div>
        <div><Label>{t("lbl_admin_fee_lbl")}</Label>
          <Input type="number" step="0.01" value={form.adminFee} onChange={(e) => setForm({ ...form, adminFee: Number(e.target.value) })} />
        </div>
        <div className="flex items-end"><Button onClick={submit} className="w-full"><Plus className="w-4 h-4 mr-2" />{t("btn_add")}</Button></div>
      </div>

      {financeCompanies.length === 0 ? <Empty msg={t("empty_no_finance")} /> : (
        <div className="space-y-3">
          {financeCompanies.map((f) => (
            <Card key={f.id} className="p-4">
              <div className="grid md:grid-cols-7 gap-3 items-end">
                <div className="md:col-span-2"><Label className="text-xs">{t("lbl_name")}</Label>
                  <Input value={f.name} onChange={(e) => updateFinanceCo(f.id, { name: e.target.value })} />
                </div>
                <div><Label className="text-xs">{t("lbl_fee_pct")}</Label>
                  <Input type="number" step="0.1" value={(f.defaultFee * 100).toFixed(2)}
                    onChange={(e) => updateFinanceCo(f.id, { defaultFee: Number(e.target.value) / 100 })} />
                </div>
                <div><Label className="text-xs">{t("lbl_dealer_fee_lbl")}</Label>
                  <Input type="number" step="0.01" value={f.dealerFee}
                    onChange={(e) => updateFinanceCo(f.id, { dealerFee: Number(e.target.value) })} />
                </div>
                <div><Label className="text-xs">{t("lbl_admin_fee_lbl")}</Label>
                  <Input type="number" step="0.01" value={f.adminFee}
                    onChange={(e) => updateFinanceCo(f.id, { adminFee: Number(e.target.value) })} />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={f.active} onCheckedChange={(v) => updateFinanceCo(f.id, { active: v })} />
                  <span className="text-xs">{t("lbl_active")}</span>
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeFinanceCo(f.id)}><Trash2 className="w-4 h-4" /></Button>
              </div>
              <div className="mt-3"><Label className="text-xs">{t("lbl_notes")}</Label>
                <Textarea value={f.notes} rows={2} onChange={(e) => updateFinanceCo(f.id, { notes: e.target.value })} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/* ---------- Invoices ---------- */
function blankInvoice(): Omit<Invoice, "id" | "number"> {
  return {
    date: new Date().toISOString().slice(0, 10),
    status: "draft",
    agentId: "",
    financeCompanyId: null,
    customerName: "",
    customerNotes: "",
    salesAmount: 0,
    productCost: 0,
    approvalPercent: 1,
    discount: 0,
    charges: [],
    credits: [],
    advanceApplied: 0,
    specialDeductions: 0,
    taxReservePercent: 0.2,
    paid: false,
    saleType: "finance",
    ccpfPercent: 0.035,
    adminFeePercent: 0,
    dealerFee: undefined,
    approvedAdvanceAmount: 0,
    pendingAdvanceBalance: 0,
    commissionLevel: "",
    commissionBase: "profit",
    commissionPercentOverride: undefined,
  };
}

function InvoicesPanel() {
  const s = useStore();
  const t = useT();
  const isAdmin = s.role !== "rep";
  const myAgentId = s.role === "rep" ? s.activeAgentId : null;
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Omit<Invoice, "id" | "number">>(() => {
    const b = blankInvoice();
    return myAgentId ? { ...b, agentId: myAgentId } : b;
  });

  const live = useMemo(() => calcInvoice({ ...(draft as Invoice), id: "tmp", number: "—" }, s.financeCompanies), [draft, s.financeCompanies]);

  const [explainId, setExplainId] = useState<string | null>(null);
  const [disputeId, setDisputeId] = useState<string | null>(null);
  const [splitId, setSplitId] = useState<string | null>(null);
  const [timelineId, setTimelineId] = useState<string | null>(null);

  useEffect(() => {
    const dl = s.deepLink;
    if (!dl || !dl.invoiceId) return;
    if (dl.openSplit) setSplitId(dl.invoiceId);
    else if (dl.openDispute) setDisputeId(dl.invoiceId);
    else if (dl.openTimeline) setTimelineId(dl.invoiceId);
    s.setDeepLink(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.deepLink?.ts]);

  const editInvoice = (id: string) => {
    const inv = s.invoices.find((x) => x.id === id);
    if (!inv) return;
    setEditing(id);
    setDraft(inv);
  };

  const save = () => {
    const payload = { ...draft, agentId: isAdmin ? draft.agentId : myAgentId || draft.agentId };
    if (!payload.agentId) return toast.error(t("err_pick_rep"));
    if (!payload.customerName.trim()) return toast.error(t("err_customer_required"));
    if (payload.salesAmount < 0 || payload.productCost < 0) return toast.error(t("err_amounts_negative"));
    if (payload.approvalPercent < 0 || payload.approvalPercent > 1) return toast.error(t("err_approval_range"));
    if (!isAdmin && editing) {
      const existing = s.invoices.find((x) => x.id === editing);
      if (existing && existing.agentId !== myAgentId) return toast.error(t("err_own_invoices"));
    }
    // Split commission validation: if a split exists, total must equal 100%
    if (payload.split && payload.split.participants.length > 0) {
      const total = totalSplitPercent(payload.split.participants);
      if (!isSplitValid(payload.split.participants)) {
        return toast.error(
          `Split commission must total 100% (currently ${(total * 100).toFixed(2)}%). Open the Split editor to fix it.`
        );
      }
    }
    if (payload.status === "paid" || payload.paid) {
      const cur = editing ? s.invoices.find((x) => x.id === editing) : null;
      if (cur?.split && cur.split.participants.length > 0 && !cur.split.approvedAt) {
        return toast.error(t("err_split_approve"));
      }
    }
    if (editing) {
      s.updateInvoice(editing, payload);
      toast.success(t("success_invoice_updated"));
    } else {
      s.addInvoice(payload);
      toast.success(t("success_invoice_created"));
    }
    setEditing(null);
    setDraft(myAgentId ? { ...blankInvoice(), agentId: myAgentId } : blankInvoice());
  };

  const updateLine = (key: "charges" | "credits", i: number, field: "label" | "amount", v: string) => {
    const next = [...(draft[key] || [])];
    next[i] = { ...next[i], [field]: field === "amount" ? Number(v) : v } as LineItem;
    setDraft({ ...draft, [key]: next });
  };
  const addLine = (key: "charges" | "credits") =>
    setDraft({ ...draft, [key]: [...(draft[key] || []), { label: "", amount: 0 }] });
  const removeLine = (key: "charges" | "credits", i: number) =>
    setDraft({ ...draft, [key]: draft[key].filter((_, j) => j !== i) });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
      <SectionCard
        title={t(editing ? "sect_invoice_edit" : "sect_invoice_new")}
        desc={t("sect_invoice_desc")}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <div><Label>{t("lbl_date")}</Label><Input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></div>
          <div><Label>{t("lbl_status")}</Label>
            <Select value={draft.status} onValueChange={(v: any) => setDraft({ ...draft, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">{t("status_draft")}</SelectItem>
                <SelectItem value="pending">{t("status_pending")}</SelectItem>
                <SelectItem value="paid">{t("status_paid")}</SelectItem>
                <SelectItem value="on_hold">{t("status_on_hold")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>{t("lbl_salesperson")}</Label>
            <Select value={draft.agentId} onValueChange={(v) => {
              const ag = s.agents.find((a) => a.id === v);
              setDraft({
                ...draft,
                agentId: v,
                commissionLevel: ag?.level ?? draft.commissionLevel ?? "",
              });
            }} disabled={!isAdmin}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {(isAdmin ? s.agents : s.agents.filter((a) => a.id === myAgentId)).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}{a.level ? ` · ${a.level}` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2"><Label>{t("lbl_customer")}</Label>
            <Input value={draft.customerName} onChange={(e) => setDraft({ ...draft, customerName: e.target.value })} placeholder="Customer name" />
          </div>
          <div><Label>{t("lbl_finance_co")}</Label>
            <Select value={draft.financeCompanyId || "none"} onValueChange={(v) => setDraft({ ...draft, financeCompanyId: v === "none" ? null : v })}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {s.financeCompanies.filter((f) => f.active).map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div><Label>{t("lbl_sales_amount")}</Label>
            <Input type="number" step="0.01" value={draft.salesAmount} onChange={(e) => setDraft({ ...draft, salesAmount: Number(e.target.value) })} />
          </div>
          <div><Label>{t("lbl_product_cost")}</Label>
            <Input type="number" step="0.01" value={draft.productCost} onChange={(e) => setDraft({ ...draft, productCost: Number(e.target.value) })} />
          </div>
          <div><Label>{t("lbl_approval_pct")}</Label>
            <Input type="number" step="0.1" value={(draft.approvalPercent * 100).toFixed(2)}
              onChange={(e) => setDraft({ ...draft, approvalPercent: Number(e.target.value) / 100 })} />
          </div>
          <div><Label>{t("lbl_discount")}</Label>
            <Input type="number" step="0.01" value={draft.discount} onChange={(e) => setDraft({ ...draft, discount: Number(e.target.value) })} />
          </div>
          <div><Label>{t("lbl_advance_applied")}</Label>
            <Input type="number" step="0.01" value={draft.advanceApplied} onChange={(e) => setDraft({ ...draft, advanceApplied: Number(e.target.value) })} />
          </div>
          <div><Label>{t("lbl_special_deductions")}</Label>
            <Input type="number" step="0.01" value={draft.specialDeductions} onChange={(e) => setDraft({ ...draft, specialDeductions: Number(e.target.value) })} />
          </div>
          <div><Label>{t("lbl_tax_reserve_pct")}</Label>
            <Input type="number" step="0.1" value={(draft.taxReservePercent * 100).toFixed(2)}
              onChange={(e) => setDraft({ ...draft, taxReservePercent: Number(e.target.value) / 100 })} />
          </div>
          <div><Label>{t("lbl_sale_type")}</Label>
            <Select value={draft.saleType || "finance"} onValueChange={(v: any) => setDraft({ ...draft, saleType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="credit_card">{t("sale_credit_card")}</SelectItem>
                <SelectItem value="finance">{t("sale_finance")}</SelectItem>
                <SelectItem value="check">{t("sale_check")}</SelectItem>
                <SelectItem value="wire">{t("sale_wire")}</SelectItem>
                <SelectItem value="cash">{t("sale_cash")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>C.C.P.F. % {draft.saleType === "credit_card" ? "" : t("lbl_card_only")}</Label>
            <Input type="number" step="0.1" value={((draft.ccpfPercent ?? 0.035) * 100).toFixed(2)}
              onChange={(e) => setDraft({ ...draft, ccpfPercent: Number(e.target.value) / 100 })} />
          </div>
          <div><Label>{t("lbl_admin_fee_pct")}</Label>
            <Input type="number" step="0.1" value={((draft.adminFeePercent ?? 0) * 100).toFixed(2)}
              onChange={(e) => setDraft({ ...draft, adminFeePercent: Number(e.target.value) / 100 })} />
          </div>
          <div><Label>{t("lbl_dealer_fee")}</Label>
            <Input type="number" step="0.01"
              placeholder={t("lbl_defaults_finance")}
              value={draft.dealerFee ?? ""}
              onChange={(e) => setDraft({ ...draft, dealerFee: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </div>
          <div><Label>{t("lbl_approved_advance")}</Label>
            <Input type="number" step="0.01" value={draft.approvedAdvanceAmount ?? 0}
              onChange={(e) => setDraft({ ...draft, approvedAdvanceAmount: Number(e.target.value) })} />
          </div>
          <div><Label>{t("lbl_pending_advance")}</Label>
            <Input type="number" step="0.01" value={draft.pendingAdvanceBalance ?? 0}
              onChange={(e) => setDraft({ ...draft, pendingAdvanceBalance: Number(e.target.value) })} />
          </div>
          <div><Label>{t("lbl_commission_level")}</Label>
            <Input value={draft.commissionLevel ?? ""} readOnly disabled
              placeholder={t("lbl_salesperson")} />
          </div>
          <div><Label>{t("lbl_commission_base")}</Label>
            <Select value={draft.commissionBase || "profit"} onValueChange={(v: any) => setDraft({ ...draft, commissionBase: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="profit">{t("lbl_commission_base_profit")}</SelectItem>
                <SelectItem value="product_cost">{t("lbl_commission_base_product")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isAdmin && (() => {
            const ag = s.agents.find((a) => a.id === draft.agentId);
            const defaultPct = ag?.commissionPercent;
            const defaultLabel = defaultPct != null
              ? `${(defaultPct * 100).toFixed(2)}%`
              : t("lbl_volume_tier");
            return (
              <div><Label>
                {t("lbl_commission_override")}
              </Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder={`Default: ${defaultLabel}`}
                  value={draft.commissionPercentOverride != null ? (draft.commissionPercentOverride * 100).toFixed(2) : ""}
                  onChange={(e) => setDraft({
                    ...draft,
                    commissionPercentOverride: e.target.value === "" ? undefined : Number(e.target.value) / 100,
                  })}
                />
              </div>
            );
          })()}
          <div className="flex items-end gap-2">
            <Switch checked={draft.paid} onCheckedChange={(v) => setDraft({ ...draft, paid: v })} disabled={!isAdmin} />
            <span className="text-sm">{t("lbl_paid_flag")} {isAdmin ? "" : t("lbl_admin_only")}</span>
          </div>
        </div>

        <LineEditor title={t("lbl_extra_charges")} rows={draft.charges} onAdd={() => addLine("charges")} onRemove={(i) => removeLine("charges", i)} onChange={(i, f, v) => updateLine("charges", i, f, v)} />
        <LineEditor title={t("lbl_credits")} rows={draft.credits} onAdd={() => addLine("credits")} onRemove={(i) => removeLine("credits", i)} onChange={(i, f, v) => updateLine("credits", i, f, v)} />

        <div className="flex gap-2 mt-4">
          <Button onClick={save}><Plus className="w-4 h-4 mr-2" />{editing ? "Update" : "Create invoice"}</Button>
          {editing && (
            <Button variant="outline" onClick={() => { setEditing(null); setDraft(blankInvoice()); }}>Cancel</Button>
          )}
        </div>
      </SectionCard>

      <SectionCard title={t("preview_title")} desc={t("sect_invoice_preview_desc")}>
        <Row k={t("preview_sales")} v={fmtMoney(draft.salesAmount, s.company.currency)} />
        <Row k={t("preview_approval")} v={fmtMoney(live.approvalAmount, s.company.currency)} />
        <Row k={t("lbl_discount")} v={`- ${fmtMoney(draft.discount, s.company.currency)}`} />
        <Row k={t("preview_total_charges")} v={`- ${fmtMoney(live.totalCharges, s.company.currency)}`} />
        <Row k={t("preview_total_credits")} v={`+ ${fmtMoney(live.totalCredits, s.company.currency)}`} />
        <div className="border-t my-2" />
        <Row k={t("preview_grand_total")} v={fmtMoney(live.grandTotal, s.company.currency)} bold />
        <Row k={t("preview_product_cost_lbl")} v={`- ${fmtMoney(draft.productCost, s.company.currency)}`} />
        <Row k={t("preview_net_profit")} v={fmtMoney(live.profit, s.company.currency)} accent bold />
        {(() => {
          const ag = s.agents.find((a) => a.id === draft.agentId);
          const rate =
            draft.commissionPercentOverride != null
              ? draft.commissionPercentOverride
              : ag?.commissionPercent ?? 0;
          const personal = Math.max(0, live.commissionableBase) * rate;
          const overrideMap = new Map(s.overrides.map((o) => [o.level, o.rate]));
          // Build downline chain (children of selected agent recursively)
          const childrenOf = (id: string) => s.agents.filter((a) => a.sponsorId === id);
          const collect = (id: string, lvl: number, out: { name: string; level: number; rate: number }[] = []) => {
            for (const k of childrenOf(id)) {
              out.push({ name: k.name, level: lvl, rate: overrideMap.get(lvl) || 0 });
              collect(k.id, lvl + 1, out);
            }
            return out;
          };
          const downline = draft.agentId ? collect(draft.agentId, 1) : [];
          const overrideTotal = downline.reduce(
            (sum, d) => sum + Math.max(0, live.profit) * d.rate,
            0
          );
          const splits = draft.split?.participants ?? [];
          const splitRows = splits.map((p) => ({
            name: p.displayName || "—",
            pct: p.splitPercent,
            share: personal * p.splitPercent,
          }));
          const gross = personal + overrideTotal;
          const netPay = gross - (draft.advanceApplied || 0) - (draft.specialDeductions || 0);
          const reserve = Math.max(0, netPay) * (draft.taxReservePercent || 0);
          const final = netPay - reserve;
          return (
            <>
              <div className="border-t my-2" />
              <Row k={`${t("preview_personal")} (${(rate * 100).toFixed(2)}%)`} v={fmtMoney(personal, s.company.currency)} />
              {splitRows.length > 0 && (
                <div className="mt-1 mb-1 pl-3 border-l-2 border-accent/30">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t("preview_splits")}</div>
                  {splitRows.map((r, i) => (
                    <Row key={i} k={`  ${r.name} (${(r.pct * 100).toFixed(0)}%)`} v={fmtMoney(r.share, s.company.currency)} />
                  ))}
                </div>
              )}
              {downline.length > 0 && (
                <div className="mt-1 mb-1 pl-3 border-l-2 border-primary/30">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t("preview_overrides")}</div>
                  {downline.map((d, i) => (
                    <Row
                      key={i}
                      k={`  ${d.name} L${d.level} (${(d.rate * 100).toFixed(2)}%)`}
                      v={fmtMoney(Math.max(0, live.profit) * d.rate, s.company.currency)}
                    />
                  ))}
                  <Row k={`  ${t("preview_override_total")}`} v={fmtMoney(overrideTotal, s.company.currency)} bold />
                </div>
              )}
              <Row k={t("preview_advance")} v={`- ${fmtMoney(draft.advanceApplied || 0, s.company.currency)}`} />
              <Row k={t("preview_deductions")} v={`- ${fmtMoney(draft.specialDeductions || 0, s.company.currency)}`} />
              <div className="border-t my-2" />
              <Row k={t("preview_net")} v={fmtMoney(netPay, s.company.currency)} bold />
              <Row k={`${t("preview_reserve")} (${((draft.taxReservePercent || 0) * 100).toFixed(1)}%)`} v={`- ${fmtMoney(reserve, s.company.currency)}`} />
              <Row k={t("preview_final")} v={fmtMoney(final, s.company.currency)} accent bold />
            </>
          );
        })()}
      </SectionCard>

      <div className="lg:col-span-2">
        <SectionCard title={t(isAdmin ? "sect_all_invoices" : "sect_my_invoices_lbl")} desc={t(isAdmin ? "sect_all_invoices_desc" : "sect_my_invoices_desc")}>
          {(() => {
            const visible = (isAdmin ? s.invoices : s.invoices.filter((i) => i.agentId === myAgentId)).slice().sort((a, b) => b.date.localeCompare(a.date));
            if (visible.length === 0) return <Empty msg={t("empty_no_invoices")} />;
            return (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="py-2">{t("th_number")}</th><th>{t("th_date")}</th><th>{t("th_customer")}</th><th>{t("th_salesperson")}</th>
                    <th>{t("th_status")}</th><th className="text-right">{t("th_sales")}</th><th className="text-right">{t("th_profit")}</th>
                    <th className="w-44"></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((inv) => {
                    const c = calcInvoice(inv, s.financeCompanies);
                    const ag = s.agents.find((a) => a.id === inv.agentId);
                    return (
                      <tr key={inv.id} className="border-t border-border/60">
                        <td className="py-2 font-mono text-xs">
                          {inv.number}
                          {inv.split && inv.split.participants.length > 0 && (() => {
                            const total = totalSplitPercent(inv.split.participants);
                            const ok = isSplitValid(inv.split.participants);
                            return (
                              <span
                                title={`Split: ${(total * 100).toFixed(1)}% across ${inv.split.participants.length} participant(s)`}
                                className={`ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                  ok ? "bg-emerald-500/15 text-emerald-500" : "bg-destructive/15 text-destructive"
                                }`}
                              >
                                <SplitIcon className="w-3 h-3" />
                                {inv.split.participants.length}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="font-mono text-xs">{inv.date}</td>
                        <td className="font-medium">{inv.customerName}</td>
                        <td>{ag?.name || "—"}</td>
                        <td><span className="text-xs uppercase tracking-wider px-2 py-1 rounded bg-muted">{inv.status}</span></td>
                        <td className="text-right font-mono">{fmtMoney(inv.salesAmount, s.company.currency)}</td>
                        <td className="text-right font-mono">{fmtMoney(c.profit, s.company.currency)}</td>
                        <td className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => editInvoice(inv.id)}>{isAdmin ? t("btn_edit") : t("btn_view")}</Button>
                          <Button variant="ghost" size="sm" title="Explain this commission" onClick={() => setExplainId(inv.id)}><HelpCircle className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="sm" title="Request correction" onClick={() => setDisputeId(inv.id)}><MessageSquare className="w-4 h-4" /></Button>
                          {isAdmin && (
                            <Button variant="ghost" size="sm" title="Split commission" onClick={() => setSplitId(inv.id)}>
                              <SplitIcon className="w-4 h-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => {
                            if (!inv.brandingSnapshot) s.updateInvoice(inv.id, { brandingSnapshot: makeBrandingSnapshot(s.company) });
                            const doc = buildSaleInvoicePDF(c, s.company, ag?.name || "—");
                            window.open(doc.output("bloburl"), "_blank");
                          }}>{t("btn_preview")}</Button>
                          <Button variant="ghost" size="sm" onClick={() => {
                            if (!inv.brandingSnapshot) s.updateInvoice(inv.id, { brandingSnapshot: makeBrandingSnapshot(s.company) });
                            buildSaleAndDownload(c, s.company, ag?.name || "—");
                          }}>PDF</Button>
                          <Button variant="ghost" size="sm" title="Timeline / audit log" onClick={() => setTimelineId(inv.id)}><Activity className="w-4 h-4" /></Button>
                          {isAdmin && <Button variant="ghost" size="icon" onClick={() => s.removeInvoice(inv.id)}><Trash2 className="w-4 h-4" /></Button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>);
          })()}
        </SectionCard>
      </div>

      <ExplainDialog invoiceId={explainId} open={!!explainId} onClose={() => setExplainId(null)} />
      <DisputeDialog invoiceId={disputeId} open={!!disputeId} onClose={() => setDisputeId(null)} />
      <SplitEditorDialog invoiceId={splitId} open={!!splitId} onClose={() => setSplitId(null)} />
      <InvoiceTimelineDialog invoiceId={timelineId} open={!!timelineId} onClose={() => setTimelineId(null)} />
    </div>
  );
}

function Row({ k, v, bold, accent }: { k: string; v: string; bold?: boolean; accent?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1 text-sm ${bold ? "font-semibold" : ""}`}>
      <span className="text-muted-foreground">{k}</span>
      <span className={`font-mono ${accent ? "text-accent" : ""}`}>{v}</span>
    </div>
  );
}

function LineEditor({
  title, rows, onAdd, onRemove, onChange,
}: {
  title: string;
  rows: LineItem[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  onChange: (i: number, f: "label" | "amount", v: string) => void;
}) {
  const t = useT();
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between mb-2">
        <Label className="text-sm font-semibold">{title}</Label>
        <Button variant="outline" size="sm" onClick={onAdd}><Plus className="w-3 h-3 mr-1" />{t("btn_add_line")}</Button>
      </div>
      <div className="space-y-2">
        {rows.length === 0 && <p className="text-xs text-muted-foreground">{t("empty_no_lines")}</p>}
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_140px_auto] gap-2">
            <Input value={r.label} placeholder={t("lbl_description")} onChange={(e) => onChange(i, "label", e.target.value)} />
            <Input type="number" step="0.01" value={r.amount} onChange={(e) => onChange(i, "amount", e.target.value)} />
            <Button variant="ghost" size="icon" onClick={() => onRemove(i)}><Trash2 className="w-4 h-4" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Plan ---------- */
function PlanPanel() {
  const {
    personalTiers, overrides, setPersonalTiers, setOverrides,
    positions, addPosition, updatePosition, removePosition,
    financeCompanies, company,
  } = useStore();
  const tierErrs = validateTiers(personalTiers);
  const ovErrs = validateOverrides(overrides);
  const t = useT();

  const updTier = (i: number, field: "minVolume" | "rate", v: number) => {
    const next = [...personalTiers];
    next[i] = { ...next[i], [field]: v };
    setPersonalTiers(next);
  };
  const updOv = (i: number, field: "level" | "rate", v: number) => {
    const next = [...overrides];
    next[i] = { ...next[i], [field]: v };
    setOverrides(next);
  };

  const addBlankPosition = (name = "New Position") =>
    addPosition({
      name,
      commissionPercent: 0.08,
      fixedPayout: 0,
      overrideEligible: false,
      differentialOverridePercent: 0,
      splitDefaultPercent: 0.5,
      effectiveFrom: new Date().toISOString().slice(0, 10),
      effectiveTo: "",
      active: true,
      financeCompanyId: null,
      productRule: "",
      minApprovalPercent: 0,
      specialDeductionPercent: 0,
      notes: "",
    });

  const presetNames = [
    "Junior Rep", "Sales Rep", "Senior Rep", "Manager",
    "Regional Manager", "Dealer", "Owner",
  ];

  /* ----- sample-sale simulator ----- */
  const [sim, setSim] = useState({
    positionId: "",
    salesAmount: 10000,
    productCost: 4000,
    approvalPercent: 1,
    financeCompanyId: "",
  });
  const simPosition = positions.find((p) => p.id === sim.positionId);
  const simFinance = financeCompanies.find((f) => f.id === sim.financeCompanyId) || null;
  const simResult = (() => {
    if (!simPosition) return null;
    const approval = sim.salesAmount * sim.approvalPercent;
    const financeFee = simFinance ? simFinance.defaultFee * sim.salesAmount + simFinance.adminFee + simFinance.dealerFee : 0;
    const grand = approval - financeFee;
    const profit = Math.max(0, grand - sim.productCost);
    const deductions = sim.salesAmount * (simPosition.specialDeductionPercent || 0);
    const blockedByApproval = sim.approvalPercent < simPosition.minApprovalPercent;
    const blockedByFinanceCo =
      simPosition.financeCompanyId && simPosition.financeCompanyId !== sim.financeCompanyId;
    const blocked = blockedByApproval || blockedByFinanceCo || !simPosition.active;
    const commission = blocked ? 0 : profit * simPosition.commissionPercent + simPosition.fixedPayout - deductions;
    return { approval, financeFee, grand, profit, deductions, commission, blocked, blockedByApproval, blockedByFinanceCo };
  })();

  return (
    <div className="space-y-6">
      <SectionCard
        title={t("sect_positions")}
        desc={t("sect_positions_desc")}
        action={
          <div className="flex gap-2 flex-wrap">
            <Select onValueChange={(v) => addBlankPosition(v)}>
              <SelectTrigger className="h-8 w-[180px]"><SelectValue placeholder={t("btn_add_preset")} /></SelectTrigger>
              <SelectContent>
                {presetNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => addBlankPosition()}>
              <Plus className="w-4 h-4 mr-2" />{t("btn_custom")}
            </Button>
          </div>
        }
      >
        {positions.length === 0 ? (
          <Empty msg={t("empty_no_positions")} />
        ) : (
          <div className="space-y-4">
            {positions.map((p) => (
              <div key={p.id} className="border border-border/60 rounded-lg p-4 space-y-3 bg-card/40">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Input
                      className="font-semibold w-56"
                      value={p.name}
                      onChange={(e) => updatePosition(p.id, { name: e.target.value })}
                    />
                    <label className="flex items-center gap-2 text-xs">
                      <Switch checked={p.active} onCheckedChange={(v) => updatePosition(p.id, { active: v })} />
                      {p.active ? t("lbl_active") : t("lbl_inactive")}
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                      <Switch checked={p.overrideEligible} onCheckedChange={(v) => updatePosition(p.id, { overrideEligible: v })} />
                      {t("lbl_override_eligible")}
                    </label>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removePosition(p.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <div className="grid md:grid-cols-4 gap-3">
                  <div><Label className="text-xs">{t("lbl_commission_pct")}</Label>
                    <Input type="number" step="0.1" value={(p.commissionPercent * 100).toFixed(2)}
                      onChange={(e) => updatePosition(p.id, { commissionPercent: Number(e.target.value) / 100 })} />
                  </div>
                  <div><Label className="text-xs">{t("lbl_fixed_payout")} ({company.currency})</Label>
                    <Input type="number" value={p.fixedPayout}
                      onChange={(e) => updatePosition(p.id, { fixedPayout: Number(e.target.value) })} />
                  </div>
                  <div><Label className="text-xs">{t("lbl_diff_override")}</Label>
                    <Input type="number" step="0.1" value={(p.differentialOverridePercent * 100).toFixed(2)}
                      onChange={(e) => updatePosition(p.id, { differentialOverridePercent: Number(e.target.value) / 100 })} />
                  </div>
                  <div><Label className="text-xs">{t("lbl_split_default")}</Label>
                    <Input type="number" step="1" value={(p.splitDefaultPercent * 100).toFixed(0)}
                      onChange={(e) => updatePosition(p.id, { splitDefaultPercent: Number(e.target.value) / 100 })} />
                  </div>

                  <div><Label className="text-xs">{t("lbl_effective_from")}</Label>
                    <Input type="date" value={p.effectiveFrom}
                      onChange={(e) => updatePosition(p.id, { effectiveFrom: e.target.value })} />
                  </div>
                  <div><Label className="text-xs">{t("lbl_effective_to")}</Label>
                    <Input type="date" value={p.effectiveTo}
                      onChange={(e) => updatePosition(p.id, { effectiveTo: e.target.value })} />
                  </div>
                  <div><Label className="text-xs">{t("lbl_min_approval")}</Label>
                    <Input type="number" step="1" value={(p.minApprovalPercent * 100).toFixed(0)}
                      onChange={(e) => updatePosition(p.id, { minApprovalPercent: Number(e.target.value) / 100 })} />
                  </div>
                  <div><Label className="text-xs">{t("lbl_special_deduction_pct")}</Label>
                    <Input type="number" step="0.1" value={(p.specialDeductionPercent * 100).toFixed(2)}
                      onChange={(e) => updatePosition(p.id, { specialDeductionPercent: Number(e.target.value) / 100 })} />
                  </div>

                  <div className="md:col-span-2"><Label className="text-xs">{t("lbl_finance_rule")}</Label>
                    <Select
                      value={p.financeCompanyId ?? "__all__"}
                      onValueChange={(v) => updatePosition(p.id, { financeCompanyId: v === "__all__" ? null : v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">{t("lbl_all_finance")}</SelectItem>
                        {financeCompanies.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2"><Label className="text-xs">{t("lbl_product_rule")}</Label>
                    <Input value={p.productRule}
                      placeholder="e.g. softener systems only"
                      onChange={(e) => updatePosition(p.id, { productRule: e.target.value })} />
                  </div>

                  <div className="md:col-span-4"><Label className="text-xs">{t("lbl_notes")}</Label>
                    <Textarea rows={2} value={p.notes}
                      onChange={(e) => updatePosition(p.id, { notes: e.target.value })} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={t("sect_simulator")}
        desc={t("sect_simulator_desc")}
      >
        {positions.length === 0 ? (
          <Empty msg={t("empty_add_position")} />
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div><Label className="text-xs">Position</Label>
                <Select value={sim.positionId} onValueChange={(v) => setSim({ ...sim, positionId: v })}>
                  <SelectTrigger><SelectValue placeholder={t("lbl_select_position")} /></SelectTrigger>
                  <SelectContent>
                    {positions.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">{t("lbl_sales_amount")}</Label>
                  <Input type="number" value={sim.salesAmount}
                    onChange={(e) => setSim({ ...sim, salesAmount: Number(e.target.value) })} />
                </div>
                <div><Label className="text-xs">{t("lbl_product_cost")}</Label>
                  <Input type="number" value={sim.productCost}
                    onChange={(e) => setSim({ ...sim, productCost: Number(e.target.value) })} />
                </div>
                <div><Label className="text-xs">{t("lbl_approval_pct")}</Label>
                  <Input type="number" step="1" value={(sim.approvalPercent * 100).toFixed(0)}
                    onChange={(e) => setSim({ ...sim, approvalPercent: Number(e.target.value) / 100 })} />
                </div>
                <div><Label className="text-xs">{t("lbl_finance_co")}</Label>
                  <Select value={sim.financeCompanyId || "__none__"}
                    onValueChange={(v) => setSim({ ...sim, financeCompanyId: v === "__none__" ? "" : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t("lbl_none")}</SelectItem>
                      {financeCompanies.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-muted/40 p-4 text-sm space-y-1.5">
              {!simResult ? (
                <p className="text-muted-foreground">{t("sim_no_position")}</p>
              ) : (
                <>
                  <Row k={t("sim_approval")} v={fmtMoney(simResult.approval, company.currency)} />
                  <Row k={t("sim_finance_fees")} v={fmtMoney(simResult.financeFee, company.currency)} />
                  <Row k={t("sim_grand_total")} v={fmtMoney(simResult.grand, company.currency)} />
                  <Row k={t("sim_profit")} v={fmtMoney(simResult.profit, company.currency)} />
                  <Row k={t("sim_deductions")} v={fmtMoney(simResult.deductions, company.currency)} />
                  <div className="border-t border-border/60 my-2" />
                  <Row k={t("sim_commission")} v={fmtMoney(simResult.commission, company.currency)} bold />
                  {simResult.blocked && (
                    <p className="text-xs text-destructive flex items-start gap-1 mt-2">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5" />
                      {!simPosition?.active && t("sim_pos_inactive")}
                      {simResult.blockedByApproval && t("sim_below_min")}
                      {simResult.blockedByFinanceCo && t("sim_wrong_finance")}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground italic mt-2">
                    {t("sim_estimate")}
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </SectionCard>

      <div className="grid md:grid-cols-2 gap-6">
        <SectionCard
          title={t("sect_tiers")}
          desc={t("sect_tiers_desc")}
          action={
            <Button variant="outline" size="sm"
              onClick={() => setPersonalTiers([...personalTiers, { minVolume: 0, rate: 0 }])}>
              <Plus className="w-4 h-4 mr-2" />{t("btn_tier")}
            </Button>}
        >
          <div className="space-y-2">
            {personalTiers.map((tier, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end">
                <div><Label className="text-xs">{t("lbl_min_profit")}</Label>
                  <Input type="number" value={tier.minVolume} onChange={(e) => updTier(i, "minVolume", Number(e.target.value))} />
                </div>
                <div><Label className="text-xs">{t("lbl_rate_pct")}</Label>
                  <Input type="number" step="0.1" value={(tier.rate * 100).toFixed(2)}
                    onChange={(e) => updTier(i, "rate", Number(e.target.value) / 100)} />
                </div>
                <Button variant="ghost" size="icon" onClick={() => setPersonalTiers(personalTiers.filter((_, j) => j !== i))}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
          <ValidationList errs={tierErrs} />
        </SectionCard>

        <SectionCard
          title={t("sect_overrides")}
          desc={t("sect_overrides_desc")}
          action={
            <Button variant="outline" size="sm"
              onClick={() => setOverrides([...overrides, { level: overrides.length + 1, rate: 0 }])}>
              <Plus className="w-4 h-4 mr-2" />{t("btn_level")}
            </Button>}
        >
          <div className="space-y-2">
            {overrides.map((o, i) => (
              <div key={i} className="grid grid-cols-[100px_1fr_auto] gap-3 items-end">
                <div><Label className="text-xs">{t("lbl_level")}</Label>
                  <Input type="number" min={1} value={o.level} onChange={(e) => updOv(i, "level", Number(e.target.value))} />
                </div>
                <div><Label className="text-xs">{t("lbl_rate_pct")}</Label>
                  <Input type="number" step="0.1" value={(o.rate * 100).toFixed(2)}
                    onChange={(e) => updOv(i, "rate", Number(e.target.value) / 100)} />
                </div>
                <Button variant="ghost" size="icon" onClick={() => setOverrides(overrides.filter((_, j) => j !== i))}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
          <ValidationList errs={ovErrs} />
        </SectionCard>
      </div>
    </div>
  );
}

function ValidationList({ errs }: { errs: string[] }) {
  const t = useT();
  if (!errs.length)
    return <p className="text-xs text-emerald-600 mt-3 flex items-center gap-1">{t("valid_config")}</p>;
  return (
    <ul className="mt-3 space-y-1">
      {errs.map((e, i) => (
        <li key={i} className="text-xs text-destructive flex items-start gap-1">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {e}
        </li>
      ))}
    </ul>
  );
}

/* ---------- Company ---------- */
function CompanyPanel() {
  const { company, setCompany, invoiceDate, periodLabel, setInvoiceMeta, resetAll, currentUserName, setCurrentUserName } = useStore();
  const t = useT();
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <SectionCard title={t("sect_company")} desc={t("sect_company_desc")}>
        <div className="grid gap-3">
          <Field label={t("lbl_company_name")} value={company.name} onChange={(v) => setCompany({ name: v })} />
          <Field label={t("lbl_address")} value={company.address} onChange={(v) => setCompany({ address: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("lbl_phone")} value={company.phone} onChange={(v) => setCompany({ phone: v })} />
            <Field label={t("lbl_billing_email")} value={company.email} onChange={(v) => setCompany({ email: v })} />
          </div>
          <Field label={t("lbl_tax_id")} value={company.taxId} onChange={(v) => setCompany({ taxId: v })} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><Label>{t("lbl_currency")}</Label>
              <Select value={company.currency} onValueChange={(v) => setCompany({ currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["USD","EUR","GBP","CAD","AUD","INR","BRL","MXN","ZAR","SGD"].map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Field label={t("lbl_invoice_prefix")} value={company.invoicePrefix} onChange={(v) => setCompany({ invoicePrefix: v })} />
            <div><Label>{t("lbl_brand_color")}</Label>
              <Input type="color" value={company.brandColor} onChange={(e) => setCompany({ brandColor: e.target.value })} />
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title={t("sect_payout_run")} desc={t("sect_payout_run_desc")}>
        <div className="grid gap-3">
          <Field
            label={t("lbl_admin_name")}
            value={currentUserName}
            onChange={(v) => setCurrentUserName(v)}
          />
          <div><Label>{t("lbl_invoice_date")}</Label>
            <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceMeta(e.target.value, periodLabel)} />
          </div>
          <Field label={t("lbl_period_label")} value={periodLabel} onChange={(v) => setInvoiceMeta(invoiceDate, v)} />
        </div>
        <div className="border-t border-border/60 mt-6 pt-4">
          <Button variant="destructive" size="sm" onClick={() => { if (confirm(t("confirm_reset"))) resetAll(); }}>
            {t("btn_reset_data")}
          </Button>
        </div>
      </SectionCard>

      <div className="md:col-span-2">
        <SectionCard title={t("sect_tax_reserve")} desc={t("sect_tax_reserve_desc")}>
          <TaxReserveByStateEditor />
        </SectionCard>
      </div>

      <div className="md:col-span-2">
        <BrandingPanel />
      </div>
    </div>
  );
}

/* ---------- Generate ---------- */
function GeneratePanel({ payouts }: { payouts: ReturnType<typeof calcPayouts> }) {
  const { company, invoiceDate, periodLabel } = useStore();
  const t = useT();
  const total = payouts.reduce((a, p) => a + p.finalPayable, 0);
  const payable = payouts.filter((p) => p.grossPayout > 0);

  const previewOne = (id: string) => {
    const p = payouts.find((x) => x.agent.id === id);
    if (!p) return;
    const doc = buildAgentCommissionPDF(p, company, invoiceDate, periodLabel);
    window.open(doc.output("bloburl"), "_blank");
  };
  const downloadOne = (id: string) => {
    const p = payouts.find((x) => x.agent.id === id);
    if (!p) return;
    const doc = buildAgentCommissionPDF(p, company, invoiceDate, periodLabel);
    doc.save(`commission_${p.agent.name.replace(/\s+/g, "_")}.pdf`);
  };

  return (
    <SectionCard
      title={t("sect_payouts")}
      desc={t("sect_payouts_desc")}
      action={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => downloadSummary(payouts, company, periodLabel)} disabled={!payouts.length}>
            <FileDown className="w-4 h-4 mr-2" />{t("btn_xlsx_summary")}
          </Button>
          <Button onClick={() => downloadAllCommissionPDFs(payable, company, invoiceDate, periodLabel)}
            disabled={!payable.length} className="bg-gradient-primary">
            <Sparkles className="w-4 h-4 mr-2" />{t("btn_generate_all")} ({payable.length})
          </Button>
        </div>
      }
    >
      {payouts.length === 0 ? <Empty msg={t("empty_add_reps")} /> : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm bg-muted/40 rounded-lg px-4 py-3">
            <span className="text-muted-foreground">{t("gen_final_payable")} {periodLabel}</span>
            <span className="font-mono font-bold text-lg text-accent">{fmtMoney(total, company.currency)}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="py-2">{t("th_salesperson")}</th>
                  <th className="text-right">{t("th_profit")}</th>
                  <th className="text-right">{t("th_personal")}</th>
                  <th className="text-right">{t("th_override")}</th>
                  <th className="text-right">{t("th_advance")}</th>
                  <th className="text-right">{t("th_net")}</th>
                  <th className="text-right">{t("th_tax_res")}</th>
                  <th className="text-right">{t("th_final")}</th>
                  <th className="w-44"></th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.agent.id} className="border-t border-border/60">
                    <td className="py-2">
                      <div className="font-medium">{p.agent.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.invoices.length} {t("gen_inv_count")} · {p.downline.length} {t("gen_downline_count")}
                      </div>
                    </td>
                    <td className="text-right font-mono">{fmtMoney(p.personalProfit, company.currency)}</td>
                    <td className="text-right font-mono">
                      {fmtMoney(p.personalCommission, company.currency)}
                      <div className="text-[10px] text-muted-foreground">@ {(p.personalRate * 100).toFixed(1)}%</div>
                    </td>
                    <td className="text-right font-mono">{fmtMoney(p.overrideTotal, company.currency)}</td>
                    <td className="text-right font-mono">{fmtMoney(p.advanceApplied, company.currency)}</td>
                    <td className="text-right font-mono">{fmtMoney(p.netPayable, company.currency)}</td>
                    <td className="text-right font-mono text-muted-foreground">{fmtMoney(p.taxReserveSuggested, company.currency)}</td>
                    <td className="text-right font-mono font-semibold">{fmtMoney(p.finalPayable, company.currency)}</td>
                    <td className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => previewOne(p.agent.id)} disabled={p.grossPayout <= 0}>{t("btn_preview")}</Button>
                      <Button variant="ghost" size="sm" onClick={() => downloadOne(p.agent.id)} disabled={p.grossPayout <= 0}>PDF</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground italic">
            {t("gen_tax_note")}
          </p>
        </div>
      )}
    </SectionCard>
  );
}

function ProductsPanel() {
  const s = useStore();
  const blank = { name: "", sku: "", kind: "product" as const, price: 0, cost: 0, priceEditable: true, active: true, notes: "" };
  const [draft, setDraft] = useState(blank);
  const t = useT();
  const add = () => {
    if (!draft.name.trim()) { toast.error(t("err_name_required")); return; }
    s.addProduct(draft);
    setDraft(blank);
    toast.success(t("success_product_added"));
  };
  return (
    <div className="space-y-6">
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          <div>
            <h3 className="font-semibold">{t("sect_products")}</h3>
            <p className="text-xs text-muted-foreground">{t("sect_products_desc")}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="md:col-span-2">
            <Label className="text-xs">{t("lbl_name")} *</Label>
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Premium Plan" />
          </div>
          <div>
            <Label className="text-xs">{t("lbl_sku")}</Label>
            <Input value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">{t("lbl_type")}</Label>
            <Select value={draft.kind} onValueChange={(v: any) => setDraft({ ...draft, kind: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="product">{t("prod_product")}</SelectItem>
                <SelectItem value="service">{t("prod_service")}</SelectItem>
                <SelectItem value="plan">{t("prod_plan")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{t("lbl_price")}</Label>
            <Input type="number" value={draft.price} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })} />
          </div>
          <div>
            <Label className="text-xs">{t("lbl_cost")}</Label>
            <Input type="number" value={draft.cost} onChange={(e) => setDraft({ ...draft, cost: Number(e.target.value) })} />
          </div>
          <div className="md:col-span-5 flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={draft.priceEditable} onCheckedChange={(v) => setDraft({ ...draft, priceEditable: v })} />
              {t("lbl_allow_price_edit")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} />
              {t("lbl_active")}
            </label>
          </div>
          <div className="md:col-span-1 flex items-end">
            <Button onClick={add} className="w-full"><Plus className="w-4 h-4 mr-1" />{t("btn_add")}</Button>
          </div>
          <div className="md:col-span-6">
            <Label className="text-xs">{t("lbl_notes")}</Label>
            <Textarea rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="font-semibold">{t("sect_catalog")} ({s.products.length})</h3>
        {s.products.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty_no_products")}</p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="text-left p-2">{t("lbl_name")}</th>
                  <th className="text-left p-2">{t("th_sku")}</th>
                  <th className="text-left p-2">{t("lbl_type")}</th>
                  <th className="text-right p-2">{t("lbl_price")}</th>
                  <th className="text-right p-2">{t("lbl_cost")}</th>
                  <th className="text-center p-2">{t("th_editable")}</th>
                  <th className="text-center p-2">{t("lbl_active")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {s.products.map((p) => (
                  <tr key={p.id} className="border-b">
                    <td className="p-2"><Input value={p.name} onChange={(e) => s.updateProduct(p.id, { name: e.target.value })} /></td>
                    <td className="p-2"><Input value={p.sku} onChange={(e) => s.updateProduct(p.id, { sku: e.target.value })} /></td>
                    <td className="p-2">
                      <Select value={p.kind} onValueChange={(v: any) => s.updateProduct(p.id, { kind: v })}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="product">{t("prod_product")}</SelectItem>
                          <SelectItem value="service">{t("prod_service")}</SelectItem>
                          <SelectItem value="plan">{t("prod_plan")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2"><Input type="number" className="text-right" value={p.price} onChange={(e) => s.updateProduct(p.id, { price: Number(e.target.value) })} /></td>
                    <td className="p-2"><Input type="number" className="text-right" value={p.cost} onChange={(e) => s.updateProduct(p.id, { cost: Number(e.target.value) })} /></td>
                    <td className="p-2 text-center"><Switch checked={p.priceEditable} onCheckedChange={(v) => s.updateProduct(p.id, { priceEditable: v })} /></td>
                    <td className="p-2 text-center"><Switch checked={p.active} onCheckedChange={(v) => s.updateProduct(p.id, { active: v })} /></td>
                    <td className="p-2 text-right">
                      <Button variant="ghost" size="icon" onClick={() => s.removeProduct(p.id)}><Trash2 className="w-4 h-4" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------- Branding & Invoice Templates (Admin only) ---------- */
function BrandingPanel() {
  const { company, setCompany, role, invoices, agents, financeCompanies } = useStore();
  if (role !== "admin") return null;

  const onLogoUpload = (file?: File | null) => {
    if (!file) return;
    if (file.size > 1024 * 1024) {
      toast.error("Logo must be under 1 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCompany({ logoDataUrl: String(reader.result || "") });
    reader.readAsDataURL(file);
  };

  const generateTestPdf = () => {
    const sample = invoices[0];
    if (sample) {
      const ag = agents.find((a) => a.id === sample.agentId);
      const c = calcInvoice(sample, financeCompanies);
      const doc = buildSaleInvoicePDF(c, company, ag?.name || "—");
      window.open(doc.output("bloburl"), "_blank");
      return;
    }
    const fakeInv: Invoice = {
      id: "test", number: `${company.invoicePrefix}-PREVIEW`, date: new Date().toISOString().slice(0, 10),
      status: "draft", agentId: "", financeCompanyId: null,
      customerName: "Sample Customer", customerNotes: "Test invoice — branding preview",
      salesAmount: 10000, productCost: 6000, approvalPercent: 1, discount: 0,
      charges: [{ label: "Setup fee", amount: 150 }],
      credits: [], advanceApplied: 0, specialDeductions: 0, taxReservePercent: 0.25, paid: false,
      saleType: "finance", commissionLevel: "Sales Rep", commissionBase: "profit",
    };
    const c = calcInvoice(fakeInv, financeCompanies);
    const doc = buildSaleInvoicePDF(c, company, "Sample Rep");
    window.open(doc.output("bloburl"), "_blank");
  };

  return (
    <SectionCard
      title="Company Branding & Invoice Templates"
      desc="Per-company branding. PDFs use these settings; old PDFs keep the branding snapshot from when they were generated."
    >
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="grid gap-4">
          <div>
            <Label>Company logo</Label>
            <div className="flex items-center gap-3 mt-1">
              <div className="w-20 h-20 rounded-md border border-border/60 bg-muted/30 flex items-center justify-center overflow-hidden">
                {company.logoDataUrl
                  ? <img src={company.logoDataUrl} alt="logo" className="max-w-full max-h-full object-contain" />
                  : <span className="text-xs text-muted-foreground">No logo</span>}
              </div>
              <div className="flex flex-col gap-2">
                <Input type="file" accept="image/png,image/jpeg" onChange={(e) => onLogoUpload(e.target.files?.[0])} />
                {company.logoDataUrl && (
                  <Button variant="outline" size="sm" onClick={() => setCompany({ logoDataUrl: "" })}>Remove logo</Button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Primary brand color</Label>
              <Input type="color" value={company.brandColor} onChange={(e) => setCompany({ brandColor: e.target.value })} />
            </div>
            <div>
              <Label>Accent color</Label>
              <Input type="color" value={company.brandColorSecondary} onChange={(e) => setCompany({ brandColorSecondary: e.target.value })} />
            </div>
          </div>

          <div>
            <Label>Invoice template</Label>
            <Select value={company.invoiceTemplate} onValueChange={(v: any) => setCompany({ invoiceTemplate: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INVOICE_TEMPLATES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name} — {t.desc}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Footer text</Label>
            <Textarea rows={2} value={company.footerText} onChange={(e) => setCompany({ footerText: e.target.value })} />
          </div>
          <div>
            <Label>Disclaimer / legal text</Label>
            <Textarea rows={3} value={company.disclaimerText} onChange={(e) => setCompany({ disclaimerText: e.target.value })} />
          </div>

          <div className="flex gap-2">
            <Button onClick={generateTestPdf}><FileDown className="w-4 h-4 mr-2" />Generate test PDF</Button>
          </div>
        </div>

        <div>
          <Label>Live preview</Label>
          <InvoicePreview />
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <Label>Template gallery — compare all 5 styles</Label>
          <span className="text-xs text-muted-foreground">Click any to apply</span>
        </div>
        <TemplateGallery />
      </div>
    </SectionCard>
  );
}

function TemplateGallery() {
  const { company, setCompany } = useStore();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
      {INVOICE_TEMPLATES.map((t) => {
        const active = company.invoiceTemplate === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setCompany({ invoiceTemplate: t.id })}
            className={`group text-left rounded-lg border-2 transition-all p-2 bg-background hover:shadow-md ${
              active ? "border-primary ring-2 ring-primary/30" : "border-border/60 hover:border-primary/50"
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs font-semibold">{t.name}</div>
              {active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground">Active</span>}
            </div>
            <div className="origin-top-left scale-[0.55] w-[182%] h-[260px] overflow-hidden pointer-events-none">
              <InvoicePreview templateOverride={t.id} />
            </div>
            <div className="text-[10px] text-muted-foreground mt-1.5 line-clamp-2">{t.desc}</div>
          </button>
        );
      })}
    </div>
  );
}

function InvoicePreview({ templateOverride }: { templateOverride?: import("@/lib/commission-store").InvoiceTemplateId } = {}) {
  const { company } = useStore();
  const tpl = templateOverride ?? company.invoiceTemplate;
  const primary = company.brandColor;
  const accent = company.brandColorSecondary;

  const headerStyle: React.CSSProperties =
    tpl === "minimal"
      ? { background: "white", color: "#111", borderBottom: `3px solid ${primary}` }
      : tpl === "modern-finance"
        ? { background: primary, color: "white", borderBottom: `8px solid ${accent}` }
        : { background: primary, color: "white" };

  const titleSize = tpl === "compact" ? 16 : tpl === "minimal" ? 22 : 20;

  return (
    <div className="mt-1 rounded-md border border-border/60 overflow-hidden bg-white text-[#111] shadow-sm">
      <div style={headerStyle} className="p-4 flex items-start gap-3">
        {company.logoDataUrl && (
          <img src={company.logoDataUrl} alt="logo" className={tpl === "compact" ? "w-9 h-9 object-contain" : "w-12 h-12 object-contain"} />
        )}
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: titleSize, fontWeight: 700 }}>SALES INVOICE</div>
          {tpl !== "minimal" ? (
            <div className="text-[11px] opacity-90 leading-tight mt-1">
              <div>{company.name}</div>
              <div>{company.address}</div>
              <div>{company.phone} · {company.email}</div>
            </div>
          ) : (
            <div className="text-[11px] text-neutral-600 leading-tight mt-1">
              <div>{company.name} · {company.address}</div>
              <div>{company.phone} · {company.email}</div>
            </div>
          )}
        </div>
        <div className="text-right text-[11px] opacity-90">
          <div>Invoice #: {company.invoicePrefix}-PREVIEW</div>
          <div>Date: {new Date().toISOString().slice(0, 10)}</div>
          <div>Status: DRAFT</div>
        </div>
      </div>

      <div className="p-4 text-[12px]">
        <div className="grid grid-cols-2 gap-4 mb-3">
          <div><div className="font-semibold">CUSTOMER</div><div>Sample Customer</div></div>
          <div><div className="font-semibold">SALESPERSON</div><div>Sample Rep</div></div>
        </div>
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr style={{ background: tpl === "minimal" ? "#f0f0f0" : primary, color: tpl === "minimal" ? "#111" : "white" }}>
              <th className="text-left p-1.5">Concept</th>
              <th className="text-right p-1.5">Amount ({company.currency})</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b"><td className="p-1.5">Sales Amount</td><td className="text-right p-1.5">10,000.00</td></tr>
            <tr className="border-b"><td className="p-1.5">Product Cost</td><td className="text-right p-1.5">6,000.00</td></tr>
            <tr className="border-b"><td className="p-1.5">Approval (100.00%)</td><td className="text-right p-1.5">10,000.00</td></tr>
          </tbody>
        </table>
        {tpl === "detailed-commission" && (
          <table className="w-full text-[11px] border-collapse mt-3">
            <thead>
              <tr style={{ background: accent, color: "white" }}>
                <th className="text-left p-1.5">Commission Detail</th>
                <th className="text-right p-1.5">Value</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b"><td className="p-1.5">Commission level</td><td className="text-right p-1.5">Sales Rep</td></tr>
              <tr className="border-b"><td className="p-1.5">Commission base</td><td className="text-right p-1.5">profit</td></tr>
            </tbody>
          </table>
        )}
        <div className="mt-4 pt-3 border-t text-[10px] text-neutral-500">
          {company.footerText && <div>{company.footerText}</div>}
          {company.disclaimerText && <div className="mt-1">{company.disclaimerText}</div>}
        </div>
      </div>
    </div>
  );
}
