import { NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth";

const NAV_ITEMS = [
  { to: "/app", label: "Dashboard", end: true },
  { to: "/app/leads", label: "Leads" },
  { to: "/app/hospitals-map", label: "Hospitals Map" },
  { to: "/app/bed-space-availability", label: "Bed Space Availability" },
  { to: "/app/campaigns", label: "Campaigns" },
  { to: "/app/campaign-writer", label: "Campaign Writer" },
  { to: "/app/email-analytics", label: "Email Analytics" },
  { to: "/app/facilities", label: "Facilities" },
  { to: "/app/contacts", label: "Contacts" },
  { to: "/app/settings", label: "Settings" },
];

export default function Sidebar() {
  const { signOut } = useAuth();

  return (
    <aside className="flex h-screen w-64 flex-shrink-0 flex-col bg-plum text-white">
      <div className="px-6 py-6">
        <p className="font-serif text-lg font-semibold text-white">Angels Oasis</p>
        <p className="text-xs text-white/60">Referral Outreach AI</p>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `block rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive ? "bg-ink text-white" : "text-white/75 hover:bg-plum-light hover:text-white"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 px-3 py-4">
        <button
          onClick={() => signOut()}
          className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-white/75 hover:bg-ink hover:text-white"
        >
          Log out
        </button>
      </div>
    </aside>
  );
}
