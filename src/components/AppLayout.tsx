import type { ReactNode } from "react";
import Sidebar from "./Sidebar";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    // Fixed to the viewport so only <main> scrolls and the sidebar stays put.
    <div className="flex h-screen overflow-hidden bg-cream">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-9 lg:py-8">{children}</main>
    </div>
  );
}
