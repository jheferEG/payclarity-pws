export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      companies: {
        Row: {
          id: string
          name: string
          address: string
          email: string
          phone: string
          tax_id: string
          currency: string
          invoice_prefix: string
          brand_color: string
          brand_color_secondary: string
          logo_data_url: string
          footer_text: string
          disclaimer_text: string
          invoice_template: string
          invoice_date: string | null
          period_label: string
          next_payout_date: string | null
          language: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          address?: string
          email?: string
          phone?: string
          tax_id?: string
          currency?: string
          invoice_prefix?: string
          brand_color?: string
          brand_color_secondary?: string
          logo_data_url?: string
          footer_text?: string
          disclaimer_text?: string
          invoice_template?: string
          invoice_date?: string | null
          period_label?: string
          next_payout_date?: string | null
          language?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          address?: string
          email?: string
          phone?: string
          tax_id?: string
          currency?: string
          invoice_prefix?: string
          brand_color?: string
          brand_color_secondary?: string
          logo_data_url?: string
          footer_text?: string
          disclaimer_text?: string
          invoice_template?: string
          invoice_date?: string | null
          period_label?: string
          next_payout_date?: string | null
          language?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          role: "admin" | "rep" | "accountant" | "superadmin" | null
          status: "pending" | "active" | "rejected"
          company_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          role?: "admin" | "rep" | "accountant" | "superadmin" | null
          status?: "pending" | "active" | "rejected"
          company_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          role?: "admin" | "rep" | "accountant" | "superadmin" | null
          status?: "pending" | "active" | "rejected"
          company_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "companies"
            referencedColumns: ["id"]
          }
        ]
      }
      notifications: {
        Row: {
          id: string
          company_id: string
          at: string
          kind: "dispute_submitted" | "dispute_replied" | "dispute_status" | "dispute_claimed" | "split_changed" | "pdf_regenerated" | "info"
          title: string
          message: string
          audience: string
          invoice_id: string | null
          dispute_id: string | null
          read: boolean
          read_by: string | null
        }
        Insert: {
          id?: string
          company_id: string
          at?: string
          kind: "dispute_submitted" | "dispute_replied" | "dispute_status" | "dispute_claimed" | "split_changed" | "pdf_regenerated" | "info"
          title: string
          message?: string
          audience?: string
          invoice_id?: string | null
          dispute_id?: string | null
          read?: boolean
          read_by?: string | null
        }
        Update: {
          id?: string
          company_id?: string
          at?: string
          kind?: "dispute_submitted" | "dispute_replied" | "dispute_status" | "dispute_claimed" | "split_changed" | "pdf_regenerated" | "info"
          title?: string
          message?: string
          audience?: string
          invoice_id?: string | null
          dispute_id?: string | null
          read?: boolean
          read_by?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          id: string
          company_id: string
          agent_id: string
          date: string
          amount: number
          method: string
          notes: string
          reference: string
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          agent_id: string
          date: string
          amount: number
          method?: string
          notes?: string
          reference?: string
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          agent_id?: string
          date?: string
          amount?: number
          method?: string
          notes?: string
          reference?: string
          created_at?: string
        }
        Relationships: []
      }
      adjustments: {
        Row: {
          id: string
          company_id: string
          agent_id: string
          invoice_id: string | null
          kind: "advance" | "deduction" | "credit" | "chargeback" | "manual_override" | "payment_correction" | "split_correction" | "pending_balance"
          amount: number
          date: string
          note: string
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          agent_id: string
          invoice_id?: string | null
          kind: "advance" | "deduction" | "credit" | "chargeback" | "manual_override" | "payment_correction" | "split_correction" | "pending_balance"
          amount: number
          date: string
          note?: string
          created_by?: string
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          agent_id?: string
          invoice_id?: string | null
          kind?: "advance" | "deduction" | "credit" | "chargeback" | "manual_override" | "payment_correction" | "split_correction" | "pending_balance"
          amount?: number
          date?: string
          note?: string
          created_by?: string
          created_at?: string
        }
        Relationships: []
      }
      disputes: {
        Row: {
          id: string
          company_id: string
          invoice_id: string | null
          agent_id: string
          reason: string
          notes: string
          kind: "correction" | "dispute" | "adjustment"
          priority: "low" | "normal" | "high"
          status: "submitted" | "under_review" | "needs_info" | "approved" | "rejected" | "resolved"
          assigned_admin_id: string | null
          admin_notes: string
          requested_change: Record<string, unknown> | null
          created_at: string
          updated_at: string
          resolved_at: string | null
        }
        Insert: {
          id?: string
          company_id: string
          invoice_id?: string | null
          agent_id: string
          reason: string
          notes?: string
          kind?: "correction" | "dispute" | "adjustment"
          priority?: "low" | "normal" | "high"
          status?: "submitted" | "under_review" | "needs_info" | "approved" | "rejected" | "resolved"
          assigned_admin_id?: string | null
          admin_notes?: string
          requested_change?: Record<string, unknown> | null
          created_at?: string
          updated_at?: string
          resolved_at?: string | null
        }
        Update: {
          id?: string
          company_id?: string
          invoice_id?: string | null
          agent_id?: string
          reason?: string
          notes?: string
          kind?: "correction" | "dispute" | "adjustment"
          priority?: "low" | "normal" | "high"
          status?: "submitted" | "under_review" | "needs_info" | "approved" | "rejected" | "resolved"
          assigned_admin_id?: string | null
          admin_notes?: string
          requested_change?: Record<string, unknown> | null
          created_at?: string
          updated_at?: string
          resolved_at?: string | null
        }
        Relationships: []
      }
      dispute_events: {
        Row: {
          id: string
          dispute_id: string
          at: string
          actor: "rep" | "admin" | "system"
          type: "submitted" | "claimed" | "needs_info" | "rep_reply" | "approved" | "rejected" | "resolved" | "note" | "reopened"
          message: string
        }
        Insert: {
          id?: string
          dispute_id: string
          at?: string
          actor: "rep" | "admin" | "system"
          type: "submitted" | "claimed" | "needs_info" | "rep_reply" | "approved" | "rejected" | "resolved" | "note" | "reopened"
          message?: string
        }
        Update: {
          id?: string
          dispute_id?: string
          at?: string
          actor?: "rep" | "admin" | "system"
          type?: "submitted" | "claimed" | "needs_info" | "rep_reply" | "approved" | "rejected" | "resolved" | "note" | "reopened"
          message?: string
        }
        Relationships: []
      }
      invoice_sequences: {
        Row: { company_id: string; last_seq: number }
        Insert: { company_id: string; last_seq?: number }
        Update: { company_id?: string; last_seq?: number }
        Relationships: []
      }
      invoices: {
        Row: {
          id: string
          company_id: string
          number: string
          date: string
          status: "draft" | "pending" | "paid" | "on_hold"
          agent_id: string
          finance_company_id: string | null
          customer_name: string
          customer_notes: string
          sales_amount: number
          product_cost: number
          approval_percent: number
          discount: number
          advance_applied: number
          special_deductions: number
          tax_reserve_percent: number
          paid: boolean
          sale_type: "credit_card" | "finance" | "check" | "wire" | "cash" | null
          ccpf_percent: number
          admin_fee_percent: number
          dealer_fee: number | null
          approved_advance_amount: number
          pending_advance_balance: number
          commission_level: string
          commission_base: "profit" | "product_cost"
          commission_percent_override: number | null
          branding_snapshot: Record<string, unknown> | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          number?: string
          date: string
          status?: "draft" | "pending" | "paid" | "on_hold"
          agent_id: string
          finance_company_id?: string | null
          customer_name?: string
          customer_notes?: string
          sales_amount?: number
          product_cost?: number
          approval_percent?: number
          discount?: number
          advance_applied?: number
          special_deductions?: number
          tax_reserve_percent?: number
          paid?: boolean
          sale_type?: "credit_card" | "finance" | "check" | "wire" | "cash" | null
          ccpf_percent?: number
          admin_fee_percent?: number
          dealer_fee?: number | null
          approved_advance_amount?: number
          pending_advance_balance?: number
          commission_level?: string
          commission_base?: "profit" | "product_cost"
          commission_percent_override?: number | null
          branding_snapshot?: Record<string, unknown> | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          number?: string
          date?: string
          status?: "draft" | "pending" | "paid" | "on_hold"
          agent_id?: string
          finance_company_id?: string | null
          customer_name?: string
          customer_notes?: string
          sales_amount?: number
          product_cost?: number
          approval_percent?: number
          discount?: number
          advance_applied?: number
          special_deductions?: number
          tax_reserve_percent?: number
          paid?: boolean
          sale_type?: "credit_card" | "finance" | "check" | "wire" | "cash" | null
          ccpf_percent?: number
          admin_fee_percent?: number
          dealer_fee?: number | null
          approved_advance_amount?: number
          pending_advance_balance?: number
          commission_level?: string
          commission_base?: "profit" | "product_cost"
          commission_percent_override?: number | null
          branding_snapshot?: Record<string, unknown> | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoice_line_items: {
        Row: {
          id: string
          invoice_id: string
          kind: "charge" | "credit"
          label: string
          amount: number
          sort_order: number
        }
        Insert: {
          id?: string
          invoice_id: string
          kind: "charge" | "credit"
          label?: string
          amount?: number
          sort_order?: number
        }
        Update: {
          id?: string
          invoice_id?: string
          kind?: "charge" | "credit"
          label?: string
          amount?: number
          sort_order?: number
        }
        Relationships: []
      }
      invoice_pdf_records: {
        Row: {
          id: string
          invoice_id: string
          at: string
          by: string
          reason: "initial" | "split_changed" | "manual_regeneration" | "approval"
          file_name: string
          split_snapshot: unknown[] | null
          branding_snapshot: Record<string, unknown>
        }
        Insert: {
          id?: string
          invoice_id: string
          at?: string
          by: string
          reason: "initial" | "split_changed" | "manual_regeneration" | "approval"
          file_name: string
          split_snapshot?: unknown[] | null
          branding_snapshot?: Record<string, unknown>
        }
        Update: {
          id?: string
          invoice_id?: string
          at?: string
          by?: string
          reason?: "initial" | "split_changed" | "manual_regeneration" | "approval"
          file_name?: string
          split_snapshot?: unknown[] | null
          branding_snapshot?: Record<string, unknown>
        }
        Relationships: []
      }
      split_templates: {
        Row: {
          id: string
          company_id: string
          name: string
          description: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          name: string
          description?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          name?: string
          description?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      split_template_positions: {
        Row: {
          id: string
          template_id: string
          role: string
          custom_role_label: string | null
          split_percent: number
          display_name: string | null
          sort_order: number
        }
        Insert: {
          id?: string
          template_id: string
          role: string
          custom_role_label?: string | null
          split_percent: number
          display_name?: string | null
          sort_order?: number
        }
        Update: {
          id?: string
          template_id?: string
          role?: string
          custom_role_label?: string | null
          split_percent?: number
          display_name?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      split_rules: {
        Row: {
          id: string
          company_id: string
          name: string
          priority: number
          active: boolean
          template_id: string
          criteria: Record<string, unknown>
          notes: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          name: string
          priority?: number
          active?: boolean
          template_id: string
          criteria?: Record<string, unknown>
          notes?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          name?: string
          priority?: number
          active?: boolean
          template_id?: string
          criteria?: Record<string, unknown>
          notes?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoice_splits: {
        Row: {
          id: string
          invoice_id: string
          applied_rule_id: string | null
          applied_template_id: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          invoice_id: string
          applied_rule_id?: string | null
          applied_template_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          invoice_id?: string
          applied_rule_id?: string | null
          applied_template_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoice_split_participants: {
        Row: {
          id: string
          invoice_split_id: string
          agent_id: string | null
          display_name: string
          role: string
          custom_role_label: string | null
          split_percent: number
          commission_level: string | null
          notes: string | null
          sort_order: number
        }
        Insert: {
          id?: string
          invoice_split_id: string
          agent_id?: string | null
          display_name?: string
          role: string
          custom_role_label?: string | null
          split_percent: number
          commission_level?: string | null
          notes?: string | null
          sort_order?: number
        }
        Update: {
          id?: string
          invoice_split_id?: string
          agent_id?: string | null
          display_name?: string
          role?: string
          custom_role_label?: string | null
          split_percent?: number
          commission_level?: string | null
          notes?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      split_audit_entries: {
        Row: {
          id: string
          invoice_split_id: string
          at: string
          by: string
          action: "created" | "updated" | "rule_applied" | "template_applied" | "cleared" | "approved" | "recalculated"
          message: string
          snapshot: unknown[]
        }
        Insert: {
          id?: string
          invoice_split_id: string
          at?: string
          by: string
          action: "created" | "updated" | "rule_applied" | "template_applied" | "cleared" | "approved" | "recalculated"
          message?: string
          snapshot?: unknown[]
        }
        Update: {
          id?: string
          invoice_split_id?: string
          at?: string
          by?: string
          action?: "created" | "updated" | "rule_applied" | "template_applied" | "cleared" | "approved" | "recalculated"
          message?: string
          snapshot?: unknown[]
        }
        Relationships: []
      }
      agents: {
        Row: {
          id: string
          company_id: string
          profile_id: string | null
          name: string
          email: string
          sponsor_id: string | null
          w9_status: "missing" | "pending" | "valid"
          state: string
          payment_method: string
          tax_reserve_percent: number
          commission_percent: number | null
          level: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          profile_id?: string | null
          name: string
          email?: string
          sponsor_id?: string | null
          w9_status?: "missing" | "pending" | "valid"
          state?: string
          payment_method?: string
          tax_reserve_percent?: number
          commission_percent?: number | null
          level?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          profile_id?: string | null
          name?: string
          email?: string
          sponsor_id?: string | null
          w9_status?: "missing" | "pending" | "valid"
          state?: string
          payment_method?: string
          tax_reserve_percent?: number
          commission_percent?: number | null
          level?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_sponsor_id_fkey"
            columns: ["sponsor_id"]
            referencedRelation: "agents"
            referencedColumns: ["id"]
          }
        ]
      }
      finance_companies: {
        Row: {
          id: string
          company_id: string
          name: string
          default_fee: number
          dealer_fee: number
          admin_fee: number
          uses_approval_discount: boolean
          active: boolean
          notes: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          name: string
          default_fee?: number
          dealer_fee?: number
          admin_fee?: number
          uses_approval_discount?: boolean
          active?: boolean
          notes?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          name?: string
          default_fee?: number
          dealer_fee?: number
          admin_fee?: number
          uses_approval_discount?: boolean
          active?: boolean
          notes?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_companies_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "companies"
            referencedColumns: ["id"]
          }
        ]
      }
      products: {
        Row: {
          id: string
          company_id: string
          name: string
          sku: string
          kind: "product" | "service" | "plan"
          price: number
          cost: number
          price_editable: boolean
          active: boolean
          notes: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          name: string
          sku?: string
          kind?: "product" | "service" | "plan"
          price?: number
          cost?: number
          price_editable?: boolean
          active?: boolean
          notes?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          name?: string
          sku?: string
          kind?: "product" | "service" | "plan"
          price?: number
          cost?: number
          price_editable?: boolean
          active?: boolean
          notes?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "companies"
            referencedColumns: ["id"]
          }
        ]
      }
      compensation_positions: {
        Row: {
          id: string
          company_id: string
          name: string
          commission_percent: number
          fixed_payout: number
          override_eligible: boolean
          differential_override_percent: number
          split_default_percent: number
          effective_from: string
          effective_to: string | null
          active: boolean
          finance_company_id: string | null
          product_rule: string
          min_approval_percent: number
          special_deduction_percent: number
          notes: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          name: string
          commission_percent?: number
          fixed_payout?: number
          override_eligible?: boolean
          differential_override_percent?: number
          split_default_percent?: number
          effective_from: string
          effective_to?: string | null
          active?: boolean
          finance_company_id?: string | null
          product_rule?: string
          min_approval_percent?: number
          special_deduction_percent?: number
          notes?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          name?: string
          commission_percent?: number
          fixed_payout?: number
          override_eligible?: boolean
          differential_override_percent?: number
          split_default_percent?: number
          effective_from?: string
          effective_to?: string | null
          active?: boolean
          finance_company_id?: string | null
          product_rule?: string
          min_approval_percent?: number
          special_deduction_percent?: number
          notes?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compensation_positions_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "companies"
            referencedColumns: ["id"]
          }
        ]
      }
      commission_tiers: {
        Row: {
          id: string
          company_id: string
          min_volume: number
          rate: number
          sort_order: number
        }
        Insert: {
          id?: string
          company_id: string
          min_volume: number
          rate: number
          sort_order?: number
        }
        Update: {
          id?: string
          company_id?: string
          min_volume?: number
          rate?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "commission_tiers_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "companies"
            referencedColumns: ["id"]
          }
        ]
      }
      override_levels: {
        Row: {
          id: string
          company_id: string
          level: number
          rate: number
        }
        Insert: {
          id?: string
          company_id: string
          level: number
          rate: number
        }
        Update: {
          id?: string
          company_id?: string
          level?: number
          rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "override_levels_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "companies"
            referencedColumns: ["id"]
          }
        ]
      }
      tax_reserve_by_state: {
        Row: {
          id: string
          company_id: string
          state_code: string
          rate: number
        }
        Insert: {
          id?: string
          company_id: string
          state_code: string
          rate: number
        }
        Update: {
          id?: string
          company_id?: string
          state_code?: string
          rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "tax_reserve_by_state_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "companies"
            referencedColumns: ["id"]
          }
        ]
      }
      company_config: {
        Row: {
          id: number
          invite_code: string
          company_id: string | null
          updated_at: string
        }
        Insert: {
          id?: number
          invite_code: string
          company_id?: string | null
          updated_at?: string
        }
        Update: {
          id?: number
          invite_code?: string
          company_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_config_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "companies"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      superadmin_companies_summary: {
        Row: {
          id: string
          name: string
          status: "active" | "trial" | "suspended"
          plan: string
          invite_code: string | null
          created_at: string
          user_count: number
          active_user_count: number
          agent_count: number
        }
        Relationships: []
      }
    }
    Functions: {
      is_superadmin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      create_company_with_invite: {
        Args: {
          p_name: string
          p_invite_code?: string | null
          p_plan?: string
        }
        Returns: Json
      }
      regenerate_invite_code: {
        Args: { p_company_id: string }
        Returns: string
      }
      set_company_status: {
        Args: { p_company_id: string; p_status: string }
        Returns: void
      }
      verify_invite_code: {
        Args: { code: string }
        Returns: string | null
      }
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      my_company_id: {
        Args: Record<PropertyKey, never>
        Returns: string | null
      }
      my_agent_id: {
        Args: Record<PropertyKey, never>
        Returns: string | null
      }
      next_invoice_number: {
        Args: { p_company_id: string }
        Returns: string
      }
      create_invoice: {
        Args: { p_invoice: Record<string, unknown>; p_line_items: unknown[] }
        Returns: string
      }
      submit_dispute: {
        Args: {
          p_company_id: string
          p_invoice_id: string | null
          p_agent_id: string
          p_reason: string
          p_notes: string
          p_kind: string
          p_priority: string
          p_requested_change: Record<string, unknown> | null
        }
        Returns: string
      }
      update_dispute_status: {
        Args: {
          p_dispute_id: string
          p_status: string
          p_actor: string
          p_message: string
        }
        Returns: void
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
