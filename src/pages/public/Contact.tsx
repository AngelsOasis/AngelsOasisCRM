import { useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function Contact() {
  const [form, setForm] = useState({ facility_name: "", contact_person: "", email: "", phone: "", notes: "" });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    // Public referral submissions land as a new lead, source = manual, status = new.
    const { error } = await supabase.from("leads").insert({
      facility_name: form.facility_name,
      contact_person: form.contact_person,
      email: form.email,
      phone: form.phone,
      notes: form.notes,
      category: "hospital",
      status: "new",
      source: "manual",
    });
    if (error) setError(error.message);
    else setSubmitted(true);
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-serif text-4xl">Contact</h1>
      <p className="mt-3 text-plum/70">
        (323) 213-2831 &middot; admin@angelsoasisclhf.com &middot; 12018 Sarah St., Valley Village, CA 91607
      </p>

      {submitted ? (
        <div className="card mt-8">
          <p className="font-medium text-plum-dark">Thank you — our admissions team will be in touch.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card mt-8 space-y-4">
          <input required placeholder="Your organization" className="w-full rounded-lg border border-plum/20 px-3 py-2"
            value={form.facility_name} onChange={(e) => setForm({ ...form, facility_name: e.target.value })} />
          <input required placeholder="Your name" className="w-full rounded-lg border border-plum/20 px-3 py-2"
            value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
          <input required type="email" placeholder="Email" className="w-full rounded-lg border border-plum/20 px-3 py-2"
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input placeholder="Phone" className="w-full rounded-lg border border-plum/20 px-3 py-2"
            value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <textarea placeholder="How can we help? (e.g. patient referral details)" rows={4}
            className="w-full rounded-lg border border-plum/20 px-3 py-2"
            value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="btn-primary">Submit</button>
        </form>
      )}
    </div>
  );
}
