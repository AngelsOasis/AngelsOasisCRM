import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";

interface Kpis {
  totalLeads: number;
  newThisWeek: number;
  emailsSentThisWeek: number;
  activeCampaigns: number;
}

export default function Dashboard() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [{ count: totalLeads }, { count: newThisWeek }, { count: emailsSentThisWeek }, { count: activeCampaigns }] =
        await Promise.all([
          supabase.from("leads").select("*", { count: "exact", head: true }),
          supabase.from("leads").select("*", { count: "exact", head: true }).gte("created_at", weekAgo),
          supabase
            .from("emails")
            .select("*", { count: "exact", head: true })
            .eq("status", "sent")
            .gte("sent_at", weekAgo),
          supabase.from("campaigns").select("*", { count: "exact", head: true }).eq("approval_status", "pending_approval"),
        ]);

      setKpis({
        totalLeads: totalLeads ?? 0,
        newThisWeek: newThisWeek ?? 0,
        emailsSentThisWeek: emailsSentThisWeek ?? 0,
        activeCampaigns: activeCampaigns ?? 0,
      });
      setLoading(false);
    }
    load().catch(() => setLoading(false));
  }, []);

  const cards = [
    { label: "Total Leads", value: kpis?.totalLeads },
    { label: "New Leads This Week", value: kpis?.newThisWeek },
    { label: "Emails Sent This Week", value: kpis?.emailsSentThisWeek },
    { label: "Awaiting Approval", value: kpis?.activeCampaigns },
  ];

  return (
    <div>
      <h1 className="font-serif text-3xl">Dashboard</h1>
      <p className="mt-1 text-plum/60">A weekly snapshot of leads, campaigns, and outreach.</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card">
            <p className="text-sm text-plum/60">{c.label}</p>
            <p className="mt-2 font-serif text-3xl">{loading ? "…" : c.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="font-serif text-xl">This week's campaigns</h2>
          <ul className="mt-3 space-y-2 text-sm text-plum/80">
            <li>Monday — Weekly Newsletter</li>
            <li>Wednesday — Facility Education</li>
            <li>Friday — Testimonials / Blog</li>
          </ul>
          <Link to="/app/campaigns" className="mt-4 inline-block text-sm font-semibold text-plum underline">
            Review approval queue →
          </Link>
        </div>

        <div className="card">
          <h2 className="font-serif text-xl">Quick actions</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link to="/app/leads" className="btn-primary !px-4 !py-2 text-sm">Add Lead</Link>
            <Link to="/app/campaigns" className="btn-primary !px-4 !py-2 text-sm">Launch Campaign</Link>
            <Link to="/app/ai-writer" className="btn-primary !px-4 !py-2 text-sm">Generate AI Content</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
