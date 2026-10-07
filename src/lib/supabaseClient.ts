import { createClient } from "@supabase/supabase-js";

// These two values are safe to ship to the browser:
// - the project URL is public by definition
// - the "publishable" key (sb_publishable_...) is Supabase's newer public-safe
//   key format, the same idea as a Stripe publishable key.
//
// Nothing secret (service-role key, Deepseek keys, email provider key) is ever
// read here or bundled into frontend code — see supabase/functions/ai-writer
// for where those live instead.
const configuredUrl =
  window.__ANGELS_OASIS_CONFIG__?.supabaseUrl?.trim() ||
  import.meta.env.VITE_SUPABASE_URL?.trim();
const configuredKey =
  window.__ANGELS_OASIS_CONFIG__?.supabaseKey?.trim() ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
let validUrl: string | null = null;
if (configuredUrl) {
  try {
    const parsed = new URL(configuredUrl);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      validUrl = configuredUrl;
    }
  } catch {
    // Invalid configuration is reported below and handled by the safe fallback.
  }
}

export const isSupabaseConfigured = Boolean(validUrl && configuredKey);

if (!isSupabaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    "[supabaseClient] Supabase configuration is missing or invalid. " +
      "Set VITE_SUPABASE_URL and either VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY."
  );
}

// Keep a misconfigured deployment renderable so the login page can explain
// the problem instead of crashing during module initialization.
export const supabase = createClient(
  validUrl ?? "https://missing-project.supabase.co",
  configuredKey || "missing-supabase-publishable-key"
);
