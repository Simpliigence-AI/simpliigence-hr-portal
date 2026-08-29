'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Cookie-backed browser client, matching the createBrowserClient used by the
// login page, Sidebar and lib/access. The previous plain createClient() looked
// for the session in localStorage, where the cookie-based login never writes
// it — so every query made through this client ran as the anonymous role
// (and logged "Multiple GoTrueClient instances detected").
//
// That went unnoticed while `anon` held a blanket SELECT on public.employees.
// Once migration 20260829141323 scoped that grant to a handful of
// non-sensitive columns, `select('*')` started returning 401 and the Dossier,
// Org Chart, Dashboard, Performance and Reports pages all rendered empty.
export const supabase = createBrowserClient<Database>(supabaseUrl, supabaseAnon);
