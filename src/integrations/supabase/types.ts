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
      admin_permissions: {
        Row: {
          granted_at: string
          id: string
          permission_key: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          id?: string
          permission_key: string
          user_id: string
        }
        Update: {
          granted_at?: string
          id?: string
          permission_key?: string
          user_id?: string
        }
        Relationships: []
      }
      android_devices: {
        Row: {
          android_version: string | null
          app_version: string | null
          archived_at: string | null
          battery_level: number | null
          created_at: string
          device_id: string
          device_name: string
          failed_deliveries: number
          id: string
          imei: string | null
          is_active: boolean
          is_charging: boolean | null
          last_heartbeat: string | null
          last_ping_at: string | null
          model: string | null
          notes: string | null
          provider_name: string | null
          sim_number: string | null
          sim1_provider: string | null
          sim2_number: string | null
          sim2_provider: string | null
          status: Database["public"]["Enums"]["device_status"]
          total_deliveries: number
          updated_at: string
        }
        Insert: {
          android_version?: string | null
          app_version?: string | null
          archived_at?: string | null
          battery_level?: number | null
          created_at?: string
          device_id: string
          device_name: string
          failed_deliveries?: number
          id?: string
          imei?: string | null
          is_active?: boolean
          is_charging?: boolean | null
          last_heartbeat?: string | null
          last_ping_at?: string | null
          model?: string | null
          notes?: string | null
          provider_name?: string | null
          sim_number?: string | null
          sim1_provider?: string | null
          sim2_number?: string | null
          sim2_provider?: string | null
          status?: Database["public"]["Enums"]["device_status"]
          total_deliveries?: number
          updated_at?: string
        }
        Update: {
          android_version?: string | null
          app_version?: string | null
          archived_at?: string | null
          battery_level?: number | null
          created_at?: string
          device_id?: string
          device_name?: string
          failed_deliveries?: number
          id?: string
          imei?: string | null
          is_active?: boolean
          is_charging?: boolean | null
          last_heartbeat?: string | null
          last_ping_at?: string | null
          model?: string | null
          notes?: string | null
          provider_name?: string | null
          sim_number?: string | null
          sim1_provider?: string | null
          sim2_number?: string | null
          sim2_provider?: string | null
          status?: Database["public"]["Enums"]["device_status"]
          total_deliveries?: number
          updated_at?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key: string
          setting_value?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json | null
          target_id: string | null
          target_type: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      auto_topup_delivery_rules: {
        Row: {
          created_at: string
          delay_minutes: number
          delivery_count: number
          execution_order: number
          id: string
          is_active: boolean
          notes: string | null
          source_package_id: string
          target_package_id: string
        }
        Insert: {
          created_at?: string
          delay_minutes?: number
          delivery_count?: number
          execution_order?: number
          id?: string
          is_active?: boolean
          notes?: string | null
          source_package_id: string
          target_package_id: string
        }
        Update: {
          created_at?: string
          delay_minutes?: number
          delivery_count?: number
          execution_order?: number
          id?: string
          is_active?: boolean
          notes?: string | null
          source_package_id?: string
          target_package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auto_topup_delivery_rules_source_package_id_fkey"
            columns: ["source_package_id"]
            isOneToOne: false
            referencedRelation: "auto_topup_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_topup_delivery_rules_target_package_id_fkey"
            columns: ["target_package_id"]
            isOneToOne: false
            referencedRelation: "auto_topup_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_topup_numbers: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string | null
          phone_number: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          phone_number: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          phone_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      auto_topup_packages: {
        Row: {
          cost_price: number
          created_at: string
          data_amount: string | null
          id: string
          is_active: boolean
          package_name: string
          provider_name: string | null
          selling_price: number
          sim_password: string | null
          topup_number_id: string
          updated_at: string
          ussd_code: string | null
        }
        Insert: {
          cost_price?: number
          created_at?: string
          data_amount?: string | null
          id?: string
          is_active?: boolean
          package_name: string
          provider_name?: string | null
          selling_price: number
          sim_password?: string | null
          topup_number_id: string
          updated_at?: string
          ussd_code?: string | null
        }
        Update: {
          cost_price?: number
          created_at?: string
          data_amount?: string | null
          id?: string
          is_active?: boolean
          package_name?: string
          provider_name?: string | null
          selling_price?: number
          sim_password?: string | null
          topup_number_id?: string
          updated_at?: string
          ussd_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auto_topup_packages_topup_number_id_fkey"
            columns: ["topup_number_id"]
            isOneToOne: false
            referencedRelation: "auto_topup_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_topup_phone_mappings: {
        Row: {
          category_name: string | null
          created_at: string
          custom_amount: string | null
          id: string
          is_active: boolean
          label: string | null
          package_id: string
          phone_number: string
          topup_number_id: string | null
          updated_at: string
        }
        Insert: {
          category_name?: string | null
          created_at?: string
          custom_amount?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          package_id: string
          phone_number: string
          topup_number_id?: string | null
          updated_at?: string
        }
        Update: {
          category_name?: string | null
          created_at?: string
          custom_amount?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          package_id?: string
          phone_number?: string
          topup_number_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      auto_topup_rules: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          notes: string | null
          package_id: string | null
          phone_number: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          package_id?: string | null
          phone_number: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          package_id?: string | null
          phone_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "auto_topup_rules_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_topup_settings: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          notes: string | null
          threshold_amount: number
          topup_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          notes?: string | null
          threshold_amount?: number
          topup_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          notes?: string | null
          threshold_amount?: number
          topup_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      bank_credentials: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          notes: string | null
          password_hash: string
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          password_hash: string
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          password_hash?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      bank_sessions: {
        Row: {
          created_at: string
          credential_id: string
          expires_at: string
          id: string
          last_used_at: string | null
          token: string
        }
        Insert: {
          created_at?: string
          credential_id: string
          expires_at: string
          id?: string
          last_used_at?: string | null
          token: string
        }
        Update: {
          created_at?: string
          credential_id?: string
          expires_at?: string
          id?: string
          last_used_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_sessions_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "bank_credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          acc_no: string | null
          charge_amt: number | null
          created_at: string
          currency_code: string | null
          customer_name: string | null
          dr_cr: string | null
          id: string
          match_notes: string | null
          match_status: string
          matched_order_id: string | null
          matched_payment_id: string | null
          narration: string | null
          parsed_receiver_phone: string | null
          parsed_sender_phone: string | null
          processed_at: string | null
          raw_payload: Json | null
          rrp_no: string | null
          tran_amt: number
          tran_date: string | null
          tran_date_time: string | null
          tran_desc: string | null
          tran_no: string
          tran_type: string | null
          user_id_field: string | null
          uti: string | null
        }
        Insert: {
          acc_no?: string | null
          charge_amt?: number | null
          created_at?: string
          currency_code?: string | null
          customer_name?: string | null
          dr_cr?: string | null
          id?: string
          match_notes?: string | null
          match_status?: string
          matched_order_id?: string | null
          matched_payment_id?: string | null
          narration?: string | null
          parsed_receiver_phone?: string | null
          parsed_sender_phone?: string | null
          processed_at?: string | null
          raw_payload?: Json | null
          rrp_no?: string | null
          tran_amt: number
          tran_date?: string | null
          tran_date_time?: string | null
          tran_desc?: string | null
          tran_no: string
          tran_type?: string | null
          user_id_field?: string | null
          uti?: string | null
        }
        Update: {
          acc_no?: string | null
          charge_amt?: number | null
          created_at?: string
          currency_code?: string | null
          customer_name?: string | null
          dr_cr?: string | null
          id?: string
          match_notes?: string | null
          match_status?: string
          matched_order_id?: string | null
          matched_payment_id?: string | null
          narration?: string | null
          parsed_receiver_phone?: string | null
          parsed_sender_phone?: string | null
          processed_at?: string | null
          raw_payload?: Json | null
          rrp_no?: string | null
          tran_amt?: number
          tran_date?: string | null
          tran_date_time?: string | null
          tran_desc?: string | null
          tran_no?: string
          tran_type?: string | null
          user_id_field?: string | null
          uti?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_matched_order_id_fkey"
            columns: ["matched_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_matched_payment_id_fkey"
            columns: ["matched_payment_id"]
            isOneToOne: false
            referencedRelation: "pending_online_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      banners_config: {
        Row: {
          alt_text: string | null
          created_at: string
          id: string
          image_url: string
          is_active: boolean
          link_url: string | null
          media_type: string
          rotation_interval: number | null
          sort_order: number
          title: string | null
          updated_at: string
          video_duration: number | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          id?: string
          image_url: string
          is_active?: boolean
          link_url?: string | null
          media_type?: string
          rotation_interval?: number | null
          sort_order?: number
          title?: string | null
          updated_at?: string
          video_duration?: number | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          id?: string
          image_url?: string
          is_active?: boolean
          link_url?: string | null
          media_type?: string
          rotation_interval?: number | null
          sort_order?: number
          title?: string | null
          updated_at?: string
          video_duration?: number | null
        }
        Relationships: []
      }
      blocked_users: {
        Row: {
          blocked_at: string
          blocked_by: string | null
          id: string
          is_active: boolean
          phone_number: string
          reason: string | null
        }
        Insert: {
          blocked_at?: string
          blocked_by?: string | null
          id?: string
          is_active?: boolean
          phone_number: string
          reason?: string | null
        }
        Update: {
          blocked_at?: string
          blocked_by?: string | null
          id?: string
          is_active?: boolean
          phone_number?: string
          reason?: string | null
        }
        Relationships: []
      }
      bulk_sms_campaigns: {
        Row: {
          campaign_name: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          device_id: string | null
          failed_count: number
          id: string
          message: string
          recipient_count: number
          sent_count: number
          sim_slot: number | null
          status: string
          target_type: string | null
          total_recipients: number | null
        }
        Insert: {
          campaign_name: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          device_id?: string | null
          failed_count?: number
          id?: string
          message: string
          recipient_count?: number
          sent_count?: number
          sim_slot?: number | null
          status?: string
          target_type?: string | null
          total_recipients?: number | null
        }
        Update: {
          campaign_name?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          device_id?: string | null
          failed_count?: number
          id?: string
          message?: string
          recipient_count?: number
          sent_count?: number
          sim_slot?: number | null
          status?: string
          target_type?: string | null
          total_recipients?: number | null
        }
        Relationships: []
      }
      bulk_sms_queue: {
        Row: {
          campaign_id: string | null
          claimed_at: string | null
          created_at: string
          device_id: string | null
          error: string | null
          error_message: string | null
          id: string
          phone_number: string
          sent_at: string | null
          sim_slot: number | null
          status: string
        }
        Insert: {
          campaign_id?: string | null
          claimed_at?: string | null
          created_at?: string
          device_id?: string | null
          error?: string | null
          error_message?: string | null
          id?: string
          phone_number: string
          sent_at?: string | null
          sim_slot?: number | null
          status?: string
        }
        Update: {
          campaign_id?: string | null
          claimed_at?: string | null
          created_at?: string
          device_id?: string | null
          error?: string | null
          error_message?: string | null
          id?: string
          phone_number?: string
          sent_at?: string | null
          sim_slot?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulk_sms_queue_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "bulk_sms_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      company_finances: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          reference_id: string | null
          transaction_date: string
          transaction_type: string
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          reference_id?: string | null
          transaction_date?: string
          transaction_type: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          reference_id?: string | null
          transaction_date?: string
          transaction_type?: string
        }
        Relationships: []
      }
      daily_orders: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          order_date: string
          total_orders: number
          total_revenue: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          order_date?: string
          total_orders?: number
          total_revenue?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          order_date?: string
          total_orders?: number
          total_revenue?: number
          updated_at?: string
        }
        Relationships: []
      }
      data_packages_config: {
        Row: {
          category: string | null
          category_id: string | null
          connection_type_label: string
          cost_price: number
          created_at: string
          data_amount: string | null
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean
          is_featured: boolean
          package_name: string
          price: number
          profit_margin: number
          provider_id: string
          purchase_count: number
          secret_price: number[] | null
          selling_price: number | null
          sort_order: number
          updated_at: string
          ussd_code: string | null
          ussd_template: string | null
          validity_days: number | null
        }
        Insert: {
          category?: string | null
          category_id?: string | null
          connection_type_label?: string
          cost_price?: number
          created_at?: string
          data_amount?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean
          is_featured?: boolean
          package_name: string
          price: number
          profit_margin?: number
          provider_id: string
          purchase_count?: number
          secret_price?: number[] | null
          selling_price?: number | null
          sort_order?: number
          updated_at?: string
          ussd_code?: string | null
          ussd_template?: string | null
          validity_days?: number | null
        }
        Update: {
          category?: string | null
          category_id?: string | null
          connection_type_label?: string
          cost_price?: number
          created_at?: string
          data_amount?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean
          is_featured?: boolean
          package_name?: string
          price?: number
          profit_margin?: number
          provider_id?: string
          purchase_count?: number
          secret_price?: number[] | null
          selling_price?: number | null
          sort_order?: number
          updated_at?: string
          ussd_code?: string | null
          ussd_template?: string | null
          validity_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "data_packages_config_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "package_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_packages_config_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers_config"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_instructions: {
        Row: {
          category_id: string | null
          code_template: string | null
          created_at: string
          id: string
          instruction_template: string | null
          level: string | null
          notes: string | null
          package_id: string | null
          provider_id: string | null
          reference_id: string | null
          sim_password: string | null
          updated_at: string
          ussd_template: string | null
        }
        Insert: {
          category_id?: string | null
          code_template?: string | null
          created_at?: string
          id?: string
          instruction_template?: string | null
          level?: string | null
          notes?: string | null
          package_id?: string | null
          provider_id?: string | null
          reference_id?: string | null
          sim_password?: string | null
          updated_at?: string
          ussd_template?: string | null
        }
        Update: {
          category_id?: string | null
          code_template?: string | null
          created_at?: string
          id?: string
          instruction_template?: string | null
          level?: string | null
          notes?: string | null
          package_id?: string | null
          provider_id?: string | null
          reference_id?: string | null
          sim_password?: string | null
          updated_at?: string
          ussd_template?: string | null
        }
        Relationships: []
      }
      delivery_queue: {
        Row: {
          android_device_id: string | null
          attempts: number
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          created_at: string
          delay_seconds: number
          delivery_count: number | null
          dispatch_device_id: string | null
          dispatched_at: string | null
          error_message: string | null
          execution_order: number
          id: string
          last_attempt_at: string | null
          order_id: string
          package_code: string | null
          package_id: string | null
          pin_code: string | null
          provider_name: string | null
          provider_response: string | null
          receiver_phone: string | null
          scheduled_at: string | null
          sim_slot: number | null
          status: string
          ussd_code: string | null
          ussd_command: string | null
          ussd_dispatched: boolean
        }
        Insert: {
          android_device_id?: string | null
          attempts?: number
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          created_at?: string
          delay_seconds?: number
          delivery_count?: number | null
          dispatch_device_id?: string | null
          dispatched_at?: string | null
          error_message?: string | null
          execution_order?: number
          id?: string
          last_attempt_at?: string | null
          order_id: string
          package_code?: string | null
          package_id?: string | null
          pin_code?: string | null
          provider_name?: string | null
          provider_response?: string | null
          receiver_phone?: string | null
          scheduled_at?: string | null
          sim_slot?: number | null
          status?: string
          ussd_code?: string | null
          ussd_command?: string | null
          ussd_dispatched?: boolean
        }
        Update: {
          android_device_id?: string | null
          attempts?: number
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          created_at?: string
          delay_seconds?: number
          delivery_count?: number | null
          dispatch_device_id?: string | null
          dispatched_at?: string | null
          error_message?: string | null
          execution_order?: number
          id?: string
          last_attempt_at?: string | null
          order_id?: string
          package_code?: string | null
          package_id?: string | null
          pin_code?: string | null
          provider_name?: string | null
          provider_response?: string | null
          receiver_phone?: string | null
          scheduled_at?: string | null
          sim_slot?: number | null
          status?: string
          ussd_code?: string | null
          ussd_command?: string | null
          ussd_dispatched?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "delivery_queue_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "android_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_queue_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_queue_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
        ]
      }
      device_offline_alerts: {
        Row: {
          alert_type: string
          created_at: string
          device_id: string
          id: string
          message: string | null
          resolved: boolean
        }
        Insert: {
          alert_type: string
          created_at?: string
          device_id: string
          id?: string
          message?: string | null
          resolved?: boolean
        }
        Update: {
          alert_type?: string
          created_at?: string
          device_id?: string
          id?: string
          message?: string | null
          resolved?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "device_offline_alerts_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "android_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      error_messages: {
        Row: {
          created_at: string
          error_key: string
          id: string
          message_en: string | null
          message_so: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_key: string
          id?: string
          message_en?: string | null
          message_so: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_key?: string
          id?: string
          message_en?: string | null
          message_so?: string
          updated_at?: string
        }
        Relationships: []
      }
      evoucher_transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          notes: string | null
          rate: number | null
          sim_id: string | null
          status: string
          voucher_code: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          notes?: string | null
          rate?: number | null
          sim_id?: string | null
          status?: string
          voucher_code?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          rate?: number | null
          sim_id?: string | null
          status?: string
          voucher_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evoucher_transactions_sim_id_fkey"
            columns: ["sim_id"]
            isOneToOne: false
            referencedRelation: "sims"
            referencedColumns: ["id"]
          },
        ]
      }
      featured_packages: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          package_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          package_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          package_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "featured_packages_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: true
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_alerts: {
        Row: {
          alert_type: string
          amount: number | null
          created_at: string
          description: string | null
          id: string
          phone_number: string | null
          resolved: boolean
          severity: string
        }
        Insert: {
          alert_type: string
          amount?: number | null
          created_at?: string
          description?: string | null
          id?: string
          phone_number?: string | null
          resolved?: boolean
          severity?: string
        }
        Update: {
          alert_type?: string
          amount?: number | null
          created_at?: string
          description?: string | null
          id?: string
          phone_number?: string | null
          resolved?: boolean
          severity?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          metadata: Json | null
          notification_type: string | null
          recipient_phone: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          metadata?: Json | null
          notification_type?: string | null
          recipient_phone?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          metadata?: Json | null
          notification_type?: string | null
          recipient_phone?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      offline_payment_settings: {
        Row: {
          created_at: string
          id: string
          instructions: string | null
          is_active: boolean
          payment_phone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          instructions?: string | null
          is_active?: boolean
          payment_phone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          instructions?: string | null
          is_active?: boolean
          payment_phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      offline_registrations: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          notes: string | null
          provider_id: string | null
          provider_name: string | null
          receiver_phone: string | null
          sender_phone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          provider_id?: string | null
          provider_name?: string | null
          receiver_phone?: string | null
          sender_phone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          provider_id?: string | null
          provider_name?: string | null
          receiver_phone?: string | null
          sender_phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offline_registrations_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers_config"
            referencedColumns: ["id"]
          },
        ]
      }
      order_stats_daily: {
        Row: {
          cancelled_orders: number
          completed_orders: number
          created_at: string
          failed_orders: number
          id: string
          provider_name: string
          stat_date: string
          total_cost: number
          total_orders: number
          total_profit: number
          total_revenue: number
          updated_at: string
        }
        Insert: {
          cancelled_orders?: number
          completed_orders?: number
          created_at?: string
          failed_orders?: number
          id?: string
          provider_name?: string
          stat_date: string
          total_cost?: number
          total_orders?: number
          total_profit?: number
          total_revenue?: number
          updated_at?: string
        }
        Update: {
          cancelled_orders?: number
          completed_orders?: number
          created_at?: string
          failed_orders?: number
          id?: string
          provider_name?: string
          stat_date?: string
          total_cost?: number
          total_orders?: number
          total_profit?: number
          total_revenue?: number
          updated_at?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          amount: number
          cancelled_at: string | null
          cancelled_by: string | null
          cost_price: number | null
          created_at: string
          customer_phone: string | null
          data_amount: string | null
          delivered_at: string | null
          delivery_notes: string | null
          delivery_status: string | null
          device_id: string | null
          id: string
          is_manual: boolean
          is_offline: boolean
          order_number: string
          package_id: string | null
          package_name: string | null
          paid_via_secret_price: boolean
          payment_number: string | null
          payment_provider_id: string | null
          payment_reference: string | null
          payment_source: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          provider_id: string | null
          receiver_phone: string
          selling_price: number | null
          sender_phone: string
          sim_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          tx_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          cancelled_at?: string | null
          cancelled_by?: string | null
          cost_price?: number | null
          created_at?: string
          customer_phone?: string | null
          data_amount?: string | null
          delivered_at?: string | null
          delivery_notes?: string | null
          delivery_status?: string | null
          device_id?: string | null
          id?: string
          is_manual?: boolean
          is_offline?: boolean
          order_number?: string
          package_id?: string | null
          package_name?: string | null
          paid_via_secret_price?: boolean
          payment_number?: string | null
          payment_provider_id?: string | null
          payment_reference?: string | null
          payment_source?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          provider_id?: string | null
          receiver_phone: string
          selling_price?: number | null
          sender_phone: string
          sim_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          tx_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          cancelled_at?: string | null
          cancelled_by?: string | null
          cost_price?: number | null
          created_at?: string
          customer_phone?: string | null
          data_amount?: string | null
          delivered_at?: string | null
          delivery_notes?: string | null
          delivery_status?: string | null
          device_id?: string | null
          id?: string
          is_manual?: boolean
          is_offline?: boolean
          order_number?: string
          package_id?: string | null
          package_name?: string | null
          paid_via_secret_price?: boolean
          payment_number?: string | null
          payment_provider_id?: string | null
          payment_reference?: string | null
          payment_source?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          provider_id?: string | null
          receiver_phone?: string
          selling_price?: number | null
          sender_phone?: string
          sim_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          tx_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "android_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_payment_provider_id_fkey"
            columns: ["payment_provider_id"]
            isOneToOne: false
            referencedRelation: "payment_providers_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_sim_id_fkey"
            columns: ["sim_id"]
            isOneToOne: false
            referencedRelation: "sims"
            referencedColumns: ["id"]
          },
        ]
      }
      package_categories: {
        Row: {
          category_image: string | null
          category_name: string
          created_at: string
          display_order: number | null
          id: string
          is_active: boolean
          provider_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_image?: string | null
          category_name: string
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean
          provider_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category_image?: string | null
          category_name?: string
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean
          provider_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_categories_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers_config"
            referencedColumns: ["id"]
          },
        ]
      }
      package_delivery_rules: {
        Row: {
          created_at: string
          delay_minutes: number
          delay_seconds: number
          delivery_count: number
          execution_order: number
          id: string
          is_active: boolean
          notes: string | null
          source_package_id: string
          target_package_id: string
        }
        Insert: {
          created_at?: string
          delay_minutes?: number
          delay_seconds?: number
          delivery_count?: number
          execution_order?: number
          id?: string
          is_active?: boolean
          notes?: string | null
          source_package_id: string
          target_package_id: string
        }
        Update: {
          created_at?: string
          delay_minutes?: number
          delay_seconds?: number
          delivery_count?: number
          execution_order?: number
          id?: string
          is_active?: boolean
          notes?: string | null
          source_package_id?: string
          target_package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_delivery_rules_source_package_id_fkey"
            columns: ["source_package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_delivery_rules_target_package_id_fkey"
            columns: ["target_package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_providers_config: {
        Row: {
          commission_rate: number
          created_at: string
          display_name: string
          display_order: number | null
          enabled_for_sim_cards: boolean
          id: string
          is_active: boolean
          logo_url: string | null
          payment_number: string | null
          payment_phone: string | null
          prefixes: string[]
          provider_logo: string | null
          provider_name: string
          sort_order: number
          updated_at: string
          ussd_template: string | null
        }
        Insert: {
          commission_rate?: number
          created_at?: string
          display_name: string
          display_order?: number | null
          enabled_for_sim_cards?: boolean
          id?: string
          is_active?: boolean
          logo_url?: string | null
          payment_number?: string | null
          payment_phone?: string | null
          prefixes?: string[]
          provider_logo?: string | null
          provider_name: string
          sort_order?: number
          updated_at?: string
          ussd_template?: string | null
        }
        Update: {
          commission_rate?: number
          created_at?: string
          display_name?: string
          display_order?: number | null
          enabled_for_sim_cards?: boolean
          id?: string
          is_active?: boolean
          logo_url?: string | null
          payment_number?: string | null
          payment_phone?: string | null
          prefixes?: string[]
          provider_logo?: string | null
          provider_name?: string
          sort_order?: number
          updated_at?: string
          ussd_template?: string | null
        }
        Relationships: []
      }
      payment_receipts: {
        Row: {
          admin_notes: string | null
          amount: number | null
          created_at: string
          device_id: string | null
          id: string
          matched: boolean
          matched_order_id: string | null
          matching_strategy: string | null
          order_id: string | null
          processed_at: string | null
          raw_sms: string
          received_at: string
          receiver_sim: string | null
          reference: string | null
          sender_phone: string | null
          sim_id: string | null
          sms_body: string | null
          status: string
          tx_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          amount?: number | null
          created_at?: string
          device_id?: string | null
          id?: string
          matched?: boolean
          matched_order_id?: string | null
          matching_strategy?: string | null
          order_id?: string | null
          processed_at?: string | null
          raw_sms: string
          received_at?: string
          receiver_sim?: string | null
          reference?: string | null
          sender_phone?: string | null
          sim_id?: string | null
          sms_body?: string | null
          status?: string
          tx_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          amount?: number | null
          created_at?: string
          device_id?: string | null
          id?: string
          matched?: boolean
          matched_order_id?: string | null
          matching_strategy?: string | null
          order_id?: string | null
          processed_at?: string | null
          raw_sms?: string
          received_at?: string
          receiver_sim?: string | null
          reference?: string | null
          sender_phone?: string | null
          sim_id?: string | null
          sms_body?: string | null
          status?: string
          tx_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_receipts_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "android_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_sim_id_fkey"
            columns: ["sim_id"]
            isOneToOne: false
            referencedRelation: "sims"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_sms_log: {
        Row: {
          admin_notes: string | null
          amount: number | null
          created_at: string
          device_id: string | null
          id: string
          matched_order_id: string | null
          matching_strategy: string | null
          processed_at: string | null
          raw_sms: string
          received_at: string
          receiver_sim: string | null
          reference: string | null
          sender_phone: string | null
          sim_id: string | null
          sms_body: string | null
          status: Database["public"]["Enums"]["payment_status"]
          tx_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          amount?: number | null
          created_at?: string
          device_id?: string | null
          id?: string
          matched_order_id?: string | null
          matching_strategy?: string | null
          processed_at?: string | null
          raw_sms: string
          received_at?: string
          receiver_sim?: string | null
          reference?: string | null
          sender_phone?: string | null
          sim_id?: string | null
          sms_body?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          tx_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          amount?: number | null
          created_at?: string
          device_id?: string | null
          id?: string
          matched_order_id?: string | null
          matching_strategy?: string | null
          processed_at?: string | null
          raw_sms?: string
          received_at?: string
          receiver_sim?: string | null
          reference?: string | null
          sender_phone?: string | null
          sim_id?: string | null
          sms_body?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          tx_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_sms_log_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "android_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_sms_log_matched_order_id_fkey"
            columns: ["matched_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_sms_log_sim_id_fkey"
            columns: ["sim_id"]
            isOneToOne: false
            referencedRelation: "sims"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_online_payments: {
        Row: {
          created_at: string
          expected_amount: number
          id: string
          matched_at: string | null
          matched_order_id: string | null
          package_id: string | null
          payment_provider: string | null
          provider_id: string | null
          receiver_phone: string
          sender_phone: string
          status: string
          updated_at: string
          verified_phone: string | null
        }
        Insert: {
          created_at?: string
          expected_amount: number
          id?: string
          matched_at?: string | null
          matched_order_id?: string | null
          package_id?: string | null
          payment_provider?: string | null
          provider_id?: string | null
          receiver_phone: string
          sender_phone: string
          status?: string
          updated_at?: string
          verified_phone?: string | null
        }
        Update: {
          created_at?: string
          expected_amount?: number
          id?: string
          matched_at?: string | null
          matched_order_id?: string | null
          package_id?: string | null
          payment_provider?: string | null
          provider_id?: string | null
          receiver_phone?: string
          sender_phone?: string
          status?: string
          updated_at?: string
          verified_phone?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      providers_config: {
        Row: {
          created_at: string
          display_name: string
          display_order: number | null
          evoucher_rate: number
          id: string
          is_active: boolean
          logo_url: string | null
          phone_prefixes: string[] | null
          promotional_text: string | null
          provider_logo: string | null
          provider_name: string
          sort_order: number
          updated_at: string
          ussd_code: string | null
        }
        Insert: {
          created_at?: string
          display_name: string
          display_order?: number | null
          evoucher_rate?: number
          id?: string
          is_active?: boolean
          logo_url?: string | null
          phone_prefixes?: string[] | null
          promotional_text?: string | null
          provider_logo?: string | null
          provider_name: string
          sort_order?: number
          updated_at?: string
          ussd_code?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string
          display_order?: number | null
          evoucher_rate?: number
          id?: string
          is_active?: boolean
          logo_url?: string | null
          phone_prefixes?: string[] | null
          promotional_text?: string | null
          provider_logo?: string | null
          provider_name?: string
          sort_order?: number
          updated_at?: string
          ussd_code?: string | null
        }
        Relationships: []
      }
      reversal_alerts: {
        Row: {
          amount: number
          created_at: string
          dismissed_at: string | null
          dismissed_by: string | null
          id: string
          sender_phone: string
          sms_body: string
          sms_log_id: string | null
          ussd_code: string
        }
        Insert: {
          amount: number
          created_at?: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          id?: string
          sender_phone: string
          sms_body: string
          sms_log_id?: string | null
          ussd_code: string
        }
        Update: {
          amount?: number
          created_at?: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          id?: string
          sender_phone?: string
          sms_body?: string
          sms_log_id?: string | null
          ussd_code?: string
        }
        Relationships: []
      }
      sim_balances: {
        Row: {
          android_device_id: string | null
          balance: number
          balance_type: string
          created_at: string
          device_id: string | null
          id: string
          last_updated: string | null
          last_updated_at: string
          provider: string | null
          sim_slot: number
          updated_at: string
        }
        Insert: {
          android_device_id?: string | null
          balance?: number
          balance_type?: string
          created_at?: string
          device_id?: string | null
          id?: string
          last_updated?: string | null
          last_updated_at?: string
          provider?: string | null
          sim_slot?: number
          updated_at?: string
        }
        Update: {
          android_device_id?: string | null
          balance?: number
          balance_type?: string
          created_at?: string
          device_id?: string | null
          id?: string
          last_updated?: string | null
          last_updated_at?: string
          provider?: string | null
          sim_slot?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sim_balances_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "android_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      sim_card_orders: {
        Row: {
          created_at: string
          date_of_birth: string | null
          error_message: string | null
          full_name: string
          guarantor_phone: string | null
          id: string
          mother_name: string | null
          order_status: string
          payment_phone: string | null
          payment_provider: string | null
          payment_status: string
          price: number
          sim_number: string
          sim_provider: string | null
          sim_type: string | null
          updated_at: string
          user_id: string | null
          waafipay_reference_id: string | null
          waafipay_response: Json | null
          waafipay_transaction_id: string | null
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          error_message?: string | null
          full_name: string
          guarantor_phone?: string | null
          id?: string
          mother_name?: string | null
          order_status?: string
          payment_phone?: string | null
          payment_provider?: string | null
          payment_status?: string
          price?: number
          sim_number: string
          sim_provider?: string | null
          sim_type?: string | null
          updated_at?: string
          user_id?: string | null
          waafipay_reference_id?: string | null
          waafipay_response?: Json | null
          waafipay_transaction_id?: string | null
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          error_message?: string | null
          full_name?: string
          guarantor_phone?: string | null
          id?: string
          mother_name?: string | null
          order_status?: string
          payment_phone?: string | null
          payment_provider?: string | null
          payment_status?: string
          price?: number
          sim_number?: string
          sim_provider?: string | null
          sim_type?: string | null
          updated_at?: string
          user_id?: string | null
          waafipay_reference_id?: string | null
          waafipay_response?: Json | null
          waafipay_transaction_id?: string | null
        }
        Relationships: []
      }
      sim_cards_catalog: {
        Row: {
          created_at: string
          features: string | null
          id: string
          is_active: boolean
          name: string | null
          number: string
          popular: boolean
          providers: Json
          sim_type: string
          sold_at: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          features?: string | null
          id?: string
          is_active?: boolean
          name?: string | null
          number: string
          popular?: boolean
          providers?: Json
          sim_type?: string
          sold_at?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          features?: string | null
          id?: string
          is_active?: boolean
          name?: string | null
          number?: string
          popular?: boolean
          providers?: Json
          sim_type?: string
          sold_at?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      sims: {
        Row: {
          balance: number
          created_at: string
          device_id: string | null
          id: string
          notes: string | null
          phone_number: string
          pin: string | null
          provider_id: string | null
          sim_slot: number
          status: Database["public"]["Enums"]["sim_status"]
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          device_id?: string | null
          id?: string
          notes?: string | null
          phone_number: string
          pin?: string | null
          provider_id?: string | null
          sim_slot?: number
          status?: Database["public"]["Enums"]["sim_status"]
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          device_id?: string | null
          id?: string
          notes?: string | null
          phone_number?: string
          pin?: string | null
          provider_id?: string | null
          sim_slot?: number
          status?: Database["public"]["Enums"]["sim_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sims_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "android_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sims_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers_config"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_lacago_cards: {
        Row: {
          amount: number
          card_number: string
          created_at: string
          id: string
          used: boolean
          used_at: string | null
        }
        Insert: {
          amount: number
          card_number: string
          created_at?: string
          id?: string
          used?: boolean
          used_at?: string | null
        }
        Update: {
          amount?: number
          card_number?: string
          created_at?: string
          id?: string
          used?: boolean
          used_at?: string | null
        }
        Relationships: []
      }
      sms_logs: {
        Row: {
          amount: number | null
          counterpart_phone: string | null
          created_at: string
          device_id: string | null
          direction: string
          id: string
          message: string
          phone_number: string
          sim_number: string | null
          sim_slot: number | null
          sms_body: string | null
          sms_sender: string | null
          sms_type: string | null
          status: string | null
          tx_id: string | null
          tx_type: string | null
        }
        Insert: {
          amount?: number | null
          counterpart_phone?: string | null
          created_at?: string
          device_id?: string | null
          direction: string
          id?: string
          message: string
          phone_number: string
          sim_number?: string | null
          sim_slot?: number | null
          sms_body?: string | null
          sms_sender?: string | null
          sms_type?: string | null
          status?: string | null
          tx_id?: string | null
          tx_type?: string | null
        }
        Update: {
          amount?: number | null
          counterpart_phone?: string | null
          created_at?: string
          device_id?: string | null
          direction?: string
          id?: string
          message?: string
          phone_number?: string
          sim_number?: string | null
          sim_slot?: number | null
          sms_body?: string | null
          sms_sender?: string | null
          sms_type?: string | null
          status?: string | null
          tx_id?: string | null
          tx_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_logs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "android_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      unmatched_payments: {
        Row: {
          amount: number | null
          created_at: string
          id: string
          payment_sms_id: string | null
          reason: string | null
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          sender_phone: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          id?: string
          payment_sms_id?: string | null
          reason?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          sender_phone?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          id?: string
          payment_sms_id?: string | null
          reason?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          sender_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unmatched_payments_payment_sms_id_fkey"
            columns: ["payment_sms_id"]
            isOneToOne: false
            referencedRelation: "payment_sms_log"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      verified_phones: {
        Row: {
          created_at: string
          id: string
          last_login_at: string | null
          phone_number: string
          verified_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_login_at?: string | null
          phone_number: string
          verified_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_login_at?: string | null
          phone_number?: string
          verified_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_run_cleanup: { Args: never; Returns: Json }
      auto_recover_stuck_deliveries: {
        Args: { p_timeout_minutes?: number }
        Returns: Json
      }
      claim_next_bulk_sms: {
        Args: { p_device_id?: string; p_sim_slot?: number }
        Returns: {
          campaign_id: string
          created_at: string
          device_id: string
          id: string
          message: string
          phone_number: string
          sim_slot: number
          status: string
        }[]
      }
      claim_next_delivery: {
        Args: { p_device_id: string; p_providers?: string[] }
        Returns: {
          attempts: number
          id: string
          order_id: string
          package_code: string
          package_id: string
          pin_code: string
          provider_name: string
          queue_id: string
          receiver_phone: string
          sim_slot: number
          ussd_code: string
          ussd_command: string
        }[]
      }
      cleanup_old_data: { Args: never; Returns: Json }
      get_active_categories: {
        Args: { p_provider_id: string }
        Returns: {
          category_image: string
          category_name: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          provider_id: string
          sort_order: number
          updated_at: string
        }[]
      }
      get_active_payment_providers: {
        Args: never
        Returns: {
          commission_rate: number
          display_name: string
          display_order: number
          id: string
          is_active: boolean
          logo_url: string
          payment_number: string
          payment_phone: string
          provider_logo: string
          provider_name: string
          sort_order: number
          ussd_template: string
        }[]
      }
      get_active_providers: {
        Args: never
        Returns: {
          display_name: string
          display_order: number
          evoucher_rate: number
          id: string
          is_active: boolean
          logo_url: string
          phone_prefixes: string[]
          promotional_text: string
          provider_logo: string
          provider_name: string
          sort_order: number
          ussd_code: string
        }[]
      }
      get_admin_analytics_summary: { Args: never; Returns: Json }
      get_admin_transactions_paginated: {
        Args: {
          p_page?: number
          p_page_size?: number
          p_period?: string
          p_provider_id?: string
          p_search?: string
          p_status?: string
        }
        Returns: Json
      }
      get_admin_transactions_summary: {
        Args: { p_period?: string; p_provider_id?: string }
        Returns: Json
      }
      get_customer_order_history: {
        Args: { _phone: string }
        Returns: {
          amount: number
          created_at: string
          data_amount: string
          delivered_at: string
          delivery_status: string
          id: string
          order_number: string
          package_name: string
          paid_via_secret_price: boolean
          payment_source: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          provider_logo: string
          provider_name: string
          receiver_phone: string
          selling_price: number
          sender_phone: string
          status: Database["public"]["Enums"]["order_status"]
          validity_days: number
        }[]
      }
      get_data_retention_days: { Args: never; Returns: number }
      get_featured_packages: {
        Args: never
        Returns: {
          data_amount: string
          description: string
          id: string
          logo_url: string
          package_name: string
          price: number
          provider_name: string
        }[]
      }
      get_most_purchased_packages: {
        Args: never
        Returns: {
          data_amount: string
          description: string
          id: string
          logo_url: string
          package_name: string
          price: number
          provider_name: string
          purchase_count: number
        }[]
      }
      get_public_packages: {
        Args: { p_provider_id: string }
        Returns: {
          category_id: string
          connection_type_label: string
          cost_price: number
          data_amount: string
          description: string
          id: string
          is_active: boolean
          is_featured: boolean
          package_name: string
          price: number
          provider_id: string
          selling_price: number
          sort_order: number
          ussd_code: string
          ussd_template: string
          validity_days: number
        }[]
      }
      has_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_bulk_sms_counter: {
        Args: { p_campaign_id: string; p_field: string }
        Returns: undefined
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_phone_blocked: { Args: { p_phone: string }; Returns: boolean }
      mark_bulk_sms_claimed_on_read: {
        Args: { p_queue_id: string }
        Returns: boolean
      }
      mark_bulk_sms_status: {
        Args: {
          p_device_id: string
          p_error_message?: string
          p_queue_id: string
          p_status: string
        }
        Returns: boolean
      }
      mark_delivery_dispatched: {
        Args: { p_device_id: string; p_queue_id: string }
        Returns: boolean
      }
      retry_bulk_sms_campaign: {
        Args: { p_campaign_id: string }
        Returns: Json
      }
      rollup_order_stats: {
        Args: { p_older_than_days?: number }
        Returns: number
      }
      set_bank_credential: {
        Args: { p_password: string; p_username: string }
        Returns: undefined
      }
      set_data_retention_days: { Args: { p_days: number }; Returns: number }
      verify_bank_password: {
        Args: { p_password: string; p_username: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "moderator" | "user"
      device_status: "online" | "offline" | "idle" | "busy"
      order_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
        | "cancelled"
        | "refunded"
      payment_status:
        | "pending"
        | "matched"
        | "unmatched"
        | "refunded"
        | "failed"
      sim_status: "active" | "inactive" | "low_balance" | "depleted"
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
      app_role: ["super_admin", "admin", "moderator", "user"],
      device_status: ["online", "offline", "idle", "busy"],
      order_status: [
        "pending",
        "processing",
        "completed",
        "failed",
        "cancelled",
        "refunded",
      ],
      payment_status: ["pending", "matched", "unmatched", "refunded", "failed"],
      sim_status: ["active", "inactive", "low_balance", "depleted"],
    },
  },
} as const
