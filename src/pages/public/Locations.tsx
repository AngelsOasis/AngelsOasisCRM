const LOCATIONS = [
  {
    name: "Valley Village (Flagship)",
    status: "Open now",
    address: "12018 Sarah St., Valley Village, CA 91607",
    coverage: "Greater Los Angeles, San Fernando Valley",
    features: ["6 private rooms", "Ensuite bathrooms", "3:1 staffing ratio", "24-hour care"],
  },
  {
    name: "San Jacinto",
    status: "Coming soon",
    address: "Address to be announced",
    coverage: "Riverside County, Inland Empire",
    features: ["6 beds", "3:1 staffing ratio", "24-hour care"],
  },
];

export default function Locations() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="font-serif text-4xl">Locations</h1>
      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {LOCATIONS.map((loc) => (
          <div key={loc.name} className="card">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl">{loc.name}</h2>
              <span className={`badge ${loc.status === "Open now" ? "bg-mint/40 text-plum-dark" : "bg-plum/10 text-plum"}`}>
                {loc.status}
              </span>
            </div>
            <p className="mt-2 text-plum/70">{loc.address}</p>
            <p className="mt-1 text-sm text-plum/50">{loc.coverage}</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {loc.features.map((f) => (
                <li key={f} className="badge bg-plum/5 text-plum">{f}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-8 text-sm text-plum/50">
        An interactive map with both locations plots here in production — wire it to the same
        Leaflet/OpenStreetMap (or Google Maps) setup used on the internal Hospitals Map page.
      </p>
    </div>
  );
}
