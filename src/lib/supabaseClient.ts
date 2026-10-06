import { createClient } from "@supabase/supabase-js";

// These two values are safe to ship to the browser:
// - the project URL is public by definition
// - the "publishable" key (sb_publishable_...) is Supabase's newer public-safe
//   key format, the same idea as a Stripe publishable key.
//
// Nothing secret (service-role key, Deepseek keys, email provider key) is ever
// read here or bundled into frontend code — see supabase/functions/ai-writer
// for where those live instead.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
  | string
  | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

if (!supabaseUrl || !supabaseKey) {
  // eslint-disable-next-line no-console
  console.warn(
    "[supabaseClient] Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. " +
      "Copy .env.example to .env.local and fill in your project's values."
  );
}

export const supabase = createClient(supabaseUrl ?? "", supabaseKey ?? "");
