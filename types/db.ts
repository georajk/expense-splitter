export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      TripExpense: {
        Row: {
          id: string;
          date: string;
          item: string;
          amount: number;
          split_among: string[];
          paid_by: string;
        };
        Insert: {
          id?: string;
          date?: string;
          item: string;
          amount: number;
          split_among: string[];
          paid_by: string;
        };
        Update: {
          id?: string;
          date?: string;
          item?: string;
          amount?: number;
          split_among?: string[];
          paid_by?: string;
        };
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
  };
}
