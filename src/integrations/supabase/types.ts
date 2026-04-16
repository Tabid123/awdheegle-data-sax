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
          created_at: string
          id: string
          permission_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission_key?: string
          user_id?: string
        }
        Relationships: []
      }
      android_devices: {
        Row: {
          archived_at: string | null
          battery_level: number | null
          created_at: string
          device_id: string
          device_name: string
          failed_deliveries: number | null
          id: string
          is_active: boolean
          is_charging: boolean | null
          last_ping_at: string | null
          provider_name: string
          sim_number: string
          sim1_provider: string | null
          sim2_number: string | null
          sim2_provider: string | null
          total_deliveries: number | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          battery_level?: number | null
          created_at?: string
          device_id: string
          device_name: string
          failed_deliveries?: number | null
          id?: string
          is_active?: boolean
          is_charging?: boolean | null
          last_ping_at?: string | null
          provider_name: string
          sim_number: string
          sim1_provider?: string | null
          sim2_number?: string | null
          sim2_provider?: string | null
          total_deliveries?: number | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          battery_level?: number | null
          created_at?: string
          device_id?: string
          device_name?: string
          failed_deliveries?: number | null
          id?: string
          is_active?: boolean
          is_charging?: boolean | null
          last_ping_at?: string | null
          provider_name?: string
          sim_number?: string
          sim1_provider?: string | null
          sim2_number?: string | null
          sim2_provider?: string | null
          total_deliveries?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          created_at: string
          description: string
          id: string
          setting_key: string
          setting_value: boolean | null
          text_value: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          setting_key: string
          setting_value?: boolean | null
          text_value?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          setting_key?: string
          setting_value?: boolean | null
          text_value?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          user_email?: string | null
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
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          phone_number: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          phone_number?: string
        }
        Relationships: []
      }
      auto_topup_packages: {
        Row: {
          cost_price: number
          created_at: string
          data_amount: string
          id: string
          is_active: boolean
          package_name: string
          provider_name: string
          selling_price: number
          sim_password: string | null
          topup_number_id: string
          ussd_code: string | null
        }
        Insert: {
          cost_price?: number
          created_at?: string
          data_amount?: string
          id?: string
          is_active?: boolean
          package_name: string
          provider_name?: string
          selling_price: number
          sim_password?: string | null
          topup_number_id: string
          ussd_code?: string | null
        }
        Update: {
          cost_price?: number
          created_at?: string
          data_amount?: string
          id?: string
          is_active?: boolean
          package_name?: string
          provider_name?: string
          selling_price?: number
          sim_password?: string | null
          topup_number_id?: string
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
          package_id: string | null
          phone_number: string
          topup_number_id: string
        }
        Insert: {
          category_name?: string | null
          created_at?: string
          custom_amount?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          package_id?: string | null
          phone_number: string
          topup_number_id: string
        }
        Update: {
          category_name?: string | null
          created_at?: string
          custom_amount?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          package_id?: string | null
          phone_number?: string
          topup_number_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auto_topup_phone_mappings_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "auto_topup_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_topup_phone_mappings_topup_number_id_fkey"
            columns: ["topup_number_id"]
            isOneToOne: false
            referencedRelation: "auto_topup_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      banners_config: {
        Row: {
          alt_text: string | null
          banner_image: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          media_type: string | null
          rotation_interval: number | null
          updated_at: string
          video_duration: number | null
        }
        Insert: {
          alt_text?: string | null
          banner_image: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          media_type?: string | null
          rotation_interval?: number | null
          updated_at?: string
          video_duration?: number | null
        }
        Update: {
          alt_text?: string | null
          banner_image?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          media_type?: string | null
          rotation_interval?: number | null
          updated_at?: string
          video_duration?: number | null
        }
        Relationships: []
      }
      blocked_users: {
        Row: {
          blocked_by: string | null
          created_at: string
          id: string
          is_active: boolean
          phone_number: string
          reason: string | null
          unblocked_at: string | null
        }
        Insert: {
          blocked_by?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          phone_number: string
          reason?: string | null
          unblocked_at?: string | null
        }
        Update: {
          blocked_by?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          phone_number?: string
          reason?: string | null
          unblocked_at?: string | null
        }
        Relationships: []
      }
      bulk_sms_campaigns: {
        Row: {
          created_at: string
          device_id: string | null
          failed_count: number
          id: string
          message: string
          sent_count: number
          sim_slot: number | null
          status: string
          target_type: string
          total_recipients: number
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          failed_count?: number
          id?: string
          message: string
          sent_count?: number
          sim_slot?: number | null
          status?: string
          target_type?: string
          total_recipients?: number
        }
        Update: {
          created_at?: string
          device_id?: string | null
          failed_count?: number
          id?: string
          message?: string
          sent_count?: number
          sim_slot?: number | null
          status?: string
          target_type?: string
          total_recipients?: number
        }
        Relationships: []
      }
      bulk_sms_queue: {
        Row: {
          campaign_id: string
          created_at: string
          device_id: string | null
          error_message: string | null
          id: string
          phone_number: string
          sent_at: string | null
          sim_slot: number | null
          status: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          device_id?: string | null
          error_message?: string | null
          id?: string
          phone_number: string
          sent_at?: string | null
          sim_slot?: number | null
          status?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          device_id?: string | null
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
      customer_discounts: {
        Row: {
          applicable_to: string | null
          created_at: string
          customer_phone: string
          discount_type: string | null
          discount_value: number
          id: string
          is_active: boolean
          notes: string | null
          package_id: string | null
          provider_id: string | null
        }
        Insert: {
          applicable_to?: string | null
          created_at?: string
          customer_phone: string
          discount_type?: string | null
          discount_value?: number
          id?: string
          is_active?: boolean
          notes?: string | null
          package_id?: string | null
          provider_id?: string | null
        }
        Update: {
          applicable_to?: string | null
          created_at?: string
          customer_phone?: string
          discount_type?: string | null
          discount_value?: number
          id?: string
          is_active?: boolean
          notes?: string | null
          package_id?: string | null
          provider_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_discounts_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_discounts_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers_config"
            referencedColumns: ["id"]
          },
        ]
      }
      data_packages_config: {
        Row: {
          category_id: string | null
          connection_type_label: string
          cost_price: number
          created_at: string
          data_amount: string
          display_order: number
          id: string
          is_active: boolean
          package_name: string
          profit_margin: number | null
          provider_id: string
          selling_price: number
          updated_at: string
          ussd_code: string | null
          validity_days: string
        }
        Insert: {
          category_id?: string | null
          connection_type_label?: string
          cost_price?: number
          created_at?: string
          data_amount: string
          display_order?: number
          id?: string
          is_active?: boolean
          package_name: string
          profit_margin?: number | null
          provider_id: string
          selling_price: number
          updated_at?: string
          ussd_code?: string | null
          validity_days?: string
        }
        Update: {
          category_id?: string | null
          connection_type_label?: string
          cost_price?: number
          created_at?: string
          data_amount?: string
          display_order?: number
          id?: string
          is_active?: boolean
          package_name?: string
          profit_margin?: number | null
          provider_id?: string
          selling_price?: number
          updated_at?: string
          ussd_code?: string | null
          validity_days?: string
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
          execution_order: number | null
          id: string
          instruction_template: string | null
          instruction_type: string
          notes: string | null
          order_id: string | null
          package_id: string | null
          provider_id: string | null
          provider_name: string | null
          receiver_phone: string | null
          sim_password: string | null
          status: string | null
          ussd_code: string | null
        }
        Insert: {
          category_id?: string | null
          code_template?: string | null
          created_at?: string
          execution_order?: number | null
          id?: string
          instruction_template?: string | null
          instruction_type?: string
          notes?: string | null
          order_id?: string | null
          package_id?: string | null
          provider_id?: string | null
          provider_name?: string | null
          receiver_phone?: string | null
          sim_password?: string | null
          status?: string | null
          ussd_code?: string | null
        }
        Update: {
          category_id?: string | null
          code_template?: string | null
          created_at?: string
          execution_order?: number | null
          id?: string
          instruction_template?: string | null
          instruction_type?: string
          notes?: string | null
          order_id?: string | null
          package_id?: string | null
          provider_id?: string | null
          provider_name?: string | null
          receiver_phone?: string | null
          sim_password?: string | null
          status?: string | null
          ussd_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_instructions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "package_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_instructions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_instructions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_instructions_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers_config"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_queue: {
        Row: {
          android_device_id: string | null
          attempts: number | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          last_attempt_at: string | null
          order_id: string
          package_code: string | null
          provider_name: string
          provider_response: string | null
          receiver_phone: string
          scheduled_at: string | null
          sim_slot: number | null
          status: string | null
          ussd_code: string
        }
        Insert: {
          android_device_id?: string | null
          attempts?: number | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          order_id: string
          package_code?: string | null
          provider_name: string
          provider_response?: string | null
          receiver_phone: string
          scheduled_at?: string | null
          sim_slot?: number | null
          status?: string | null
          ussd_code: string
        }
        Update: {
          android_device_id?: string | null
          attempts?: number | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          order_id?: string
          package_code?: string | null
          provider_name?: string
          provider_response?: string | null
          receiver_phone?: string
          scheduled_at?: string | null
          sim_slot?: number | null
          status?: string | null
          ussd_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_queue_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      device_alerts: {
        Row: {
          alert_type: string
          created_at: string
          device_id: string
          id: string
          is_resolved: boolean | null
          message: string | null
          resolved_at: string | null
        }
        Insert: {
          alert_type: string
          created_at?: string
          device_id: string
          id?: string
          is_resolved?: boolean | null
          message?: string | null
          resolved_at?: string | null
        }
        Update: {
          alert_type?: string
          created_at?: string
          device_id?: string
          id?: string
          is_resolved?: boolean | null
          message?: string | null
          resolved_at?: string | null
        }
        Relationships: []
      }
      error_messages: {
        Row: {
          created_at: string
          error_code: string
          error_type: string | null
          icon_type: string | null
          icon_value: string | null
          id: string
          is_active: boolean
          is_animated: boolean | null
          message: string | null
          message_en: string | null
          message_so: string | null
          title: string | null
        }
        Insert: {
          created_at?: string
          error_code: string
          error_type?: string | null
          icon_type?: string | null
          icon_value?: string | null
          id?: string
          is_active?: boolean
          is_animated?: boolean | null
          message?: string | null
          message_en?: string | null
          message_so?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string
          error_code?: string
          error_type?: string | null
          icon_type?: string | null
          icon_value?: string | null
          id?: string
          is_active?: boolean
          is_animated?: boolean | null
          message?: string | null
          message_en?: string | null
          message_so?: string | null
          title?: string | null
        }
        Relationships: []
      }
      featured_packages: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          package_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          package_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "featured_packages_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_alerts: {
        Row: {
          alert_type: string
          amount: number
          created_at: string
          description: string | null
          id: string
          is_reviewed: boolean
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sender_phone: string
          severity: string
        }
        Insert: {
          alert_type: string
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          is_reviewed?: boolean
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sender_phone: string
          severity?: string
        }
        Update: {
          alert_type?: string
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          is_reviewed?: boolean
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sender_phone?: string
          severity?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          message: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          message: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          message?: string
          title?: string
        }
        Relationships: []
      }
      offline_registrations: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          provider_id: string | null
          provider_name: string | null
          receiver_phone: string
          sender_phone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          provider_id?: string | null
          provider_name?: string | null
          receiver_phone: string
          sender_phone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          provider_id?: string | null
          provider_name?: string | null
          receiver_phone?: string
          sender_phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          cost_price: number
          created_at: string
          customer_phone: string
          data_amount: string | null
          delivered_at: string | null
          delivery_notes: string | null
          delivery_status: string | null
          id: string
          invoice_url: string | null
          is_manual: boolean | null
          package_id: string | null
          package_name: string
          payment_number: string | null
          payment_provider_id: string | null
          payment_source: string | null
          provider_id: string | null
          receiver_phone: string
          selling_price: number
          sender_phone: string | null
          status: string
          tx_id: string | null
          updated_at: string
        }
        Insert: {
          cost_price?: number
          created_at?: string
          customer_phone: string
          data_amount?: string | null
          delivered_at?: string | null
          delivery_notes?: string | null
          delivery_status?: string | null
          id?: string
          invoice_url?: string | null
          is_manual?: boolean | null
          package_id?: string | null
          package_name: string
          payment_number?: string | null
          payment_provider_id?: string | null
          payment_source?: string | null
          provider_id?: string | null
          receiver_phone: string
          selling_price: number
          sender_phone?: string | null
          status?: string
          tx_id?: string | null
          updated_at?: string
        }
        Update: {
          cost_price?: number
          created_at?: string
          customer_phone?: string
          data_amount?: string | null
          delivered_at?: string | null
          delivery_notes?: string | null
          delivery_status?: string | null
          id?: string
          invoice_url?: string | null
          is_manual?: boolean | null
          package_id?: string | null
          package_name?: string
          payment_number?: string | null
          payment_provider_id?: string | null
          payment_source?: string | null
          provider_id?: string | null
          receiver_phone?: string
          selling_price?: number
          sender_phone?: string | null
          status?: string
          tx_id?: string | null
          updated_at?: string
        }
        Relationships: [
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
        ]
      }
      package_categories: {
        Row: {
          category_image: string | null
          category_name: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          provider_id: string | null
          updated_at: string
        }
        Insert: {
          category_image?: string | null
          category_name: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          provider_id?: string | null
          updated_at?: string
        }
        Update: {
          category_image?: string | null
          category_name?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          provider_id?: string | null
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
          display_order: number
          id: string
          is_active: boolean
          payment_number: string | null
          prefix_code: string | null
          provider_logo: string | null
          provider_name: string
          updated_at: string
          ussd_code_template: string | null
        }
        Insert: {
          commission_rate?: number
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          payment_number?: string | null
          prefix_code?: string | null
          provider_logo?: string | null
          provider_name: string
          updated_at?: string
          ussd_code_template?: string | null
        }
        Update: {
          commission_rate?: number
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          payment_number?: string | null
          prefix_code?: string | null
          provider_logo?: string | null
          provider_name?: string
          updated_at?: string
          ussd_code_template?: string | null
        }
        Relationships: []
      }
      payment_receipts: {
        Row: {
          admin_notes: string | null
          amount: number
          created_at: string | null
          id: string
          matched_order_id: string | null
          matching_strategy: string | null
          processed_at: string | null
          receiver_sim: string | null
          sender_phone: string
          sms_body: string | null
          status: string | null
          tx_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          amount: number
          created_at?: string | null
          id?: string
          matched_order_id?: string | null
          matching_strategy?: string | null
          processed_at?: string | null
          receiver_sim?: string | null
          sender_phone: string
          sms_body?: string | null
          status?: string | null
          tx_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          amount?: number
          created_at?: string | null
          id?: string
          matched_order_id?: string | null
          matching_strategy?: string | null
          processed_at?: string | null
          receiver_sim?: string | null
          sender_phone?: string
          sms_body?: string | null
          status?: string | null
          tx_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_receipts_matched_order_id_fkey"
            columns: ["matched_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
          package_id: string | null
          payment_provider: string | null
          provider_id: string | null
          receiver_phone: string
          sender_phone: string
          status: string
          verified_phone: string | null
        }
        Insert: {
          created_at?: string
          expected_amount: number
          id?: string
          matched_at?: string | null
          package_id?: string | null
          payment_provider?: string | null
          provider_id?: string | null
          receiver_phone: string
          sender_phone: string
          status?: string
          verified_phone?: string | null
        }
        Update: {
          created_at?: string
          expected_amount?: number
          id?: string
          matched_at?: string | null
          package_id?: string | null
          payment_provider?: string | null
          provider_id?: string | null
          receiver_phone?: string
          sender_phone?: string
          status?: string
          verified_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_online_payments_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_online_payments_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers_config"
            referencedColumns: ["id"]
          },
        ]
      }
      providers_config: {
        Row: {
          created_at: string
          display_order: number
          evoucher_rate: number
          id: string
          is_active: boolean
          promotional_text: string | null
          provider_logo: string | null
          provider_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          evoucher_rate?: number
          id?: string
          is_active?: boolean
          promotional_text?: string | null
          provider_logo?: string | null
          provider_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          evoucher_rate?: number
          id?: string
          is_active?: boolean
          promotional_text?: string | null
          provider_logo?: string | null
          provider_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      sim_balances: {
        Row: {
          balance: number
          balance_type: string
          created_at: string
          device_id: string
          id: string
          last_updated: string
          sim_slot: number
        }
        Insert: {
          balance?: number
          balance_type?: string
          created_at?: string
          device_id: string
          id?: string
          last_updated?: string
          sim_slot?: number
        }
        Update: {
          balance?: number
          balance_type?: string
          created_at?: string
          device_id?: string
          id?: string
          last_updated?: string
          sim_slot?: number
        }
        Relationships: []
      }
      sms_logs: {
        Row: {
          amount: number | null
          counterpart_phone: string | null
          created_at: string
          device_id: string
          id: string
          received_at: string
          sim_number: string | null
          sim_slot: number
          sms_body: string
          sms_sender: string | null
          sms_type: string
          tx_id: string | null
          tx_type: string | null
        }
        Insert: {
          amount?: number | null
          counterpart_phone?: string | null
          created_at?: string
          device_id: string
          id?: string
          received_at?: string
          sim_number?: string | null
          sim_slot?: number
          sms_body: string
          sms_sender?: string | null
          sms_type?: string
          tx_id?: string | null
          tx_type?: string | null
        }
        Update: {
          amount?: number | null
          counterpart_phone?: string | null
          created_at?: string
          device_id?: string
          id?: string
          received_at?: string
          sim_number?: string | null
          sim_slot?: number
          sms_body?: string
          sms_sender?: string | null
          sms_type?: string
          tx_id?: string | null
          tx_type?: string | null
        }
        Relationships: []
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
          role?: Database["public"]["Enums"]["app_role"]
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
      devices: {
        Row: {
          created_at: string | null
          device_id: string | null
          device_name: string | null
          id: string | null
          is_active: boolean | null
          last_seen: string | null
          sim1_number: string | null
          sim2_number: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          device_id?: string | null
          device_name?: string | null
          id?: string | null
          is_active?: boolean | null
          last_seen?: string | null
          sim1_number?: string | null
          sim2_number?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          device_id?: string | null
          device_name?: string | null
          id?: string | null
          is_active?: boolean | null
          last_seen?: string | null
          sim1_number?: string | null
          sim2_number?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      check_fraud_rules: {
        Args: { p_amount: number; p_sender_phone: string }
        Returns: Json
      }
      claim_next_delivery:
        | { Args: { p_device_id: string }; Returns: Json }
        | {
            Args: { p_device_id: string; p_providers?: string[] }
            Returns: Json
          }
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
          updated_at: string
        }[]
      }
      get_active_payment_providers: {
        Args: never
        Returns: {
          commission_rate: number
          created_at: string
          id: string
          is_active: boolean
          payment_number: string
          prefix_code: string
          provider_logo: string
          provider_name: string
          updated_at: string
          ussd_code_template: string
        }[]
      }
      get_active_providers: {
        Args: never
        Returns: {
          display_order: number
          evoucher_rate: number
          id: string
          is_active: boolean
          promotional_text: string
          provider_logo: string
          provider_name: string
        }[]
      }
      get_admin_analytics_summary: {
        Args: { p_end_date?: string; p_period?: string; p_start_date?: string }
        Returns: Json
      }
      get_admin_date_range_breakdown:
        | { Args: { p_end_date: string; p_start_date: string }; Returns: Json }
        | {
            Args: {
              p_end_date: string
              p_provider_id?: string
              p_start_date: string
            }
            Returns: Json
          }
      get_admin_provider_daily_stats: {
        Args: { p_date?: string }
        Returns: Json
      }
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
        Args: {
          p_period?: string
          p_provider_id?: string
          p_search?: string
          p_status?: string
        }
        Returns: Json
      }
      get_customer_order_history: {
        Args: { customer_phone_number: string }
        Returns: {
          created_at: string
          customer_phone: string
          data_amount: string
          delivered_at: string
          delivery_notes: string
          delivery_status: string
          id: string
          invoice_url: string
          package_name: string
          payment_source: string
          provider_logo: string
          provider_name: string
          receiver_phone: string
          selling_price: number
          sender_phone: string
          status: string
          validity_days: string
        }[]
      }
      get_featured_packages: {
        Args: never
        Returns: {
          data_amount: string
          id: string
          package_id: string
          package_name: string
          provider_id: string
          provider_logo: string
          provider_name: string
          selling_price: number
          validity_days: string
        }[]
      }
      get_public_packages: {
        Args: { p_provider_id: string }
        Returns: {
          category_id: string
          connection_type_label: string
          cost_price: number
          data_amount: string
          display_order: number
          id: string
          is_active: boolean
          package_name: string
          provider_id: string
          selling_price: number
          ussd_code: string
          validity_days: string
        }[]
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
      resolve_order_cost: {
        Args: {
          p_data_amount: string
          p_order_cost: number
          p_package_id: string
          p_package_name: string
          p_provider_id: string
        }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "super_admin"
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
      app_role: ["admin", "super_admin"],
    },
  },
} as const
