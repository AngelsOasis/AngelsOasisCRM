interface ConfigRequest {
  method?: string;
}

interface ConfigResponse {
  setHeader(name: string, value: string): void;
  status(code: number): ConfigResponse;
  json(body: unknown): void;
}

declare const process: {
  env: Record<string, string | undefined>;
};

function firstConfigured(...values: Array<string | undefined>): string {
  return values.find((value) => value?.trim())?.trim() ?? "";
}

export default function handler(_request: ConfigRequest, response: ConfigResponse) {
  response.setHeader("Cache-Control", "no-store");
  response.json({
    url: firstConfigured(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_URL
    ),
    key: firstConfigured(
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      process.env.VITE_SUPABASE_ANON_KEY,
      process.env.SUPABASE_PUBLISHABLE_KEY,
      process.env.SUPABASE_ANON_KEY,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ),
  });
}
