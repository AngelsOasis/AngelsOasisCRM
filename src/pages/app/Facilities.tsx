import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import type { Facility } from "../../lib/types";

export default function Facilities() {
  const [facilities, setFacilities] = useState<Facility[]>([]);

  useEffect(() => {
    supabase.from("facilities").select("*").then(({ data }) => setFacilities((data as Facility[]) ?? []));
  }, []);

  return (
    <div>
      <h1 className="font-serif text-3xl">Facilities</h1>
      <p className="mt-1 text-plum/60">Angels Oasis locations used for radius search and distance calculations.</p>

      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {facilities.map((f) => (
          <div key={f.id} className="card">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl">{f.name}</h2>
              <span className={`badge ${f.status === "open" ? "bg-ink text-white" : "bg-plum-50 text-plum"}`}>
                {f.status === "open" ? "Open" : "Coming soon"}
              </span>
            </div>
            <p className="mt-2 text-sm text-plum/70">{f.address ? `${f.address}, ` : ""}{f.city}, {f.state} {f.zip}</p>
            <p className="mt-1 text-sm text-plum/50">{f.coverage_area}</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {(f.features ?? []).map((feat) => (
                <li key={feat} className="badge bg-plum/5 text-plum">{feat}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}