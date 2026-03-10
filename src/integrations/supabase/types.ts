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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agent_groups: {
        Row: {
          created_at: string
          domain: string
          id: string
          leader_agent_id: string | null
          max_children: number
          name: string
          parent_group_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          leader_agent_id?: string | null
          max_children?: number
          name: string
          parent_group_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          leader_agent_id?: string | null
          max_children?: number
          name?: string
          parent_group_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_groups_parent_group_id_fkey"
            columns: ["parent_group_id"]
            isOneToOne: false
            referencedRelation: "agent_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_policies: {
        Row: {
          agent_id: string
          allowed_delegate_targets: string[] | null
          allowed_file_paths_read: string[] | null
          allowed_file_paths_write: string[] | null
          allowed_models: string[] | null
          allowed_network_domains: string[] | null
          allowed_tools: string[] | null
          created_at: string
          forbidden_actions: string[] | null
          id: string
          max_output_tokens: number | null
          max_runtime_ms: number | null
          max_tool_calls_per_task: number | null
          policy_yaml: string | null
          tool_argument_schema: Json | null
          updated_at: string
        }
        Insert: {
          agent_id: string
          allowed_delegate_targets?: string[] | null
          allowed_file_paths_read?: string[] | null
          allowed_file_paths_write?: string[] | null
          allowed_models?: string[] | null
          allowed_network_domains?: string[] | null
          allowed_tools?: string[] | null
          created_at?: string
          forbidden_actions?: string[] | null
          id?: string
          max_output_tokens?: number | null
          max_runtime_ms?: number | null
          max_tool_calls_per_task?: number | null
          policy_yaml?: string | null
          tool_argument_schema?: Json | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          allowed_delegate_targets?: string[] | null
          allowed_file_paths_read?: string[] | null
          allowed_file_paths_write?: string[] | null
          allowed_models?: string[] | null
          allowed_network_domains?: string[] | null
          allowed_tools?: string[] | null
          created_at?: string
          forbidden_actions?: string[] | null
          id?: string
          max_output_tokens?: number | null
          max_runtime_ms?: number | null
          max_tool_calls_per_task?: number | null
          policy_yaml?: string | null
          tool_argument_schema?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_policies_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agents"
            referencedColumns: ["agent_id"]
          },
        ]
      }
      agents: {
        Row: {
          agent_id: string
          capability_tags: string[] | null
          created_at: string
          group_id: string | null
          id: string
          identity_yaml: string | null
          instructions_md: string | null
          is_active: boolean
          model: string | null
          name: string
          purpose: string
          role: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          capability_tags?: string[] | null
          created_at?: string
          group_id?: string | null
          id?: string
          identity_yaml?: string | null
          instructions_md?: string | null
          is_active?: boolean
          model?: string | null
          name: string
          purpose: string
          role: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          capability_tags?: string[] | null
          created_at?: string
          group_id?: string | null
          id?: string
          identity_yaml?: string | null
          instructions_md?: string | null
          is_active?: boolean
          model?: string | null
          name?: string
          purpose?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_agents_group"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "agent_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      api_usage_logs: {
        Row: {
          cost_estimate: number
          created_at: string
          credential_meta_id: string | null
          id: string
          model_id: string
          provider: string
          request_type: string
          tokens_input: number
          tokens_output: number
          total_tokens: number
        }
        Insert: {
          cost_estimate?: number
          created_at?: string
          credential_meta_id?: string | null
          id?: string
          model_id: string
          provider: string
          request_type?: string
          tokens_input?: number
          tokens_output?: number
          total_tokens?: number
        }
        Update: {
          cost_estimate?: number
          created_at?: string
          credential_meta_id?: string | null
          id?: string
          model_id?: string
          provider?: string
          request_type?: string
          tokens_input?: number
          tokens_output?: number
          total_tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_logs_credential_meta_id_fkey"
            columns: ["credential_meta_id"]
            isOneToOne: false
            referencedRelation: "credentials_meta"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_agent_id: string | null
          created_at: string
          id: string
          latency_ms: number | null
          reason: string | null
          request: Json | null
          result: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_agent_id?: string | null
          created_at?: string
          id?: string
          latency_ms?: number | null
          reason?: string | null
          request?: Json | null
          result?: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_agent_id?: string | null
          created_at?: string
          id?: string
          latency_ms?: number | null
          reason?: string | null
          request?: Json | null
          result?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          agent_id: string | null
          content: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
          task_id: string | null
        }
        Insert: {
          agent_id?: string | null
          content: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
          task_id?: string | null
        }
        Update: {
          agent_id?: string | null
          content?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      credential_values: {
        Row: {
          created_at: string
          credential_meta_id: string
          encrypted_value: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credential_meta_id: string
          encrypted_value: string
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credential_meta_id?: string
          encrypted_value?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credential_values_credential_meta_id_fkey"
            columns: ["credential_meta_id"]
            isOneToOne: true
            referencedRelation: "credentials_meta"
            referencedColumns: ["id"]
          },
        ]
      }
      credentials_meta: {
        Row: {
          created_at: string
          credential_name: string
          credential_type: string
          id: string
          is_set: boolean
          last_verified_at: string | null
          masked_value: string | null
          provider: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credential_name: string
          credential_type?: string
          id?: string
          is_set?: boolean
          last_verified_at?: string | null
          masked_value?: string | null
          provider: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credential_name?: string
          credential_type?: string
          id?: string
          is_set?: boolean
          last_verified_at?: string | null
          masked_value?: string | null
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      cron_job_runs: {
        Row: {
          checkpoint: Json | null
          completed_at: string | null
          error: string | null
          id: string
          idempotency_key: string | null
          job_id: string
          result: Json | null
          started_at: string
          status: string
        }
        Insert: {
          checkpoint?: Json | null
          completed_at?: string | null
          error?: string | null
          id?: string
          idempotency_key?: string | null
          job_id: string
          result?: Json | null
          started_at?: string
          status?: string
        }
        Update: {
          checkpoint?: Json | null
          completed_at?: string | null
          error?: string | null
          id?: string
          idempotency_key?: string | null
          job_id?: string
          result?: Json | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cron_job_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cron_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_jobs: {
        Row: {
          config: Json | null
          created_at: string
          function_name: string
          id: string
          is_active: boolean
          last_run_at: string | null
          name: string
          next_run_at: string | null
          schedule: string
          updated_at: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          function_name: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          name: string
          next_run_at?: string | null
          schedule: string
          updated_at?: string
        }
        Update: {
          config?: Json | null
          created_at?: string
          function_name?: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          name?: string
          next_run_at?: string | null
          schedule?: string
          updated_at?: string
        }
        Relationships: []
      }
      knowledge_change_log: {
        Row: {
          action: string
          created_at: string
          details: string | null
          file_id: string
          id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: string | null
          file_id: string
          id?: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: string | null
          file_id?: string
          id?: string
        }
        Relationships: []
      }
      knowledge_files: {
        Row: {
          confidence_min: number | null
          content: string
          created_at: string
          domain: string
          file_id: string
          file_path: string
          frontmatter: Json
          id: string
          is_valid: boolean
          owner_agent: string | null
          related_files: string[] | null
          schema_version: string
          source_refs: Json | null
          subdomain: string | null
          summary: string | null
          title: string
          updated_at: string
          validation_errors: string[] | null
          word_count: number
        }
        Insert: {
          confidence_min?: number | null
          content: string
          created_at?: string
          domain: string
          file_id: string
          file_path: string
          frontmatter?: Json
          id?: string
          is_valid?: boolean
          owner_agent?: string | null
          related_files?: string[] | null
          schema_version?: string
          source_refs?: Json | null
          subdomain?: string | null
          summary?: string | null
          title: string
          updated_at?: string
          validation_errors?: string[] | null
          word_count?: number
        }
        Update: {
          confidence_min?: number | null
          content?: string
          created_at?: string
          domain?: string
          file_id?: string
          file_path?: string
          frontmatter?: Json
          id?: string
          is_valid?: boolean
          owner_agent?: string | null
          related_files?: string[] | null
          schema_version?: string
          source_refs?: Json | null
          subdomain?: string | null
          summary?: string | null
          title?: string
          updated_at?: string
          validation_errors?: string[] | null
          word_count?: number
        }
        Relationships: []
      }
      live_feed_events: {
        Row: {
          agent_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json | null
          severity: string
          source: string
          task_id: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json | null
          severity?: string
          source: string
          task_id?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json | null
          severity?: string
          source?: string
          task_id?: string | null
        }
        Relationships: []
      }
      model_budgets: {
        Row: {
          budget_type: string
          created_at: string
          current_usage: number
          id: string
          is_active: boolean
          limit_value: number
          model_id: string
          period: string
          updated_at: string
        }
        Insert: {
          budget_type: string
          created_at?: string
          current_usage?: number
          id?: string
          is_active?: boolean
          limit_value: number
          model_id: string
          period?: string
          updated_at?: string
        }
        Update: {
          budget_type?: string
          created_at?: string
          current_usage?: number
          id?: string
          is_active?: boolean
          limit_value?: number
          model_id?: string
          period?: string
          updated_at?: string
        }
        Relationships: []
      }
      model_registry: {
        Row: {
          config: Json | null
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          model_id: string
          model_type: string
          provider: string
          updated_at: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          model_id: string
          model_type?: string
          provider: string
          updated_at?: string
        }
        Update: {
          config?: Json | null
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          model_id?: string
          model_type?: string
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      night_reports: {
        Row: {
          completed_at: string | null
          created_at: string
          dedup_count: number | null
          errors: string[] | null
          files_created: number | null
          files_split: number | null
          files_updated: number | null
          id: string
          idempotency_key: string | null
          processing_date: string
          report_date: string
          started_at: string | null
          status: string
          summary: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          dedup_count?: number | null
          errors?: string[] | null
          files_created?: number | null
          files_split?: number | null
          files_updated?: number | null
          id?: string
          idempotency_key?: string | null
          processing_date: string
          report_date: string
          started_at?: string | null
          status?: string
          summary?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          dedup_count?: number | null
          errors?: string[] | null
          files_created?: number | null
          files_split?: number | null
          files_updated?: number | null
          id?: string
          idempotency_key?: string | null
          processing_date?: string
          report_date?: string
          started_at?: string | null
          status?: string
          summary?: string | null
        }
        Relationships: []
      }
      provider_budgets: {
        Row: {
          budget_amount: number
          created_at: string
          id: string
          period: string
          provider: string
          updated_at: string
        }
        Insert: {
          budget_amount?: number
          created_at?: string
          id?: string
          period?: string
          provider: string
          updated_at?: string
        }
        Update: {
          budget_amount?: number
          created_at?: string
          id?: string
          period?: string
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      provider_models_catalog: {
        Row: {
          created_at: string
          display_name: string
          id: string
          input_price_per_1m: number
          is_available: boolean
          last_updated: string
          model_id: string
          output_price_per_1m: number
          provider: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          input_price_per_1m?: number
          is_available?: boolean
          last_updated?: string
          model_id: string
          output_price_per_1m?: number
          provider: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          input_price_per_1m?: number
          is_available?: boolean
          last_updated?: string
          model_id?: string
          output_price_per_1m?: number
          provider?: string
        }
        Relationships: []
      }
      recent_memory_chunks: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          id: string
          metadata: Json | null
          source_id: string | null
          source_type: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          source_id?: string | null
          source_type?: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          source_id?: string | null
          source_type?: string
        }
        Relationships: []
      }
      task_checklists: {
        Row: {
          completed_at: string | null
          created_at: string
          details: string | null
          id: string
          status: string
          step: string
          task_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          details?: string | null
          id?: string
          status?: string
          step: string
          task_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          details?: string | null
          id?: string
          status?: string
          step?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_checklists_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_agent_id: string | null
          constraints: Json | null
          context_packet: Json | null
          created_at: string
          goal: string | null
          id: string
          idempotency_key: string | null
          result: Json | null
          status: Database["public"]["Enums"]["task_status"]
          task_type: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_agent_id?: string | null
          constraints?: Json | null
          context_packet?: Json | null
          created_at?: string
          goal?: string | null
          id?: string
          idempotency_key?: string | null
          result?: Json | null
          status?: Database["public"]["Enums"]["task_status"]
          task_type?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_agent_id?: string | null
          constraints?: Json | null
          context_packet?: Json | null
          created_at?: string
          goal?: string | null
          id?: string
          idempotency_key?: string | null
          result?: Json | null
          status?: Database["public"]["Enums"]["task_status"]
          task_type?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      verification_runs: {
        Row: {
          checks: Json
          completed_at: string | null
          created_at: string
          id: string
          overall_status: string
          started_at: string
          target_id: string
          target_type: string
        }
        Insert: {
          checks?: Json
          completed_at?: string | null
          created_at?: string
          id?: string
          overall_status?: string
          started_at?: string
          target_id: string
          target_type: string
        }
        Update: {
          checks?: Json
          completed_at?: string | null
          created_at?: string
          id?: string
          overall_status?: string
          started_at?: string
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      search_recent_memory: {
        Args: {
          hours_back?: number
          match_count?: number
          query_embedding: string
        }
        Returns: {
          content: string
          created_at: string
          id: string
          metadata: Json
          similarity: number
          source_id: string
          source_type: string
        }[]
      }
    }
    Enums: {
      task_status:
        | "received"
        | "classified"
        | "recent_context_ready"
        | "long_term_context_ready"
        | "agent_selected"
        | "specialist_running"
        | "specialist_self_check_passed"
        | "orchestrator_review_passed"
        | "final_action_done"
        | "reported_to_secretary"
        | "failed"
        | "cancelled"
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
    Enums: {
      task_status: [
        "received",
        "classified",
        "recent_context_ready",
        "long_term_context_ready",
        "agent_selected",
        "specialist_running",
        "specialist_self_check_passed",
        "orchestrator_review_passed",
        "final_action_done",
        "reported_to_secretary",
        "failed",
        "cancelled",
      ],
    },
  },
} as const
