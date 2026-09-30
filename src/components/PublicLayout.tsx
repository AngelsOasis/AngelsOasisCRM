import type { ReactNode } from "react";
import { Link } from "react-router-dom";

const LINKS = [
  { to: "/", label: "Home" },
  { to: "/about", label: "About" },
  { to: "/services", label: "Services" },
  { to: "/locations", label: "Locations" },
  { to: "/referral-partners", label: "Referral Partners" },
  { to: "/contact", label: "Contact" },
];

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-plum text-cream">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="font-serif text-xl font-semibold text-white">
            Angels Oasis
          </Link>
          <nav className="hidden gap-6 md:flex">
            {LINKS.map((l) => (
              <Link key={l.to} to={l.to} className="text-sm font-medium text-cream/85 hover:text-white">
                {l.label}
              </Link>
            ))}
          </nav>
          <Link to="/contact" className="btn-primary !px-4 !py-2 text-sm">
            Refer A Patient
          </Link>
        </div>
      </header>

      <main>{children}</main>

      <footer className="bg-plum-dark py-10 text-cream/80">
        <div className="mx-auto max-w-6xl px-6 text-sm">
          <p className="font-serif text-base text-white">Angels Oasis</p>
          <p className="mt-1">12018 Sarah St., Valley Village, CA 91607</p>
          <p className="mt-1">
            (323) 213-2831 &middot; admin@angelsoasisclhf.com
          </p>
          <p className="mt-4 text-xs text-cream/50">
            &copy; {new Date().getFullYear()} Angels Oasis. Licensed Congregate Living Health Facility (CLHF).
          </p>
        </div>
      </footer>
    </div>
  );
}
