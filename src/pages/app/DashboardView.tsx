import React from 'react';
import { 
  Database, 
  Send, 
  MailOpen, 
  MessageSquare, 
  Sparkles, 
  Map, 
  Plus, 
  ArrowUpRight, 
  CheckCircle2, 
  Clock, 
  Building2, 
  TrendingUp, 
  Calendar,
  ShieldCheck
} from 'lucide-react';
import { Campaign, LeadRecord } from '../../types';
import { BrandLogo } from '../../components/common/BrandLogo';

interface DashboardViewProps {
  leads: LeadRecord[];
  campaigns: Campaign[];
  onNavigateView: (view: string) => void;
  onOpenAddLead: () => void;
  onOpenQuickEmail: (lead: LeadRecord) => void;
  onSelectLead: (lead: LeadRecord) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  leads,
  campaigns,
  onNavigateView,
  onOpenAddLead,
  onOpenQuickEmail,
  onSelectLead,
}) => {
  // Compute KPIs
  const totalLeads = leads.length;
  const newLeads = leads.filter((l) => l.status === 'New').length;
  const activePartners = leads.filter((l) => l.status === 'Active Partner' || l.status === 'Engaged').length;

  const totalSent = campaigns.reduce((sum, c) => sum + c.sentCount, 0);
  const totalOpens = campaigns.reduce((sum, c) => sum + c.openCount, 0);
  const totalReplies = campaigns.reduce((sum, c) => sum + c.replyCount, 0);
  const averageOpenRate = totalSent > 0 ? Math.round((totalOpens / totalSent) * 100) : 67;
  const averageReplyRate = totalSent > 0 ? Math.round((totalReplies / totalSent) * 100) : 15;

  // Flatten recent outreach activity from all leads
  const recentActivity = leads
    .flatMap((lead) =>
      (lead.outreachHistory || []).map((outreach) => ({
        ...outreach,
        leadName: lead.hospitalName,
        leadCategory: lead.referralType,
        leadObj: lead,
      }))
    )
    .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
    .slice(0, 6);

  // Top facilities by qualification score & engagement
  const topEngagedLeads = [...leads]
    .sort((a, b) => (b.qualificationScore || 0) - (a.qualificationScore || 0))
    .slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Top Welcome / Strategy Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-[#2a0813] via-[#3a0d1b] to-[#481324] text-white shadow-md border border-rose-950 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-4 max-w-2xl">
          <BrandLogo size="lg" theme="dark" variant="mark-only" />
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-400/30">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Angels Oasis CLHF · Valley Village Flagship & San Jacinto</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-serif font-bold text-white tracking-tight">
              Referral Outreach Command Center
            </h2>
            <p className="text-xs sm:text-sm text-rose-200/80 leading-relaxed font-light">
              Automating relationships with hospital discharge planners, case managers, and ICU step-down teams across Southern California. 3-day weekly cadence active.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            onClick={() => onNavigateView('pipeline')}
            className="bg-white/10 hover:bg-white/20 text-white font-semibold px-3.5 py-2.5 rounded-xl text-xs border border-white/20 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <span>Pipeline Kanban</span>
          </button>
          <button
            onClick={() => onNavigateView('map')}
            className="bg-white/10 hover:bg-white/20 text-white font-semibold px-3.5 py-2.5 rounded-xl text-xs border border-white/20 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Map className="w-4 h-4 text-emerald-300" />
            <span>Map Scan</span>
          </button>
          <button
            onClick={() => onNavigateView('ai-writer')}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>AI Assistant</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <div className="text-slate-500 text-xs font-medium mb-1">Total Leads</div>
          <div className="text-2xl font-serif font-bold text-slate-900 tabular-nums">
            {totalLeads}
          </div>
          <div className="text-[11px] text-emerald-700 font-medium flex items-center gap-1 mt-1">
            <TrendingUp className="w-3 h-3" />
            <span>+12 this week</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <div className="text-slate-500 text-xs font-medium mb-1">New Leads</div>
          <div className="text-2xl font-serif font-bold text-rose-950 tabular-nums">
            {newLeads}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Pending first contact</div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <div className="text-slate-500 text-xs font-medium mb-1">Emails Sent</div>
          <div className="text-2xl font-serif font-bold text-slate-900 tabular-nums">
            {totalSent}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Across 3 campaigns</div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <div className="text-slate-500 text-xs font-medium mb-1">Open Rate</div>
          <div className="text-2xl font-serif font-bold text-emerald-700 tabular-nums">
            {averageOpenRate}%
          </div>
          <div className="text-[11px] text-emerald-700 font-medium mt-1">Well above avg</div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <div className="text-slate-500 text-xs font-medium mb-1">Reply Rate</div>
          <div className="text-2xl font-serif font-bold text-emerald-700 tabular-nums">
            {averageReplyRate}%
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Direct case inquiries</div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <div className="text-slate-500 text-xs font-medium mb-1">Active Partners</div>
          <div className="text-2xl font-serif font-bold text-slate-900 tabular-nums">
            {activePartners}
          </div>
          <div className="text-[11px] text-emerald-700 font-medium mt-1">Engaged facilities</div>
        </div>
      </div>

      {/* 3-Day Weekly Campaign Cadence Schedule */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-900">
              Automated Cadence Pipeline
            </span>
            <h3 className="text-xl font-serif font-bold text-slate-900 mt-0.5">
              This Week's Outreach Schedule (Monday · Wednesday · Friday)
            </h3>
          </div>
          <button
            onClick={() => onNavigateView('campaigns')}
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 self-start sm:self-auto"
          >
            <span>Manage All Campaigns</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {campaigns.map((camp) => (
            <div
              key={camp.id}
              className="p-6 rounded-2xl border border-slate-200/90 bg-slate-50/50 hover:bg-white hover:shadow-sm transition-all space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase px-2 py-0.5 rounded bg-[#380e1a] text-white">
                  {camp.day}
                </span>
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full">
                  {camp.status}
                </span>
              </div>

              <div>
                <h4 className="text-sm font-serif font-bold text-slate-900 line-clamp-1">
                  {camp.name}
                </h4>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                  {camp.theme}
                </p>
              </div>

              <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-600 font-mono">
                <span>Sent: <strong className="text-slate-900">{camp.sentCount}</strong></span>
                <span>Opens: <strong className="text-emerald-700">{camp.openCount}</strong></span>
                <span>Replies: <strong className="text-emerald-700">{camp.replyCount}</strong></span>
              </div>

              <div className="text-[11px] text-slate-500 flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>Next: {camp.nextScheduledSend}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Two Column Section: Top Engaged Facilities + Recent Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top Facilities by Engagement */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-xs">
          <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100">
            <h3 className="text-base font-serif font-bold text-slate-900">
              Top Referral Partners by Engagement
            </h3>
            <button
              onClick={() => onNavigateView('leads')}
              className="text-xs font-semibold text-emerald-700 hover:underline"
            >
              View All Leads
            </button>
          </div>

          <div className="space-y-3">
            {topEngagedLeads.map((lead) => (
              <div
                key={lead.id}
                onClick={() => onSelectLead(lead)}
                className="p-3.5 rounded-xl border border-slate-200/80 hover:border-rose-900/40 hover:bg-rose-50/20 transition-all flex items-center justify-between gap-3 cursor-pointer group"
              >
                <div className="space-y-1 max-w-[70%]">
                  <div className="text-xs font-bold text-slate-900 group-hover:text-rose-950 transition-colors line-clamp-1">
                    {lead.hospitalName}
                  </div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-2">
                    <span>{lead.contactPerson}</span>
                    <span>·</span>
                    <span className="text-slate-400">{lead.distanceValleyVillage} mi away</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 tabular-nums">
                    {lead.qualificationScore || 90}/100
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    {lead.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Outreach Activity Feed */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-xs">
          <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100">
            <h3 className="text-base font-serif font-bold text-slate-900">
              Recent Outreach Activity Feed
            </h3>
            <span className="text-xs text-slate-400 font-mono">Live Sync</span>
          </div>

          <div className="space-y-3">
            {recentActivity.length > 0 ? (
              recentActivity.map((act) => (
                <div
                  key={act.id}
                  onClick={() => onSelectLead(act.leadObj)}
                  className="p-3.5 rounded-xl border border-slate-200/80 hover:border-slate-300 transition-all flex items-start justify-between gap-3 cursor-pointer"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="font-semibold text-rose-900">{act.leadName}</span>
                      <span className="text-slate-400 font-mono">{act.sentAt}</span>
                    </div>
                    <div className="text-xs text-slate-800 line-clamp-1">
                      {act.subject}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      To: {act.recipientName}
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                      act.status === 'replied'
                        ? 'bg-emerald-100 text-emerald-800'
                        : act.status === 'opened'
                        ? 'bg-blue-100 text-blue-800'
                        : act.status === 'clicked'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {act.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center py-10 text-xs text-slate-500">
                No outreach activity logged yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};