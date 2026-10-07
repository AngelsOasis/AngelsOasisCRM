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
    <div className="flex min-h-screen items-center justify-center bg-plum px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="font-serif text-2xl text-plum-dark">Angels Oasis</h1>
        <p className="mt-1 text-sm text-plum/70">Referral Outreach AI — staff sign in</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-plum-dark">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-plum/20 px-3 py-2 focus:border-plum focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-plum-dark">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-plum/20 px-3 py-2 focus:border-plum focus:outline-none"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
        {!isSupabaseConfigured && (
          <p className="mt-4 rounded-lg bg-plum-50 p-3 text-xs text-plum-dark">
            Supabase is not configured. Copy <code>.env.example</code> to <code>.env.local</code>,
            set <code>VITE_SUPABASE_URL</code> and either{" "}
            <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> or <code>VITE_SUPABASE_ANON_KEY</code>,
            then redeploy.
          </p>
        )}
        <p className="mt-6 text-xs text-plum/50">
          Accounts are created in Supabase Auth (Settings → Users in your Supabase project),
          then given a role via the <code>profiles</code> table.
        </p>
      </div>
    </div>
  );
}