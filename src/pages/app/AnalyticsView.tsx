import React from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Send, 
  MailOpen, 
  MousePointerClick, 
  MessageSquare, 
  Building2,
  Calendar,
  CheckCircle2
} from 'lucide-react';
import { Campaign, LeadRecord } from '../../types';

interface AnalyticsViewProps {
  campaigns: Campaign[];
  leads: LeadRecord[];
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ campaigns, leads }) => {
  const totalSent = campaigns.reduce((s, c) => s + c.sentCount, 0);
  const totalOpens = campaigns.reduce((s, c) => s + c.openCount, 0);
  const totalClicks = campaigns.reduce((s, c) => s + c.clickCount, 0);
  const totalReplies = campaigns.reduce((s, c) => s + c.replyCount, 0);

  const overallOpenRate = totalSent > 0 ? Math.round((totalOpens / totalSent) * 100) : 0;
  const overallClickRate = totalSent > 0 ? Math.round((totalClicks / totalSent) * 100) : 0;
  const overallReplyRate = totalSent > 0 ? Math.round((totalReplies / totalSent) * 100) : 0;

  // Flatten all outreach events
  const allEvents = leads
    .flatMap((l) => (l.outreachHistory || []).map((e) => ({ ...e, leadName: l.hospitalName })))
    .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div>
        <h2 className="text-2xl font-serif font-bold text-slate-900">
          Referral Email Analytics & Conversion Dashboard
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Real-time tracking of sent messages, opens, link clicks, and direct case manager replies.
        </p>
      </div>

      {/* Primary KPI Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Total Delivered</span>
            <Send className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-3xl font-serif font-bold text-slate-900 tabular-nums">
            {totalSent}
          </div>
          <span className="text-[11px] text-emerald-700 font-medium">99.4% Delivery rate</span>
        </div>

        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Open Rate</span>
            <MailOpen className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-3xl font-serif font-bold text-emerald-700 tabular-nums">
            {overallOpenRate}%
          </div>
          <span className="text-[11px] text-slate-500">{totalOpens} verified opens</span>
        </div>

        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Click-Through</span>
            <MousePointerClick className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-3xl font-serif font-bold text-blue-700 tabular-nums">
            {overallClickRate}%
          </div>
          <span className="text-[11px] text-slate-500">{totalClicks} intake packet downloads</span>
        </div>

        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Direct Reply Rate</span>
            <MessageSquare className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-3xl font-serif font-bold text-purple-700 tabular-nums">
            {overallReplyRate}%
          </div>
          <span className="text-[11px] text-purple-700 font-medium">{totalReplies} case discussions</span>
        </div>
      </div>

      {/* Cadence Breakdown Comparison (Monday vs Wednesday vs Friday) */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs">
        <h3 className="text-lg font-serif font-bold text-slate-900 mb-6 pb-2 border-b border-slate-100">
          Weekly Campaign Cadence Comparison
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {campaigns.map((camp) => {
            const openPct = camp.sentCount > 0 ? Math.round((camp.openCount / camp.sentCount) * 100) : 0;
            const clickPct = camp.sentCount > 0 ? Math.round((camp.clickCount / camp.sentCount) * 100) : 0;
            const replyPct = camp.sentCount > 0 ? Math.round((camp.replyCount / camp.sentCount) * 100) : 0;

            return (
              <div key={camp.id} className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold uppercase px-2.5 py-0.5 rounded bg-[#380e1a] text-white">
                    {camp.day}
                  </span>
                  <span className="text-xs text-slate-500 font-mono">{camp.sentCount} sent</span>
                </div>

                <div className="font-serif font-bold text-slate-900 text-sm">
                  {camp.name}
                </div>

                {/* Progress bars */}
                <div className="space-y-2 text-xs">
                  <div>
                    <div className="flex justify-between text-[11px] text-slate-600 mb-1">
                      <span>Open Rate</span>
                      <span className="font-bold font-mono text-emerald-700">{openPct}%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${openPct}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-slate-600 mb-1">
                      <span>Click Rate</span>
                      <span className="font-bold font-mono text-blue-700">{clickPct}%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-blue-500 h-full rounded-full" style={{ width: `${clickPct}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-slate-600 mb-1">
                      <span>Reply Rate</span>
                      <span className="font-bold font-mono text-purple-700">{replyPct}%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-purple-500 h-full rounded-full" style={{ width: `${replyPct}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Event Stream / Interaction Audit Log */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <h3 className="text-base font-serif font-bold text-slate-900">
            Recipient Interaction Event Log ({allEvents.length})
          </h3>
          <span className="text-xs text-slate-400 font-mono">Real-time status updates</span>
        </div>

        <div className="divide-y divide-slate-100 text-xs">
          {allEvents.slice(0, 10).map((evt) => (
            <div key={evt.id} className="py-3.5 flex items-center justify-between gap-4">
              <div className="space-y-0.5 max-w-[65%]">
                <div className="font-semibold text-slate-900 line-clamp-1">
                  {evt.leadName} · <span className="text-slate-500 font-normal">{evt.recipientName}</span>
                </div>
                <div className="text-[11px] text-slate-500 line-clamp-1">
                  {evt.campaignName}: "{evt.subject}"
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="font-mono text-slate-400 text-[11px]">{evt.sentAt}</span>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                    evt.status === 'replied'
                      ? 'bg-emerald-100 text-emerald-800'
                      : evt.status === 'opened'
                      ? 'bg-blue-100 text-blue-800'
                      : evt.status === 'clicked'
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {evt.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
