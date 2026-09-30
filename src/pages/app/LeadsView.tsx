import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  Plus, 
  Download, 
  Mail, 
  ExternalLink, 
  MapPin, 
  Sparkles, 
  MoreVertical,
  ChevronRight,
  ShieldCheck,
  Building2
} from 'lucide-react';
import { LeadCategory, LeadRecord, PipelineStatus } from '../../types';

interface LeadsViewProps {
  leads: LeadRecord[];
  onSelectLead: (lead: LeadRecord) => void;
  onOpenQuickEmail: (lead: LeadRecord) => void;
  onOpenAddLead: () => void;
  onDeleteLead: (id: string) => void;
  onNavigateToPipeline?: () => void;
}

export const LeadsView: React.FC<LeadsViewProps> = ({
  leads,
  onSelectLead,
  onOpenQuickEmail,
  onOpenAddLead,
  onDeleteLead,
  onNavigateToPipeline,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [selectedCounty, setSelectedCounty] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const categories: string[] = [
    'All',
    'Hospitals',
    'Skilled Nursing Facilities',
    'Rehab Centers',
    'Case Managers',
    'Discharge Planners',
    'Physicians',
    'Insurance Networks',
    'Healthcare Organizations',
  ];

  const statuses: string[] = [
    'All',
    'New',
    'Researched',
    'Contacted',
    'Engaged',
    'Referral Received',
    'Active Partner',
    'Dormant',
  ];

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const matchCategory = selectedCategory === 'All' || lead.referralType === selectedCategory;
      const matchStatus = selectedStatus === 'All' || lead.status === selectedStatus;
      const matchCounty = selectedCounty === 'All' || lead.county === selectedCounty;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        lead.hospitalName.toLowerCase().includes(q) ||
        lead.contactPerson.toLowerCase().includes(q) ||
        lead.department.toLowerCase().includes(q) ||
        lead.address.toLowerCase().includes(q) ||
        lead.city.toLowerCase().includes(q);

      return matchCategory && matchStatus && matchCounty && matchSearch;
    });
  }, [leads, selectedCategory, selectedStatus, selectedCounty, searchQuery]);

  const handleExportCSV = () => {
    const headers = [
      'Hospital Name',
      'Address',
      'County',
      'Category',
      'Status',
      'Distance Valley Village (mi)',
      'Contact Person',
      'Department',
      'Email',
      'Phone',
      'AI Score',
      'Last Contacted'
    ];

    const rows = filteredLeads.map((l) => [
      `"${l.hospitalName.replace(/"/g, '""')}"`,
      `"${l.address.replace(/"/g, '""')}"`,
      `"${l.county}"`,
      `"${l.referralType}"`,
      `"${l.status}"`,
      l.distanceValleyVillage,
      `"${l.contactPerson.replace(/"/g, '""')}"`,
      `"${l.department.replace(/"/g, '""')}"`,
      `"${l.emailAddress}"`,
      `"${l.phoneNumber}"`,
      l.qualificationScore || 88,
      l.lastContacted || 'Never'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `angels_oasis_referral_leads_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Export controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-bold text-slate-900">
            Hospital & Referral Lead Database
          </h2>
          <p className="text-xs text-slate-500">
            Manage hospital discharge units, case managers, and post-acute referral partners.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {onNavigateToPipeline && (
            <button
              onClick={onNavigateToPipeline}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-950 text-rose-100 hover:bg-rose-900 transition-colors shadow-2xs border border-rose-800"
            >
              <span>Pipeline Kanban</span>
            </button>
          )}
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={onOpenAddLead}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Lead</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by facility name, contact, department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-rose-900/20"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">County:</span>
              <select
                value={selectedCounty}
                onChange={(e) => setSelectedCounty(e.target.value)}
                className="text-xs px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 focus:outline-none"
              >
                <option value="All">All Counties</option>
                <option value="Los Angeles County">Los Angeles County</option>
                <option value="Riverside County">Riverside County</option>
              </select>
            </div>
            <div className="text-xs text-slate-500 font-mono">
              Showing <strong className="text-slate-900">{filteredLeads.length}</strong> of {leads.length} leads
            </div>
          </div>
        </div>

        {/* Category Pill Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-all ${
                selectedCategory === cat
                  ? 'bg-rose-950 text-white font-semibold shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pt-1 border-t border-slate-100 text-xs text-slate-500">
          <span className="font-semibold text-slate-700">Pipeline:</span>
          {statuses.map((st) => (
            <button
              key={st}
              onClick={() => setSelectedStatus(st)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                selectedStatus === st
                  ? 'bg-emerald-100 text-emerald-800 font-bold'
                  : 'hover:text-slate-900'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Leads Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px] font-semibold">
              <tr>
                <th className="py-3.5 px-4">Hospital / Facility</th>
                <th className="py-3.5 px-4">Referral Category</th>
                <th className="py-3.5 px-4">Distance</th>
                <th className="py-3.5 px-4">Primary Contact</th>
                <th className="py-3.5 px-4">AI Score</th>
                <th className="py-3.5 px-4">Pipeline Status</th>
                <th className="py-3.5 px-4">Last Contact</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredLeads.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => onSelectLead(lead)}
                  className="hover:bg-slate-50/80 cursor-pointer transition-colors group"
                >
                  <td className="py-4 px-4 font-semibold text-slate-900">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-slate-400 group-hover:text-rose-900 transition-colors shrink-0" />
                      <div>
                        <div className="line-clamp-1 group-hover:text-rose-950 transition-colors">
                          {lead.hospitalName}
                        </div>
                        <div className="text-[11px] text-slate-400 font-normal font-sans line-clamp-1">
                          {lead.address}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="py-4 px-4">
                    <span className="text-[11px] font-medium text-slate-600">
                      {lead.referralType}
                    </span>
                  </td>

                  <td className="py-4 px-4 font-mono text-[11px] text-slate-600">
                    <div>{lead.distanceValleyVillage} mi (VV)</div>
                    <div className="text-slate-400 text-[10px]">{lead.distanceSanJacinto} mi (SJ)</div>
                  </td>

                  <td className="py-4 px-4">
                    <div className="font-medium text-slate-900">{lead.contactPerson}</div>
                    <div className="text-[11px] text-slate-500 line-clamp-1">{lead.department}</div>
                  </td>

                  <td className="py-4 px-4">
                    <div className="inline-flex items-center gap-1 font-mono font-bold text-xs text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/80 tabular-nums">
                      <Sparkles className="w-3 h-3 text-emerald-600" />
                      <span>{lead.qualificationScore || 88}</span>
                    </div>
                  </td>

                  <td className="py-4 px-4">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                        lead.status === 'Active Partner'
                          ? 'bg-emerald-100 text-emerald-900'
                          : lead.status === 'Referral Received'
                          ? 'bg-purple-100 text-purple-900'
                          : lead.status === 'Engaged'
                          ? 'bg-blue-100 text-blue-900'
                          : lead.status === 'Contacted'
                          ? 'bg-amber-100 text-amber-900'
                          : lead.status === 'Researched'
                          ? 'bg-slate-100 text-slate-800'
                          : 'bg-rose-50 text-rose-900 border border-rose-200'
                      }`}
                    >
                      {lead.status}
                    </span>
                  </td>

                  <td className="py-4 px-4 font-mono text-[11px] text-slate-500">
                    {lead.lastContacted || 'Never'}
                  </td>

                  <td className="py-4 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onOpenQuickEmail(lead)}
                        title="Send Targeted Email"
                        className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-50 transition-colors"
                      >
                        <Mail className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onSelectLead(lead)}
                        title="Open Lead Profile"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
