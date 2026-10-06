import React, { useState } from 'react';
import { X, CheckCircle2, Send, Clock, UserCheck } from 'lucide-react';
import { LeadRecord } from '../../types';
import { BrandLogo } from './BrandLogo';

interface ReferralModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddReferralLead?: (lead: Omit<LeadRecord, 'id' | 'outreachHistory'>) => void;
}

export const ReferralModal: React.FC<ReferralModalProps> = ({ isOpen, onClose, onAddReferralLead }) => {
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    hospitalName: '',
    coordinatorName: '',
    department: 'Discharge Planning / Social Services',
    email: '',
    phone: '',
    residentNeeds: 'Ventilator & Tracheostomy Care',
    county: 'Los Angeles County',
    notes: '',
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onAddReferralLead) {
      onAddReferralLead({
        hospitalName: formData.hospitalName,
        address: 'Direct referral from hospital discharge team',
        city: 'Los Angeles',
        county: formData.county,
        lat: 34.1488,
        lon: -118.3962,
        distanceValleyVillage: 7.2,
        distanceSanJacinto: 84.0,
        contactPerson: formData.coordinatorName,
        contactTitle: 'Discharge Coordinator',
        department: formData.department,
        emailAddress: formData.email,
        phoneNumber: formData.phone,
        referralType: 'Discharge Planners',
        status: 'Referral Received',
        notes: `Clinical Referral Intake: ${formData.residentNeeds}. Clinical Summary: ${formData.notes}`,
        lastContacted: new Date().toISOString(),
        qualificationScore: 98,
        qualificationReason: `Direct patient referral requesting ${formData.residentNeeds}.`,
        recommendedAction: 'Immediate clinical intake review & bed confirmation.',
        source: 'Inbound Referral',
        tags: ['Direct Referral', formData.residentNeeds, 'Urgent Placement'],
      });
    }
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      onClose();
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative border border-slate-200">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 transition-colors p-1"
        >
          <X className="w-5 h-5" />
        </button>

        {submitted ? (
          <div className="text-center py-8 space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
            <h3 className="text-xl font-serif font-bold text-slate-900">Referral Inquiry Sent!</h3>
            <p className="text-xs text-slate-600 max-w-xs mx-auto">
              Our clinical intake director has received this referral. We will follow up directly within 2 hours.
            </p>
          </div>
        ) : (
          <div>
            <div className="mb-4">
              <BrandLogo size="md" theme="light" subtitle="Direct Clinical Intake Desk" badge="ADMISSIONS" />
            </div>

            <div className="flex items-center gap-2 text-[#4A1525] text-xs font-semibold uppercase tracking-wider mb-1">
              <Clock className="w-3.5 h-3.5 text-[#10B981]" />
              <span>2-Hour Clinical Review Guarantee</span>
            </div>
            <h2 className="text-xl font-serif font-bold text-slate-900 mb-1">
              Log Clinical Referral
            </h2>
            <p className="text-xs text-slate-500 mb-5">
              Congregate Living Health Facility (CLHF) Intake · Valley Village & San Jacinto locations
            </p>

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Referring Facility / Hospital *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Cedars-Sinai, Tarzana Medical Center"
                  value={formData.hospitalName}
                  onChange={(e) => setFormData({ ...formData, hospitalName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-900/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Coordinator Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Elena Rostova, LCSW"
                    value={formData.coordinatorName}
                    onChange={(e) => setFormData({ ...formData, coordinatorName: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-900/20"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Direct Phone *</label>
                  <input
                    type="tel"
                    required
                    placeholder="(310) 423-5000"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-900/20"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Coordinator Email *</label>
                <input
                  type="email"
                  required
                  placeholder="coordinator@hospital.org"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-900/20"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Clinical Needs</label>
                <select
                  value={formData.residentNeeds}
                  onChange={(e) => setFormData({ ...formData, residentNeeds: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-900/20"
                >
                  <option value="Ventilator & Tracheostomy Care">Ventilator & Tracheostomy Care</option>
                  <option value="Enteral Feeding (G-Tube / J-Tube)">Enteral Feeding (G-Tube / J-Tube)</option>
                  <option value="Hospice & Terminal Care">Hospice & Terminal Care</option>
                  <option value="IV Antibiotics & Complex Wounds">IV Antibiotics & Complex Wounds</option>
                  <option value="Post-Trauma Neurological Recovery">Post-Trauma Neurological Recovery</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Clinical Summary / Bed Request</label>
                <textarea
                  rows={2}
                  placeholder="Patient status, anticipated discharge date, insurance..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-900/20 resize-none"
                />
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
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-5 py-2.5 rounded-lg text-xs flex items-center gap-1.5 shadow-sm transition-all"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Submit Patient Referral</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
