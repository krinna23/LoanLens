import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { TrendingUp, Percent, Calendar, IndianRupee, ShieldAlert, ShieldQuestion, ShieldCheck, BookOpen, Loader2 } from 'lucide-react';

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
  onNavigate: (tab: string) => void;
}

export default function OverviewTab({
  loanFields,
  loadingFields,
  summaryA,
  summarizingA,
  docAName,
  riskFlags,
  onNavigate
}: OverviewTabProps) {
  const highRisk = riskFlags.filter(r => r.risk_level === 'HIGH').length;
  const medRisk = riskFlags.filter(r => r.risk_level === 'MEDIUM').length;
  const lowRisk = riskFlags.filter(r => r.risk_level === 'LOW').length;
  const hasRisks = riskFlags.length > 0;

  const isNotSpecified = (val?: string) => !val || val === 'Not specified';

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

      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="font-semibold text-gray-800">Risk Overview</div>
        {!hasRisks ? (
          <div className="text-sm text-gray-500">Run analysis to see risk data</div>
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

      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4 text-gray-800 border-b border-gray-100 pb-3">
          <BookOpen className="text-blue-600" size={20} />
          <h3 className="font-bold text-lg">Agreement Summary</h3>
        </div>
        
        {summarizingA ? (
          <div className="flex items-center justify-center py-8 text-gray-500 gap-3">
            <Loader2 className="animate-spin text-blue-500" size={20} />
            <span>Analyzing your agreement...</span>
          </div>
        ) : (summaryA !== null && summaryA !== undefined) ? (
          summaryA.trim() ? (
            <div className="prose prose-sm prose-gray max-w-none break-words overflow-x-auto prose-headings:text-gray-800 prose-headings:font-bold prose-p:text-gray-700 prose-li:text-gray-700 prose-strong:text-gray-900 prose-table:w-full prose-table:text-gray-700 prose-th:text-gray-800 prose-th:bg-gray-50 prose-th:p-2.5 prose-td:text-gray-700 prose-td:p-2.5">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{summaryA}</ReactMarkdown>
            </div>
          ) : (
            <div className="text-gray-500 italic py-4 text-center">Summary could not be generated. Please try asking in the &quot;Ask LoanLens&quot; tab.</div>
          )
        ) : (
          <div className="text-gray-500 italic py-4 text-center">Upload a document to see the summary.</div>
        )}
        
        <div className="mt-6 pt-4 border-t border-gray-100 text-xs text-gray-400 text-center">
          AI-generated summary. Verify with original document.
        </div>
      </div>
    </div>
  );
}
