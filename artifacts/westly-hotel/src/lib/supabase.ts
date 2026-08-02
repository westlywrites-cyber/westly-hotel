import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ══════════════════════════════════════════════════════════════════════════
// SUPABASE CLIENT — used ONLY by the public-website Message Inbox feature
// (src/lib/messages.ts, src/pages/admin/MessagesPage.tsx). Every other part
// of this application (auth, rooms, bookings, payments, etc.) continues to
// run on Firebase and is untouched by this file.
//
// This project has not been connected to Supabase yet. Once it is, set
// these two environment variables (in Netlify → Site settings → Environment
// variables, and in a local .env file for development):
//
//   VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
//   VITE_SUPABASE_ANON_KEY=<your-project-anon-public-key>
//
// Until those are set, `isSupabaseConfigured` is false and every function in
// messages.ts fails soft (returns an empty/queued result instead of
// throwing), so the rest of the app keeps working normally — the public
// contact form simply queues messages locally and the admin Message Inbox
// shows a "not connected yet" state instead of a crash.
//
// See supabase/schema.sql for the table + Row Level Security + realtime
// setup this feature expects once you connect a project.
// ══════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
      auth: {
        // The public site submits messages without any Supabase auth session
        // (RLS policies grant the `anon` role insert-only access — see
        // supabase/schema.sql). Admin reads/updates also go through the anon
        // key scoped by RLS rather than a separate Supabase auth session,
        // since staff identity/roles already live in Firebase Auth.
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;
