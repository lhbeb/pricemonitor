import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Read-only client using public anon key (governed by RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Product = {
    id: string;
    slug: string;
    title: string;
    price: number;
    brand: string;
    condition: string;
    category: string;
    images: string[];
    in_stock: boolean;
    created_at: string;
    listed_by?: string | null;
};
