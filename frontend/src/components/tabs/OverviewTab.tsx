import React from 'react';
import { TrendingUp, Percent, Calendar, IndianRupee, ShieldAlert, ShieldQuestion, ShieldCheck, Loader2, CheckCircle2, ArrowRight } from 'lucide-react';

interface LoanFields {
  loan_amount: string;
  loan_type: string;
  interest_rate: string;
  interest_type: string;
  tenure: string;
  emi: string;
  disbursement_mode: string;
  processing_fee: string;
  insurance: string;
  other_charges: string;
  late_payment_charges: string;
  prepayment_charges: string;
  prepayment_allowed: string;
  lock_in_period: string;
  collateral: string;
  rate_reset_conditions: string;
  default_conditions: string;
}

interface RiskFlag {
  id: string;
  clause_text: string;
  rbi_rule_matched: string | null;
  rbi_source_document: string | null;
  rbi_document_status: string;
  deviation_description: string | null;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  reason: string | null;
}

interface OverviewTabProps {
  sessionId: string;
  loanFields: LoanFields | null;
  loadingFields: boolean;
  summaryA: string | null;
  summarizingA: boolean;
  docAName: string;
  riskFlags: RiskFlag[];
  riskLoading?: boolean;
  riskError?: string | null;
  onNavigate: (tab: string) => void;
}

function cleanMarkdown(text: string): string {
  if (!text) return '';
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')  // **bold** -> bold
    .replace(/\*([^*]+)\*/g, '$1')      // *italic* -> italic
    .replace(/__([^_]+)__/g, '$1')      // __bold__ -> bold
    .replace(/_([^_]+)_/g, '$1')        // _italic_ -> italic
    .replace(/`([^`]+)`/g, '$1')        // `code` -> code
    .replace(/^#{1,6}\s*/, '')          // ### headings
    .replace(/^[-*•]\s*/, '')           // list bullets
    .trim();
}

function extractChecklistFromSummary(summary?: string | null): string[] {
  if (!summary) return [];
  const match = summary.match(/###\s*Important Things to Check\s*[\r\n]+([\s\S]*?)(?:###|$)/i);
  if (!match || !match[1]) return [];
  return match[1]
    .split('\n')
    .map(line => cleanMarkdown(line))
    .filter(line => line.length > 5 && !line.startsWith('#') && !line.startsWith('|'));
}

export default function OverviewTab({
  loanFields,
  loadingFields,
  summaryA,
  summarizingA,
  docAName,
  riskFlags,
  riskLoading,
  riskError,
  onNavigate
}: OverviewTabProps) {
  const highRisk = riskFlags.filter(r => r.risk_level === 'HIGH').length;
  const medRisk = riskFlags.filter(r => r.risk_level === 'MEDIUM').length;
  const lowRisk = riskFlags.filter(r => r.risk_level === 'LOW').length;
  const hasRisks = riskFlags.length > 0;

  const isNotSpecified = (val?: string) => !val || val === 'Not specified' || val.toLowerCase().includes('not specified') || val.toLowerCase().includes('could not extract');

  const checklistBullets = extractChecklistFromSummary(summaryA);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Agreement Overview</h2>
        <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">{docAName}</span>
      </div>

      {loadingFields ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-3"></div>
              <div className="h-6 bg-gray-200 rounded w-3/4"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 mb-2">
              <TrendingUp size={16} />
              <span className="text-sm font-medium">Loan Amount</span>
            </div>
            <div className={`text-xl font-bold ${isNotSpecified(loanFields?.loan_amount) ? 'text-gray-400' : 'text-blue-600'}`}>
              {loanFields?.loan_amount || 'Not specified'}
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 mb-2">
              <Percent size={16} />
              <span className="text-sm font-medium">Interest Rate</span>
            </div>
            <div className={`text-xl font-bold ${isNotSpecified(loanFields?.interest_rate) ? 'text-gray-400' : 'text-blue-600'}`}>
              {loanFields?.interest_rate || 'Not specified'}
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 mb-2">
              <Calendar size={16} />
              <span className="text-sm font-medium">Tenure</span>
            </div>
            <div className={`text-xl font-bold ${isNotSpecified(loanFields?.tenure) ? 'text-gray-400' : 'text-blue-600'}`}>
              {loanFields?.tenure || 'Not specified'}
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 mb-2">
              <IndianRupee size={16} />
              <span className="text-sm font-medium">EMI</span>
            </div>
            <div className={`text-xl font-bold ${isNotSpecified(loanFields?.emi) ? 'text-gray-400' : 'text-blue-600'}`}>
              {loanFields?.emi || 'Not specified'}
            </div>
          </div>
        </div>
      )}

      {/* Risk Overview Bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="font-semibold text-gray-800">Risk Overview</div>
        {riskLoading ? (
          <div className="flex items-center gap-2 text-sm text-blue-600 font-medium">
            <Loader2 className="animate-spin text-blue-500" size={16} />
            <span>Scanning agreement clauses for compliance risks...</span>
          </div>
        ) : riskError ? (
          <div className="text-sm text-red-500">{riskError}</div>
        ) : !hasRisks ? (
          <div className="text-sm text-gray-500">No risk flags detected in agreement</div>
        ) : (
          <div className="flex items-center gap-4 text-sm font-medium">
            <div className="flex items-center gap-1.5 bg-red-50 text-red-700 px-3 py-1 rounded-full border border-red-100">
              <ShieldAlert size={14} /> High: {highRisk}
            </div>
            <div className="flex items-center gap-1.5 bg-amber-50 text-amber-700 px-3 py-1 rounded-full border border-amber-100">
              <ShieldQuestion size={14} /> Medium: {medRisk}
            </div>
            <div className="flex items-center gap-1.5 bg-green-50 text-green-700 px-3 py-1 rounded-full border border-green-100">
              <ShieldCheck size={14} /> Low: {lowRisk}
            </div>
          </div>
        )}
        <button 
          onClick={() => onNavigate('risks')}
          className="text-sm bg-blue-50 text-blue-600 px-4 py-2 rounded-lg font-medium hover:bg-blue-100 transition-colors"
        >
          View All Risks
        </button>
      </div>

      {/* Clause Explanation Card — directly below Risk Overview */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-blue-700 mb-1">Clause Explanation</div>
          <h4 className="font-semibold text-gray-900 text-base">Understand Your Agreement</h4>
          <p className="text-sm text-gray-500 mt-0.5">
            Review important clauses explained in simple, easy-to-understand language with borrower implications and RBI context.
          </p>
        </div>
        <button
          onClick={() => onNavigate('details')}
          className="text-sm bg-blue-50 text-blue-600 px-4 py-2 rounded-lg font-medium hover:bg-blue-100 transition-colors whitespace-nowrap flex items-center gap-1.5 shrink-0 self-start md:self-auto"
        >
          Explore Clauses <ArrowRight size={14} />
        </button>
      </div>

      {/* Prepayment & Penalties Section — preserved structure */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h3 className="text-xs font-bold uppercase tracking-wider text-blue-700 mb-4 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 inline-block"></span>
          Prepayment & Penalties
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-amber-50/50 border border-amber-200/70 rounded-lg p-4">
            <span className="text-xs font-bold text-amber-900 uppercase tracking-wide block mb-2">Prepayment Conditions</span>
            <div className="text-xs text-gray-700 space-y-2">
              <p>
                <strong className="text-gray-900">Prepayment:</strong>{' '}
                {isNotSpecified(loanFields?.prepayment_allowed) 
                  ? (isNotSpecified(loanFields?.prepayment_charges) ? 'Not specified in the agreement' : 'Allowed, subject to applicable charges') 
                  : `${cleanMarkdown(loanFields?.prepayment_allowed || '')}, subject to applicable charges`}
              </p>
              <p>
                <strong className="text-gray-900">Prepayment Charge:</strong>{' '}
                <span className={isNotSpecified(loanFields?.prepayment_charges) ? 'text-gray-400 italic' : 'text-gray-900 font-medium'}>
                  {cleanMarkdown(loanFields?.prepayment_charges || '') || 'Not specified'}
                </span>
              </p>
              <p>
                <strong className="text-gray-900">Lock-in Period:</strong>{' '}
                <span className={isNotSpecified(loanFields?.lock_in_period) ? 'text-gray-400 italic' : 'text-gray-900 font-medium'}>
                  {cleanMarkdown(loanFields?.lock_in_period || '') || 'Not specified'}
                </span>
              </p>
            </div>
          </div>

          <div className="bg-red-50/50 border border-red-200/70 rounded-lg p-4">
            <span className="text-xs font-bold text-red-900 uppercase tracking-wide block mb-2">Late Payment Penalties</span>
            <div className="text-xs text-gray-700 space-y-2">
              <p>
                <strong className="text-gray-900">Late Payment Charge:</strong>{' '}
                <span className={isNotSpecified(loanFields?.late_payment_charges) ? 'text-gray-400 italic' : 'text-gray-900 font-medium'}>
                  {cleanMarkdown(loanFields?.late_payment_charges || '') || 'Not specified'}
                </span>
              </p>
              <p>
                <strong className="text-gray-900">Default Impact:</strong>{' '}
                <span className={isNotSpecified(loanFields?.default_conditions) ? 'text-gray-400 italic' : 'text-gray-900 font-medium'}>
                  {cleanMarkdown(loanFields?.default_conditions || '') || 'Subject to penal interest on overdue instalments + applicable taxes.'}
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* KEY TERMS TO CONSIDER — clean, compact borrower checks without raw markdown */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-blue-700 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 inline-block"></span>
            KEY TERMS TO CONSIDER
          </h3>
          <span className="text-xs text-gray-400 font-medium">Important Borrower Checks</span>
        </div>

        {summarizingA ? (
          <div className="flex items-center justify-center py-6 text-gray-500 gap-3">
            <Loader2 className="animate-spin text-blue-500" size={18} />
            <span className="text-sm">Evaluating key agreement terms...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {checklistBullets.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {checklistBullets.slice(0, 6).map((bullet, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 p-3 rounded-lg bg-gray-50 border border-gray-100 text-xs text-gray-700 leading-relaxed">
                    <CheckCircle2 size={15} className="text-blue-600 shrink-0 mt-0.5" />
                    <span>{cleanMarkdown(bullet)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-700">
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <CheckCircle2 size={15} className="text-blue-600 shrink-0 mt-0.5" />
                  <span>Verify whether interest rate is fixed or subject to periodic benchmark reset</span>
                </div>
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <CheckCircle2 size={15} className="text-blue-600 shrink-0 mt-0.5" />
                  <span>Check exact foreclosure and part-prepayment charges applicable before signing</span>
                </div>
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <CheckCircle2 size={15} className="text-blue-600 shrink-0 mt-0.5" />
                  <span>Confirm all upfront fees including processing, documentation, and insurance charges</span>
                </div>
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <CheckCircle2 size={15} className="text-blue-600 shrink-0 mt-0.5" />
                  <span>Review grace period and penal interest rate in case of overdue EMI payment</span>
                </div>
              </div>
            )}

            {/* Quick link to Agreement Terms for detailed contractual information */}
            <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span>Looking for detailed contractual terms and clause breakdown?</span>
              <button
                onClick={() => onNavigate('details')}
                className="text-blue-600 font-semibold hover:underline inline-flex items-center gap-1"
              >
                View Agreement Terms
                <ArrowRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
