import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

interface Row {
  status: string;
  count: number;
}

export default function EmailAnalytics() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("emails").select("status");
      const counts: Record<string, number> = {};
      (data ?? []).forEach((e: { status: string }) => {
        counts[e.status] = (counts[e.status] ?? 0) + 1;
      });
      setRows(Object.entries(counts).map(([status, count]) => ({ status, count })));
      setLoading(false);
    }
    load();
  }, []);

  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const opened = rows.find((r) => r.status === "opened")?.count ?? 0;
  const replied = rows.find((r) => r.status === "replied")?.count ?? 0;
  const sent = rows.find((r) => r.status === "sent")?.count ?? 0;

  return (
    <div>
      <h1 className="font-serif text-3xl">Email Analytics</h1>
      <p className="mt-1 text-plum/60">Open/click/reply performance across all three weekly campaigns.</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-sm text-plum/60">Sent</p>
          <p className="mt-2 font-serif text-3xl">{loading ? "…" : sent}</p>
        </div>
        <div className="card">
          <p className="text-sm text-plum/60">Open rate</p>
          <p className="mt-2 font-serif text-3xl">{loading || !total ? "—" : `${Math.round((opened / total) * 100)}%`}</p>
        </div>
        <div className="card">
          <p className="text-sm text-plum/60">Reply rate</p>
          <p className="mt-2 font-serif text-3xl">{loading || !total ? "—" : `${Math.round((replied / total) * 100)}%`}</p>
        </div>
      </div>

      <div className="mt-6 card">
        <h2 className="font-serif text-lg">Status breakdown</h2>
        <ul className="mt-3 space-y-1 text-sm">
          {rows.map((r) => (
            <li key={r.status} className="flex justify-between border-b border-plum/5 py-1">
              <span className="capitalize">{r.status}</span>
              <span className="font-semibold">{r.count}</span>
            </li>
          ))}
          {!loading && rows.length === 0 && <li className="text-plum/50">No emails sent yet.</li>}
        </ul>
      </div>
    </div>
  );
}