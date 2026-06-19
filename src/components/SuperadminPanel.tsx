import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Building2, Users, Plus, RefreshCw, MoreVertical, LogOut,
  Copy, ChevronDown, ShieldAlert, Activity, Package, Eye,
  Ban, CheckCircle2, Sparkles,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type CompanySummary = {
  id: string;
  name: string;
  status: "active" | "trial" | "suspended";
  plan: string;
  invite_code: string | null;
  created_at: string;
  user_count: number;
  active_user_count: number;
  agent_count: number;
};

type CompanyUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: string | null;
  status: string;
  created_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  active:    "bg-emerald-100 text-emerald-700 border-emerald-200",
  trial:     "bg-sky-100 text-sky-700 border-sky-200",
  suspended: "bg-red-100 text-red-700 border-red-200",
};

const PLAN_COLORS: Record<string, string> = {
  starter:      "bg-slate-100 text-slate-600",
  professional: "bg-purple-100 text-purple-700",
  enterprise:   "bg-amber-100 text-amber-700",
};

function fmt(dt: string) {
  return new Date(dt).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function SuperadminPanel() {
  const { signOut } = useAuth();
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"companies" | "users">("companies");

  // Create company dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", invite_code: "", plan: "starter" });
  const [creating, setCreating] = useState(false);

  // Company detail / users dialog
  const [detailCompany, setDetailCompany] = useState<CompanySummary | null>(null);
  const [detailUsers, setDetailUsers] = useState<CompanyUser[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // All users tab
  const [allUsers, setAllUsers] = useState<(CompanyUser & { company_name: string })[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  async function loadCompanies() {
    setLoading(true);
    const { data, error } = await supabase
      .from("superadmin_companies_summary")
      .select("*");
    if (error) {
      toast.error("Error cargando empresas: " + error.message);
    } else {
      setCompanies((data ?? []) as unknown as CompanySummary[]);
    }
    setLoading(false);
  }

  async function loadAllUsers() {
    setUsersLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, status, created_at, companies(name)")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Error cargando usuarios: " + error.message);
    } else {
      setAllUsers(
        (data ?? []).map((u: any) => ({
          id: u.id,
          email: u.email,
          full_name: u.full_name,
          role: u.role,
          status: u.status,
          created_at: u.created_at,
          company_name: u.companies?.name ?? "—",
        }))
      );
    }
    setUsersLoading(false);
  }

  useEffect(() => { loadCompanies(); }, []);

  useEffect(() => {
    if (tab === "users") loadAllUsers();
  }, [tab]);

  async function handleCreate() {
    if (!createForm.name.trim()) { toast.error("Nombre requerido"); return; }
    setCreating(true);
    const { data, error } = await supabase.rpc("create_company_with_invite", {
      p_name: createForm.name.trim(),
      p_invite_code: createForm.invite_code.trim() || null,
      p_plan: createForm.plan,
    });
    setCreating(false);
    if (error) { toast.error("Error: " + error.message); return; }
    const result = data as unknown as { company_id: string; invite_code: string };
    toast.success(`Empresa creada. Código: ${result.invite_code}`);
    setCreateOpen(false);
    setCreateForm({ name: "", invite_code: "", plan: "starter" });
    loadCompanies();
  }

  async function handleSetStatus(companyId: string, status: string) {
    const { error } = await supabase.rpc("set_company_status", {
      p_company_id: companyId,
      p_status: status,
    });
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Estado actualizado");
    loadCompanies();
  }

  async function handleRegenCode(companyId: string, companyName: string) {
    const { data, error } = await supabase.rpc("regenerate_invite_code", {
      p_company_id: companyId,
    });
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success(`Nuevo código para ${companyName}: ${data}`);
    loadCompanies();
  }

  async function handleApproveUser(userId: string, role: string) {
    const { error } = await supabase
      .from("profiles")
      .update({ status: "active", role: role as "admin" | "rep" | "accountant" })
      .eq("id", userId);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Usuario aprobado");
    if (detailCompany) openDetail(detailCompany);
    if (tab === "users") loadAllUsers();
  }

  async function handleRejectUser(userId: string) {
    const { error } = await supabase
      .from("profiles")
      .update({ status: "rejected" })
      .eq("id", userId);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Usuario rechazado");
    if (detailCompany) openDetail(detailCompany);
    if (tab === "users") loadAllUsers();
  }

  async function openDetail(company: CompanySummary) {
    setDetailCompany(company);
    setDetailLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, status, created_at")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false });
    setDetailLoading(false);
    if (error) { toast.error("Error: " + error.message); return; }
    setDetailUsers((data ?? []) as CompanyUser[]);
  }

  const totalCompanies = companies.length;
  const activeCompanies = companies.filter((c) => c.status === "active").length;
  const totalUsers = companies.reduce((s, c) => s + (c.user_count ?? 0), 0);

  return (
    <div className="min-h-screen bg-[#F0F4F8]">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-sky-200/60 bg-white/95 backdrop-blur-md shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0B1F3A] to-[#0EA5E9] flex items-center justify-center">
              <ShieldAlert className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight">PayClarity — Superadmin</h1>
              <p className="text-[10px] text-muted-foreground hidden sm:block">Panel de control del sistema</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={loadCompanies} title="Refrescar">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="w-4 h-4 mr-1.5" />
              Salir
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Empresas totales",  value: totalCompanies,  icon: Building2,    color: "text-sky-600" },
            { label: "Empresas activas",  value: activeCompanies, icon: Activity,     color: "text-emerald-600" },
            { label: "Usuarios totales",  value: totalUsers,      icon: Users,        color: "text-violet-600" },
            { label: "Planes activos",    value: activeCompanies, icon: Package,      color: "text-amber-600" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white rounded-xl border border-border p-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center ${color}`}>
                <Icon className="w-4.5 h-4.5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">{label}</p>
                <p className="text-lg font-bold leading-tight">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 bg-white rounded-xl border border-border p-1">
            {(["companies", "users"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  tab === t
                    ? "bg-[#0B1F3A] text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "companies" ? "Empresas" : "Todos los usuarios"}
              </button>
            ))}
          </div>

          {tab === "companies" && (
            <Button
              size="sm"
              className="bg-[#0B1F3A] hover:bg-[#0EA5E9] text-white gap-1.5"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="w-4 h-4" />
              Nueva empresa
            </Button>
          )}
        </div>

        {/* ── COMPANIES TAB ───────────────────────────────────────────── */}
        {tab === "companies" && (
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            {loading ? (
              <div className="py-16 text-center text-sm text-muted-foreground">Cargando empresas…</div>
            ) : companies.length === 0 ? (
              <div className="py-16 text-center">
                <Building2 className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No hay empresas todavía</p>
                <Button size="sm" className="mt-3" onClick={() => setCreateOpen(true)}>
                  <Plus className="w-4 h-4 mr-1.5" /> Crear primera empresa
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Empresa</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Código de invitación</TableHead>
                      <TableHead className="text-center">Usuarios</TableHead>
                      <TableHead className="text-center">Agentes</TableHead>
                      <TableHead>Creada</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {companies.map((company) => (
                      <TableRow key={company.id} className="hover:bg-muted/20">
                        <TableCell className="font-medium">{company.name}</TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[company.status] ?? ""}`}>
                            {company.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_COLORS[company.plan] ?? "bg-slate-100 text-slate-600"}`}>
                            {company.plan}
                          </span>
                        </TableCell>
                        <TableCell>
                          {company.invite_code ? (
                            <div className="flex items-center gap-1.5">
                              <code className="text-xs bg-slate-100 border border-slate-200 px-2 py-0.5 rounded font-mono">
                                {company.invite_code}
                              </code>
                              <button
                                onClick={() => { navigator.clipboard.writeText(company.invite_code!); toast.success("Código copiado"); }}
                                className="text-muted-foreground hover:text-foreground"
                                title="Copiar"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm font-medium">{company.user_count ?? 0}</span>
                          <span className="text-xs text-muted-foreground ml-1">({company.active_user_count ?? 0} activos)</span>
                        </TableCell>
                        <TableCell className="text-center text-sm">{company.agent_count ?? 0}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmt(company.created_at)}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="w-8 h-8">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openDetail(company)}>
                                <Eye className="w-4 h-4 mr-2" /> Ver usuarios
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleRegenCode(company.id, company.name)}>
                                <RefreshCw className="w-4 h-4 mr-2" /> Regenerar código
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {company.status !== "active" && (
                                <DropdownMenuItem onClick={() => handleSetStatus(company.id, "active")}>
                                  <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600" /> Activar
                                </DropdownMenuItem>
                              )}
                              {company.status !== "trial" && (
                                <DropdownMenuItem onClick={() => handleSetStatus(company.id, "trial")}>
                                  <Sparkles className="w-4 h-4 mr-2 text-sky-600" /> Modo trial
                                </DropdownMenuItem>
                              )}
                              {company.status !== "suspended" && (
                                <DropdownMenuItem
                                  onClick={() => handleSetStatus(company.id, "suspended")}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Ban className="w-4 h-4 mr-2" /> Suspender
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {/* ── USERS TAB ───────────────────────────────────────────────── */}
        {tab === "users" && (
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            {usersLoading ? (
              <div className="py-16 text-center text-sm text-muted-foreground">Cargando usuarios…</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Usuario</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Registrado</TableHead>
                      <TableHead className="w-32">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allUsers.map((u) => (
                      <TableRow key={u.id} className="hover:bg-muted/20">
                        <TableCell>
                          <p className="font-medium text-sm">{u.full_name ?? u.email}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </TableCell>
                        <TableCell className="text-sm">{u.company_name}</TableCell>
                        <TableCell>
                          {u.role ? (
                            <Badge variant="outline" className="text-xs">{u.role}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">Sin rol</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                            u.status === "active"   ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                            u.status === "pending"  ? "bg-amber-100 text-amber-700 border-amber-200" :
                                                      "bg-red-100 text-red-700 border-red-200"
                          }`}>
                            {u.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmt(u.created_at)}</TableCell>
                        <TableCell>
                          {u.status === "pending" && (
                            <div className="flex gap-1">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                                    Aprobar <ChevronDown className="w-3 h-3" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                  {["admin", "rep", "accountant"].map((r) => (
                                    <DropdownMenuItem key={r} onClick={() => handleApproveUser(u.id, r)}>
                                      Como {r}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-destructive hover:text-destructive"
                                onClick={() => handleRejectUser(u.id)}
                              >
                                Rechazar
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── CREATE COMPANY DIALOG ─────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva empresa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Nombre de la empresa *</Label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="Ej: Acme Corp"
                autoFocus
              />
            </div>
            <div>
              <Label>Código de invitación</Label>
              <Input
                value={createForm.invite_code}
                onChange={(e) => setCreateForm({ ...createForm, invite_code: e.target.value.toUpperCase() })}
                placeholder="Auto-generado si se deja vacío"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Máx. 8 caracteres. Los empleados usan este código para registrarse.
              </p>
            </div>
            <div>
              <Label>Plan</Label>
              <Select
                value={createForm.plan}
                onValueChange={(v) => setCreateForm({ ...createForm, plan: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleCreate}
              disabled={creating}
              className="bg-[#0B1F3A] hover:bg-[#0EA5E9] text-white"
            >
              {creating ? "Creando…" : "Crear empresa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── COMPANY DETAIL DIALOG ─────────────────────────────────────── */}
      <Dialog open={!!detailCompany} onOpenChange={(o) => { if (!o) setDetailCompany(null); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Usuarios — {detailCompany?.name}
            </DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Cargando…</div>
          ) : (
            <div className="overflow-x-auto max-h-96">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                        Sin usuarios registrados
                      </TableCell>
                    </TableRow>
                  ) : detailUsers.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <p className="font-medium text-sm">{u.full_name ?? u.email}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </TableCell>
                      <TableCell>
                        {u.role
                          ? <Badge variant="outline" className="text-xs">{u.role}</Badge>
                          : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                          u.status === "active"  ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                          u.status === "pending" ? "bg-amber-100 text-amber-700 border-amber-200" :
                                                    "bg-red-100 text-red-700 border-red-200"
                        }`}>
                          {u.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        {u.status === "pending" && (
                          <div className="flex gap-1">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                                  Aprobar <ChevronDown className="w-3 h-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                {["admin", "rep", "accountant"].map((r) => (
                                  <DropdownMenuItem key={r} onClick={() => handleApproveUser(u.id, r)}>
                                    Como {r}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 text-xs text-destructive hover:text-destructive"
                              onClick={() => handleRejectUser(u.id)}
                            >
                              Rechazar
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailCompany(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
