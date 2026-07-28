import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import type { Profile } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, Clock, Shield, UserRound, Users2, RefreshCw, KeyRound,
  Copy, UserX, UserCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/commission-store";
import { useT } from "@/lib/i18n";

type ProfileRow = Profile & { id: string };

export function UserManagementPanel() {
  const t = useT();
  const { profile: myProfile } = useAuth();
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState("");

  const ROLE_LABELS: Record<string, string> = {
    admin: t("um_admin"),
    rep: t("um_rep"),
    accountant: t("um_accountant"),
  };

  async function loadData() {
    setLoading(true);
    const [{ data: profiles }, { data: company }] = await Promise.all([
      supabase.from("profiles").select("*")
        .eq("company_id", myProfile?.company_id ?? "")
        .eq("is_superadmin", false)
        .order("created_at", { ascending: true }),
      supabase.from("companies").select("invite_code")
        .eq("id", myProfile?.company_id ?? "")
        .single(),
    ]);
    setUsers((profiles as ProfileRow[]) ?? []);
    setInviteCode(company?.invite_code ?? "");
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  async function approve(userId: string, role: string) {
    if (!role) { toast.error(t("um_role_required")); return; }
    const { error } = await supabase
      .from("profiles")
      .update({ status: "active", role: role as any })
      .eq("id", userId);
    if (error) { toast.error(t("um_approve_failed")); return; }
    toast.success(t("um_approved"));
    loadData();
  }

  async function reject(userId: string) {
    const { error } = await supabase
      .from("profiles")
      .update({ status: "rejected" })
      .eq("id", userId);
    if (error) { toast.error(t("um_reject_failed")); return; }
    toast.success(t("um_rejected"));
    loadData();
  }

  async function inactivate(userId: string) {
    const { error } = await supabase
      .from("profiles")
      .update({ status: "rejected" })
      .eq("id", userId);
    if (error) { toast.error(t("um_inactivate_failed")); return; }
    toast.success(t("um_inactivated"));
    loadData();
  }

  async function reactivate(userId: string, role: string) {
    const { error } = await supabase
      .from("profiles")
      .update({ status: "active", role: role as any })
      .eq("id", userId);
    if (error) { toast.error(t("um_reactivate_failed")); return; }
    toast.success(t("um_reactivated"));
    loadData();
  }

  async function changeRole(userId: string, role: string) {
    const { error } = await supabase
      .from("profiles")
      .update({ role: role as any })
      .eq("id", userId);
    if (error) { toast.error(t("um_role_failed")); return; }
    toast.success(t("um_role_updated"));
    loadData();
  }

  const pending  = users.filter((u) => u.status === "pending");
  const active   = users.filter((u) => u.status === "active");
  const inactive = users.filter((u) => u.status === "rejected");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Invite Code — read-only; only superadmin can regenerate it */}
      <Card className="p-5 border border-border">
        <div className="flex items-center gap-2 mb-3">
          <KeyRound className="w-4 h-4 text-accent" />
          <h3 className="font-semibold text-sm">{t("um_invite_code")}</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          {t("um_invite_desc")}
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 max-w-[220px] px-3 py-2 rounded-lg bg-muted border border-border font-mono text-sm tracking-widest font-semibold">
            {inviteCode || "—"}
          </code>
          {inviteCode && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { navigator.clipboard.writeText(inviteCode); toast.success(t("um_code_copied")); }}
            >
              <Copy className="w-4 h-4 mr-1.5" />
              {t("um_copy")}
            </Button>
          )}
        </div>
      </Card>

      {/* Pending approvals */}
      {pending.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-amber-500" />
            <h3 className="font-semibold text-sm">{t("um_pending_title")} ({pending.length})</h3>
          </div>
          <div className="space-y-3">
            {pending.map((u) => (
              <PendingUserRow key={u.id} user={u} myId={myProfile?.id ?? ""} onApprove={approve} onReject={reject} />
            ))}
          </div>
        </div>
      )}

      {/* Active users */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Users2 className="w-4 h-4 text-accent" />
          <h3 className="font-semibold text-sm">{t("um_active_title")} ({active.length})</h3>
        </div>
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("um_no_active")}</p>
        ) : (
          <div className="space-y-2">
            {active.map((u) => (
              <ActiveUserRow
                key={u.id}
                user={u}
                myId={myProfile?.id ?? ""}
                onRoleChange={changeRole}
                onInactivate={inactivate}
              />
            ))}
          </div>
        )}
      </div>

      {/* Inactive users */}
      {inactive.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <UserX className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">{t("um_inactive_title")} ({inactive.length})</h3>
          </div>
          <div className="space-y-2">
            {inactive.map((u) => (
              <ReactivateRow key={u.id} user={u} onReactivate={reactivate} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PendingUserRow({
  user, myId, onApprove, onReject,
}: { user: ProfileRow; myId: string; onApprove: (id: string, role: string) => void; onReject: (id: string) => void }) {
  const t = useT();
  const [role, setRole] = useState<string>("");
  const joinedAt = new Date(user.created_at).toLocaleDateString();

  return (
    <Card className="p-4 border border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-medium">{user.full_name ?? "—"}</p>
            <p className="text-xs text-muted-foreground">{user.email} · {t("um_registered")} {joinedAt}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="h-8 w-[140px]">
              <SelectValue placeholder={t("um_role_select")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">{t("um_admin")}</SelectItem>
              <SelectItem value="rep">{t("um_rep")}</SelectItem>
              <SelectItem value="accountant">{t("um_accountant")}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="bg-success text-success-foreground hover:bg-success/90 gap-1"
            onClick={() => onApprove(user.id, role)}
            disabled={!role}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {t("um_approve")}
          </Button>
          <Button size="sm" variant="destructive" className="gap-1" onClick={() => onReject(user.id)}>
            <XCircle className="w-3.5 h-3.5" />
            {t("um_reject")}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ReactivateRow({
  user, onReactivate,
}: { user: ProfileRow; onReactivate: (id: string, role: string) => void }) {
  const t = useT();
  const [role, setRole] = useState("");

  return (
    <Card className="p-4 border border-border opacity-70">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium">{user.full_name ?? "—"}</p>
          <p className="text-xs text-muted-foreground">{user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="h-8 w-[160px]">
              <SelectValue placeholder={t("um_reactivate_as")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">{t("um_admin")}</SelectItem>
              <SelectItem value="rep">{t("um_rep")}</SelectItem>
              <SelectItem value="accountant">{t("um_accountant")}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
            disabled={!role}
            onClick={() => onReactivate(user.id, role)}
          >
            <UserCheck className="w-3.5 h-3.5" />
            {t("um_reactivate")}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ActiveUserRow({
  user, myId, onRoleChange, onInactivate,
}: {
  user: ProfileRow;
  myId: string;
  onRoleChange: (id: string, role: string) => void;
  onInactivate: (id: string) => void;
}) {
  const t = useT();
  const ROLE_LABELS: Record<string, string> = {
    admin: t("um_admin"),
    rep: t("um_rep"),
    accountant: t("um_accountant"),
  };
  const isMe = user.id === myId;
  const roleIcon = user.role === "admin"
    ? <Shield className="w-3.5 h-3.5 text-accent" />
    : <UserRound className="w-3.5 h-3.5 text-muted-foreground" />;

  return (
    <Card className="p-3.5 border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
            {roleIcon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{user.full_name ?? "—"}</p>
              {isMe && <span className="text-[10px] bg-accent/15 text-accent px-1.5 py-0.5 rounded font-medium">{t("um_you")}</span>}
            </div>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="capitalize text-xs">
            {ROLE_LABELS[user.role ?? ""] ?? user.role ?? t("um_no_role")}
          </Badge>
          {!isMe && (
            <>
              <Select value={user.role ?? ""} onValueChange={(v) => onRoleChange(user.id, v)}>
                <SelectTrigger className="h-8 w-[140px]">
                  <SelectValue placeholder={t("um_role_select")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">{t("um_admin")}</SelectItem>
                  <SelectItem value="rep">{t("um_rep")}</SelectItem>
                  <SelectItem value="accountant">{t("um_accountant")}</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1 text-destructive border-destructive/30 hover:bg-destructive/5"
                onClick={() => onInactivate(user.id)}
              >
                <UserX className="w-3.5 h-3.5" />
                {t("um_inactivate")}
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
