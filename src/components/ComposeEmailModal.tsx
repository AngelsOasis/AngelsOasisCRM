import { useEffect, useRef, useState } from "react";
import { Copy, Send, Sparkles, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

export interface ComposedEmail {
  subject: string;
  body: string;
  model: string;
  genre: string;
}

type ChatMessage =
  | { role: "user"; text: string; genre: string }
  | { role: "model"; email: ComposedEmail }
  | { role: "error"; text: string };

const SUGGESTIONS: Record<string, string[]> = {
  monday: [
    "This week's newsletter: open beds, a discharge-planning tip, and an invite to tour",
    "Monthly roundup for referral partners with facility updates and community news",
    "Thank our referral partners and invite them for a tour",
  ],
  wednesday: [
    "Explain what a CLHF is to a new hospital case manager",
    "Which patients are a good fit for ventilator care at Angels Oasis?",
    "Walk discharge planners through how a referral to us works",
  ],
  friday: [
    "Blog post: a day in the life of our nursing team",
    "Blog post on how families can prepare for a move from hospital to a CLHF",
    "Turn this testimonial into a post: (paste the real quote and who said it)",
  ],
};

// Gemini sees its earlier drafts as plain "Subject/Body" text so follow-ups
// like "make it shorter" revise the latest draft.
function toApiMessages(messages: ChatMessage[]) {
  return messages.flatMap((message) =>
    message.role === "user"
      ? [{ role: "user", text: message.text }]
      : message.role === "model"
      ? [{ role: "model", text: `Subject: ${message.email.subject}\n\n${message.email.body}` }]
      : []
  );
}

export default function ComposeEmailModal({ genres, initialGenre, onUse, onClose }: {
  genres: { value: string; label: string }[];
  initialGenre: string;
  onUse: (email: ComposedEmail) => void;
  onClose: () => void;
}) {
  const [genre, setGenre] = useState(initialGenre);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  async function send(text = input) {
    const prompt = text.trim();
    if (!prompt || sending) return;
    const next: ChatMessage[] = [...messages, { role: "user", text: prompt, genre }];
    setMessages(next);
    setInput("");
    setSending(true);

    let reply: ChatMessage;
    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch("/api/ai-compose", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ genre, messages: toApiMessages(next) }),
      });
      const result = (await response.json().catch(() => ({}))) as Partial<ComposedEmail> & { error?: string };
      reply = response.ok && result.body
        ? { role: "model", email: { subject: result.subject ?? "", body: result.body, model: result.model ?? "gemini", genre } }
        : { role: "error", text: result.error ?? `The AI composer returned ${response.status}.` };
    } catch {
      reply = { role: "error", text: "Couldn't reach the server. Check your connection and try again." };
    }
    setMessages((current) => [...current, reply]);
    setSending(false);
    inputRef.current?.focus();
  }

  async function copy(email: ComposedEmail, index: number) {
    try {
      await navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${email.body}`);
      setCopiedIndex(index);
      window.setTimeout(() => setCopiedIndex((current) => (current === index ? null : current)), 1500);
    } catch {
      // Clipboard can be blocked; the text is still selectable.
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="compose-email-title"
        className="flex h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-plum/10 px-6 py-4">
          <div>
            <h2 id="compose-email-title" className="flex items-center gap-2 font-sans text-lg font-semibold text-ink">
              <Sparkles className="h-5 w-5 text-forest" /> Compose email
            </h2>
            <p className="text-xs text-plum/60">Gemini · Drafts are never sent from here</p>
          </div>
          <label className="ml-auto flex items-center gap-2 text-sm text-plum/80">
            <span className="hidden sm:inline">Genre</span>
            <select value={genre} onChange={(e) => setGenre(e.target.value)} disabled={sending}
              aria-label="Genre for the next draft"
              className="rounded-lg border border-plum/20 px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-forest">
              {genres.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <button onClick={onClose} aria-label="Close"
            className="rounded-lg border border-plum/20 p-1.5 text-ink transition hover:bg-plum/5 focus:outline-none focus:ring-2 focus:ring-plum">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-cream/40 px-6 py-5" aria-live="polite">
          {messages.length === 0 && (
            <div className="mx-auto max-w-md pt-8 text-center">
              <p className="font-serif text-xl text-ink">What should this email say?</p>
              <p className="mt-1 text-sm text-plum/60">
                Describe the email, then ask for changes like “make it shorter” or “warmer tone”.
              </p>
              <div className="mt-5 space-y-2">
                {(SUGGESTIONS[genre] ?? []).map((suggestion) => (
                  <button key={suggestion} type="button" onClick={() => send(suggestion)}
                    className="block w-full rounded-xl border border-plum/15 bg-white px-4 py-2.5 text-left text-sm text-ink transition hover:border-forest hover:bg-sage-light/40">
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message, index) =>
            message.role === "user" ? (
              <div key={index} className="flex justify-end">
                <p className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-forest px-4 py-2.5 text-sm text-white">
                  {message.text}
                </p>
              </div>
            ) : message.role === "error" ? (
              <p key={index} role="alert" className="max-w-[85%] rounded-2xl rounded-bl-sm border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                {message.text}
              </p>
            ) : (
              <div key={index} className="max-w-[90%] rounded-2xl rounded-bl-sm border border-plum/10 bg-white px-4 py-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-plum/50">
                  {genres.find((item) => item.value === message.email.genre)?.label} · Subject
                </p>
                <p className="font-medium text-ink">{message.email.subject || "(no subject)"}</p>
                <p className="mt-3 whitespace-pre-wrap text-sm text-ink">{message.email.body}</p>
                <div className="mt-3 flex flex-wrap gap-2 border-t border-plum/10 pt-3">
                  <button type="button" onClick={() => onUse(message.email)}
                    className="rounded-full bg-forest px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-forest-deep">
                    Use this draft
                  </button>
                  <button type="button" onClick={() => copy(message.email, index)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-plum/20 px-4 py-1.5 text-sm text-ink transition hover:bg-plum/5">
                    <Copy className="h-4 w-4" /> {copiedIndex === index ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            )
          )}

          {sending && (
            <p className="inline-flex items-center gap-2 rounded-2xl rounded-bl-sm border border-plum/10 bg-white px-4 py-2.5 text-sm text-plum/60">
              <Sparkles className="h-4 w-4 animate-pulse text-forest" /> Writing…
            </p>
          )}
          <div ref={endRef} />
        </div>

        <form className="border-t border-plum/10 px-6 py-4" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <div className="flex items-end gap-2 rounded-2xl border border-plum/20 bg-white p-2 focus-within:ring-2 focus-within:ring-forest">
            <textarea ref={inputRef} rows={2} maxLength={4000} value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              aria-label="Describe the email"
              placeholder={messages.length ? "Ask for changes…" : "e.g. Newsletter about our new Riverside location opening in November"}
              className="max-h-40 min-h-[2.5rem] flex-1 resize-none border-0 px-2 py-1.5 text-sm focus:outline-none focus:ring-0" />
            <button type="submit" disabled={sending || !input.trim()} aria-label="Send"
              className="rounded-full bg-forest p-2.5 text-white transition hover:bg-forest-deep disabled:opacity-40">
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-xs text-plum/50">
            Enter to send · Shift+Enter for a new line · Never include patient information.
          </p>
        </form>
      </div>
    </div>
  );
}
