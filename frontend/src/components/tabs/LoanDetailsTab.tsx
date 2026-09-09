import React from 'react';
import { FileText, IndianRupee, Scale } from 'lucide-react';

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

interface LoanDetailsTabProps {
  loanFields: LoanFields | null;
  loadingFields: boolean;
}

export default function LoanDetailsTab({ loanFields, loadingFields }: LoanDetailsTabProps) {
  const isNotSpecified = (val?: string) => !val || val === 'Not specified';

  const renderRow = (label: string, value?: string) => (
    <div className="flex flex-col sm:flex-row sm:justify-between py-2 border-b border-gray-50 last:border-0 gap-1">
      <span className="text-gray-500 text-sm">{label}</span>
      <span className={`text-sm font-medium text-right ${isNotSpecified(value) ? 'text-gray-400 italic' : 'text-gray-900'}`}>
        {value || 'Not specified'}
      </span>
    </div>
  );

  const renderBullet = (label: string, value?: string) => (
    <li className="text-sm">
      <strong className="text-gray-700">{label}:</strong>{' '}
      <span className={isNotSpecified(value) ? 'text-gray-400 italic' : 'text-gray-800'}>
        {value || 'Not specified'}
      </span>
    </li>
  );

  if (loadingFields) {
    return (
      <div className="space-y-6 animate-pulse">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm h-48"></div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-6 border-b border-gray-100 pb-3">
          <FileText className="text-blue-600" size={20} />
          <h2 className="text-lg font-bold text-gray-900">Loan Overview</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-2">
          {renderRow('Loan Amount', loanFields?.loan_amount)}
          {renderRow('Loan Type', loanFields?.loan_type)}
          {renderRow('Interest Rate', loanFields?.interest_rate)}
          {renderRow('Interest Type', loanFields?.interest_type)}
          {renderRow('Tenure', loanFields?.tenure)}
          {renderRow('EMI', loanFields?.emi)}
          {renderRow('Disbursement Mode', loanFields?.disbursement_mode)}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-6 border-b border-gray-100 pb-3">
          <IndianRupee className="text-blue-600" size={20} />
          <h2 className="text-lg font-bold text-gray-900">Financial Terms</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-2">
          {renderRow('Processing Fee', loanFields?.processing_fee)}
          {renderRow('Insurance', loanFields?.insurance)}
          {renderRow('Late Payment Charges', loanFields?.late_payment_charges)}
          {renderRow('Prepayment Charges', loanFields?.prepayment_charges)}
          {renderRow('Other Charges', loanFields?.other_charges)}
          {renderRow('Prepayment Allowed', loanFields?.prepayment_allowed)}
          {renderRow('Lock-in Period', loanFields?.lock_in_period)}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-6 border-b border-gray-100 pb-3">
          <Scale className="text-blue-600" size={20} />
          <h2 className="text-lg font-bold text-gray-900">Key Terms</h2>
        </div>
        <ul className="list-disc pl-5 space-y-3 marker:text-blue-500">
          {renderBullet('Collateral', loanFields?.collateral)}
          {renderBullet('Rate Reset Conditions', loanFields?.rate_reset_conditions)}
          {renderBullet('Default Conditions', loanFields?.default_conditions)}
        </ul>
      </div>

      <p className="text-center text-xs text-gray-400 mt-4">
        Information extracted by AI from the uploaded agreement. Always verify with the original document.
      </p>
    </div>
  );
}
