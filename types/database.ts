export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      answers: {
        Row: {
          comment: string | null
          follow_up: string | null
          id: string
          question_id: string
          response_id: string
          value: Json
        }
        Insert: {
          comment?: string | null
          follow_up?: string | null
          id?: string
          question_id: string
          response_id: string
          value: Json
        }
        Update: {
          comment?: string | null
          follow_up?: string | null
          id?: string
          question_id?: string
          response_id?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "survey_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "responses"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: number
          meta: Json
          org_id: string | null
          target: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: never
          meta?: Json
          org_id?: string | null
          target?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: never
          meta?: Json
          org_id?: string | null
          target?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      benchmarks: {
        Row: {
          industry: string
          metric_key: string
          source: string
          value: number
        }
        Insert: {
          industry: string
          metric_key: string
          source: string
          value: number
        }
        Update: {
          industry?: string
          metric_key?: string
          source?: string
          value?: number
        }
        Relationships: []
      }
      brand_accents: {
        Row: {
          contrast: string
          hex: string
          key: string
          sort_order: number
        }
        Insert: {
          contrast: string
          hex: string
          key: string
          sort_order?: number
        }
        Update: {
          contrast?: string
          hex?: string
          key?: string
          sort_order?: number
        }
        Relationships: []
      }
      dashboard_layouts: {
        Row: {
          created_at: string
          filters: Json
          id: string
          org_id: string
          panels: Json
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          org_id: string
          panels?: Json
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          org_id?: string
          panels?: Json
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_layouts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_pins: {
        Row: {
          created_at: string
          id: string
          org_id: string
          panel_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          panel_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          panel_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_pins_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_pins_panel_key_fkey"
            columns: ["panel_key"]
            isOneToOne: false
            referencedRelation: "report_section_types"
            referencedColumns: ["key"]
          },
        ]
      }
      dashboard_presets: {
        Row: {
          description: string
          key: string
          panels: Json
          sort_order: number
          tint: string | null
          title: string
        }
        Insert: {
          description: string
          key: string
          panels: Json
          sort_order?: number
          tint?: string | null
          title: string
        }
        Update: {
          description?: string
          key?: string
          panels?: Json
          sort_order?: number
          tint?: string | null
          title?: string
        }
        Relationships: []
      }
      demo_requests: {
        Row: {
          company: string
          created_at: string
          email: string
          id: string
          name: string
          plan: string | null
          status: string
        }
        Insert: {
          company: string
          created_at?: string
          email: string
          id?: string
          name: string
          plan?: string | null
          status?: string
        }
        Update: {
          company?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          plan?: string | null
          status?: string
        }
        Relationships: []
      }
      dsr_requests: {
        Row: {
          created_at: string
          due_at: string
          handled_by: string | null
          id: string
          org_id: string
          resolution: string | null
          status: "mottatt" | "under_behandling" | "fullfort" | "avvist"
          subject_email: string
          type: "innsyn" | "retting" | "sletting" | "portabilitet"
          updated_at: string
        }
        Insert: {
          created_at?: string
          due_at?: string
          handled_by?: string | null
          id?: string
          org_id: string
          resolution?: string | null
          status?: "mottatt" | "under_behandling" | "fullfort" | "avvist"
          subject_email: string
          type: "innsyn" | "retting" | "sletting" | "portabilitet"
          updated_at?: string
        }
        Update: {
          created_at?: string
          due_at?: string
          handled_by?: string | null
          id?: string
          org_id?: string
          resolution?: string | null
          status?: "mottatt" | "under_behandling" | "fullfort" | "avvist"
          subject_email?: string
          type?: "innsyn" | "retting" | "sletting" | "portabilitet"
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dsr_requests_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "org_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dsr_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      duties: {
        Row: {
          created_at: string
          definition_key: string
          id: string
          interval_months: number
          next_due_at: string | null
          org_id: string
          owner_member_id: string | null
          publish: boolean | null
          reminder_weeks: number
        }
        Insert: {
          created_at?: string
          definition_key: string
          id?: string
          interval_months: number
          next_due_at?: string | null
          org_id: string
          owner_member_id?: string | null
          publish?: boolean | null
          reminder_weeks?: number
        }
        Update: {
          created_at?: string
          definition_key?: string
          id?: string
          interval_months?: number
          next_due_at?: string | null
          org_id?: string
          owner_member_id?: string | null
          publish?: boolean | null
          reminder_weeks?: number
        }
        Relationships: [
          {
            foreignKeyName: "duties_definition_key_fkey"
            columns: ["definition_key"]
            isOneToOne: false
            referencedRelation: "duty_definitions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "duties_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duties_owner_member_id_fkey"
            columns: ["owner_member_id", "org_id"]
            isOneToOne: false
            referencedRelation: "org_members"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      duty_checks: {
        Row: {
          done: boolean
          done_at: string | null
          done_by: string | null
          duty_id: string
          key: string
        }
        Insert: {
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          duty_id: string
          key: string
        }
        Update: {
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          duty_id?: string
          key?: string
        }
        Relationships: [
          {
            foreignKeyName: "duty_checks_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "org_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duty_checks_duty_id_fkey"
            columns: ["duty_id"]
            isOneToOne: false
            referencedRelation: "duties"
            referencedColumns: ["id"]
          },
        ]
      }
      duty_definitions: {
        Row: {
          basis: string
          checks: Json
          default_interval_months: number
          key: string
          law: string
          pack_key: string
          policy: Json | null
          publish: boolean
          signer_roles: Json
          title: string
        }
        Insert: {
          basis: string
          checks: Json
          default_interval_months: number
          key: string
          law: string
          pack_key: string
          policy?: Json | null
          publish?: boolean
          signer_roles: Json
          title: string
        }
        Update: {
          basis?: string
          checks?: Json
          default_interval_months?: number
          key?: string
          law?: string
          pack_key?: string
          policy?: Json | null
          publish?: boolean
          signer_roles?: Json
          title?: string
        }
        Relationships: []
      }
      duty_signers: {
        Row: {
          duty_id: string
          id: string
          label: string
          member_id: string | null
          role_key: string
          signed_at: string | null
          signed_content_hash: string | null
        }
        Insert: {
          duty_id: string
          id?: string
          label: string
          member_id?: string | null
          role_key: string
          signed_at?: string | null
          signed_content_hash?: string | null
        }
        Update: {
          duty_id?: string
          id?: string
          label?: string
          member_id?: string | null
          role_key?: string
          signed_at?: string | null
          signed_content_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "duty_signers_duty_id_fkey"
            columns: ["duty_id"]
            isOneToOne: false
            referencedRelation: "duties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duty_signers_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "org_members"
            referencedColumns: ["id"]
          },
        ]
      }
      duty_survey_links: {
        Row: {
          duty_id: string
          survey_id: string
        }
        Insert: {
          duty_id: string
          survey_id: string
        }
        Update: {
          duty_id?: string
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "duty_survey_links_duty_id_fkey"
            columns: ["duty_id"]
            isOneToOne: false
            referencedRelation: "duties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duty_survey_links_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      duty_versions: {
        Row: {
          archived_by: string | null
          content_hash: string
          duty_id: string
          id: string
          label: string
          published_at: string
          report_id: string | null
        }
        Insert: {
          archived_by?: string | null
          content_hash: string
          duty_id: string
          id?: string
          label: string
          published_at?: string
          report_id?: string | null
        }
        Update: {
          archived_by?: string | null
          content_hash?: string
          duty_id?: string
          id?: string
          label?: string
          published_at?: string
          report_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "duty_versions_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "org_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duty_versions_duty_id_fkey"
            columns: ["duty_id"]
            isOneToOne: false
            referencedRelation: "duties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duty_versions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          enabled: boolean
          key: string
          org_id: string | null
        }
        Insert: {
          enabled?: boolean
          key: string
          org_id?: string | null
        }
        Update: {
          enabled?: boolean
          key?: string
          org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          id: string
          lead_member_id: string | null
          name: string
          org_id: string
          source: string | null
          synced_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          lead_member_id?: string | null
          name: string
          org_id: string
          source?: string | null
          synced_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          lead_member_id?: string | null
          name?: string
          org_id?: string
          source?: string | null
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "groups_lead_fk"
            columns: ["lead_member_id"]
            isOneToOne: false
            referencedRelation: "org_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          created_at: string
          created_by: string | null
          error_rows: Json | null
          id: string
          ok_rows: number | null
          org_id: string
          source: "csv" | "excel" | "entra" | "google" | "hr" | "paste"
          status: string
          survey_id: string | null
          total_rows: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error_rows?: Json | null
          id?: string
          ok_rows?: number | null
          org_id: string
          source: "csv" | "excel" | "entra" | "google" | "hr" | "paste"
          status?: string
          survey_id?: string | null
          total_rows?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error_rows?: Json | null
          id?: string
          ok_rows?: number | null
          org_id?: string
          source?: "csv" | "excel" | "entra" | "google" | "hr" | "paste"
          status?: string
          survey_id?: string | null
          total_rows?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "org_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      logic_rules: {
        Row: {
          config: Json
          created_at: string
          id: string
          kind: string
          survey_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          kind?: string
          survey_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          kind?: string
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "logic_rules_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          kind: string
          member_id: string
          org_id: string
          payload: Json
          read_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          member_id: string
          org_id: string
          payload?: Json
          read_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          member_id?: string
          org_id?: string
          payload?: Json
          read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "org_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          email: string
          group_id: string | null
          id: string
          invited_by: string | null
          name: string | null
          org_id: string
          role: "administrator" | "redaktor" | "leser"
          sso_exempt: boolean
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          group_id?: string | null
          id?: string
          invited_by?: string | null
          name?: string | null
          org_id: string
          role?: "administrator" | "redaktor" | "leser"
          sso_exempt?: boolean
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          group_id?: string | null
          id?: string
          invited_by?: string | null
          name?: string | null
          org_id?: string
          role?: "administrator" | "redaktor" | "leser"
          sso_exempt?: boolean
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          active_langs: string[]
          address: string | null
          brand_accent: string | null
          brand_type: string | null
          contact_email: string | null
          contact_name: string | null
          created_at: string
          default_k_threshold: number
          default_lang: string
          dpo: string | null
          id: string
          logo_dark: string | null
          logo_icon: string | null
          logo_light: string | null
          name: string
          options: Json
          orgnr: string | null
          plan: string
          privacy: Json
          retention_months: number
          timezone: string
          updated_at: string
        }
        Insert: {
          active_langs?: string[]
          address?: string | null
          brand_accent?: string | null
          brand_type?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          default_k_threshold?: number
          default_lang?: string
          dpo?: string | null
          id?: string
          logo_dark?: string | null
          logo_icon?: string | null
          logo_light?: string | null
          name: string
          options?: Json
          orgnr?: string | null
          plan?: string
          privacy?: Json
          retention_months?: number
          timezone?: string
          updated_at?: string
        }
        Update: {
          active_langs?: string[]
          address?: string | null
          brand_accent?: string | null
          brand_type?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          default_k_threshold?: number
          default_lang?: string
          dpo?: string | null
          id?: string
          logo_dark?: string | null
          logo_icon?: string | null
          logo_light?: string | null
          name?: string
          options?: Json
          orgnr?: string | null
          plan?: string
          privacy?: Json
          retention_months?: number
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_brand_accent_fkey"
            columns: ["brand_accent"]
            isOneToOne: false
            referencedRelation: "brand_accents"
            referencedColumns: ["key"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          job_title: string | null
          lang: string
          notify: Json
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          job_title?: string | null
          lang?: string
          notify?: Json
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          job_title?: string | null
          lang?: string
          notify?: Json
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quality_rules: {
        Row: {
          key: string
          lang: string
          message: string
          pattern: string | null
          rule: Json
        }
        Insert: {
          key: string
          lang?: string
          message: string
          pattern?: string | null
          rule: Json
        }
        Update: {
          key?: string
          lang?: string
          message?: string
          pattern?: string | null
          rule?: Json
        }
        Relationships: []
      }
      question_bank: {
        Row: {
          author_member_id: string | null
          category: string
          config: Json
          created_at: string
          id: string
          org_id: string | null
          sort_order: number
          text: string
          type:
            | "scale"
            | "likert"
            | "smiley"
            | "enps"
            | "slider"
            | "choice"
            | "dropdown"
            | "image"
            | "yesno"
            | "ranking"
            | "matrix"
            | "text"
            | "field"
          used_count: number
        }
        Insert: {
          author_member_id?: string | null
          category: string
          config?: Json
          created_at?: string
          id?: string
          org_id?: string | null
          sort_order?: number
          text: string
          type:
            | "scale"
            | "likert"
            | "smiley"
            | "enps"
            | "slider"
            | "choice"
            | "dropdown"
            | "image"
            | "yesno"
            | "ranking"
            | "matrix"
            | "text"
            | "field"
          used_count?: number
        }
        Update: {
          author_member_id?: string | null
          category?: string
          config?: Json
          created_at?: string
          id?: string
          org_id?: string | null
          sort_order?: number
          text?: string
          type?:
            | "scale"
            | "likert"
            | "smiley"
            | "enps"
            | "slider"
            | "choice"
            | "dropdown"
            | "image"
            | "yesno"
            | "ranking"
            | "matrix"
            | "text"
            | "field"
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "question_bank_author_member_id_fkey"
            columns: ["author_member_id"]
            isOneToOne: false
            referencedRelation: "org_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_bank_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      question_translations: {
        Row: {
          config_overrides: Json
          confirmed_by: string | null
          help: string | null
          lang: string
          machine_translated: boolean
          question_id: string
          text: string
        }
        Insert: {
          config_overrides?: Json
          confirmed_by?: string | null
          help?: string | null
          lang: string
          machine_translated?: boolean
          question_id: string
          text: string
        }
        Update: {
          config_overrides?: Json
          confirmed_by?: string | null
          help?: string | null
          lang?: string
          machine_translated?: boolean
          question_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_translations_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "survey_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      report_exports: {
        Row: {
          created_at: string
          created_by: string | null
          format: string
          id: string
          report_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          format: string
          id?: string
          report_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          format?: string
          id?: string
          report_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_exports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "org_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_exports_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_section_types: {
        Row: {
          description: string
          in_report: boolean
          key: string
          label: string
          on_dashboard: boolean
          sort_order: number
          supports_group_filter: boolean
        }
        Insert: {
          description: string
          in_report?: boolean
          key: string
          label: string
          on_dashboard?: boolean
          sort_order?: number
          supports_group_filter?: boolean
        }
        Update: {
          description?: string
          in_report?: boolean
          key?: string
          label?: string
          on_dashboard?: boolean
          sort_order?: number
          supports_group_filter?: boolean
        }
        Relationships: []
      }
      report_shares: {
        Row: {
          created_at: string
          expires_at: string | null
          group_id: string | null
          id: string
          report_id: string
          scope: "ledelse" | "ledere_eget_team" | "alle_ansatte"
          token_hash: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          group_id?: string | null
          id?: string
          report_id: string
          scope: "ledelse" | "ledere_eget_team" | "alle_ansatte"
          token_hash: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          group_id?: string | null
          id?: string
          report_id?: string
          scope?: "ledelse" | "ledere_eget_team" | "alle_ansatte"
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_shares_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_shares_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_templates: {
        Row: {
          description: string
          key: string
          sections: Json
          sort_order: number
          tag: string
          title: string
        }
        Insert: {
          description: string
          key: string
          sections: Json
          sort_order?: number
          tag: string
          title: string
        }
        Update: {
          description?: string
          key?: string
          sections?: Json
          sort_order?: number
          tag?: string
          title?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          base_template: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duty_id: string | null
          filters: Json
          id: string
          kind: "lov" | "egen"
          org_id: string
          schedule: Json | null
          sections: Json
          share_scope: "ledelse" | "ledere_eget_team" | "alle_ansatte"
          snapshot_id: string | null
          status: "utkast" | "klar" | "publisert"
          title: string
          updated_at: string
        }
        Insert: {
          base_template?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          duty_id?: string | null
          filters?: Json
          id?: string
          kind?: "lov" | "egen"
          org_id: string
          schedule?: Json | null
          sections?: Json
          share_scope?: "ledelse" | "ledere_eget_team" | "alle_ansatte"
          snapshot_id?: string | null
          status?: "utkast" | "klar" | "publisert"
          title: string
          updated_at?: string
        }
        Update: {
          base_template?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          duty_id?: string | null
          filters?: Json
          id?: string
          kind?: "lov" | "egen"
          org_id?: string
          schedule?: Json | null
          sections?: Json
          share_scope?: "ledelse" | "ledere_eget_team" | "alle_ansatte"
          snapshot_id?: string | null
          status?: "utkast" | "klar" | "publisert"
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "org_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_duty_id_fkey"
            columns: ["duty_id"]
            isOneToOne: false
            referencedRelation: "duties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "result_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      responses: {
        Row: {
          anonymity_at_submission: "anonymous" | "named" | "optional"
          id: string
          invitation_id: string | null
          lang: string
          respondent_group_id: string | null
          round_id: string
          submission_key: string
          submitted_hour: string
        }
        Insert: {
          anonymity_at_submission: "anonymous" | "named" | "optional"
          id?: string
          invitation_id?: string | null
          lang?: string
          respondent_group_id?: string | null
          round_id: string
          submission_key?: string
          submitted_hour?: string
        }
        Update: {
          anonymity_at_submission?: "anonymous" | "named" | "optional"
          id?: string
          invitation_id?: string | null
          lang?: string
          respondent_group_id?: string | null
          round_id?: string
          submission_key?: string
          submitted_hour?: string
        }
        Relationships: [
          {
            foreignKeyName: "responses_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "survey_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responses_respondent_group_id_fkey"
            columns: ["respondent_group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responses_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "survey_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      result_snapshots: {
        Row: {
          aggregates: Json
          content_hash: string
          created_at: string
          id: string
          org_id: string
          round_id: string | null
          scope: Json
          survey_id: string
        }
        Insert: {
          aggregates: Json
          content_hash: string
          created_at?: string
          id?: string
          org_id: string
          round_id?: string | null
          scope?: Json
          survey_id: string
        }
        Update: {
          aggregates?: Json
          content_hash?: string
          created_at?: string
          id?: string
          org_id?: string
          round_id?: string | null
          scope?: Json
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "result_snapshots_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_snapshots_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "survey_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_snapshots_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          active: boolean
          cadence:
            | "once"
            | "weekly"
            | "biweekly"
            | "monthly"
            | "quarterly"
            | "biannual"
            | "annual"
            | "biennial"
            | "custom"
          created_at: string
          custom_every: number | null
          custom_unit: string | null
          custom_weekday: number | null
          id: string
          next_run_at: string | null
          paused_at: string | null
          reminder_after_days: number
          rotate_questions: boolean
          runs_done: number
          runs_total: number
          send_at_local: string
          survey_id: string
        }
        Insert: {
          active?: boolean
          cadence?:
            | "once"
            | "weekly"
            | "biweekly"
            | "monthly"
            | "quarterly"
            | "biannual"
            | "annual"
            | "biennial"
            | "custom"
          created_at?: string
          custom_every?: number | null
          custom_unit?: string | null
          custom_weekday?: number | null
          id?: string
          next_run_at?: string | null
          paused_at?: string | null
          reminder_after_days?: number
          rotate_questions?: boolean
          runs_done?: number
          runs_total?: number
          send_at_local?: string
          survey_id: string
        }
        Update: {
          active?: boolean
          cadence?:
            | "once"
            | "weekly"
            | "biweekly"
            | "monthly"
            | "quarterly"
            | "biannual"
            | "annual"
            | "biennial"
            | "custom"
          created_at?: string
          custom_every?: number | null
          custom_unit?: string | null
          custom_weekday?: number | null
          id?: string
          next_run_at?: string | null
          paused_at?: string | null
          reminder_after_days?: number
          rotate_questions?: boolean
          runs_done?: number
          runs_total?: number
          send_at_local?: string
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      segment_fields: {
        Row: {
          available: boolean
          key: string
          sort_order: number
          source_column: string | null
          value_kind: string
        }
        Insert: {
          available?: boolean
          key: string
          sort_order?: number
          source_column?: string | null
          value_kind: string
        }
        Update: {
          available?: boolean
          key?: string
          sort_order?: number
          source_column?: string | null
          value_kind?: string
        }
        Relationships: []
      }
      segments: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string
          predicate: Json
          source: string | null
          synced_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id: string
          predicate?: Json
          source?: string | null
          synced_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          predicate?: Json
          source?: string | null
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "segments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      share_links: {
        Row: {
          active: boolean
          created_at: string
          id: string
          kind: "email" | "link" | "qr" | "sms"
          round_id: string
          token_hash: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: "email" | "link" | "qr" | "sms"
          round_id: string
          token_hash: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: "email" | "link" | "qr" | "sms"
          round_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_links_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "survey_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressions: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          id: string
          org_id: string
          reason: string | null
          source: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          org_id: string
          reason?: string | null
          source?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          org_id?: string
          reason?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppressions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_editors: {
        Row: {
          created_at: string
          granted_by: string | null
          member_id: string
          survey_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          member_id: string
          survey_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          member_id?: string
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_editors_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "org_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_editors_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "org_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_editors_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_invitations: {
        Row: {
          bounced_at: string | null
          channel: "email" | "link" | "qr" | "sms"
          created_at: string
          email: string | null
          expires_at: string | null
          group_id: string | null
          id: string
          identity_provider: string | null
          lang: string
          member_id: string | null
          name: string | null
          phone: string | null
          previous_token_expires_at: string | null
          previous_token_hash: string | null
          reminded_at: string[] | null
          responded_at: string | null
          round_id: string
          sent_at: string | null
          token_hash: string
        }
        Insert: {
          bounced_at?: string | null
          channel?: "email" | "link" | "qr" | "sms"
          created_at?: string
          email?: string | null
          expires_at?: string | null
          group_id?: string | null
          id?: string
          identity_provider?: string | null
          lang?: string
          member_id?: string | null
          name?: string | null
          phone?: string | null
          previous_token_expires_at?: string | null
          previous_token_hash?: string | null
          reminded_at?: string[] | null
          responded_at?: string | null
          round_id: string
          sent_at?: string | null
          token_hash: string
        }
        Update: {
          bounced_at?: string | null
          channel?: "email" | "link" | "qr" | "sms"
          created_at?: string
          email?: string | null
          expires_at?: string | null
          group_id?: string | null
          id?: string
          identity_provider?: string | null
          lang?: string
          member_id?: string | null
          name?: string | null
          phone?: string | null
          previous_token_expires_at?: string | null
          previous_token_hash?: string | null
          reminded_at?: string[] | null
          responded_at?: string | null
          round_id?: string
          sent_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_invitations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_invitations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "org_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_invitations_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "survey_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_questions: {
        Row: {
          comment_mode: "arv" | "pa" | "av"
          config: Json
          created_at: string
          follow_up_on_low: boolean
          help: string | null
          id: string
          position: number
          required: boolean
          survey_id: string
          text: string
          type:
            | "scale"
            | "likert"
            | "smiley"
            | "enps"
            | "slider"
            | "choice"
            | "dropdown"
            | "image"
            | "yesno"
            | "ranking"
            | "matrix"
            | "text"
            | "field"
        }
        Insert: {
          comment_mode?: "arv" | "pa" | "av"
          config?: Json
          created_at?: string
          follow_up_on_low?: boolean
          help?: string | null
          id?: string
          position: number
          required?: boolean
          survey_id: string
          text: string
          type:
            | "scale"
            | "likert"
            | "smiley"
            | "enps"
            | "slider"
            | "choice"
            | "dropdown"
            | "image"
            | "yesno"
            | "ranking"
            | "matrix"
            | "text"
            | "field"
        }
        Update: {
          comment_mode?: "arv" | "pa" | "av"
          config?: Json
          created_at?: string
          follow_up_on_low?: boolean
          help?: string | null
          id?: string
          position?: number
          required?: boolean
          survey_id?: string
          text?: string
          type?:
            | "scale"
            | "likert"
            | "smiley"
            | "enps"
            | "slider"
            | "choice"
            | "dropdown"
            | "image"
            | "yesno"
            | "ranking"
            | "matrix"
            | "text"
            | "field"
        }
        Relationships: [
          {
            foreignKeyName: "survey_questions_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_rounds: {
        Row: {
          closes_at: string | null
          created_at: string
          id: string
          opens_at: string
          question_snapshot: Json
          round_no: number
          status: string
          survey_id: string
        }
        Insert: {
          closes_at?: string | null
          created_at?: string
          id?: string
          opens_at?: string
          question_snapshot: Json
          round_no?: number
          status?: string
          survey_id: string
        }
        Update: {
          closes_at?: string | null
          created_at?: string
          id?: string
          opens_at?: string
          question_snapshot?: Json
          round_no?: number
          status?: string
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_rounds_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      surveys: {
        Row: {
          anonymity: "anonymous" | "named" | "optional"
          audience_label: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          engage: Json
          id: string
          k_threshold: number
          langs: string[]
          org_id: string
          policy_locked: boolean
          respondent_kind: string
          results_scope: "ledelse" | "ledere_eget_team" | "alle_ansatte"
          source_lang: string
          status: "utkast" | "aktiv" | "lukket"
          target: number | null
          template_pack_key: string | null
          title: string
          updated_at: string
        }
        Insert: {
          anonymity?: "anonymous" | "named" | "optional"
          audience_label?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          engage?: Json
          id?: string
          k_threshold?: number
          langs?: string[]
          org_id: string
          policy_locked?: boolean
          respondent_kind?: string
          results_scope?: "ledelse" | "ledere_eget_team" | "alle_ansatte"
          source_lang?: string
          status?: "utkast" | "aktiv" | "lukket"
          target?: number | null
          template_pack_key?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          anonymity?: "anonymous" | "named" | "optional"
          audience_label?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          engage?: Json
          id?: string
          k_threshold?: number
          langs?: string[]
          org_id?: string
          policy_locked?: boolean
          respondent_kind?: string
          results_scope?: "ledelse" | "ledere_eget_team" | "alle_ansatte"
          source_lang?: string
          status?: "utkast" | "aktiv" | "lukket"
          target?: number | null
          template_pack_key?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "surveys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "org_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surveys_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      task_effect_assessments: {
        Row: {
          assessed_at: string
          assessed_by: string | null
          id: string
          note: string | null
          round_id: string | null
          task_id: string
        }
        Insert: {
          assessed_at?: string
          assessed_by?: string | null
          id?: string
          note?: string | null
          round_id?: string | null
          task_id: string
        }
        Update: {
          assessed_at?: string
          assessed_by?: string | null
          id?: string
          note?: string | null
          round_id?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_effect_assessments_assessed_by_fkey"
            columns: ["assessed_by"]
            isOneToOne: false
            referencedRelation: "org_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_effect_assessments_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "survey_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_effect_assessments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_kinds: {
        Row: {
          key: string
          sort_order: number
        }
        Insert: {
          key: string
          sort_order?: number
        }
        Update: {
          key?: string
          sort_order?: number
        }
        Relationships: []
      }
      tasks: {
        Row: {
          corrects_task_id: string | null
          created_at: string
          due_at: string | null
          id: string
          kind: string
          law_ref: string | null
          org_id: string
          owner_member_id: string | null
          source_kind: string
          source_ref: string | null
          status:
            | "foreslatt"
            | "besluttet"
            | "pagar"
            | "gjennomfort"
            | "effektvurdert"
            | "lukket"
          title: string
        }
        Insert: {
          corrects_task_id?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          kind: string
          law_ref?: string | null
          org_id: string
          owner_member_id?: string | null
          source_kind?: string
          source_ref?: string | null
          status?:
            | "foreslatt"
            | "besluttet"
            | "pagar"
            | "gjennomfort"
            | "effektvurdert"
            | "lukket"
          title: string
        }
        Update: {
          corrects_task_id?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          kind?: string
          law_ref?: string | null
          org_id?: string
          owner_member_id?: string | null
          source_kind?: string
          source_ref?: string | null
          status?:
            | "foreslatt"
            | "besluttet"
            | "pagar"
            | "gjennomfort"
            | "effektvurdert"
            | "lukket"
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_corrects_task_id_fkey"
            columns: ["corrects_task_id", "org_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "tasks_kind_fkey"
            columns: ["kind"]
            isOneToOne: false
            referencedRelation: "task_kinds"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "tasks_law_ref_fkey"
            columns: ["law_ref"]
            isOneToOne: false
            referencedRelation: "duty_definitions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_owner_member_id_fkey"
            columns: ["owner_member_id", "org_id"]
            isOneToOne: false
            referencedRelation: "org_members"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "tasks_source_ref_fkey"
            columns: ["source_ref", "org_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      template_pack_translations: {
        Row: {
          lang: string
          pack_id: string
          questions: Json | null
          title: string | null
        }
        Insert: {
          lang: string
          pack_id: string
          questions?: Json | null
          title?: string | null
        }
        Update: {
          lang?: string
          pack_id?: string
          questions?: Json | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_pack_translations_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "template_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      template_packs: {
        Row: {
          audience: string | null
          author_member_id: string | null
          category: string
          created_at: string
          id: string
          key: string
          legal_ref: string | null
          org_id: string | null
          policy: Json | null
          private: boolean
          questions: Json
          sort_order: number
          title: string
          use_case: string | null
        }
        Insert: {
          audience?: string | null
          author_member_id?: string | null
          category: string
          created_at?: string
          id?: string
          key: string
          legal_ref?: string | null
          org_id?: string | null
          policy?: Json | null
          private?: boolean
          questions: Json
          sort_order?: number
          title: string
          use_case?: string | null
        }
        Update: {
          audience?: string | null
          author_member_id?: string | null
          category?: string
          created_at?: string
          id?: string
          key?: string
          legal_ref?: string | null
          org_id?: string | null
          policy?: Json | null
          private?: boolean
          questions?: Json
          sort_order?: number
          title?: string
          use_case?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_packs_author_member_id_fkey"
            columns: ["author_member_id"]
            isOneToOne: false
            referencedRelation: "org_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_packs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_packs_use_case_fkey"
            columns: ["use_case"]
            isOneToOne: false
            referencedRelation: "use_cases"
            referencedColumns: ["key"]
          },
        ]
      }
      theme_rules: {
        Row: {
          key: string
          label: string
          lang: string
          ord: number
          pattern: string
        }
        Insert: {
          key: string
          label: string
          lang: string
          ord?: number
          pattern: string
        }
        Update: {
          key?: string
          label?: string
          lang?: string
          ord?: number
          pattern?: string
        }
        Relationships: []
      }
      ui_messages: {
        Row: {
          id: string
          key: string
          lang: string
          namespace: string
          org_id: string | null
          org_key: string | null
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          id?: string
          key: string
          lang: string
          namespace: string
          org_id?: string | null
          org_key?: string | null
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          id?: string
          key?: string
          lang?: string
          namespace?: string
          org_id?: string | null
          org_key?: string | null
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "ui_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      use_cases: {
        Row: {
          description: string
          key: string
          label: string
          preset_key: string | null
          short: string
          sort_order: number
          tint: string | null
        }
        Insert: {
          description: string
          key: string
          label: string
          preset_key?: string | null
          short: string
          sort_order?: number
          tint?: string | null
        }
        Update: {
          description?: string
          key?: string
          label?: string
          preset_key?: string | null
          short?: string
          sort_order?: number
          tint?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "use_cases_preset_key_fkey"
            columns: ["preset_key"]
            isOneToOne: false
            referencedRelation: "dashboard_presets"
            referencedColumns: ["key"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      aggregate_results: {
        Args: { p_group?: string; p_round?: string; p_survey: string }
        Returns: Json
      }
      attributed_results: {
        Args: { p_round?: string; p_survey: string }
        Returns: Json
      }
      claim_membership: { Args: never; Returns: string }
      close_round: { Args: { p_round: string }; Returns: Json }
      compose_report: {
        Args: {
          p_as_scope?: "ledelse" | "ledere_eget_team" | "alle_ansatte"
          p_report: string
          p_token?: string
        }
        Returns: Json
      }
      dashboard_summary: {
        Args: {
          p_group?: string
          p_org: string
          p_rounds?: string[]
          p_surveys?: string[]
        }
        Returns: Json
      }
      duty_status: { Args: { p_duty: string }; Returns: Json }
      get_benchmarks: {
        Args: {
          p_group?: string
          p_industry?: string
          p_round?: string
          p_survey: string
        }
        Returns: Json
      }
      get_heatmap: {
        Args: {
          p_group?: string
          p_org: string
          p_rounds?: string[]
          p_surveys?: string[]
        }
        Returns: Json
      }
      get_peer_results: { Args: { p_token: string }; Returns: Json }
      get_quotes: {
        Args: {
          p_group?: string
          p_lang?: string
          p_limit?: number
          p_question: string
          p_survey: string
          p_theme?: string
        }
        Returns: Json
      }
      get_survey_for_token: {
        Args: { p_lang?: string; p_token: string }
        Returns: Json
      }
      get_themes: {
        Args: {
          p_group?: string
          p_lang?: string
          p_rounds?: string[]
          p_survey: string
        }
        Returns: Json
      }
      get_trends: {
        Args: { p_group?: string; p_survey: string }
        Returns: Json
      }
      mail_outbox_archive: { Args: { p_msg_id: number }; Returns: boolean }
      mail_outbox_delete: { Args: { p_msg_id: number }; Returns: boolean }
      mail_outbox_read: {
        Args: { p_batch?: number; p_visibility?: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      overview_activity: { Args: { p_org: string }; Returns: Json }
      publish_duty: {
        Args: { p_duty: string; p_label?: string }
        Returns: Json
      }
      quote_candidates: {
        Args: {
          p_group?: string
          p_limit?: number
          p_rounds?: string[]
          p_survey: string
        }
        Returns: Json
      }
      report_for_share_token: { Args: { p_token: string }; Returns: string }
      request_demo: {
        Args: {
          p_company: string
          p_email: string
          p_name: string
          p_plan?: string
        }
        Returns: Json
      }
      results_summary: {
        Args: { p_group?: string; p_round?: string; p_survey: string }
        Returns: Json
      }
      send_round: {
        Args: {
          p_anonymity?: string
          p_cadence?: string
          p_channels: string[]
          p_closes_at?: string
          p_custom_every?: number
          p_custom_unit?: string
          p_custom_weekday?: number
          p_group_ids?: string[]
          p_recipients?: Json
          p_reminder_days?: number
          p_rotate?: boolean
          p_runs?: number
          p_send_at_local?: string
          p_survey: string
          p_test_only?: boolean
        }
        Returns: Json
      }
      sign_duty: { Args: { p_duty: string; p_role_key: string }; Returns: Json }
      snapshot_report: { Args: { p_report: string }; Returns: Json }
      snapshot_results: {
        Args: { p_group?: string; p_round?: string; p_survey: string }
        Returns: Json
      }
      submit_response: {
        Args: {
          p_anon_choice?: boolean
          p_answers: Json
          p_lang: string
          p_token: string
        }
        Returns: Json
      }
      survey_response_counts: {
        Args: { p_org: string }
        Returns: {
          responses: number
          survey_id: string
        }[]
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

