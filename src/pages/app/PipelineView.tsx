import React, { useState, useMemo } from 'react';
import { 
  Columns3, 
  Search, 
  Filter, 
  Plus, 
  Mail, 
  MapPin, 
  Sparkles, 
  ChevronRight, 
  ChevronLeft,
  Building2,
  CheckCircle2,
  Clock,
  ArrowRight
} from 'lucide-react';
import { LeadCategory, LeadRecord, PipelineStatus } from '../../types';

interface PipelineViewProps {
  leads: LeadRecord[];
  onSelectLead: (lead: LeadRecord) => void;
  onOpenQuickEmail: (lead: LeadRecord) => void;
  onUpdateLeadStatus: (id: string, newStatus: PipelineStatus) => void;
  onOpenAddLead: () => void;
}

const STAGES: { id: PipelineStatus; title: string; color: string; badgeBg: string; textCol: string; borderCol: string }[] = [
  { id: 'New', title: 'New Leads', color: 'bg-slate-400', badgeBg: 'bg-slate-100', textCol: 'text-slate-700', borderCol: 'border-slate-200' },
  { id: 'Researched', title: 'Researched', color: 'bg-blue-500', badgeBg: 'bg-blue-50', textCol: 'text-blue-700', borderCol: 'border-blue-200' },
  { id: 'Contacted', title: 'Contacted', color: 'bg-amber-500', badgeBg: 'bg-amber-50', textCol: 'text-amber-700', borderCol: 'border-amber-200' },
  { id: 'Engaged', title: 'In Discussion', color: 'bg-purple-500', badgeBg: 'bg-purple-50', textCol: 'text-purple-700', borderCol: 'border-purple-200' },
  { id: 'Referral Received', title: 'Referral Received', color: 'bg-emerald-500', badgeBg: 'bg-emerald-50', textCol: 'text-emerald-800', borderCol: 'border-emerald-300' },
  { id: 'Active Partner', title: 'Active Partners', color: 'bg-rose-900', badgeBg: 'bg-rose-50', textCol: 'text-rose-900', borderCol: 'border-rose-300' },
];

export const PipelineView: React.FC<PipelineViewProps> = ({
  leads,
  onSelectLead,
  onOpenQuickEmail,
  onUpdateLeadStatus,
  onOpenAddLead,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const categories: string[] = [
    'All',
    'Hospitals',
    'Skilled Nursing Facilities',
    'Rehab Centers',
    'Case Managers',
    'Discharge Planners',
    'Physicians',
    'Insurance Networks',
  ];

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const matchCategory = selectedCategory === 'All' || lead.referralType === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        lead.hospitalName.toLowerCase().includes(q) ||
        lead.contactPerson.toLowerCase().includes(q) ||
        lead.department.toLowerCase().includes(q) ||
        lead.city.toLowerCase().includes(q);
      return matchCategory && matchSearch;
    });
  }, [leads, selectedCategory, searchQuery]);

  const moveLead = (lead: LeadRecord, direction: 'prev' | 'next') => {
    const currentIndex = STAGES.findIndex((s) => s.id === lead.status);
    if (currentIndex === -1) return;
    const newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (newIndex >= 0 && newIndex < STAGES.length) {
      onUpdateLeadStatus(lead.id, STAGES[newIndex].id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-bold text-slate-900 flex items-center gap-2">
            <span>Referral Pipeline Board</span>
            <span className="text-xs font-sans font-semibold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-900 border border-rose-200">
              {leads.length} Facilities
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Track hospital discharge planners & referral partners from initial discovery to active resident placement.
          </p>
        </div>

        <button
          onClick={onOpenAddLead}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-xs transition-all cursor-pointer self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Facility Lead</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white rounded-2xl border border-slate-200 shadow-xs">
        <div className="relative min-w-[240px] flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search facility name, contact, city..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-900/20"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto py-1">
          <span className="text-xs text-slate-500 font-medium">Category:</span>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-rose-950 text-white font-semibold shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Kanban Board Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-start overflow-x-auto pb-4">
        {STAGES.map((stage, stageIndex) => {
          const stageLeads = filteredLeads.filter((l) => l.status === stage.id);

          return (
            <div
              key={stage.id}
              className={`flex flex-col rounded-2xl bg-slate-100/70 border ${stage.borderCol} min-w-[220px] max-h-[calc(100vh-250px)] overflow-hidden`}
            >
              {/* Column Header */}
              <div className="p-3.5 bg-white border-b border-slate-200/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
                  <span className="text-xs font-bold text-slate-900 truncate">
                    {stage.title}
                  </span>
                </div>
                <span
                  className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${stage.badgeBg} ${stage.textCol}`}
                >
                  {stageLeads.length}
                </span>
              </div>

              {/* Cards Container */}
              <div className="flex-1 p-2.5 space-y-2.5 overflow-y-auto">
                {stageLeads.length === 0 ? (
                  <div className="text-center py-8 text-[11px] text-slate-400 italic">
                    No leads in this stage
                  </div>
                ) : (
                  stageLeads.map((lead) => (
                    <div
                      key={lead.id}
                      className="p-3.5 bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all space-y-2.5 group text-xs"
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <button
                          onClick={() => onSelectLead(lead)}
                          className="font-semibold text-slate-900 hover:text-rose-900 transition-colors text-left font-serif leading-snug line-clamp-2"
                        >
                          {lead.hospitalName}
                        </button>
                        {lead.qualificationScore && (
                          <span className="shrink-0 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {lead.qualificationScore} pts
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-500 space-y-0.5">
                        <div className="truncate font-medium text-slate-700">
                          {lead.contactPerson || 'Discharge Director'}
                        </div>
                        <div className="flex items-center gap-1 text-slate-500">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{lead.city || lead.county} ({lead.distanceValleyVillage} mi)</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 truncate max-w-[100px]">
                          {lead.referralType}
                        </span>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onOpenQuickEmail(lead)}
                            title="Send Email"
                            className="p-1 rounded-md text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                          >
                            <Mail className="w-3.5 h-3.5" />
                          </button>

                          {stageIndex > 0 && (
                            <button
                              onClick={() => moveLead(lead, 'prev')}
                              title="Move back"
                              className="p-1 rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {stageIndex < STAGES.length - 1 && (
                            <button
                              onClick={() => moveLead(lead, 'next')}
                              title="Advance stage"
                              className="p-1 rounded-md text-rose-900 hover:text-rose-950 hover:bg-rose-50 transition-colors"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};