import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type UserRole = "admin" | "rep" | "accountant" | "technician";
export type UserStatus = "pending" | "active" | "rejected";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole | null;
  is_superadmin: boolean;
  status: UserStatus;
  company_id: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyAccess {
  id: string;
  name: string;
  role: UserRole;
}

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  companiesList: CompanyAccess[];
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  switchCompany: (companyId: string) => Promise<void>;
  updateAvatar: (avatarUrl: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [companiesList, setCompaniesList] = useState<CompanyAccess[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchAll(userId: string) {
    const [{ data: profileData }, { data: accessData }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).single(),
      supabase
        .from("user_company_access")
        .select("company_id, role, companies(id, name)")
        .eq("user_id", userId),
    ]);
    setProfile((profileData as Profile) ?? null);
    setCompaniesList(
      (accessData ?? []).map((a: any) => ({
        id: a.companies?.id ?? a.company_id,
        name: a.companies?.name ?? "—",
        role: a.role as UserRole,
      }))
    );
  }

  async function refreshProfile() {
    if (!user) return;
    await fetchAll(user.id);
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) await fetchAll(session.user.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchAll(session.user.id);
      } else {
        setProfile(null);
        setCompaniesList([]);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function switchCompany(companyId: string) {
    if (!user) return;
    const c = companiesList.find((x) => x.id === companyId);
    if (!c) return;
    const { error } = await supabase
      .from("profiles")
      .update({ company_id: companyId, role: c.role })
      .eq("id", user.id);
    if (!error) await fetchAll(user.id);
  }

  async function updateAvatar(avatarUrl: string) {
    if (!user) return;
    await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", user.id);
    setProfile((p) => p ? { ...p, avatar_url: avatarUrl } : p);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setCompaniesList([]);
    window.location.replace("/login");
  }

  return (
    <AuthContext.Provider value={{ user, profile, companiesList, loading, signOut, refreshProfile, switchCompany, updateAvatar }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
