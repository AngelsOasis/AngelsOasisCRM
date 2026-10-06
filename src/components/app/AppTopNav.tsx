import React from 'react';
import { Plus, Sparkles, Send, FileCheck } from 'lucide-react';
import { BrandLogo } from '../common/BrandLogo';

interface AppTopNavProps {
  title: string;
  subtitle?: string;
  onAddLead: () => void;
  onLaunchCampaign: () => void;
  onOpenAIWriter: () => void;
  onLogIntake?: () => void;
}

export const AppTopNav: React.FC<AppTopNavProps> = ({
  title,
  subtitle,
  onAddLead,
  onLaunchCampaign,
  onOpenAIWriter,
  onLogIntake,
}) => {
  return (
    <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30 shadow-xs">
      <div className="flex items-center gap-4">
        {/* Mobile/Tablet Brand Mark */}
        <div className="lg:hidden">
          <BrandLogo size="sm" variant="mark-only" theme="light" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-serif font-bold text-[#4A1525] tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs text-slate-500 font-sans mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        {onLogIntake && (
          <button
            onClick={onLogIntake}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 transition-colors cursor-pointer border border-emerald-300 shadow-2xs"
            title="Log incoming clinical referral intake"
          >
            <FileCheck className="w-3.5 h-3.5 text-emerald-700" />
            <span>Log Intake</span>
          </button>
        )}

        <button
          onClick={onAddLead}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors cursor-pointer border border-slate-200"
        >
          <Plus className="w-3.5 h-3.5 text-slate-700" />
          <span>Add Lead</span>
        </button>

        <button
          onClick={onOpenAIWriter}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#4A1525] hover:bg-[#380e1b] text-rose-100 transition-colors cursor-pointer border border-[#6b2238] shadow-xs"
        >
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          <span>AI Writer</span>
        </button>

        <button
          onClick={onLaunchCampaign}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#10B981] hover:bg-[#059669] text-white shadow-xs hover:shadow transition-all cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Launch Outreach</span>
        </button>
      </div>
    </header>
  );
};
