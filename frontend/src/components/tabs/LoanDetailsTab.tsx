import React, { useState, useEffect } from 'react';
import { FileText, IndianRupee, Scale, ClipboardCheck, AlertCircle, CheckCircle2, Check, BookOpen, Info, ShieldAlert } from 'lucide-react';
import { getClauseExplanations } from '../../utils/api';

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
  security_guarantee?: string;
  rate_reset_conditions: string;
  default_conditions: string;
  repayment_conditions?: string;
}

interface LoanDetailsTabProps {
  loanFields: LoanFields | null;
  loadingFields: boolean;
  sessionId?: string;
}

interface TermItem {
  key: keyof LoanFields;
  label: string;
}

const IMPORTANT_CONTRACTUAL_TERMS: TermItem[] = [
  { key: 'loan_amount', label: 'Loan Amount' },
  { key: 'loan_type', label: 'Loan Type' },
  { key: 'interest_rate', label: 'Interest Rate' },
  { key: 'interest_type', label: 'Interest Type' },
  { key: 'tenure', label: 'Tenure' },
  { key: 'emi', label: 'EMI' },
  { key: 'disbursement_mode', label: 'Disbursement Mode' },
  { key: 'processing_fee', label: 'Processing Fee' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'late_payment_charges', label: 'Late Payment Charges' },
  { key: 'prepayment_charges', label: 'Prepayment Charges' },
  { key: 'prepayment_allowed', label: 'Prepayment Allowed' },
  { key: 'lock_in_period', label: 'Lock-in Period' },
  { key: 'collateral', label: 'Collateral' },
  { key: 'security_guarantee', label: 'Security / Guarantee' },
  { key: 'rate_reset_conditions', label: 'Rate Reset Conditions' },
  { key: 'default_conditions', label: 'Default Conditions' },
  { key: 'repayment_conditions', label: 'Repayment Conditions' },
];

export default function LoanDetailsTab({ loanFields, loadingFields, sessionId }: LoanDetailsTabProps) {
  const [clauseExplanations, setClauseExplanations] = useState<any[]>([]);
  const [loadingClauses, setLoadingClauses] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    let isSubscribed = true;
    setLoadingClauses(true);
    getClauseExplanations(sessionId, 'A')
      .then(res => {
        if (isSubscribed && res?.clauses) {
          setClauseExplanations(res.clauses);
        }
      })
      .catch(err => console.error("Error fetching clause explanations:", err))
      .finally(() => {
        if (isSubscribed) setLoadingClauses(false);
      });
    return () => { isSubscribed = false; };
  }, [sessionId]);

  const isNotSpecified = (val?: string) =>
    !val ||
    val === 'Not specified' ||
    val.toLowerCase().includes('not specified') ||
    val.toLowerCase().includes('could not extract');

  const specifiedTerms = IMPORTANT_CONTRACTUAL_TERMS.filter(t => !isNotSpecified(loanFields?.[t.key]));
  const missingTerms = IMPORTANT_CONTRACTUAL_TERMS.filter(t => isNotSpecified(loanFields?.[t.key]));

  const specifiedCount = specifiedTerms.length;
  const missingCount = missingTerms.length;
  const totalCount = IMPORTANT_CONTRACTUAL_TERMS.length;
  const completenessPercent = Math.round((specifiedCount / totalCount) * 100);

  const renderSimpleRow = (label: string, value?: string) => {
    const missing = isNotSpecified(value);
    return (
      <div className="flex flex-col sm:flex-row sm:justify-between py-2.5 border-b border-gray-100 last:border-0 gap-1">
        <span className="text-gray-600 text-sm font-medium">{label}</span>
        <span className={`text-sm font-semibold text-right ${missing ? 'text-gray-400 italic font-normal' : 'text-gray-900'}`}>
          {value || 'Not specified'}
        </span>
      </div>
    );
  };

  const renderFinancialRow = (label: string, value?: string) => {
    const missing = isNotSpecified(value);
    return (
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-3 border-b border-gray-100 last:border-0 gap-2">
        <span className="text-gray-700 text-sm font-medium">{label}</span>
        <div className="flex items-center gap-3 self-end sm:self-auto">
          <span className={`text-sm font-semibold text-right ${missing ? 'text-gray-400 italic font-normal' : 'text-gray-900'}`}>
            {value || 'Not specified'}
          </span>
          {missing ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
              <AlertCircle size={11} /> Not specified
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
              <Check size={11} /> Specified
            </span>
          )}
        </div>
      </div>
    );
  };

  const renderKeyTermBlock = (label: string, value?: string) => {
    const missing = isNotSpecified(value);
    return (
      <div className="p-4 bg-gray-50 border border-gray-100 rounded-lg">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-bold text-gray-800">{label}</span>
          {missing ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
              <AlertCircle size={11} /> Not specified
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Check size={11} /> Specified
            </span>
          )}
        </div>
        <p className={`text-sm leading-relaxed ${missing ? 'text-gray-400 italic' : 'text-gray-700'}`}>
          {value || 'Not specified in the agreement.'}
        </p>
      </div>
    );
  };

  if (loadingFields) {
    return (
      <div className="space-y-6 animate-pulse">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm h-48"></div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Agreement Terms</h2>
        <p className="text-sm text-gray-500 mt-0.5">Detailed contractual reference and agreement completeness analysis</p>
      </div>

      {/* A. Loan Overview */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4 border-b border-gray-100 pb-3">
          <FileText className="text-blue-600" size={20} />
          <h3 className="text-lg font-bold text-gray-900">Loan Overview</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-1">
          {renderSimpleRow('Loan Amount', loanFields?.loan_amount)}
          {renderSimpleRow('Loan Type', loanFields?.loan_type)}
          {renderSimpleRow('Interest Rate', loanFields?.interest_rate)}
          {renderSimpleRow('Interest Type', loanFields?.interest_type)}
          {renderSimpleRow('Tenure', loanFields?.tenure)}
          {renderSimpleRow('EMI', loanFields?.emi)}
          {renderSimpleRow('Disbursement Mode', loanFields?.disbursement_mode)}
        </div>
      </div>

      {/* B. Agreement Completeness */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="text-blue-600" size={20} />
            <h3 className="text-lg font-bold text-gray-900">Agreement Completeness</h3>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
            completenessPercent >= 75 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
          }`}>
            {completenessPercent}% Identified
          </span>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between text-sm text-gray-700 mb-2 font-medium">
            <span>{specifiedCount} key terms identified</span>
            <span className={missingCount > 0 ? 'text-amber-700 font-semibold' : 'text-emerald-700'}>
              {missingCount} important term{missingCount !== 1 ? 's' : ''} not specified
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
            <div
              className={`h-2.5 rounded-full transition-all duration-500 ${
                completenessPercent >= 75 ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
              style={{ width: `${completenessPercent}%` }}
            />
          </div>
        </div>

        {missingCount > 0 ? (
          <div className="bg-amber-50/60 border border-amber-200/80 rounded-lg p-3.5 mt-4">
            <span className="text-xs font-bold text-amber-900 uppercase tracking-wide block mb-2">
              Not clearly specified in agreement:
            </span>
            <div className="flex flex-wrap gap-2">
              {missingTerms.map(t => (
                <span
                  key={t.key}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-white text-amber-800 border border-amber-200 shadow-2xs font-medium"
                >
                  <AlertCircle size={12} className="text-amber-600" />
                  {t.label}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-amber-700 mt-2.5 italic">
              These terms were absent or not clearly stated in the analyzed document excerpts. Request clarification from the lender before signing.
            </p>
          </div>
        ) : (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800 font-medium flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600" />
            All key contractual terms are clearly identified in the agreement.
          </div>
        )}
      </div>

      {/* C. Financial Terms */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4 border-b border-gray-100 pb-3">
          <IndianRupee className="text-blue-600" size={20} />
          <h3 className="text-lg font-bold text-gray-900">Financial Terms</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {renderFinancialRow('Processing Fee', loanFields?.processing_fee)}
          {renderFinancialRow('Insurance', loanFields?.insurance)}
          {renderFinancialRow('Late Payment Charges', loanFields?.late_payment_charges)}
          {renderFinancialRow('Prepayment Charges', loanFields?.prepayment_charges)}
          {renderFinancialRow('Other Charges', loanFields?.other_charges)}
          {renderFinancialRow('Prepayment Allowed', loanFields?.prepayment_allowed)}
          {renderFinancialRow('Lock-in Period', loanFields?.lock_in_period)}
        </div>
      </div>

      {/* D. Key Terms */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4 border-b border-gray-100 pb-3">
          <Scale className="text-blue-600" size={20} />
          <h3 className="text-lg font-bold text-gray-900">Key Terms</h3>
        </div>

        {/* Dynamic Key Terms Grid: prioritizes specified terms and formats cleanly */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {renderKeyTermBlock('Collateral', loanFields?.collateral)}
          {loanFields?.security_guarantee && !isNotSpecified(loanFields.security_guarantee) && (
            renderKeyTermBlock('Security / Guarantee', loanFields.security_guarantee)
          )}
          {renderKeyTermBlock('Default Conditions', loanFields?.default_conditions)}
          {renderKeyTermBlock('Rate Reset Conditions', loanFields?.rate_reset_conditions)}
          {loanFields?.repayment_conditions && !isNotSpecified(loanFields.repayment_conditions) && (
            renderKeyTermBlock('Repayment Conditions', loanFields.repayment_conditions)
          )}
        </div>
      </div>

      {/* E. Clause Explanation — Understand Your Agreement */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-4 border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="text-blue-600" size={20} />
            <div>
              <h3 className="text-lg font-bold text-gray-900">Understand Your Agreement</h3>
              <p className="text-xs text-gray-500">Important clauses explained in simple, plain language with borrower implications and RBI context.</p>
            </div>
          </div>
        </div>

        {loadingClauses ? (
          <div className="py-8 text-center text-sm text-gray-500">Loading clause explanations...</div>
        ) : clauseExplanations.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-500">
            Upload an agreement to view plain-language clause explanations.
          </div>
        ) : (
          <div className="space-y-4">
            {clauseExplanations.map((item) => (
              <div key={item.id} className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 hover:bg-white transition-colors">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                      {item.category}
                    </span>
                    <h4 className="font-bold text-gray-900 text-sm">{item.title}</h4>
                  </div>
                  {item.rbi_status && (
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      item.rbi_status === 'ACTIVE' 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {['WITHDRAWN', 'SUPERSEDED', 'HISTORICAL'].includes(item.rbi_status) ? '⚠ ' : ''}
                      RBI Status: {item.rbi_status}
                    </span>
                  )}
                </div>

                <div className="space-y-2 text-xs">
                  <div className="bg-white p-2.5 rounded border border-gray-100 text-gray-700">
                    <span className="font-semibold text-gray-900 block mb-0.5">Agreement Term:</span>
                    <p className="italic text-gray-600">{item.original_text}</p>
                  </div>

                  <div className="bg-blue-50/60 p-2.5 rounded border border-blue-100 text-blue-900">
                    <span className="font-semibold block mb-0.5">Simple Explanation:</span>
                    <p>{item.simple_explanation}</p>
                  </div>

                  <div className="bg-amber-50/60 p-2.5 rounded border border-amber-100 text-amber-900">
                    <span className="font-semibold block mb-0.5">Borrower Implication:</span>
                    <p>{item.borrower_implication}</p>
                  </div>

                  {['WITHDRAWN', 'SUPERSEDED', 'HISTORICAL'].includes(item.rbi_status) && (
                    <div className="bg-amber-50 border border-amber-200 rounded p-2 text-amber-800 text-[11px]">
                      ⚠ <strong>Regulatory Notice:</strong> The matched RBI guidance has been withdrawn and is not treated as a current regulatory requirement.
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-center text-xs text-gray-400 mt-4">
        Information extracted by AI from the uploaded agreement. Always verify with the original document.
      </p>
    </div>
  );
}
