import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";

const CAMPAIGN_TYPES = [
  { value: "monday_newsletter", label: "Monday — Weekly Newsletter" },
  { value: "wednesday_education", label: "Wednesday — Facility Education" },
  { value: "friday_testimonial", label: "Friday — Testimonials / Blog" },
] as const;

interface DraftResult {
  subject: string;
  body: string;
  cta: string;
  follow_up_body: string;
  social_version: string;
  blog_version: string;
}

export default function AIWriter() {
  const [campaignType, setCampaignType] = useState<string>(CAMPAIGN_TYPES[0].value);
  const [topicHint, setTopicHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DraftResult | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    setResult(null);
    const { data, error } = await supabase.functions.invoke("ai-writer", {
      body: { campaignType, topicHint },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setResult(data.draft);
  }

  return (
    <div>
      <h1 className="font-serif text-3xl">AI Writer</h1>
      <p className="mt-1 text-plum/60">
        Generates a subject line, body, CTA, follow-up, social post, and blog version — always saved
        straight into the Campaigns approval queue. Nothing here sends on its own.
      </p>

      <div className="card mt-6 max-w-xl space-y-4">
        <div>
          <label className="block text-sm font-medium text-plum-dark">Campaign type</label>
          <select className="mt-1 w-full rounded-lg border border-plum/20 px-3 py-2"
            value={campaignType} onChange={(e) => setCampaignType(e.target.value)}>
            {CAMPAIGN_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-plum-dark">Extra context (optional)</label>
          <textarea className="mt-1 w-full rounded-lg border border-plum/20 px-3 py-2" rows={3}
            placeholder="e.g. mention the San Jacinto location opening soon"
            value={topicHint} onChange={(e) => setTopicHint(e.target.value)} />
        </div>
        <button onClick={generate} disabled={loading} className="btn-primary">
          {loading ? "Generating…" : "Generate draft"}
        </button>
        {error && (
          <p className="text-sm text-red-600">
            {error}. Make sure the <code>ai-writer</code> Edge Function is deployed and its Deepseek
            secrets are set (see README).
          </p>
        )}
      </div>

      {result && (
        <div className="card mt-6 max-w-2xl space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-plum/50">Draft saved to Campaigns → Pending Approval</p>
          <div>
            <p className="text-xs text-plum/50">Subject</p>
            <p className="font-semibold">{result.subject}</p>
          </div>
          <div>
            <p className="text-xs text-plum/50">Body</p>
            <p className="whitespace-pre-wrap text-sm">{result.body}</p>
          </div>
          <div>
            <p className="text-xs text-plum/50">CTA</p>
            <p className="text-sm">{result.cta}</p>
          </div>
          {result.follow_up_body && (
            <div>
              <p className="text-xs text-plum/50">Follow-up email</p>
              <p className="whitespace-pre-wrap text-sm">{result.follow_up_body}</p>
            </div>
          )}
          {result.social_version && (
            <div>
              <p className="text-xs text-plum/50">Social version</p>
              <p className="whitespace-pre-wrap text-sm">{result.social_version}</p>
            </div>
          )}
          {result.blog_version && (
            <div>
              <p className="text-xs text-plum/50">Blog version</p>
              <p className="whitespace-pre-wrap text-sm">{result.blog_version}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
