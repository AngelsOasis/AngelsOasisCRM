import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { isSupabaseConfigured } from "../../lib/supabaseClient";

export default function Login() {
  const { session, signInWithPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (session) return <Navigate to="/app" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await signInWithPassword(email, password);
    setSubmitting(false);
    if (error) setError(error);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4 py-10">
      <div className="w-full max-w-md rounded-[10px] border border-hairline bg-white p-8 shadow-sm sm:p-10">
        <div className="mb-8 border-b border-hairline pb-6">
          <img src="/brand/angels-oasis-logo-positive.svg" alt="Angels Oasis" className="w-[220px] max-w-full" />
          <p className="mt-3 font-serif text-lg text-plum-dark">Staff Sign In</p>
          <p className="mt-1 text-sm text-ink-soft/70">Referral Outreach CRM</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-plum-dark">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              className="mt-1 w-full px-3 py-2.5"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-plum-dark">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="mt-1 w-full px-3 py-2.5"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={submitting} className="btn-primary w-full !rounded-full !py-3 uppercase tracking-wide">
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
        {!isSupabaseConfigured && (
          <p className="mt-4 rounded-md bg-linen p-3 text-xs text-plum-dark">
            Supabase is not configured. Copy <code>.env.example</code> to <code>.env.local</code>,
            set <code>VITE_SUPABASE_URL</code> and either{" "}
            <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> or <code>VITE_SUPABASE_ANON_KEY</code>,
            then redeploy.
          </p>
        )}
        <p className="mt-6 text-xs leading-5 text-ink-soft/70">
          Accounts are created in Supabase Auth (Settings → Users in your Supabase project),
          then given a role via the <code>profiles</code> table.
        </p>
      </div>
    </div>
  );
}