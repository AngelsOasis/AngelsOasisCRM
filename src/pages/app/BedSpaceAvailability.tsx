import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import type { Facility } from "../../lib/types";

export default function BedSpaceAvailability() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("facilities")
      .select("*")
      .then(({ data }) => {
        setFacilities((data as Facility[]) ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <div>
      <h1 className="font-serif text-3xl">Bed Space Availability</h1>
      <p className="mt-1 text-plum/60">Bed availability by Angels Oasis facility.</p>

      <div className="card mt-6">
        <p className="text-sm text-plum/70">
          This system does not currently store licensed capacity, occupied beds, or open-bed counts.
        </p>
      </div>

      <div className="mt-6 divide-y divide-plum/10 rounded-lg border border-plum/10 bg-white">
        {loading ? (
          <p className="p-4 text-sm text-plum/60">Loading facilities...</p>
        ) : facilities.length === 0 ? (
          <p className="p-4 text-sm text-plum/60">No facilities found.</p>
        ) : (
          facilities.map((facility) => (
            <div key={facility.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-medium text-plum">{facility.name}</h2>
                <p className="mt-1 text-sm text-plum/60">
                  {[facility.address, facility.city, facility.state, facility.zip].filter(Boolean).join(", ")}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`badge ${facility.status === "open" ? "bg-ink text-white" : "bg-plum-50 text-plum"}`}>
                  {facility.status === "open" ? "Open" : "Coming soon"}
                </span>
                <span className="text-sm text-plum/60">Not tracked</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}