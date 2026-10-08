import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Serves the Vercel functions in api/ during `vite dev`, so features backed by
// them (e.g. the Hospitals Map search) work locally without `vercel dev`.
function vercelApiRoutes(env: Record<string, string>): Plugin {
  return {
    name: "vercel-api-routes",
    configureServer(server) {
      // Vercel gives functions their environment variables; locally they come
      // from .env files. Server-only keys (e.g. TAVILY_KEY) stay out of the
      // browser bundle — only the VITE_ values defined below are exposed.
      const processEnv = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
      for (const [key, value] of Object.entries(env)) processEnv[key] ??= value;

      server.middlewares.use("/api", async (incoming, res, next) => {
        // @types/node isn't installed, so describe the request fields we use.
        const req = incoming as unknown as AsyncIterable<Uint8Array> & {
          url?: string;
          method?: string;
          headers: Record<string, string | string[] | undefined>;
        };
        const route = req.url?.split("?")[0].replace(/^\/+|\/+$/g, "");
        if (!route || !/^[\w-]+$/.test(route)) return next();

        let handler: (request: unknown, response: unknown) => unknown;
        try {
          handler = (await server.ssrLoadModule(`/api/${route}.ts`)).default;
        } catch {
          return next();
        }

        const decoder = new TextDecoder();
        let raw = "";
        for await (const chunk of req) raw += decoder.decode(chunk, { stream: true });
        raw += decoder.decode();
        let body: unknown = raw || undefined;
        if (raw && String(req.headers["content-type"]).includes("application/json")) {
          try {
            body = JSON.parse(raw);
          } catch {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "Invalid JSON body." }));
            return;
          }
        }

        const response = {
          setHeader: (name: string, value: string) => res.setHeader(name, value),
          status(code: number) {
            res.statusCode = code;
            return response;
          },
          json(payload: unknown) {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(payload));
          },
        };
        try {
          await handler({ method: req.method, body, headers: req.headers }, response);
        } catch (error) {
          server.config.logger.error(String(error));
          if (!res.writableEnded) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: "API route failed." }));
          }
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  // Explicitly expose only the public Supabase URL and client key. This also
  // supports Supabase/Vercel's unprefixed names without exposing other secrets.
  const supabaseUrl =
    env.VITE_SUPABASE_URL || env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseKey =
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    env.VITE_SUPABASE_ANON_KEY ||
    env.SUPABASE_PUBLISHABLE_KEY ||
    env.SUPABASE_ANON_KEY ||
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";

  return {
    plugins: [react(), vercelApiRoutes(env)],
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabaseKey),
    },
  };
});
