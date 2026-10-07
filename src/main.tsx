import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import AppErrorBoundary from "./components/AppErrorBoundary";
import "./styles/index.css";
import "leaflet/dist/leaflet.css";

const root = ReactDOM.createRoot(document.getElementById("root")!);

async function startApp() {
  try {
    const response = await fetch("/api/config", { cache: "no-store" });
    if (response.ok) {
      const config: unknown = await response.json();
      if (config && typeof config === "object") {
        const { url, key } = config as { url?: unknown; key?: unknown };
        window.__ANGELS_OASIS_CONFIG__ = {
          supabaseUrl: typeof url === "string" ? url : undefined,
          supabaseKey: typeof key === "string" ? key : undefined,
        };
      }
    }
  } catch (error) {
    console.warn("[startup] Runtime config endpoint unavailable; using build-time config.", error);
  }

  const { default: App } = await import("./App");
  root.render(
    <React.StrictMode>
      <AppErrorBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppErrorBoundary>
    </React.StrictMode>
  );
}

startApp().catch((error: unknown) => {
  console.error("[startup] The application could not be loaded.", error);
  root.render(
    <main className="flex min-h-screen items-center justify-center bg-white px-6 text-ink">
      <div className="max-w-lg rounded-2xl border border-ink/10 p-8 shadow-sm">
        <h1 className="font-serif text-2xl text-plum-dark">The app couldn’t load</h1>
        <p className="mt-3 text-sm text-plum/70">
          The app failed during startup. Reload the page, and check the browser console if this
          keeps happening.
        </p>
        <button className="btn-primary mt-6" onClick={() => window.location.reload()}>
          Reload app
        </button>
      </div>
    </main>
  );
});
