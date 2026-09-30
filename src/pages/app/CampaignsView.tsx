import React, { useState } from 'react';
import { 
  Send, 
  Sparkles, 
  Calendar, 
  Clock, 
  Users, 
  CheckCircle2, 
  ArrowRight, 
  Mail, 
  Edit3, 
  Play,
  RotateCcw
} from 'lucide-react';
import { Campaign, LeadRecord } from '../../types';

interface CampaignsViewProps {
  campaigns: Campaign[];
  leads: LeadRecord[];
  onTriggerCampaignSend: (campaignId: string) => void;
  onOpenAIWriterForCampaign: (campaignType: string) => void;
  onUpdateCampaign: (campaign: Campaign) => void;
}

export const CampaignsView: React.FC<CampaignsViewProps> = ({
  campaigns,
  leads,
  onTriggerCampaignSend,
  onOpenAIWriterForCampaign,
  onUpdateCampaign,
}) => {
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [successNotice, setSuccessNotice] = useState<string>('');

  const handleTriggerSend = (camp: Campaign) => {
    onTriggerCampaignSend(camp.id);
    setSuccessNotice(`Successfully triggered automated send for "${camp.name}" to ${leads.length} referral leads.`);
    setTimeout(() => setSuccessNotice(''), 4000);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCampaign) {
      onUpdateCampaign(editingCampaign);
      setEditingCampaign(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-bold text-slate-900">
            Email Outreach Automation & Cadence
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Structured 3-day weekly referral relationship nurturing (Monday · Wednesday · Friday).
          </p>
        </div>

        <button
          onClick={() => onOpenAIWriterForCampaign('Monday Newsletter')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-[#380e1a] hover:bg-rose-900 text-white shadow-xs transition-all cursor-pointer"
        >
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span>Generate AI Weekly Batch</span>
        </button>
      </div>

      {successNotice && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successNotice}</span>
        </div>
      )}

      {/* 3 Campaigns Cadence Cards */}
      <div className="space-y-6">
        {campaigns.map((camp) => (
          <div
            key={camp.id}
            className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition-shadow"
          >
            <div className="p-6 sm:p-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-[#380e1a] text-white flex flex-col items-center justify-center font-mono">
                    <span className="text-[10px] uppercase text-rose-300 font-sans">Cadence</span>
                    <span className="text-sm font-bold text-emerald-400">{camp.day.slice(0, 3)}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-serif font-bold text-slate-900">
                        {camp.name}
                      </h3>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                        {camp.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 font-sans">
                      Audience: <strong className="text-slate-700">{camp.audienceDescription}</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => onOpenAIWriterForCampaign(
                      camp.day === 'Monday'
                        ? 'Monday Newsletter'
                        : camp.day === 'Wednesday'
                        ? 'Wednesday Facility Education'
                        : 'Friday Testimonials'
                    )}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-950 transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-rose-900" />
                    <span>AI Rewrite</span>
                  </button>

                  <button
                    onClick={() => setEditingCampaign(camp)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit Copy</span>
                  </button>

                  <button
                    onClick={() => handleTriggerSend(camp)}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-xs transition-all cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Dispatch Send</span>
                  </button>
                </div>
              </div>

              {/* Template Preview */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Subject Line
                    </span>
                    <div className="text-xs font-semibold text-slate-900 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                      {camp.subjectTemplate}
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Body Template (Merge Tags: {'{{Contact_Person}}'}, {'{{Facility_Name}}'})
                    </span>
                    <div className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200/80 font-sans leading-relaxed whitespace-pre-wrap max-h-36 overflow-y-auto">
                      {camp.bodyTemplate}
                    </div>
                  </div>
                </div>

                {/* Performance Metrics */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3 pb-2 border-b border-slate-200">
                      Historical Performance
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[11px] text-slate-500 block">Total Sent</span>
                        <strong className="text-base font-serif font-bold text-slate-900 tabular-nums">
                          {camp.sentCount}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block">Open Rate</span>
                        <strong className="text-base font-serif font-bold text-emerald-700 tabular-nums">
                          {camp.sentCount > 0 ? Math.round((camp.openCount / camp.sentCount) * 100) : 0}%
                        </strong>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block">Click Rate</span>
                        <strong className="text-base font-serif font-bold text-slate-900 tabular-nums">
                          {camp.sentCount > 0 ? Math.round((camp.clickCount / camp.sentCount) * 100) : 0}%
                        </strong>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block">Direct Replies</span>
                        <strong className="text-base font-serif font-bold text-emerald-700 tabular-nums">
                          {camp.replyCount}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 mt-3 border-t border-slate-200 text-[11px] text-slate-500 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Next scheduled: {camp.nextScheduledSend}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Campaign Modal */}
      {editingCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 sm:p-8 shadow-2xl relative border border-slate-200">
            <h3 className="text-xl font-serif font-bold text-slate-900 mb-2">
              Edit Campaign Copy ({editingCampaign.day})
            </h3>
            <p className="text-xs text-slate-500 mb-6">
              Update the master template for {editingCampaign.name}.
            </p>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Subject Line</label>
                <input
                  type="text"
                  required
                  value={editingCampaign.subjectTemplate}
                  onChange={(e) =>
                    setEditingCampaign({ ...editingCampaign, subjectTemplate: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900 font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Body Template</label>
                <textarea
                  rows={6}
                  required
                  value={editingCampaign.bodyTemplate}
                  onChange={(e) =>
                    setEditingCampaign({ ...editingCampaign, bodyTemplate: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900 font-sans leading-relaxed"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Call to Action Text</label>
                <input
                  type="text"
                  required
                  value={editingCampaign.ctaText}
                  onChange={(e) =>
                    setEditingCampaign({ ...editingCampaign, ctaText: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingCampaign(null)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-5 py-2.5 rounded-lg shadow-xs"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
