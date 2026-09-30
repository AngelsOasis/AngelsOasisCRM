import React, { useState } from 'react';
import { Users2, Search, Phone, Mail, Building2, Plus, ArrowUpRight } from 'lucide-react';
import { ContactPerson, LeadRecord } from '../../types';

interface ContactsViewProps {
  contacts: ContactPerson[];
  leads: LeadRecord[];
  onSelectLead: (lead: LeadRecord) => void;
  onOpenQuickEmail: (lead: LeadRecord) => void;
}

export const ContactsView: React.FC<ContactsViewProps> = ({
  contacts,
  leads,
  onSelectLead,
  onOpenQuickEmail,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = contacts.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    return (
      !q ||
      c.fullName.toLowerCase().includes(q) ||
      c.facilityName.toLowerCase().includes(q) ||
      c.department.toLowerCase().includes(q) ||
      c.title.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-bold text-slate-900">
            Healthcare Referral Contacts Directory
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Key discharge planners, case managers, social workers, and clinical liaisons.
          </p>
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search contacts, hospital, title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-rose-900/20"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((ct) => {
          const lead = leads.find((l) => l.id === ct.leadId || l.hospitalName === ct.facilityName);

          return (
            <div
              key={ct.id}
              className="p-6 rounded-3xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between space-y-4"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-serif font-bold text-slate-900">
                      {ct.fullName}
                    </h3>
                    <div className="text-xs text-rose-900 font-medium">{ct.title}</div>
                  </div>
                  {ct.isPrimary && (
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      Primary
                    </span>
                  )}
                </div>

                <div className="text-xs text-slate-600 flex items-center gap-1.5 pt-1">
                  <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="font-medium line-clamp-1">{ct.facilityName}</span>
                </div>

                <div className="text-[11px] text-slate-500">
                  Dept: {ct.department}
                </div>

                {ct.notes && (
                  <p className="text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100 italic">
                    "{ct.notes}"
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <a
                    href={`mailto:${ct.email}`}
                    className="text-emerald-700 hover:underline flex items-center gap-1.5 font-medium truncate"
                  >
                    <Mail className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="truncate">{ct.email}</span>
                  </a>
                </div>
                <div className="flex items-center justify-between text-slate-600 font-mono text-[11px]">
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    {ct.phone}
                  </span>
                  {lead && (
                    <button
                      onClick={() => onOpenQuickEmail(lead)}
                      className="text-rose-900 font-sans font-semibold hover:underline"
                    >
                      Email
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};