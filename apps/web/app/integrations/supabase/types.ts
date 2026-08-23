export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          phone: string | null;
          country: string | null;
          profile_image_url: string | null;
          password_hash: string | null;
          role: string;
          active: boolean;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["users"]["Row"]> & {
          email: string;
        };
        Update: Partial<Database["public"]["Tables"]["users"]["Row"]>;
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          owner_id: string;
          slug: string;
          title: string;
          category: string;
          summary: string;
          status: string;
          featured: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["projects"]["Row"]> & {
          owner_id: string;
          slug: string;
          title: string;
          category: string;
          summary: string;
        };
        Update: Partial<Database["public"]["Tables"]["projects"]["Row"]>;
        Relationships: [];
      };
      site_settings: {
        Row: {
          id: string;
          key: string;
          value: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["site_settings"]["Row"]> & {
          key: string;
          value: string;
        };
        Update: Partial<Database["public"]["Tables"]["site_settings"]["Row"]>;
        Relationships: [];
      };
      contact_messages: {
        Row: {
          id: string;
          name: string;
          email: string;
          project_type: string | null;
          monthly_volume: string | null;
          message: string;
          status: string;
          last_reply: string | null;
          replied_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["contact_messages"]["Row"]> & {
          name: string;
          email: string;
          message: string;
        };
        Update: Partial<Database["public"]["Tables"]["contact_messages"]["Row"]>;
        Relationships: [];
      };
      admin_users: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          phone: string | null;
          password_hash: string;
          role: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["admin_users"]["Row"]> & {
          email: string;
          password_hash: string;
        };
        Update: Partial<Database["public"]["Tables"]["admin_users"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
