import React from 'react';
import { 
  LayoutDashboard, 
  Database, 
  Columns3,
  Map, 
  Send, 
  Sparkles, 
  BarChart3, 
  Users2, 
  Settings,
  ShieldCheck,
  Radio,
  UserCheck
} from 'lucide-react';
import { BrandLogo } from '../common/BrandLogo';

interface AppSidebarProps {
  currentView: string;
  onSelectView: (view: string) => void;
  leadsCount: number;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  currentView,
  onSelectView,
  leadsCount,
}) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'leads', label: 'Leads Database', icon: Database, badge: leadsCount },
    { id: 'pipeline', label: 'Pipeline Kanban', icon: Columns3 },
    { id: 'map', label: 'Hospitals Map', icon: Map, isNew: true },
    { id: 'campaigns', label: 'Campaigns', icon: Send },
    { id: 'ai-writer', label: 'AI Content Writer', icon: Sparkles, highlight: true },
    { id: 'analytics', label: 'Email Analytics', icon: BarChart3 },
    { id: 'contacts', label: 'Contacts', icon: Users2 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-[#260710] text-rose-100 flex flex-col shrink-0 border-r border-rose-900/50 select-none min-h-screen">
      {/* Brand Header */}
      <div className="p-4 border-b border-rose-900/60 bg-[#2b0813]">
        <BrandLogo 
          theme="dark" 
          size="md" 
          subtitle="CLHF Referral Outreach" 
          badge="CRM" 
        />
      </div>

      {/* Cadence Status indicator */}
      <div className="mx-4 mt-4 p-3 rounded-xl bg-[#340c17] border border-rose-900/80 text-xs">
        <div className="flex items-center justify-between text-rose-200 mb-1">
          <span className="text-[11px] font-medium flex items-center gap-1.5">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
            Cadence Engine
          </span>
          <span className="text-[10px] font-bold text-emerald-400 uppercase">Active</span>
        </div>
        <div className="text-[11px] text-rose-300/70 font-sans">
          Mon · Wed · Fri Outreach
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-rose-400/60">
          CRM Modules
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectView(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all group ${
                isActive
                  ? 'bg-rose-900 text-white font-semibold shadow-xs border border-rose-700/50'
                  : 'text-rose-200/80 hover:bg-rose-950/60 hover:text-white'
              } ${item.highlight && !isActive ? 'hover:text-emerald-300' : ''}`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`w-4 h-4 transition-colors ${
                    isActive
                      ? 'text-emerald-400'
                      : item.highlight
                      ? 'text-emerald-400/90'
                      : 'text-rose-300/70 group-hover:text-rose-100'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </div>

              {item.badge !== undefined && (
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-rose-950 text-rose-200 border border-rose-800/60 tabular-nums">
                  {item.badge}
                </span>
              )}

              {item.isNew && (
                <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
                  Overpass
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* CRM User Info & Clinical Hotline Footer */}
      <div className="p-4 border-t border-rose-900/60 space-y-2.5">
        <div className="rounded-xl bg-rose-950/40 border border-rose-900/50 p-2.5">
          <div className="flex items-center gap-2 text-[11px] text-rose-200 font-semibold mb-0.5">
            <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Admissions Liaison</span>
          </div>
          <p className="text-[10px] text-rose-300/70 font-sans leading-relaxed">
            Valley Village & San Jacinto CLHF
          </p>
        </div>

        <div className="text-[10px] text-rose-300/60 text-center font-mono">
          Clinical Intake: (323) 213-2831
        </div>
      </div>
    </aside>
  );
};
