import React, { useState } from 'react';
import { 
  Sparkles, 
  Send, 
  Copy, 
  Check, 
  RefreshCw, 
  Share2, 
  BookOpen, 
  Clock, 
  CheckCircle2, 
  Layers, 
  FileText,
  Building2,
  Sliders
} from 'lucide-react';
import { AIContentGenerationRequest, AIContentGenerationResult, Campaign } from '../../types';
import { ApiService } from '../../services/api';

interface AIWriterViewProps {
  initialCampaignType?: string;
  campaigns: Campaign[];
  onApplyToCampaign: (campaignDay: 'Monday' | 'Wednesday' | 'Friday', subject: string, body: string, cta: string) => void;
}

export const AIWriterView: React.FC<AIWriterViewProps> = ({
  initialCampaignType,
  campaigns,
  onApplyToCampaign,
}) => {
  const [campaignType, setCampaignType] = useState<'Monday Newsletter' | 'Wednesday Facility Education' | 'Friday Testimonials' | 'Custom Outreach'>(
    (initialCampaignType as any) || 'Wednesday Facility Education'
  );
  const [targetAudience, setTargetAudience] = useState<string>('Hospital Discharge Planners & ICU Case Managers');
  const [specificTopic, setSpecificTopic] = useState<string>('When Patients Need Specialized CLHF Residential Step-Down vs Standard SNF');
  const [focusClinicalService, setFocusClinicalService] = useState<string>('Ventilator Care Support & 3:1 Staffing');
  const [tone, setTone] = useState<'Professional & Empathetic' | 'Clinical & Direct' | 'Warm Residential' | 'Executive Overview'>('Clinical & Direct');

  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<AIContentGenerationResult | null>(null);
  const [activeOutputTab, setActiveOutputTab] = useState<'email' | 'followup' | 'social' | 'blog'>('email');
  const [copiedKey, setCopiedKey] = useState<string>('');
  const [applySuccess, setApplySuccess] = useState<string>('');

  const handleGenerate = async () => {
    setLoading(true);
    setApplySuccess('');
    try {
      const generated = await ApiService.generateAICampaign({
        campaignType,
        targetAudience,
        specificTopic,
        focusClinicalService,
        tone,
      });
      setResult(generated);
    } catch (err) {
      console.error('Error generating AI campaign:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 2500);
  };

  const handleApply = () => {
    if (!result) return;
    let day: 'Monday' | 'Wednesday' | 'Friday' = 'Wednesday';
    if (campaignType.includes('Monday')) day = 'Monday';
    if (campaignType.includes('Friday')) day = 'Friday';

    onApplyToCampaign(day, result.subjectLine, result.emailBody, result.callToAction.label);
    setApplySuccess(`Successfully applied generated draft to the ${day} Campaign!`);
    setTimeout(() => setApplySuccess(''), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-bold text-slate-900 flex items-center gap-2">
            AI Content Assistant & Multi-Channel Generator
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Powered by Gemini 3.8 Flash. Generates email campaigns, auto-followups, LinkedIn posts, and educational blogs.
          </p>
        </div>

        {result && (
          <button
            onClick={handleApply}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#10B981] hover:bg-[#059669] text-white shadow-xs transition-all cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Apply to Cadence Schedule</span>
          </button>
        )}
      </div>

      {applySuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{applySuccess}</span>
        </div>
      )}

      {/* Two Columns: Input Form (Left) & Generated Multi-Channel Output (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Input Parameters Box */}
        <div className="lg:col-span-5 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Sliders className="w-4 h-4 text-rose-900" />
            <h3 className="text-sm font-serif font-bold text-slate-900">
              Campaign Parameters
            </h3>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                1. Campaign Type & Day
              </label>
              <select
                value={campaignType}
                onChange={(e) => setCampaignType(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-rose-900/20"
              >
                <option value="Monday Newsletter">Monday Campaign — Newsletter To All Leads</option>
                <option value="Wednesday Facility Education">Wednesday Campaign — Facility Education Email</option>
                <option value="Friday Testimonials">Friday Campaign — Testimonials / Blog Content</option>
                <option value="Custom Outreach">Custom Specialized Hospital Outreach</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                2. Target Healthcare Audience
              </label>
              <input
                type="text"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="e.g. Hospital Discharge Planners, ICU Case Managers"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-900/20"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                3. Primary Clinical Focus & Topic
              </label>
              <textarea
                rows={2}
                value={specificTopic}
                onChange={(e) => setSpecificTopic(e.target.value)}
                placeholder="e.g. Tracheostomy Care, Ventilator Support, 3:1 Ratio vs Standard SNF..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-900/20 resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Core Service Highlight
                </label>
                <select
                  value={focusClinicalService}
                  onChange={(e) => setFocusClinicalService(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-slate-800 focus:outline-none text-[11px]"
                >
                  <option value="Ventilator Care Support & 3:1 Staffing">Ventilator Care & 3:1 Staffing</option>
                  <option value="Tracheostomy Airway Management">Tracheostomy Airway Care</option>
                  <option value="Gastrostomy & Enteral Feeding">Gastrostomy (G-Tube / J-Tube)</option>
                  <option value="Hospice & Terminal Illness Care">Hospice & Palliative Comfort</option>
                  <option value="IV Therapy & Pain Management">IV Infusions & Pain Care</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Voice & Tone
                </label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value as any)}
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-slate-800 focus:outline-none text-[11px]"
                >
                  <option value="Clinical & Direct">Clinical & Direct</option>
                  <option value="Professional & Empathetic">Professional & Empathetic</option>
                  <option value="Warm Residential">Warm Residential</option>
                  <option value="Executive Overview">Executive Overview</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full mt-2 bg-[#4A1525] hover:bg-[#380e1b] text-white font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs transition-all disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>Drafting Full Outreach Package...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Generate Multi-Channel Campaign</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Output Area */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Output Tab Switcher */}
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 overflow-x-auto">
            <div className="flex items-center gap-1.5 text-xs">
              <button
                onClick={() => setActiveOutputTab('email')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  activeOutputTab === 'email'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                1. Primary Email
              </button>
              <button
                onClick={() => setActiveOutputTab('followup')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  activeOutputTab === 'followup'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                2. Auto Follow-Up
              </button>
              <button
                onClick={() => setActiveOutputTab('social')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  activeOutputTab === 'social'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                3. Social (LinkedIn)
              </button>
              <button
                onClick={() => setActiveOutputTab('blog')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  activeOutputTab === 'blog'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                4. Educational Blog
              </button>
            </div>

            {result && (
              <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                Gemini 3.8 Flash
              </span>
            )}
          </div>

          <div className="p-6">
            {!result ? (
              <div className="py-20 text-center text-slate-400 space-y-3">
                <Sparkles className="w-8 h-8 mx-auto text-slate-300" />
                <h4 className="text-base font-serif font-semibold text-slate-700">
                  Ready to draft campaign content
                </h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Select your campaign parameters on the left and click "Generate Multi-Channel Campaign" to produce formatted emails, follow-ups, social posts, and blog articles.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* TAB 1: Primary Email */}
                {activeOutputTab === 'email' && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Subject Line
                        </span>
                        <button
                          onClick={() => handleCopy(result.subjectLine, 'sub')}
                          className="text-[11px] font-semibold text-emerald-700 hover:underline flex items-center gap-1"
                        >
                          {copiedKey === 'sub' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedKey === 'sub' ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <div className="text-sm font-semibold text-slate-900 font-sans">
                        {result.subjectLine}
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Email Body
                        </span>
                        <button
                          onClick={() => handleCopy(result.emailBody, 'body')}
                          className="text-[11px] font-semibold text-emerald-700 hover:underline flex items-center gap-1"
                        >
                          {copiedKey === 'body' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedKey === 'body' ? 'Copied' : 'Copy Body'}</span>
                        </button>
                      </div>
                      <div className="text-xs text-slate-800 leading-relaxed font-sans whitespace-pre-wrap">
                        {result.emailBody}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[10px] font-bold uppercase text-emerald-800 block">
                          Call to Action (CTA)
                        </span>
                        <strong className="text-emerald-950">{result.callToAction.label}</strong>
                      </div>
                      <span className="text-[11px] font-mono text-emerald-700">
                        {result.callToAction.targetAction}
                      </span>
                    </div>
                  </div>
                )}

                {/* TAB 2: Auto Follow-up */}
                {activeOutputTab === 'followup' && (
                  <div className="space-y-4">
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>
                        Recommended Cadence: Send automatically <strong>{result.followUpEmail.delayDays || 3} days</strong> after initial outreach if no response is received.
                      </span>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase text-slate-500">
                          Follow-up Subject
                        </span>
                        <button
                          onClick={() => handleCopy(result.followUpEmail.subjectLine, 'fu-sub')}
                          className="text-[11px] font-semibold text-emerald-700 hover:underline flex items-center gap-1"
                        >
                          {copiedKey === 'fu-sub' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedKey === 'fu-sub' ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <div className="text-xs font-semibold text-slate-900">
                        {result.followUpEmail.subjectLine}
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase text-slate-500">
                          Follow-up Message
                        </span>
                        <button
                          onClick={() => handleCopy(result.followUpEmail.body, 'fu-body')}
                          className="text-[11px] font-semibold text-emerald-700 hover:underline flex items-center gap-1"
                        >
                          {copiedKey === 'fu-body' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedKey === 'fu-body' ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <div className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                        {result.followUpEmail.body}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: Social Media (LinkedIn) */}
                {activeOutputTab === 'social' && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1">
                          <Share2 className="w-3.5 h-3.5 text-blue-600" />
                          LinkedIn / Professional Healthcare Network
                        </span>
                        <button
                          onClick={() => handleCopy(result.socialMediaVersion.content, 'soc')}
                          className="text-[11px] font-semibold text-emerald-700 hover:underline flex items-center gap-1"
                        >
                          {copiedKey === 'soc' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedKey === 'soc' ? 'Copied' : 'Copy Post'}</span>
                        </button>
                      </div>

                      <div className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                        {result.socialMediaVersion.content}
                      </div>

                      {result.socialMediaVersion.hashtags && (
                        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-200">
                          {result.socialMediaVersion.hashtags.map((tag, i) => (
                            <span key={i} className="text-[11px] font-mono text-rose-900">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 4: Educational Blog */}
                {activeOutputTab === 'blog' && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <div>
                          <span className="text-[10px] font-bold uppercase text-slate-400 block">
                            Blog Title
                          </span>
                          <h4 className="text-base font-serif font-bold text-slate-900">
                            {result.blogVersion.title}
                          </h4>
                        </div>
                        <button
                          onClick={() =>
                            handleCopy(
                              `${result.blogVersion.title}\n\n${result.blogVersion.excerpt}\n\n` +
                                result.blogVersion.sections.map((s) => `## ${s.heading}\n${s.content}`).join('\n\n'),
                              'blog'
                            )
                          }
                          className="text-[11px] font-semibold text-emerald-700 hover:underline flex items-center gap-1 shrink-0"
                        >
                          {copiedKey === 'blog' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedKey === 'blog' ? 'Copied' : 'Copy Full Article'}</span>
                        </button>
                      </div>

                      <p className="text-xs text-slate-600 italic font-serif">
                        "{result.blogVersion.excerpt}"
                      </p>

                      <div className="space-y-4 pt-2">
                        {result.blogVersion.sections.map((sec, idx) => (
                          <div key={idx} className="space-y-1">
                            <h5 className="text-xs font-serif font-bold text-slate-900">
                              {sec.heading}
                            </h5>
                            <p className="text-xs text-slate-700 leading-relaxed">
                              {sec.content}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};