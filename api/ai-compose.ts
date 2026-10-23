interface ApiRequest {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}

interface ApiResponse {
  setHeader(name: string, value: string): void;
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

declare const process: {
  env: Record<string, string | undefined>;
};

// Campaign Writer → "Compose email". A chat-style composer: the browser sends
// the whole conversation each turn and gets back a subject + body. Nothing is
// saved or sent here; the user picks a draft and saves it from the page.
// Gemini keys are Vercel secrets GEMINI_API_KEY_1..3 (GEMINI_API_KEY1..3 or
// GEMINI_API_KEY also work). Models are tried in order: an overloaded (503)
// or retired (404) model moves on to the next model, a rate-limited (429) or
// rejected key moves on to the next key. GEMINI_MODELS (comma-separated)
// overrides the model list.
export const config = { maxDuration: 60 };

const MODELS = (process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || "gemini-3.8-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite")
  .split(",").map((model) => model.trim()).filter(Boolean);
const REQUEST_TIMEOUT_MS = 20_000;
const TOTAL_BUDGET_MS = 55_000;
const MAX_TURNS = 20;
const MAX_TURN_CHARS = 8_000;

const FACILITY_CONTEXT =
  "Angels Oasis is a licensed Congregate Living Health Facility (CLHF) — tagline 'Home-Like Care. " +
  "Hospital-Level Expertise.', 24-hour skilled nursing and medically complex care, 3:1 " +
  "caregiver-to-resident ratio. Referral phone: (323) 213-2831. Warm, professional, trustworthy tone. " +
  "Write plain text (no markdown, no asterisks or # symbols) for hospital and referral partners. Return a " +
  "greeting line (e.g. 'Dear Referral Partners,'), an intro paragraph, the sections described above (each with a " +
  "short heading, 1 to 2 paragraphs of 2 to 4 sentences, and optional bullets of a few words each), a closing " +
  "paragraph with a clear call to action, and a sign-off (e.g. 'Warm regards,\\nThe Angels Oasis Team'). Never " +
  "invent statistics, bed counts, dates, events, people, quotes or patient stories — only use facts given here or " +
  "by the user — and never include patient information. When the user asks for changes, return the full revised email.";

// Each genre sets its own topic and layout. The user's request can still
// override the layout ("no headings", "make it a short note").
const GENRE_PROMPTS: Record<string, string> = {
  monday:
    "You write Angels Oasis's Weekly Newsletter for hospital and referral-partner leads. Layout: 3 to 4 short " +
    "newsletter sections with topic headings such as 'Facility Updates', 'Industry Insights', 'Transition Tips' or " +
    "'Community News', picked to fit the user's request. Keep each section brief and skimmable; bullets are " +
    "welcome for quick facts. The subject reads like a newsletter issue (e.g. 'Angels Oasis Weekly: ...').",
  wednesday:
    "You write Angels Oasis's Facility Education email for hospitals, case managers and discharge planners. " +
    "Teach one topic in depth: what a CLHF is, when patients need specialized residential care, ventilator care, " +
    "skilled nursing, hospice support, medical complexity care, or why referral sources choose Angels Oasis. " +
    "Layout: 3 sections whose headings are questions a case manager would ask (e.g. 'What is a CLHF?', 'Which " +
    "patients are a good fit?', 'How does a referral work?'). Use bullets for criteria, services or steps. The " +
    "subject names the lesson (e.g. 'Understanding CLHF Care: ...').",
  friday:
    "You write Angels Oasis's Testimonials / Blog email, styled as a short blog article. Layout: a headline-style " +
    "subject, a story-like intro, and 2 to 3 sections with descriptive headings. If the user provides real " +
    "testimonial text, quote it word for word in its own section headed 'In Their Words' with the attribution " +
    "they give, and build the article around it. If no testimonial is provided, write an educational or " +
    "behind-the-scenes blog piece instead and never write a quote, review or person's story yourself.",
};

type Turn = { role: "user" | "model"; text: string };

function firstConfigured(...values: Array<string | undefined>): string {
  return values.find((value) => value?.trim())?.trim() ?? "";
}

function header(request: ApiRequest, name: string): string {
  const value = request.headers?.[name];
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function geminiKeys(): string[] {
  const env = process.env;
  const keys = [
    env.GEMINI_API_KEY_1, env.GEMINI_API_KEY_2, env.GEMINI_API_KEY_3,
    env.GEMINI_API_KEY1, env.GEMINI_API_KEY2, env.GEMINI_API_KEY3,
    env.GEMINI_API_KEY,
  ].map((key) => key?.trim()).filter((key): key is string => !!key);
  return [...new Set(keys)];
}

// Only signed-in app users may spend the Gemini quota.
async function isSignedIn(request: ApiRequest): Promise<boolean | "unconfigured"> {
  const token = header(request, "authorization").replace(/^Bearer\s+/i, "");
  const supabaseUrl = firstConfigured(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_URL).replace(/\/+$/, "");
  const key = firstConfigured(
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    process.env.VITE_SUPABASE_ANON_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_ANON_KEY
  );
  if (!supabaseUrl || !key) return "unconfigured";
  if (!token) return false;
  const user = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  }).catch(() => null);
  return !!user?.ok;
}

function toTurns(value: unknown): Turn[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_TURNS).flatMap((item): Turn[] => {
    if (!item || typeof item !== "object") return [];
    const { role, text } = item as { role?: unknown; text?: unknown };
    if ((role !== "user" && role !== "model") || typeof text !== "string" || !text.trim()) return [];
    return [{ role, text: text.slice(0, MAX_TURN_CHARS) }];
  });
}

// Builds the plain-text email: greeting, intro, sections (UPPERCASE heading,
// paragraphs, then "•" bullets), closing and a two-line sign-off, all
// blank-line separated. Lite models often pack a section into one long
// paragraph, so a paragraph longer than four sentences is split into threes.
function formatBody(email: Record<string, unknown>): string {
  const clean = (value: unknown) => (typeof value === "string" ? value.replace(/[*#]+/g, "").trim() : "");
  const list = (value: unknown) => (Array.isArray(value) ? value : [value]).map(clean).filter(Boolean);
  const paragraphs = (value: unknown) => list(value).flatMap((paragraph) => {
    // A piece that doesn't start like a sentence (", we provide…" after the
    // tagline's periods) stays with the one before it.
    const sentences = (paragraph.match(/[^.!?]+(?:[.!?]+["')\]]*|$)\s*/g) ?? [paragraph])
      .map((s) => s.trim()).filter(Boolean)
      .reduce<string[]>((merged, s) => {
        if (merged.length && !/^["'(\[]?[A-Z0-9]/.test(s)) merged[merged.length - 1] += s.match(/^[,;:)]/) ? s : ` ${s}`;
        else merged.push(s);
        return merged;
      }, []);
    if (sentences.length <= 4) return [paragraph];
    const groups: string[] = [];
    for (let i = 0; i < sentences.length; i += 3) groups.push(sentences.slice(i, i + 3).join(" "));
    return groups;
  });

  const sections = (Array.isArray(email.sections) ? email.sections : []).flatMap((section) => {
    if (!section || typeof section !== "object") return [];
    const { heading, paragraphs: text, bullets } = section as Record<string, unknown>;
    const body = paragraphs(text);
    const points = list(bullets).map((bullet) => `• ${bullet.replace(/^[-•]\s*/, "")}`);
    if (!body.length && !points.length) return [];
    const title = clean(heading).replace(/:$/, "").toUpperCase();
    return [[title, ...body, points.join("\n")].filter(Boolean).join("\n\n")];
  });
  const middle = [...paragraphs(email.intro), ...sections, ...paragraphs(email.closing)];
  if (!middle.length) return "";

  const signOff = clean(email.signOff);
  return [
    clean(email.greeting),
    ...middle,
    signOff.includes("\n") ? signOff : signOff.replace(/,\s*/, ",\n"),
  ].filter(Boolean).join("\n\n");
}

// next: "key" tries the same model with the next key, "model" skips to the
// next model, "stop" means retrying won't help.
type GeminiResult =
  | { subject: string; body: string }
  | { next: "key" | "model" | "stop"; status: number; error: string };

function googleMessage(responseText: string): string {
  try {
    const message = JSON.parse(responseText)?.error?.message;
    if (typeof message === "string") return message.slice(0, 300);
  } catch {
    // not JSON
  }
  return responseText.slice(0, 300);
}

async function callGemini(model: string, apiKey: string, system: string, turns: Turn[], timeoutMs: number): Promise<GeminiResult> {
  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: turns.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
        generationConfig: {
          temperature: 0.7,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              subject: { type: "STRING" },
              greeting: { type: "STRING" },
              intro: { type: "STRING" },
              sections: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    heading: { type: "STRING" },
                    paragraphs: { type: "ARRAY", items: { type: "STRING" } },
                    bullets: { type: "ARRAY", items: { type: "STRING" } },
                  },
                  required: ["heading", "paragraphs"],
                },
              },
              closing: { type: "STRING" },
              signOff: { type: "STRING" },
            },
            required: ["subject", "greeting", "intro", "sections", "closing", "signOff"],
          },
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return { next: "model", status: 0, error: timedOut ? `${model} took too long to answer.` : `Couldn't reach Gemini (${model}).` };
  }

  const responseText = await response.text();
  if (!response.ok) {
    const message = googleMessage(responseText);
    const badKey = /api key/i.test(message);
    const next =
      response.status === 429 || response.status === 403 || badKey ? "key"
      : response.status === 404 || response.status >= 500 ? "model"
      : "stop";
    return { next, status: response.status, error: `${model}: ${message}` };
  }
  try {
    const text = JSON.parse(responseText).candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const body = formatBody(parsed);
    if (!body) return { next: "model", status: 200, error: "The AI returned an empty draft. Try rephrasing your request." };
    const subject = typeof parsed.subject === "string" ? parsed.subject.trim().slice(0, 200) : "";
    return { subject, body };
  } catch {
    return { next: "model", status: 200, error: "The AI returned a draft that couldn't be read. Try again." };
  }
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") {
    response.status(405).json({ error: "Use POST." });
    return;
  }

  const signedIn = await isSignedIn(request);
  if (signedIn === "unconfigured") {
    response.status(500).json({ error: "Supabase URL and publishable key are not configured on the server." });
    return;
  }
  if (!signedIn) {
    response.status(401).json({ error: "Sign in again to use the AI composer." });
    return;
  }

  const keys = geminiKeys();
  if (keys.length === 0) {
    response.status(500).json({ error: "No Gemini API key is configured. Add GEMINI_API_KEY_1 in Vercel and redeploy." });
    return;
  }

  let body: { genre?: unknown; messages?: unknown } | undefined;
  try {
    body = (typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body) as typeof body;
  } catch {
    response.status(400).json({ error: "Invalid JSON body." });
    return;
  }
  const genrePrompt = GENRE_PROMPTS[String(body?.genre)];
  const turns = toTurns(body?.messages);
  if (!genrePrompt) {
    response.status(400).json({ error: "Unknown genre." });
    return;
  }
  if (turns.length === 0 || turns[turns.length - 1].role !== "user") {
    response.status(400).json({ error: "Describe the email you want." });
    return;
  }

  const system = `${genrePrompt} ${FACILITY_CONTEXT}`;
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const failures: Array<{ status: number; error: string }> = [];
  attempts: for (const model of MODELS) {
    for (const [index, key] of keys.entries()) {
      const remaining = deadline - Date.now();
      if (remaining < 3_000) break attempts;
      const result = await callGemini(model, key, system, turns, Math.min(REQUEST_TIMEOUT_MS, remaining));
      if ("body" in result) {
        response.json({ ...result, model, keyIndex: index + 1 });
        return;
      }
      failures.push(result);
      console.error(`ai-compose: ${model} with key ${index + 1} failed (${result.status}): ${result.error}`);
      if (result.next === "stop") break attempts;
      if (result.next === "model") continue attempts;
    }
  }

  const last = failures[failures.length - 1];
  response.status(502).json({
    error: !last
      ? "The AI took too long to answer. Try again."
      : failures.every((failure) => failure.status === 429)
      ? "All Gemini keys hit their free limit. Wait a minute and try again."
      : failures.every((failure) => failure.status === 503 || failure.status === 0)
      ? "Gemini is busy right now. Wait a moment and try again."
      : `The AI couldn't write this draft. ${last.error}`,
  });
}
