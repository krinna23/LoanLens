import React, { useState, useEffect } from 'react';
import { Calculator } from 'lucide-react';

interface LoanFields {
  loan_amount?: string;
  interest_rate?: string;
  tenure?: string;
  processing_fee?: string;
  insurance?: string;
  prepayment_charges?: string;
}

interface FinancialAnalysisTabProps {
  sessionId: string;
  loanFields: LoanFields | null;
}

function parseNumeric(val?: string): number | null {
  if (!val || val === 'Not specified') return null;
  const stripped = val.replace(/[^\d.-]/g, '');
  const parsed = parseFloat(stripped);
  return isNaN(parsed) ? null : parsed;
}

function formatINR(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function calcEMI(p: number, r_annual: number, n: number): number {
  const r = r_annual / (12 * 100);
  if (r === 0) return p / n;
  return p * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
}

function calcOutstanding(p: number, r_annual: number, n: number, m: number): number {
  const r = r_annual / (12 * 100);
  if (r === 0) return p * (1 - m / n);
  return p * (Math.pow(1 + r, n) - Math.pow(1 + r, m)) / (Math.pow(1 + r, n) - 1);
}

function calcNewTenure(outstanding: number, emi: number, r_annual: number): number {
  const r = r_annual / (12 * 100);
  if (r === 0) return Math.ceil(outstanding / emi);
  return Math.ceil(-Math.log(1 - outstanding * r / emi) / Math.log(1 + r));
}

export default function FinancialAnalysisTab({ sessionId, loanFields }: FinancialAnalysisTabProps) {
  const [view, setView] = useState<'true_cost' | 'pay_early'>('true_cost');

  // True cost states
  const [tcPrincipal, setTcPrincipal] = useState<number | ''>('');
  const [tcRate, setTcRate] = useState<number | ''>('');
  const [tcTenure, setTcTenure] = useState<number | ''>('');
  const [tcProcessingFee, setTcProcessingFee] = useState<number | ''>('');
  const [tcInsurance, setTcInsurance] = useState<number | ''>('');
  const [isCalculated, setIsCalculated] = useState(false);

  // Pay early states
  const [peAmount, setPeAmount] = useState<number | ''>('');
  const [peMonth, setPeMonth] = useState<number | ''>('');
  const [peRate, setPeRate] = useState<number | ''>('');
  const [peResult, setPeResult] = useState<any>(null);

  useEffect(() => {
    if (loanFields) {
      const p = parseNumeric(loanFields.loan_amount);
      const r = parseNumeric(loanFields.interest_rate);
      const tStr = loanFields.tenure || '';
      let t = parseNumeric(tStr);
      if (tStr.toLowerCase().includes('year') && t) t = t * 12;
      
      const pf = parseNumeric(loanFields.processing_fee) || 0;
      const ins = parseNumeric(loanFields.insurance) || 0;
      const prCharge = parseNumeric(loanFields.prepayment_charges) || 0;

      if (p) setTcPrincipal(p);
      if (r) setTcRate(r);
      if (t) setTcTenure(t);
      setTcProcessingFee(pf || '');
      setTcInsurance(ins || '');
      setPeRate(prCharge || '');

      if (p && r && t) {
        setIsCalculated(true);
      }
    }
  }, [loanFields]);

  const handleTcCalculate = () => {
    if (tcPrincipal && tcRate && tcTenure) {
      setIsCalculated(true);
    } else {
      alert("Please enter Principal, Interest Rate, and Tenure.");
    }
  };

  const handlePeCalculate = () => {
    if (!tcPrincipal || !tcRate || !tcTenure) {
      alert("Cannot calculate — loan amount, interest rate, and tenure must be known.");
      return;
    }
    const p = Number(tcPrincipal);
    const r = Number(tcRate);
    const n = Number(tcTenure);
    const amt = Number(peAmount);
    const m = Number(peMonth);
    const prRate = Number(peRate);

    if (!amt || !m || m >= n) {
      alert("Invalid amount or month.");
      return;
    }

    const emi = calcEMI(p, r, n);
    const outstanding = calcOutstanding(p, r, n, m);
    const newOutstanding = Math.max(0, outstanding - amt);
    const newTenure = calcNewTenure(newOutstanding, emi, r);
    const monthsSaved = (n - m) - newTenure;
    const oldTotalInterest = (emi * (n - m)) - outstanding;
    const newTotalInterest = (emi * newTenure) - newOutstanding;
    const interestSaved = oldTotalInterest - newTotalInterest;
    const charge = amt * (prRate / 100);
    const netBenefit = interestSaved - charge;

    setPeResult({
      outstanding,
      newOutstanding,
      monthsSaved,
      interestSaved,
      charge,
      netBenefit
    });
  };

  const renderTrueCost = () => {
    if (!isCalculated || !tcPrincipal || !tcRate || !tcTenure) {
      return (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-bold mb-4">Manual Entry — Agreement values not fully specified</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Principal (₹)</label>
              <input type="number" value={tcPrincipal} onChange={e => setTcPrincipal(e.target.valueAsNumber || '')} className="w-full border rounded-lg p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Annual Rate (%)</label>
              <input type="number" value={tcRate} onChange={e => setTcRate(e.target.valueAsNumber || '')} className="w-full border rounded-lg p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tenure (months)</label>
              <input type="number" value={tcTenure} onChange={e => setTcTenure(e.target.valueAsNumber || '')} className="w-full border rounded-lg p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Processing Fee (₹, optional)</label>
              <input type="number" value={tcProcessingFee} onChange={e => setTcProcessingFee(e.target.valueAsNumber || '')} className="w-full border rounded-lg p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Insurance (₹, optional)</label>
              <input type="number" value={tcInsurance} onChange={e => setTcInsurance(e.target.valueAsNumber || '')} className="w-full border rounded-lg p-2" />
            </div>
          </div>
          <button onClick={handleTcCalculate} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700">Calculate</button>
        </div>
      );
    }

    const p = Number(tcPrincipal);
    const r = Number(tcRate);
    const n = Number(tcTenure);
    const pf = Number(tcProcessingFee || 0);
    const ins = Number(tcInsurance || 0);

    const emi = calcEMI(p, r, n);
    const totalPayment = emi * n;
    const totalInterest = totalPayment - p;
    const totalCost = totalPayment + pf + ins;

    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-6 border-b border-gray-100 pb-3">
          <Calculator className="text-blue-600" size={20} />
          <h2 className="text-lg font-bold text-gray-900">TRUE COST OF LOAN</h2>
        </div>
        
        <div className="space-y-4">
          <div className="flex justify-between items-center py-2 border-b border-gray-50">
            <span className="font-medium">Principal</span>
            <div className="flex items-center gap-3">
              <span className="font-bold">₹{formatINR(p)}</span>
              <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">Agreement Fact</span>
            </div>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-gray-50">
            <span className="font-medium">Total Interest</span>
            <div className="flex items-center gap-3">
              <span className="font-bold">₹{formatINR(totalInterest)}</span>
              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">Calculated</span>
            </div>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-gray-50">
            <span className="font-medium">Processing Fee</span>
            <span className="font-bold">{pf ? `₹${formatINR(pf)}` : <span className="text-gray-400 font-normal">Not specified</span>}</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="font-medium">Insurance</span>
            <span className="font-bold">{ins ? `₹${formatINR(ins)}` : <span className="text-gray-400 font-normal">Not specified</span>}</span>
          </div>
          
          <div className="border-t-2 border-gray-800 pt-4 mt-2">
            <div className="flex justify-between items-center">
              <span className="text-xl font-bold">TOTAL COST</span>
              <span className="text-2xl font-bold text-blue-600">₹{formatINR(totalCost)}</span>
            </div>
          </div>
          
          <div className="bg-blue-50 rounded-lg p-4 mt-6 flex justify-between items-center">
            <div>
              <span className="block text-sm text-blue-800 font-medium">EMI</span>
              <span className="text-xs text-blue-600">Fees not included in EMI figure — add separately for true monthly burden.</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-blue-900">₹{formatINR(emi)} <span className="text-sm font-normal">/ month</span></span>
              <span className="text-xs bg-white text-blue-700 px-2 py-1 rounded shadow-sm">Calculated</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderPayEarly = () => {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Pay Early Simulator</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount to prepay (₹)</label>
            <input type="number" value={peAmount} onChange={e => setPeAmount(e.target.valueAsNumber || '')} className="w-full border rounded-lg p-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">At which month?</label>
            <input type="number" value={peMonth} onChange={e => setPeMonth(e.target.valueAsNumber || '')} className="w-full border rounded-lg p-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prepayment charge rate (%)</label>
            <input type="number" value={peRate} onChange={e => setPeRate(e.target.valueAsNumber || '')} className="w-full border rounded-lg p-2" />
            <span className="text-xs text-gray-500">(Check your agreement for exact rate)</span>
          </div>
        </div>
        <button onClick={handlePeCalculate} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 mb-6">Calculate</button>

        {peResult && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="block text-sm text-gray-500">Outstanding Principal (Month {peMonth})</span>
                <span className="font-bold">₹{formatINR(peResult.outstanding)}</span>
              </div>
              <div>
                <span className="block text-sm text-gray-500">New Outstanding</span>
                <span className="font-bold">₹{formatINR(peResult.newOutstanding)}</span>
              </div>
              <div>
                <span className="block text-sm text-gray-500">Months Saved</span>
                <span className="font-bold">{peResult.monthsSaved} months</span>
              </div>
              <div>
                <span className="block text-sm text-gray-500">Interest Saved</span>
                <span className="font-bold text-green-600">₹{formatINR(peResult.interestSaved)}</span>
              </div>
              <div>
                <span className="block text-sm text-gray-500">Prepayment Charge</span>
                <span className="font-bold text-red-600">₹{formatINR(peResult.charge)}</span>
              </div>
              <div>
                <span className="block text-sm text-gray-500">Net Financial Benefit</span>
                <span className={`font-bold text-lg ${peResult.netBenefit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ₹{formatINR(peResult.netBenefit)}
                </span>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Assumptions</h4>
              <ul className="text-xs text-gray-500 list-disc pl-4 space-y-1">
                <li>Calculation uses reducing balance (amortization) method</li>
                <li>EMI assumed constant throughout loan tenure</li>
                <li>Prepayment charge: {peRate}% of prepaid amount</li>
                <li>Interest saved is approximate based on standard amortization</li>
              </ul>
              <p className="text-xs text-gray-400 mt-3 italic">These are estimates for illustrative purposes only. Consult your lender for exact figures.</p>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-center mb-6">
        <div className="bg-gray-100 p-1 rounded-full flex gap-1">
          <button 
            className={`px-6 py-2 rounded-full text-sm font-medium transition-colors ${view === 'true_cost' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
            onClick={() => setView('true_cost')}
          >
            True Cost
          </button>
          <button 
            className={`px-6 py-2 rounded-full text-sm font-medium transition-colors ${view === 'pay_early' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
            onClick={() => setView('pay_early')}
          >
            Pay Early
          </button>
        </div>
      </div>
      
      {view === 'true_cost' ? renderTrueCost() : renderPayEarly()}
    </div>
  );
}
