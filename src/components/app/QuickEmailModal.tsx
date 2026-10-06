import React, { useState, useEffect } from 'react';
import { X, Send, Sparkles, CheckCircle2, FileText, ArrowRight } from 'lucide-react';
import { LeadRecord, Campaign } from '../../types';
import { BrandLogo } from '../common/BrandLogo';

interface QuickEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: LeadRecord | null;
  campaigns: Campaign[];
  onSendOutreach: (
    leadId: string,
    campaignName: string,
    subject: string,
    recipientEmail: string,
    recipientName: string,
    previewText?: string
  ) => void;
}

export const QuickEmailModal: React.FC<QuickEmailModalProps> = ({
  isOpen,
  onClose,
  lead,
  campaigns,
  onSendOutreach,
}) => {
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sentSuccess, setSentSuccess] = useState(false);

  useEffect(() => {
    if (lead) {
      const defaultCampaign = campaigns[1] || campaigns[0]; // Wednesday facility education or Monday
      setSelectedCampaignId(defaultCampaign?.id || '');
      
      const filledSubject = defaultCampaign?.subjectTemplate
        ? defaultCampaign.subjectTemplate
            .replace(/{{Facility_Name}}/g, lead.hospitalName)
            .replace(/{{Contact_Person}}/g, lead.contactPerson)
        : `Angels Oasis CLHF: Valley Village Bed Availability & 3:1 Staffing`;

      const filledBody = defaultCampaign?.bodyTemplate
        ? defaultCampaign.bodyTemplate
            .replace(/{{Facility_Name}}/g, lead.hospitalName)
            .replace(/{{Contact_Person}}/g, lead.contactPerson)
            .replace(/{{Department}}/g, lead.department)
        : `Dear ${lead.contactPerson},\n\nWe wanted to share our clinical intake update from Angels Oasis Congregate Living Health Facility (CLHF). We currently have bed availability in our 6 private-room Valley Village home (12018 Sarah St) for medically complex patients needing 24-hour skilled nursing, ventilator care, and tracheostomy support with a guaranteed 3:1 caregiver ratio.\n\nPlease call us directly at (323) 213-2831 to review clinical packets.`;

      setSubject(filledSubject);
      setBody(filledBody);
    }
  }, [lead, campaigns]);

  if (!isOpen || !lead) return null;

  const handleCampaignChange = (campaignId: string) => {
    setSelectedCampaignId(campaignId);
    const chosen = campaigns.find((c) => c.id === campaignId);
    if (chosen) {
      setSubject(
        chosen.subjectTemplate
          .replace(/{{Facility_Name}}/g, lead.hospitalName)
          .replace(/{{Contact_Person}}/g, lead.contactPerson)
      );
      setBody(
        chosen.bodyTemplate
          .replace(/{{Facility_Name}}/g, lead.hospitalName)
          .replace(/{{Contact_Person}}/g, lead.contactPerson)
          .replace(/{{Department}}/g, lead.department)
      );
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const camp = campaigns.find((c) => c.id === selectedCampaignId);
    const campaignName = camp ? camp.name : 'Direct Facility Outreach';

    onSendOutreach(
      lead.id,
      campaignName,
      subject,
      lead.emailAddress,
      lead.contactPerson,
      body.slice(0, 80) + '...'
    );

    setSentSuccess(true);
    setTimeout(() => {
      setSentSuccess(false);
      onClose();
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-xl w-full p-6 sm:p-8 shadow-2xl relative border border-slate-200">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 transition-colors p-1"
        >
          <X className="w-5 h-5" />
        </button>

        {sentSuccess ? (
          <div className="text-center py-8 space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
            <h3 className="text-xl font-serif font-bold text-slate-900">Email Dispatched!</h3>
            <p className="text-xs text-slate-600 max-w-xs mx-auto">
              Message logged to outreach history for <strong>{lead.hospitalName}</strong>.
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
              <BrandLogo size="md" theme="light" subtitle="Clinical Outreach Dispatcher" badge="CAMPAIGN" />
            </div>

            <h2 className="text-xl font-serif font-bold text-slate-900 mb-1">
              Send Outreach to {lead.hospitalName}
            </h2>
            <p className="text-xs text-slate-500 mb-5">
              Recipient: <strong className="text-slate-800">{lead.contactPerson}</strong> ({lead.emailAddress})
            </p>

            <form onSubmit={handleSend} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Select Campaign Cadence Template</label>
                <select
                  value={selectedCampaignId}
                  onChange={(e) => handleCampaignChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-900/20 bg-slate-50 font-medium"
                >
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.day} — {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Subject Line *</label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-900/20 font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Email Body *</label>
                <textarea
                  rows={6}
                  required
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-900/20 font-sans leading-relaxed"
                />
              </div>

              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200/80 text-[11px] text-emerald-900">
                <strong>Sender:</strong> admin@angelsoasisclhf.com · Angels Oasis Admissions & Clinical Liaison Desk
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-5 py-2.5 rounded-lg text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Email Now</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
