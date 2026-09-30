const SERVICES = [
  "24-Hour Skilled Nursing Services", "Hospice Services", "Terminal Illness Care", "Oxygen Therapy",
  "Tracheostomy Care", "Ventilator Care", "Gastrostomy / Enteral Feeding Support", "IV Therapy",
  "Pain Management", "Medication Management", "Physical Therapy", "Occupational Therapy",
  "Respiratory Therapy", "Nutritional Support", "Dietary Support", "Medical Supervision",
  "Social Services", "Radiology Services", "Laboratory Services",
];

export default function Services() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="font-serif text-4xl">Services</h1>
      <p className="mt-3 max-w-2xl text-plum/70">
        Full hospital-level medical support, delivered in a residential setting.
      </p>
      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SERVICES.map((s) => (
          <div key={s} className="card">
            <p className="font-medium text-plum-dark">{s}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
