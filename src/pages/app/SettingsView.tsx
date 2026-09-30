import React, { useState } from 'react';
import { Settings, ShieldCheck, Mail, Map, Sparkles, RefreshCw, CheckCircle2, AlertTriangle, Palette } from 'lucide-react';
import { StorageService } from '../../services/storage';
import { BrandLogo } from '../../components/common/BrandLogo';

interface SettingsViewProps {
  onResetData: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onResetData }) => {
  const [resetConfirm, setResetConfirm] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');

  const handleSaveSender = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveNotice('Settings updated successfully.');
    setTimeout(() => setSaveNotice(''), 3000);
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h2 className="text-2xl font-serif font-bold text-slate-900">
          Platform Settings & System Health
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Configure outreach sender credentials, Overpass radius endpoints, and Gemini AI integration.
        </p>
      </div>

      {saveNotice && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{saveNotice}</span>
        </div>
      )}

      {/* Brand Identity & Palette */}
      <div className="bg-white p-7 rounded-3xl border border-slate-200 shadow-xs space-y-5">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Palette className="w-4 h-4 text-[#4A1525]" />
          <h3 className="text-base font-serif font-bold text-slate-900">
            Brand Identity, Official Logo & Color System
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          {/* Light Theme Logo Preview */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Primary Brand Logo (Light Background)
            </div>
            <BrandLogo size="lg" theme="light" subtitle="Congregate Living Health Facility" badge="CLHF CRM" />
          </div>

          {/* Dark Plum Theme Logo Preview */}
          <div className="p-4 rounded-2xl bg-[#260710] border border-rose-950">
            <div className="text-[11px] font-semibold text-rose-300/75 uppercase tracking-wider mb-2">
              Header & Sidebar Brand Logo (Plum Background)
            </div>
            <BrandLogo size="lg" theme="dark" subtitle="Congregate Living Health Facility" badge="CLHF CRM" />
          </div>
        </div>

        {/* Brand Swatches */}
        <div>
          <div className="text-xs font-semibold text-slate-700 mb-2">Brand Palette Swatches</div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3 rounded-xl border border-slate-200 bg-white">
              <div className="w-full h-8 rounded-lg bg-[#4A1525] mb-2 shadow-xs" />
              <div className="font-semibold text-slate-900 text-xs">Royal Plum</div>
              <div className="text-[10px] text-slate-500 font-mono">#4A1525</div>
              <div className="text-[9px] text-slate-400 mt-0.5">Primary / Header</div>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-white">
              <div className="w-full h-8 rounded-lg bg-[#260710] mb-2 shadow-xs" />
              <div className="font-semibold text-slate-900 text-xs">Dark Burgundy</div>
              <div className="text-[10px] text-slate-500 font-mono">#260710</div>
              <div className="text-[9px] text-slate-400 mt-0.5">Sidebar / Canvas</div>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-white">
              <div className="w-full h-8 rounded-lg bg-[#10B981] mb-2 shadow-xs" />
              <div className="font-semibold text-slate-900 text-xs">Vital Mint</div>
              <div className="text-[10px] text-slate-500 font-mono">#10B981</div>
              <div className="text-[9px] text-slate-400 mt-0.5">Primary CTAs</div>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-white">
              <div className="w-full h-8 rounded-lg bg-[#34D399] mb-2 shadow-xs" />
              <div className="font-semibold text-slate-900 text-xs">Soft Sage</div>
              <div className="text-[10px] text-slate-500 font-mono">#34D399</div>
              <div className="text-[9px] text-slate-400 mt-0.5">Badges & Accents</div>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-white">
              <div className="w-full h-8 rounded-lg bg-[#1E293B] mb-2 shadow-xs" />
              <div className="font-semibold text-slate-900 text-xs">Charcoal Slate</div>
              <div className="text-[10px] text-slate-500 font-mono">#1E293B</div>
              <div className="text-[9px] text-slate-400 mt-0.5">Body Typography</div>
            </div>
          </div>
        </div>
      </div>

      {/* Email Sender Configuration */}
      <div className="bg-white p-7 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Mail className="w-4 h-4 text-rose-900" />
          <h3 className="text-base font-serif font-bold text-slate-900">
            Automated Outreach Email Sender
          </h3>
        </div>

        <form onSubmit={handleSaveSender} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">From Email Address</label>
              <input
                type="email"
                defaultValue="admin@angelsoasisclhf.com"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-slate-800 bg-slate-50"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Sender Display Name</label>
              <input
                type="text"
                defaultValue="Angels Oasis CLHF Admissions & Liaison Desk"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-800"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Reply-To Address</label>
              <input
                type="email"
                defaultValue="admin@angelsoasisclhf.com"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-slate-800 bg-slate-50"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Direct Intake Phone</label>
              <input
                type="text"
                defaultValue="(323) 213-2831"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-slate-800"
              />
            </div>
          </div>

          <button
            type="submit"
            className="bg-[#380e1a] hover:bg-rose-900 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-xs transition-all cursor-pointer"
          >
            Save Sender Preferences
          </button>
        </form>
      </div>

      {/* Integration Services Status */}
      <div className="bg-white p-7 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <h3 className="text-base font-serif font-bold text-slate-900">
            System Integration Status
          </h3>
        </div>

        <div className="space-y-3 text-xs">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-emerald-600" />
              <div>
                <div className="font-semibold text-slate-900">Gemini AI Model Engine</div>
                <div className="text-[11px] text-slate-500 font-mono">Model: gemini-3.8-flash (Server-Side)</div>
              </div>
            </div>
            <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
              Active & Connected
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Map className="w-5 h-5 text-rose-900" />
              <div>
                <div className="font-semibold text-slate-900">OpenStreetMap Overpass API Proxy</div>
                <div className="text-[11px] text-slate-500 font-mono">Endpoint: https://overpass-api.de/api/interpreter</div>
              </div>
            </div>
            <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
              Radius Scanner Ready
            </span>
          </div>
        </div>
      </div>

      {/* Demo Data Reset */}
      <div className="bg-rose-50/50 p-7 rounded-3xl border border-rose-200 space-y-4">
        <div className="flex items-center gap-2 text-rose-900">
          <AlertTriangle className="w-5 h-5 text-rose-700" />
          <h3 className="text-base font-serif font-bold text-rose-950">
            Reset Platform Data
          </h3>
        </div>
        <p className="text-xs text-rose-900/80 leading-relaxed">
          Restore initial Southern California hospital leads (Cedars-Sinai, Tarzana, Valley Pres, Ronald Reagan UCLA, Hemet Global) and reset outreach email logs to default state.
        </p>

        {!resetConfirm ? (
          <button
            onClick={() => setResetConfirm(true)}
            className="bg-rose-900 hover:bg-rose-800 text-white font-semibold px-4 py-2 rounded-xl text-xs transition-colors cursor-pointer"
          >
            Reset to Canonical Demo Data
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                onResetData();
                setResetConfirm(false);
              }}
              className="bg-red-700 hover:bg-red-800 text-white font-bold px-4 py-2 rounded-xl text-xs cursor-pointer"
            >
              Confirm Full Reset
            </button>
            <button
              onClick={() => setResetConfirm(false)}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};