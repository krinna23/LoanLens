"use client";

import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ShieldCheck, UploadCloud, CheckCircle2, ArrowRightLeft, Loader2, LayoutDashboard, ShieldAlert, FileText, Calculator, Scale, MessageSquare, ArrowLeft } from 'lucide-react';
import { uploadAgreement, summarizeAgreement, getRiskSummary, extractLoanFields } from '@/utils/api';
import OverviewTab from '@/components/tabs/OverviewTab';
import RisksTab from '@/components/tabs/RisksTab';
import LoanDetailsTab from '@/components/tabs/LoanDetailsTab';
import FinancialAnalysisTab from '@/components/tabs/FinancialAnalysisTab';
import CompareTab from '@/components/tabs/CompareTab';
import AskTab from '@/components/tabs/AskTab';

function parseFieldsFromSummary(summary: string): Record<string, string> {
  const fields: Record<string, string> = {};
  if (!summary) return fields;

  const patterns: [string, RegExp][] = [
    ['loan_amount', /[-*]\s*\*{0,2}Loan Amount:\*{0,2}\s*([^\n\r]+)/i],
    ['interest_rate', /[-*]\s*\*{0,2}Interest Rate:\*{0,2}\s*([^\n\r]+)/i],
    ['interest_type', /[-*]\s*\*{0,2}Interest Type:\*{0,2}\s*([^\n\r]+)/i],
    ['tenure', /[-*]\s*\*{0,2}Tenure:\*{0,2}\s*([^\n\r]+)/i],
    ['emi', /[-*]\s*\*{0,2}EMI:\*{0,2}\s*([^\n\r]+)/i],
    ['loan_type', /[-*]\s*\*{0,2}Loan Type:\*{0,2}\s*([^\n\r]+)/i],
    ['disbursement_mode', /[-*]\s*\*{0,2}Disbursement Mode:\*{0,2}\s*([^\n\r]+)/i],
    ['insurance', /[-*]\s*\*{0,2}Insurance:\*{0,2}\s*([^\n\r]+)/i],
    ['prepayment_allowed', /[-*]\s*\*{0,2}Prepayment Allowed:\*{0,2}\s*([^\n\r]+)/i],
    ['prepayment_charges', /[-*]\s*\*{0,2}Prepayment Penalty:\*{0,2}\s*([^\n\r]+)/i],
    ['lock_in_period', /[-*]\s*\*{0,2}Lock-in Period:\*{0,2}\s*([^\n\r]+)/i],
    ['collateral', /[-*]\s*\*{0,2}Collateral:\*{0,2}\s*([^\n\r]+)/i],
    ['security_guarantee', /[-*]\s*\*{0,2}(?:Security|Guarantee|Security \/ Guarantee):\*{0,2}\s*([^\n\r]+)/i],
    ['default_conditions', /[-*]\s*\*{0,2}Default Conditions:\*{0,2}\s*([^\n\r]+)/i],
    ['rate_reset_conditions', /[-*]\s*\*{0,2}Rate Reset Conditions:\*{0,2}\s*([^\n\r]+)/i],
    ['repayment_conditions', /[-*]\s*\*{0,2}(?:Repayment Conditions|Repayment):\*{0,2}\s*([^\n\r]+)/i],
  ];

  for (const [key, regex] of patterns) {
    const match = summary.match(regex);
    if (match && match[1]) {
      const val = match[1].replace(/^\*+|\*+$/g, '').trim();
      if (val && !val.toLowerCase().includes('not specified in the agreement')) {
        fields[key] = val;
      }
    }
  }

  const processingMatch = summary.match(/\|\s*Processing Fee\s*\|\s*([^|]+)\|/i);
  if (processingMatch && processingMatch[1]) {
    const pf = processingMatch[1].replace(/^\*+|\*+$/g, '').trim();
    if (pf && !pf.toLowerCase().includes('not specified')) {
      fields['processing_fee'] = pf;
    }
  }

  const lateMatch = summary.match(/\|\s*Late Payment Fee\s*\|\s*([^|]+)\|/i);
  if (lateMatch && lateMatch[1]) {
    const lpf = lateMatch[1].replace(/^\*+|\*+$/g, '').trim();
    if (lpf && !lpf.toLowerCase().includes('not specified')) {
      fields['late_payment_charges'] = lpf;
    }
  }

  return fields;
}

function mergeFieldsWithSummary(fields: any, summaryText?: string | null) {
  if (!summaryText) return fields;
  const summaryParsed = parseFieldsFromSummary(summaryText);
  const result = { ...(fields || {}) };

  for (const [k, v] of Object.entries(summaryParsed)) {
    const currentVal = result[k];
    if (!currentVal || currentVal === 'Could not extract' || currentVal === 'Not specified') {
      result[k] = v;
    }
  }
  return result;
}

export default function Home() {
  const [sessionId, setSessionId] = useState<string>(() => uuidv4());

  const [uploadingA, setUploadingA] = useState(false);
  const [uploadingB, setUploadingB] = useState(false);
  const [docA, setDocA] = useState<any>(null);
  const [docB, setDocB] = useState<any>(null);

  const [summaryA, setSummaryA] = useState<string | null>(null);
  const [summarizingA, setSummarizingA] = useState(false);

  const [loanFields, setLoanFields] = useState<any>(null);
  const [loadingFields, setLoadingFields] = useState(false);

  const [riskFlags, setRiskFlags] = useState<any[]>([]);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskError, setRiskError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState('overview');
  const [chatMode, setChatMode] = useState<'A' | 'B'>('A');

  // Restore session from sessionStorage if available
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const savedSession = sessionStorage.getItem('loanlens_session_id');
      const savedDocA = sessionStorage.getItem('loanlens_doc_a');
      if (savedSession && savedDocA) {
        setSessionId(savedSession);
        setDocA(JSON.parse(savedDocA));
        const savedDocB = sessionStorage.getItem('loanlens_doc_b');
        if (savedDocB) setDocB(JSON.parse(savedDocB));
        const savedSummaryA = sessionStorage.getItem('loanlens_summary_a');
        if (savedSummaryA) setSummaryA(savedSummaryA);
        const savedFields = sessionStorage.getItem('loanlens_loan_fields');
        if (savedFields) {
          let parsedFields = JSON.parse(savedFields);
          if (savedSummaryA) {
            parsedFields = mergeFieldsWithSummary(parsedFields, savedSummaryA);
          }
          setLoanFields(parsedFields);
          sessionStorage.setItem('loanlens_loan_fields', JSON.stringify(parsedFields));
        } else if (savedSummaryA) {
          const parsedFromSum = parseFieldsFromSummary(savedSummaryA);
          if (Object.keys(parsedFromSum).length > 0) {
            setLoanFields(parsedFromSum);
            sessionStorage.setItem('loanlens_loan_fields', JSON.stringify(parsedFromSum));
          }
        }
        const savedRisks = sessionStorage.getItem('loanlens_risk_flags');
        if (savedRisks) setRiskFlags(JSON.parse(savedRisks));
      } else {
        sessionStorage.setItem('loanlens_session_id', sessionId);
      }
    } catch (e) {
      console.error('Session restore error:', e);
    }
  }, []);

  useEffect(() => {
    if (!docA || !sessionId) return;
    let isSubscribed = true;
    let lastCount = -1;
    let stablePolls = 0;
    let interval: NodeJS.Timeout | null = null;

    const fetchRisk = async () => {
      try {
        const data = await getRiskSummary(sessionId, docA?.id);
        if (!isSubscribed) return;
        if (Array.isArray(data)) {
          setRiskFlags(data);
          setRiskError(null);
          if (typeof window !== 'undefined' && data.length > 0) {
            sessionStorage.setItem('loanlens_risk_flags', JSON.stringify(data));
          }
          if (!summarizingA) {
            setRiskLoading(false);
            if (data.length === lastCount) {
              stablePolls++;
              // Allow up to 10 stable polls (~40s) so background targeted scan results are captured
              if (stablePolls >= 10 && interval) {
                clearInterval(interval);
              }
            } else {
              stablePolls = 0;
            }
            lastCount = data.length;
          }
        }
      } catch (err: any) {
        if (!isSubscribed) return;
        console.error('Error fetching risk summary:', err);
        setRiskError('Failed to fetch risk analysis.');
        setRiskLoading(false);
      }
    };

    fetchRisk();
    interval = setInterval(fetchRisk, 4000);

    // Re-fetch immediately when user switches to 'risks' tab
    const handleVisibilityOrTab = () => {
      fetchRisk();
    };
    window.addEventListener('focus', handleVisibilityOrTab);

    return () => {
      isSubscribed = false;
      if (interval) clearInterval(interval);
      window.removeEventListener('focus', handleVisibilityOrTab);
    };
  }, [docA, sessionId, summarizingA, activeTab]);


  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, label: 'A' | 'B') => {
    if (!e.target.files?.length || !sessionId) return;
    const file = e.target.files[0];
    if (label === 'A') setUploadingA(true);
    else setUploadingB(true);

    try {
      const res = await uploadAgreement(file, sessionId, label);
      if (label === 'A') {
        const newDocA = { filename: file.name, ...res.document };
        setDocA(newDocA);
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('loanlens_session_id', sessionId);
          sessionStorage.setItem('loanlens_doc_a', JSON.stringify(newDocA));
        }
        setActiveTab('overview');
        setSummarizingA(true);
        setLoadingFields(true);
        setRiskLoading(true);
        setRiskError(null);
        setRiskFlags([]);

        try {
          const [sumResult, fieldsResult] = await Promise.allSettled([
            summarizeAgreement(sessionId, 'A'),
            extractLoanFields(sessionId, 'A'),
          ]);

          let sumText = 'Summary could not be generated. Please use the Ask LoanLens tab to query your agreement.';
          if (sumResult.status === 'fulfilled' && sumResult.value?.summary) {
            sumText = sumResult.value.summary;
          }
          setSummaryA(sumText);

          let finalFields: any = null;
          if (fieldsResult.status === 'fulfilled' && fieldsResult.value) {
            finalFields = mergeFieldsWithSummary(fieldsResult.value, sumText);
          } else {
            finalFields = parseFieldsFromSummary(sumText);
          }

          if (finalFields && Object.keys(finalFields).length > 0) {
            setLoanFields(finalFields);
            if (typeof window !== 'undefined') {
              sessionStorage.setItem('loanlens_summary_a', sumText);
              sessionStorage.setItem('loanlens_loan_fields', JSON.stringify(finalFields));
            }
          }

          // Immediate risk fetch after summary is ready
          try {
            const riskData = await getRiskSummary(sessionId, newDocA.id);
            if (Array.isArray(riskData)) {
              setRiskFlags(riskData);
              if (typeof window !== 'undefined' && riskData.length > 0) {
                sessionStorage.setItem('loanlens_risk_flags', JSON.stringify(riskData));
              }
            }
          } catch (rErr) {
            console.error('Immediate risk check error:', rErr);
          }
        } catch (err) {
          console.error('Summary/fields error:', err);
        } finally {
          setSummarizingA(false);
          setLoadingFields(false);
          setRiskLoading(false);
        }
      } else {
        const newDocB = { filename: file.name, ...res.document };
        setDocB(newDocB);
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('loanlens_doc_b', JSON.stringify(newDocB));
        }
        setActiveTab('compare');
      }
    } catch {
      alert('Failed to upload document. Please try again.');
    } finally {
      if (label === 'A') setUploadingA(false);
      else setUploadingB(false);
    }
  };

  const handleBackToHome = () => {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem('loanlens_doc_a');
        sessionStorage.removeItem('loanlens_doc_b');
        sessionStorage.removeItem('loanlens_summary_a');
        sessionStorage.removeItem('loanlens_loan_fields');
        sessionStorage.removeItem('loanlens_risk_flags');
      } catch (e) {
        console.error('Failed to clear session storage:', e);
      }
    }
    setDocA(null);
    setDocB(null);
    setSummaryA(null);
    setLoanFields(null);
    setRiskFlags([]);
    setRiskError(null);
    setActiveTab('overview');
  };

  const highRiskCount = riskFlags.filter(f => f.risk_level === 'HIGH').length;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={16} />, requiresDocB: false },
    { id: 'risks', label: 'Risks', icon: <ShieldAlert size={16} />, requiresDocB: false },
    { id: 'details', label: 'Agreement Terms', icon: <FileText size={16} />, requiresDocB: false },
    { id: 'financial', label: 'Financial Analysis', icon: <Calculator size={16} />, requiresDocB: false },
    { id: 'compare', label: 'Compare', icon: <Scale size={16} />, requiresDocB: true },
    { id: 'ask', label: 'Ask LoanLens', icon: <MessageSquare size={16} />, requiresDocB: false },
  ];

  if (!docA) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm shrink-0 z-10">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 text-white p-2 rounded-lg">
              <ShieldCheck size={22} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-lg font-bold font-heading text-gray-900">LoanLens</h1>
              <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-widest">Loan Analysis Platform</p>
            </div>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-lg">
            <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-blue-100">
              <ShieldCheck size={40} className="text-blue-500" />
            </div>
            <h2 className="text-3xl font-bold font-heading text-gray-900 mb-3">Understand Before You Sign</h2>
            <p className="text-gray-500 mb-2 leading-relaxed">Upload your loan agreement and LoanLens will immediately answer:</p>
            <div className="bg-white border border-gray-200 rounded-xl p-4 mb-8 text-left space-y-2 text-sm">
              <div className="flex items-center gap-3 text-gray-700"><span className="font-bold text-blue-600">1.</span> What am I signing?</div>
              <div className="flex items-center gap-3 text-gray-700"><span className="font-bold text-red-600">2.</span> What could hurt me?</div>
              <div className="flex items-center gap-3 text-gray-700"><span className="font-bold text-green-600">3.</span> What will this loan actually cost me?</div>
            </div>
            <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-4 rounded-xl inline-flex items-center gap-3 transition-colors shadow-lg shadow-blue-500/20">
              <UploadCloud size={20} />
              Upload Loan Agreement (PDF / DOCX / TXT)
              <input type="file" className="hidden" accept=".pdf,.txt,.docx" onChange={(e) => handleUpload(e, 'A')} />
            </label>
            {uploadingA && <p className="mt-4 text-sm text-blue-600 animate-pulse">Processing document...</p>}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm shrink-0 z-10">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBackToHome}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 hover:text-gray-900 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            title="Return to home / upload screen"
          >
            <ArrowLeft size={14} />
            <span>Back to Home</span>
          </button>
          <div className="h-6 w-px bg-gray-200 hidden sm:block" />
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 text-white p-2 rounded-lg">
              <ShieldCheck size={22} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-lg font-bold font-heading text-gray-900">LoanLens</h1>
              <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-widest">Loan Analysis Platform</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 py-1.5 px-3 rounded-full text-sm">
            {docA ? (
              <><CheckCircle2 className="text-green-500" size={15} /><span className="text-gray-700 font-medium max-w-[130px] truncate">{docA.filename || "Document A"}</span></>
            ) : (
              <label className="cursor-pointer flex items-center gap-2 text-gray-600 hover:text-blue-600 transition-colors">
                <UploadCloud size={15} /><span>Upload Agreement A</span>
                <input type="file" className="hidden" accept=".pdf,.txt,.docx" onChange={(e) => handleUpload(e, 'A')} />
              </label>
            )}
            {uploadingA && <Loader2 size={14} className="animate-spin text-blue-500" />}
          </div>

          {docA && (
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 py-1.5 px-3 rounded-full text-sm">
              {docB ? (
                <><CheckCircle2 className="text-purple-500" size={15} /><span className="text-gray-700 font-medium max-w-[130px] truncate">{docB.filename || "Document B"}</span></>
              ) : (
                <label className="cursor-pointer flex items-center gap-2 text-gray-600 hover:text-purple-600 transition-colors">
                  <ArrowRightLeft size={15} /><span>Upload Agreement B</span>
                  <input type="file" className="hidden" accept=".pdf,.txt,.docx" onChange={(e) => handleUpload(e, 'B')} />
                </label>
              )}
              {uploadingB && <Loader2 size={14} className="animate-spin text-purple-500" />}
            </div>
          )}
        </div>
      </header>

      <div className="bg-white border-b border-gray-200 px-6 shrink-0">
        <nav className="flex gap-1 overflow-x-auto whitespace-nowrap scrollbar-hide">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.id === 'risks' && highRiskCount > 0 && (
                <span className="bg-red-100 text-red-700 text-xs font-bold px-1.5 py-0.5 rounded-full">{highRiskCount}</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <div className={activeTab === 'overview' ? 'block' : 'hidden'}>
            <OverviewTab 
              sessionId={sessionId}
              loanFields={loanFields}
              loadingFields={loadingFields}
              summaryA={summaryA}
              summarizingA={summarizingA}
              docAName={docA?.filename || "Document A"}
              riskFlags={riskFlags}
              riskLoading={riskLoading}
              riskError={riskError}
              onNavigate={setActiveTab}
            />
          </div>
          <div className={activeTab === 'risks' ? 'block' : 'hidden'}>
            <RisksTab riskFlags={riskFlags} loading={riskLoading} error={riskError} />
          </div>
          <div className={activeTab === 'details' ? 'block' : 'hidden'}>
            <LoanDetailsTab loanFields={loanFields} loadingFields={loadingFields} sessionId={sessionId} />
          </div>
          <div className={activeTab === 'financial' ? 'block' : 'hidden'}>
            <FinancialAnalysisTab sessionId={sessionId} loanFields={loanFields} />
          </div>
          <div className={activeTab === 'compare' ? 'block' : 'hidden'}>
            <CompareTab 
              sessionId={sessionId}
              canCompare={!!docB}
              docAName={docA?.filename || "Document A"}
              docBName={docB?.filename || "Document B"}
              onUploadB={(e) => handleUpload(e, 'B')}
              uploadingB={uploadingB}
            />
          </div>
          <div className={activeTab === 'ask' ? 'block' : 'hidden'}>
            <AskTab 
              sessionId={sessionId}
              mode={chatMode}
              onModeChange={setChatMode}
              hasDocB={!!docB}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
