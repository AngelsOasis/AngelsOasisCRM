import { NavLink } from "react-router-dom";
import {
  BarChart3,
  BedDouble,
  Building2,
  ContactRound,
  LayoutDashboard,
  MapPinned,
  Megaphone,
  Settings,
  UsersRound,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { BrandLogo } from "./common/BrandLogo";

const NAV_ITEMS = [
  { to: "/app", label: "Dashboard", end: true, icon: LayoutDashboard },
  { to: "/app/leads", label: "Leads", icon: UsersRound },
  { to: "/app/hospitals-map", label: "Hospitals Map", icon: MapPinned },
  { to: "/app/bed-space-availability", label: "Bed Space Availability", icon: BedDouble },
  { to: "/app/campaigns", label: "Campaigns", icon: Megaphone },
  { to: "/app/campaign-writer", label: "Campaign Writer", icon: ContactRound },
  { to: "/app/email-analytics", label: "Email Analytics", icon: BarChart3 },
  { to: "/app/facilities", label: "Facilities", icon: Building2 },
  { to: "/app/contacts", label: "Contacts", icon: ContactRound },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const { signOut } = useAuth();

  return (
    <aside className="flex h-screen w-64 flex-shrink-0 flex-col border-r border-white/10 bg-plum-dark text-cream">
      <div className="border-b border-white/10 px-5 py-6">
        <BrandLogo size="md" theme="dark" />
        <p className="mt-3 text-[11px] font-medium tracking-wide text-cream/65">REFERRAL OUTREACH CRM</p>
      </div>
      <nav aria-label="Main navigation" className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-cream/45">
          Workspace
        </p>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${
                isActive
                  ? "bg-forest text-white shadow-sm"
                  : "text-cream/75 hover:bg-white/10 hover:text-white"
              }`
            }
          >
            <item.icon aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 px-3 py-4">
        <button
          onClick={() => signOut()}
          className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-cream/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          Log out
        </button>
      </div>
    </aside>
  );
}
