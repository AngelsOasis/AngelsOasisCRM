import React, { useState } from 'react';
import { X, Plus, Building2 } from 'lucide-react';
import { LeadCategory, LeadRecord, PipelineStatus } from '../../types';

interface AddLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddLead: (lead: Omit<LeadRecord, 'id' | 'outreachHistory'>) => void;
}

export const AddLeadModal: React.FC<AddLeadModalProps> = ({ isOpen, onClose, onAddLead }) => {
  const [hospitalName, setHospitalName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [county, setCounty] = useState('Los Angeles County');
  const [distanceValleyVillage, setDistanceValleyVillage] = useState('6.5');
  const [distanceSanJacinto, setDistanceSanJacinto] = useState('85.0');
  const [contactPerson, setContactPerson] = useState('');
  const [contactTitle, setContactTitle] = useState('Discharge Planning Specialist');
  const [department, setDepartment] = useState('Case Management');
  const [emailAddress, setEmailAddress] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [referralType, setReferralType] = useState<LeadCategory>('Hospitals');
  const [status, setStatus] = useState<PipelineStatus>('New');
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAddLead({
      hospitalName,
      address,
      city: city || 'Los Angeles',
      county,
      lat: 34.1488 + (Math.random() - 0.5) * 0.1,
      lon: -118.3962 + (Math.random() - 0.5) * 0.1,
      distanceValleyVillage: parseFloat(distanceValleyVillage) || 5,
      distanceSanJacinto: parseFloat(distanceSanJacinto) || 85,
      contactPerson,
      contactTitle,
      department,
      emailAddress,
      phoneNumber,
      referralType,
      status,
      notes,
      lastContacted: null,
      qualificationScore: 88,
      qualificationReason: 'Manually added partner to Angels Oasis outreach CRM.',
      recommendedAction: 'Send introductory Wednesday facility overview.',
      source: 'Direct Intake',
      tags: ['Manual Intake', county],
    });
    onClose();
  };

  const categories: LeadCategory[] = [
    'Hospitals',
    'Skilled Nursing Facilities',
    'Rehab Centers',
    'Case Managers',
    'Discharge Planners',
    'Physicians',
    'Insurance Networks',
    'Healthcare Organizations',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-xl w-full p-6 sm:p-8 shadow-2xl relative border border-slate-200 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 transition-colors p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-rose-900 text-xs font-semibold uppercase tracking-wider mb-1">
          <Building2 className="w-4 h-4 text-emerald-600" />
          <span>CRM Intake</span>
        </div>
        <h2 className="text-2xl font-serif font-bold text-slate-900 mb-2">
          Add New Healthcare Referral Lead
        </h2>
        <p className="text-xs text-slate-600 mb-6">
          Record hospital, SNF, physician, or discharge coordinator details into the outreach database.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Hospital / Facility Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Kaiser Permanente Panorama City"
              value={hospitalName}
              onChange={(e) => setHospitalName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-900/20"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Full Street Address *</label>
              <input
                type="text"
                required
                placeholder="13652 Cantara St"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-900/20"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">City</label>
              <input
                type="text"
                placeholder="Panorama City"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-900/20"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">County</label>
              <select
                value={county}
                onChange={(e) => setCounty(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-900/20"
              >
                <option value="Los Angeles County">Los Angeles County</option>
                <option value="Riverside County">Riverside County</option>
                <option value="San Bernardino County">San Bernardino County</option>
                <option value="Orange County">Orange County</option>
                <option value="Ventura County">Ventura County</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Dist from Flagship (mi)</label>
              <input
                type="number"
                step="0.1"
                value={distanceValleyVillage}
                onChange={(e) => setDistanceValleyVillage(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-900/20"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Referral Category *</label>
              <select
                value={referralType}
                onChange={(e) => setReferralType(e.target.value as LeadCategory)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-900/20"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Primary Contact Person *</label>
              <input
                type="text"
                required
                placeholder="e.g. Maria Sanchez, RN"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-900/20"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Department</label>
              <input
                type="text"
                placeholder="e.g. Discharge Planning / Social Services"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-900/20"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Email Address *</label>
              <input
                type="email"
                required
                placeholder="msanchez@hospital.org"
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-900/20"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Phone Number *</label>
              <input
                type="tel"
                required
                placeholder="(818) 555-0100"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-900/20"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Relationship Notes & Clinical Target</label>
            <textarea
              rows={2}
              placeholder="e.g. Subacute trach/vent bed hold discussions, frequent ICU step-down placements..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-900/20 resize-none"
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-5 py-2.5 rounded-lg text-xs shadow-xs transition-all flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Save Lead to CRM</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
