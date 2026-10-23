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
// GEMINI_API_KEY also work). When one key is rate-limited or rejected, the
// next one is tried.
export const config = { maxDuration: 60 };

const MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_TURNS = 20;
const MAX_TURN_CHARS = 8_000;

const FACILITY_CONTEXT =
  "Angels Oasis is a licensed Congregate Living Health Facility (CLHF) — tagline 'Home-Like Care. " +
  "Hospital-Level Expertise.', 24-hour skilled nursing and medically complex care, 3:1 " +
  "caregiver-to-resident ratio. Referral phone: (323) 213-2831. Warm, professional, trustworthy tone. " +
  "Write plain text email (no markdown), addressed to hospital and referral partners, ending with a clear " +
  "call to action. Never invent statistics, bed counts, people, quotes or patient stories, and never include " +
  "patient information. When the user asks for changes, return the full revised email.";

const GENRE_PROMPTS: Record<string, string> = {
  monday:
    "You write Angels Oasis's weekly newsletter for hospital and referral-partner leads. Cover facility " +
    "updates, healthcare industry information, CLHF education, patient-transition information and community updates.",
  wednesday:
    "You write Angels Oasis's facility-education email for hospitals and referral partners. Explain what a CLHF " +
    "is, when patients need specialized residential care, ventilator care, skilled nursing services, hospice " +
    "support, medical complexity care, and why referral sources choose Angels Oasis.",
  friday:
    "You write Angels Oasis's testimonials/blog email. Use ONLY real testimonial text the user provides — never " +
    "invent a quote or a person's story. If none is provided, write a short educational blog piece instead.",
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

type GeminiResult = { subject: string; body: string } | { retry: boolean; error: string };

async function callGemini(apiKey: string, system: string, turns: Turn[]): Promise<GeminiResult> {
  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
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
            properties: { subject: { type: "STRING" }, body: { type: "STRING" } },
            required: ["subject", "body"],
          },
        },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    return { retry: true, error: error instanceof Error ? error.message : "Request failed" };
  }

  const responseText = await response.text();
  if (!response.ok) {
    // 400 means the request itself is bad, so another key won't help.
    return { retry: response.status !== 400, error: `Gemini responded ${response.status}: ${responseText.slice(0, 300)}` };
  }
  try {
    const text = JSON.parse(responseText).candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const parsed = JSON.parse(text) as { subject?: unknown; body?: unknown };
    const body = typeof parsed.body === "string" ? parsed.body.trim() : "";
    if (!body) return { retry: false, error: "The AI returned an empty draft. Try rephrasing your request." };
    const subject = typeof parsed.subject === "string" ? parsed.subject.trim().slice(0, 200) : "";
    return { subject, body };
  } catch {
    return { retry: false, error: "The AI returned a draft that couldn't be read. Try again." };
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
  let lastError = "";
  for (const [index, key] of keys.entries()) {
    const result = await callGemini(key, system, turns);
    if ("body" in result) {
      response.json({ ...result, model: MODEL, keyIndex: index + 1 });
      return;
    }
    lastError = result.error;
    console.error(`ai-compose: Gemini key ${index + 1} failed: ${result.error}`);
    if (!result.retry) break;
  }

  response.status(502).json({
    error: lastError.includes(" 429")
      ? "All Gemini keys hit their free limit. Wait a minute and try again."
      : lastError.startsWith("Gemini responded")
      ? "The AI service couldn't write this draft. Try again in a moment."
      : lastError,
  });
}
