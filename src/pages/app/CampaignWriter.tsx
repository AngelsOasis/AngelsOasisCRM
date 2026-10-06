import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import type { CampaignDay } from "../../lib/types";

const MAX_DRAFTS_PER_GENRE = 100;

const GENRES: { value: CampaignDay; label: string }[] = [
  { value: "monday", label: "Weekly Newsletter" },
  { value: "wednesday", label: "Facility Education" },
  { value: "friday", label: "Testimonials / Blog" },
];

interface DraftFields {
  title: string;
  subject: string;
  body: string;
  cta: string;
  followUpBody: string;
  socialVersion: string;
  blogVersion: string;
}

interface SavedDraft extends DraftFields {
  id: string;
  genre: CampaignDay;
  createdAt: string;
}

const EMPTY_DRAFT: DraftFields = {
  title: "",
  subject: "",
  body: "",
  cta: "",
  followUpBody: "",
  socialVersion: "",
  blogVersion: "",
};

const EMPTY_COUNTS: Record<CampaignDay, number> = {
  monday: 0,
  wednesday: 0,
  friday: 0,
};

export default function CampaignWriter() {
  const [genre, setGenre] = useState<CampaignDay>("monday");
  const [draft, setDraft] = useState<DraftFields>(EMPTY_DRAFT);
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [savedDrafts, setSavedDrafts] = useState<SavedDraft[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadDrafts() {
    setLoadingDrafts(true);
    setError(null);

    const { data: campaigns, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, day, title, created_at")
      .order("created_at", { ascending: false });

    if (campaignError) {
      setError(`Couldn't load saved drafts: ${campaignError.message}`);
      setLoadingDrafts(false);
      return;
    }

    const campaignById = new Map(
      (campaigns ?? []).map((campaign) => [campaign.id, campaign])
    );
    if (campaignById.size === 0) {
      setCounts(EMPTY_COUNTS);
      setSavedDrafts([]);
      setLoadingDrafts(false);
      return;
    }

    const { data: drafts, error: draftsError } = await supabase
      .from("content_drafts")
      .select("id, campaign_id, subject, body, cta, follow_up_body, social_version, blog_version, created_at")
      .in("campaign_id", [...campaignById.keys()])
      .order("created_at", { ascending: false });

    if (draftsError) {
      setError(`Couldn't load saved drafts: ${draftsError.message}`);
      setLoadingDrafts(false);
      return;
    }

    const nextCounts = { ...EMPTY_COUNTS };
    const nextSavedDrafts: SavedDraft[] = [];
    for (const saved of drafts ?? []) {
      const campaign = campaignById.get(saved.campaign_id);
      if (!campaign || !(campaign.day in nextCounts)) continue;
      const savedGenre = campaign.day as CampaignDay;
      nextCounts[savedGenre]++;
      nextSavedDrafts.push({
        id: saved.id,
        genre: savedGenre,
        title: campaign.title,
        subject: saved.subject ?? "",
        body: saved.body ?? "",
        cta: saved.cta ?? "",
        followUpBody: saved.follow_up_body ?? "",
        socialVersion: saved.social_version ?? "",
        blogVersion: saved.blog_version ?? "",
        createdAt: saved.created_at,
      });
    }

    setCounts(nextCounts);
    setSavedDrafts(nextSavedDrafts);
    setLoadingDrafts(false);
  }

  useEffect(() => {
    void loadDrafts();
  }, []);

  const genreDrafts = useMemo(
    () => savedDrafts.filter((saved) => saved.genre === genre),
    [savedDrafts, genre]
  );
  const atLimit = counts[genre] >= MAX_DRAFTS_PER_GENRE;

  function updateField(field: keyof DraftFields, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function saveDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || atLimit) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    const { data: genreCampaigns, error: countCampaignError } = await supabase
      .from("campaigns")
      .select("id")
      .eq("day", genre);
    if (countCampaignError) {
      setError(`Couldn't verify the genre draft limit: ${countCampaignError.message}`);
      setSaving(false);
      return;
    }

    if (genreCampaigns?.length) {
      const { count, error: countDraftError } = await supabase
        .from("content_drafts")
        .select("id", { count: "exact", head: true })
        .in("campaign_id", genreCampaigns.map((campaign) => campaign.id));
      if (countDraftError) {
        setError(`Couldn't verify the genre draft limit: ${countDraftError.message}`);
        setSaving(false);
        return;
      }
      if ((count ?? 0) >= MAX_DRAFTS_PER_GENRE) {
        setCounts((current) => ({ ...current, [genre]: count ?? MAX_DRAFTS_PER_GENRE }));
        setError(`This genre already has ${MAX_DRAFTS_PER_GENRE} saved drafts. Choose another genre.`);
        setSaving(false);
        return;
      }
    }

    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .insert({
        day: genre,
        send_date: new Date().toISOString().slice(0, 10),
        title: draft.title.trim(),
        is_library_draft: true,
      })
      .select("id")
      .single();

    if (campaignError) {
      setError(`Couldn't save the draft: ${campaignError.message}`);
      setSaving(false);
      return;
    }

    const { error: draftError } = await supabase.from("content_drafts").insert({
      campaign_id: campaign.id,
      subject: draft.subject.trim() || null,
      body: draft.body.trim() || null,
      cta: draft.cta.trim() || null,
      follow_up_body: draft.followUpBody.trim() || null,
      social_version: draft.socialVersion.trim() || null,
      blog_version: draft.blogVersion.trim() || null,
      generated_by_model: "manual",
    });

    if (draftError) {
      const { error: cleanupError } = await supabase
        .from("campaigns")
        .delete()
        .eq("id", campaign.id);
      setError(
        draftError.message.includes("maximum of 100 saved drafts")
          ? `This genre already has ${MAX_DRAFTS_PER_GENRE} saved drafts. Choose another genre.`
          : cleanupError
          ? `Couldn't save the draft: ${draftError.message}. The empty campaign record could not be removed: ${cleanupError.message}`
          : `Couldn't save the draft: ${draftError.message}`
      );
      setSaving(false);
      return;
    }

    setDraft(EMPTY_DRAFT);
    setMessage("Draft saved. It has not been sent.");
    await loadDrafts();
    setSaving(false);
  }

  return (
    <div>
      <h1 className="font-serif text-3xl">Campaign Writer</h1>
      <p className="mt-1 text-plum/60">
        Write and save campaign drafts yourself. No AI provider or Edge Function is used.
      </p>

      <form onSubmit={saveDraft} className="card mt-6 max-w-3xl space-y-4">
        <div>
          <label htmlFor="campaign-genre" className="block text-sm font-medium text-plum-dark">
            Genre
          </label>
          <select
            id="campaign-genre"
            className="mt-1 w-full rounded-lg border border-plum/20 px-3 py-2"
            value={genre}
            onChange={(event) => setGenre(event.target.value as CampaignDay)}
          >
            {GENRES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-plum/60" aria-live="polite">
            {counts[genre]} of {MAX_DRAFTS_PER_GENRE} saved in this genre
          </p>
        </div>

        <label className="block text-sm font-medium text-plum-dark">
          Draft title
          <input
            required
            maxLength={160}
            className="mt-1 w-full rounded-lg border border-plum/20 px-3 py-2 font-normal"
            value={draft.title}
            onChange={(event) => updateField("title", event.target.value)}
            placeholder="Give this draft a name"
          />
        </label>

        <label className="block text-sm font-medium text-plum-dark">
          Email subject
          <input
            maxLength={200}
            className="mt-1 w-full rounded-lg border border-plum/20 px-3 py-2 font-normal"
            value={draft.subject}
            onChange={(event) => updateField("subject", event.target.value)}
            placeholder="Subject line"
          />
        </label>

        <label className="block text-sm font-medium text-plum-dark">
          Email body
          <textarea
            rows={8}
            className="mt-1 w-full rounded-lg border border-plum/20 px-3 py-2 font-normal"
            value={draft.body}
            onChange={(event) => updateField("body", event.target.value)}
            placeholder="Write your email draft"
          />
        </label>

        <label className="block text-sm font-medium text-plum-dark">
          Call to action
          <input
            className="mt-1 w-full rounded-lg border border-plum/20 px-3 py-2 font-normal"
            value={draft.cta}
            onChange={(event) => updateField("cta", event.target.value)}
            placeholder="Optional call to action"
          />
        </label>

        <details className="rounded-lg border border-plum/10 p-3">
          <summary className="cursor-pointer text-sm font-medium text-plum-dark">
            Optional follow-up, social, and blog copy
          </summary>
          <div className="mt-4 space-y-4">
            <label className="block text-sm font-medium text-plum-dark">
              Follow-up email
              <textarea
                rows={4}
                className="mt-1 w-full rounded-lg border border-plum/20 px-3 py-2 font-normal"
                value={draft.followUpBody}
                onChange={(event) => updateField("followUpBody", event.target.value)}
              />
            </label>
            <label className="block text-sm font-medium text-plum-dark">
              Social post
              <textarea
                rows={4}
                className="mt-1 w-full rounded-lg border border-plum/20 px-3 py-2 font-normal"
                value={draft.socialVersion}
                onChange={(event) => updateField("socialVersion", event.target.value)}
              />
            </label>
            <label className="block text-sm font-medium text-plum-dark">
              Blog version
              <textarea
                rows={6}
                className="mt-1 w-full rounded-lg border border-plum/20 px-3 py-2 font-normal"
                value={draft.blogVersion}
                onChange={(event) => updateField("blogVersion", event.target.value)}
              />
            </label>
          </div>
        </details>

        {atLimit && (
          <p className="text-sm text-amber-700">
            This genre has reached its {MAX_DRAFTS_PER_GENRE}-draft limit. Choose another genre to save more.
          </p>
        )}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {message && <p role="status" className="text-sm text-plum">{message}</p>}

        <button type="submit" disabled={saving || loadingDrafts || atLimit} className="btn-primary">
          {saving ? "Saving…" : "Save draft"}
        </button>
      </form>

      <section className="mt-8 max-w-3xl">
        <h2 className="font-serif text-xl">
          Saved {GENRES.find((item) => item.value === genre)?.label} drafts
        </h2>
        {loadingDrafts ? (
          <p className="mt-3 text-sm text-plum/50">Loading saved drafts…</p>
        ) : genreDrafts.length === 0 ? (
          <p className="mt-3 text-sm text-plum/50">No drafts saved in this genre yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {genreDrafts.map((saved) => (
              <li key={saved.id} className="rounded-xl border border-plum/10 bg-white p-4">
                <details>
                  <summary className="cursor-pointer font-medium">
                    {saved.title}
                    {saved.subject && <span className="ml-2 font-normal text-plum/70">{saved.subject}</span>}
                  </summary>
                  <div className="mt-3 space-y-3 text-sm">
                    <p className="text-xs text-plum/50">
                      Saved {new Date(saved.createdAt).toLocaleString()} · Draft only, not sent
                    </p>
                    {saved.body && <p className="whitespace-pre-wrap">{saved.body}</p>}
                    {saved.cta && <p className="font-medium text-plum">{saved.cta}</p>}
                    {saved.followUpBody && (
                      <p className="whitespace-pre-wrap"><strong>Follow-up:</strong>{"\n"}{saved.followUpBody}</p>
                    )}
                    {saved.socialVersion && (
                      <p className="whitespace-pre-wrap"><strong>Social:</strong>{"\n"}{saved.socialVersion}</p>
                    )}
                    {saved.blogVersion && (
                      <p className="whitespace-pre-wrap"><strong>Blog:</strong>{"\n"}{saved.blogVersion}</p>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
