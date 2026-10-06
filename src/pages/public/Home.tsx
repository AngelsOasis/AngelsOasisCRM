import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div>
      <section
        className="relative flex min-h-[560px] items-center bg-cover bg-center"
        style={{
          backgroundImage:
            "linear-gradient(rgba(51,20,42,0.75), rgba(51,20,42,0.75)), url(https://images.unsplash.com/photo-1576091160550-2173dba999ef?q=80&w=1600&auto=format&fit=crop)",
        }}
      >
        <div className="mx-auto max-w-3xl px-6 py-24 text-center text-white">
          <h1 className="font-serif text-4xl leading-tight sm:text-5xl">
            Home-Like Care. Hospital-Level Expertise.
          </h1>
          <p className="mt-6 text-lg text-cream/90">
            Specialized 24-hour skilled nursing and medically complex care in a compassionate residential
            environment.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link to="/contact" className="btn-primary">Refer A Patient</Link>
            <Link to="/contact" className="btn-secondary">Schedule A Visit</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center font-serif text-3xl">Why hospitals choose Angels Oasis</h2>
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {[
            { title: "3:1 caregiver-to-resident ratio", body: "Meaningfully more attention than a typical skilled nursing facility." },
            { title: "Hospital-level medical care", body: "Ventilator care, tracheostomy support, IV therapy, and more — in a residential setting." },
            { title: "A true discharge partner", body: "We work directly with case managers and discharge planners to make transitions smooth." },
          ].map((f) => (
            <div key={f.title} className="card text-center">
              <h3 className="font-serif text-xl">{f.title}</h3>
              <p className="mt-2 text-sm text-plum/70">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-plum/5 py-16">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <h2 className="font-serif text-3xl">Our services at a glance</h2>
          <p className="mx-auto mt-4 max-w-2xl text-plum/70">
            24-hour skilled nursing, hospice, ventilator and tracheostomy care, IV therapy, pain management,
            physical/occupational/respiratory therapy, and full medical, dietary, and social-services
            support — delivered by MDs, nurse practitioners, RNs, LVNs, and CNAs.
          </p>
          <Link to="/services" className="mt-6 inline-block font-semibold text-plum underline">
            View all services →
          </Link>
        </div>
      </section>
    </div>
  );
}
