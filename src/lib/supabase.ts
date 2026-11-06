import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const chiave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configurato = Boolean(url && chiave);

// La chiave "anon" è pubblica per progettazione: la sicurezza è nelle regole (RLS) del database.
export const supabase = createClient(url ?? 'http://localhost', chiave ?? 'non-configurato');
