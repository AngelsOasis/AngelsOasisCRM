import React, { useState } from 'react';
import { 
  X, 
  MapPin, 
  Phone, 
  Mail, 
  Calendar, 
  Send, 
  Sparkles, 
  Clock, 
  CheckCircle2, 
  ArrowRight,
  ShieldCheck,
  Building2,
  FileText,
  UserCheck
} from 'lucide-react';
import { LeadRecord, PipelineStatus, OutreachEvent } from '../../types';
import { ApiService } from '../../services/api';

interface LeadDetailDrawerProps {
  lead: LeadRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateLead: (id: string, updates: Partial<LeadRecord>) => void;
  onSendOutreach: (lead: LeadRecord) => void;
}

export const LeadDetailDrawer: React.FC<LeadDetailDrawerProps> = ({
  lead,
  isOpen,
  onClose,
  onUpdateLead,
  onSendOutreach,
}) => {
  const [scoringLoading, setScoringLoading] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState(lead?.notes || '');

  if (!isOpen || !lead) return null;

  const pipelineStages: PipelineStatus[] = [
    'New',
    'Researched',
    'Contacted',
    'Engaged',
    'Referral Received',
    'Active Partner',
    'Dormant',
    'Do Not Contact'
  ];

  const handleScoreLead = async () => {
    try {
      setScoringLoading(true);
      const result = await ApiService.scoreLead(lead);
      onUpdateLead(lead.id, {
        qualificationScore: result.score,
        qualificationReason: result.clinicalFitAnalysis,
        recommendedAction: result.recommendedNextStep
      });
    } catch (e) {
      console.error(e);
    } finally {
      setScoringLoading(false);
    }
  };

  const handleStatusChange = (newStatus: PipelineStatus) => {
    onUpdateLead(lead.id, { status: newStatus });
  };

  const handleSaveNotes = () => {
    onUpdateLead(lead.id, { notes: notesText });
    setEditingNotes(false);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 overflow-y-auto">
        {/* Drawer Header */}
        <div className="p-6 bg-[#260710] text-white flex items-start justify-between sticky top-0 z-10 border-b border-rose-950">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                {lead.referralType}
              </span>
              <span className="text-xs text-rose-300 font-mono">
                {lead.distanceValleyVillage} mi from Valley Village
              </span>
            </div>
            <h2 className="text-xl font-serif font-bold text-white tracking-tight">
              {lead.hospitalName}
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-rose-200/80 mt-1">
              <MapPin className="w-3.5 h-3.5 text-rose-300" />
              <span>{lead.address}</span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-rose-300 hover:text-white p-1 rounded-lg hover:bg-rose-900/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Header Strip */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          {/* Status Pipeline Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">Pipeline Stage:</span>
            <select
              value={lead.status}
              onChange={(e) => handleStatusChange(e.target.value as PipelineStatus)}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-900/20"
            >
              {pipelineStages.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => onSendOutreach(lead)}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-3.5 py-1.5 rounded-lg text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Send className="w-3 h-3" />
            <span>Send Email Outreach</span>
          </button>
        </div>

        {/* Drawer Body Content */}
        <div className="p-6 space-y-6 flex-1">
          {/* AI Lead Qualification Card */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-serif font-bold text-slate-900">
                  AI Placement & Referral Scoring
                </span>
              </div>
              <button
                onClick={handleScoreLead}
                disabled={scoringLoading}
                className="text-[11px] font-semibold text-rose-900 hover:underline disabled:opacity-50 flex items-center gap-1"
              >
                {scoringLoading ? 'Evaluating...' : 'Re-score with Gemini'}
              </button>
            </div>

            <div className="flex items-baseline gap-3">
              <div className="text-3xl font-serif font-bold text-slate-900 tabular-nums">
                {lead.qualificationScore || 88}
                <span className="text-xs font-sans text-slate-500 font-normal"> / 100</span>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                {(lead.qualificationScore || 88) >= 90 ? 'High Priority' : 'Qualified Lead'}
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {lead.qualificationReason ||
                'High-density subacute referral partner located within the primary discharge radius of Valley Village. Strong fit for tracheostomy step-down.'}
            </p>

            {lead.recommendedAction && (
              <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-700">
                <strong className="text-slate-900">Recommended Next Step:</strong> {lead.recommendedAction}
              </div>
            )}
          </div>

          {/* Primary Referral Contact Info */}
          <div className="p-4 rounded-xl border border-slate-200 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-2">
              Primary Discharge / Case Management Contact
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block text-[11px]">Contact Person</span>
                <span className="font-semibold text-slate-900">{lead.contactPerson}</span>
                {lead.contactTitle && (
                  <span className="text-slate-500 block text-[11px]">{lead.contactTitle}</span>
                )}
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Department</span>
                <span className="font-medium text-slate-800">{lead.department}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Email Address</span>
                <a href={`mailto:${lead.emailAddress}`} className="font-medium text-emerald-700 hover:underline break-all">
                  {lead.emailAddress}
                </a>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Phone Number</span>
                <a href={`tel:${lead.phoneNumber}`} className="font-mono text-slate-800 hover:underline">
                  {lead.phoneNumber}
                </a>
              </div>
            </div>
          </div>

          {/* Relationship Notes */}
          <div className="p-4 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Relationship & Intake Notes
              </h3>
              {!editingNotes ? (
                <button
                  onClick={() => {
                    setNotesText(lead.notes);
                    setEditingNotes(true);
                  }}
                  className="text-[11px] font-semibold text-emerald-700 hover:underline"
                >
                  Edit Notes
                </button>
              ) : (
                <div className="flex gap-2 text-[11px]">
                  <button onClick={() => setEditingNotes(false)} className="text-slate-500">
                    Cancel
                  </button>
                  <button onClick={handleSaveNotes} className="font-bold text-emerald-700">
                    Save
                  </button>
                </div>
              )}
            </div>

            {editingNotes ? (
              <textarea
                rows={3}
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-900/20 resize-none"
              />
            ) : (
              <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                {lead.notes || 'No notes added yet.'}
              </p>
            )}
          </div>

          {/* Outreach History */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Outreach History & Cadence Logs ({lead.outreachHistory?.length || 0})
              </h3>
              <span className="text-[11px] text-slate-500">
                Last Contacted: {lead.lastContacted || 'Never'}
              </span>
            </div>

            {lead.outreachHistory && lead.outreachHistory.length > 0 ? (
              <div className="space-y-3">
                {lead.outreachHistory.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1.5 hover:border-slate-300 transition-colors"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-rose-900">{item.campaignName}</span>
                      <span className="text-slate-400 font-mono">{item.sentAt}</span>
                    </div>
                    <div className="text-xs font-medium text-slate-900">
                      {item.subject}
                    </div>
                    {item.previewText && (
                      <p className="text-[11px] text-slate-500 italic line-clamp-1">
                        "{item.previewText}"
                      </p>
                    )}
                    <div className="flex items-center justify-between pt-1 text-[11px]">
                      <span className="text-slate-500">To: {item.recipientName}</span>
                      <span
                        className={`font-semibold uppercase tracking-wider text-[10px] px-2 py-0.5 rounded-full ${
                          item.status === 'replied'
                            ? 'bg-emerald-100 text-emerald-800'
                            : item.status === 'opened'
                            ? 'bg-blue-100 text-blue-800'
                            : item.status === 'clicked'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-500 space-y-2">
                <Clock className="w-6 h-6 text-slate-400 mx-auto" />
                <p>No emails sent to this facility yet.</p>
                <button
                  onClick={() => onSendOutreach(lead)}
                  className="text-emerald-700 font-semibold text-xs hover:underline"
                >
                  Send first outreach message
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
