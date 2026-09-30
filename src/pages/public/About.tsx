const TEAM = [
  "MDs", "Nurse Practitioners", "Registered Nurses", "LVNs", "CNAs",
  "Dietitians", "Physical Therapists", "Occupational Therapists", "Respiratory Therapists",
];

export default function About() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="font-serif text-4xl">About Angels Oasis</h1>

      <section className="mt-10">
        <h2 className="font-serif text-2xl">Our mission</h2>
        <p className="mt-3 text-plum/80">
          Angels Oasis provides 24-hour skilled nursing and medically complex care in a warm residential
          environment — hospital-level expertise with a home-like atmosphere, at a 3:1 caregiver-to-resident
          ratio.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-2xl">Our philosophy</h2>
        <p className="mt-3 text-plum/80">
          Residents with complex medical needs deserve both clinical excellence and a genuinely home-like
          setting. We built Angels Oasis around that combination, not a trade-off between the two.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-2xl">Our medical team</h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {TEAM.map((role) => (
            <li key={role} className="badge bg-plum/10 text-plum">{role}</li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-2xl">Why hospitals choose Angels Oasis</h2>
        <p className="mt-3 text-plum/80">
          A dedicated referral point of contact, fast response on placement questions, and a facility built
          specifically for medically complex patients who need more than a standard SNF can offer.
        </p>
      </section>
    </div>
  );
}
