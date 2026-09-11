"use client";

import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ShieldCheck, UploadCloud, CheckCircle2, ArrowRightLeft, Loader2, LayoutDashboard, ShieldAlert, FileText, Calculator, Scale, MessageSquare } from 'lucide-react';
import { uploadAgreement, summarizeAgreement, getRiskSummary, extractLoanFields } from '@/utils/api';
import OverviewTab from '@/components/tabs/OverviewTab';
import RisksTab from '@/components/tabs/RisksTab';
import LoanDetailsTab from '@/components/tabs/LoanDetailsTab';
import FinancialAnalysisTab from '@/components/tabs/FinancialAnalysisTab';
import CompareTab from '@/components/tabs/CompareTab';
import AskTab from '@/components/tabs/AskTab';

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
        if (savedFields) setLoanFields(JSON.parse(savedFields));
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
    const fetchRisk = async () => {
      try {
        const data = await getRiskSummary(sessionId);
        setRiskFlags(data);
        if (typeof window !== 'undefined' && data?.length) {
          sessionStorage.setItem('loanlens_risk_flags', JSON.stringify(data));
        }
      } catch {
        // ignore for now
      } finally { 
        setRiskLoading(false); 
      }
    };
    fetchRisk();
    const interval = setInterval(fetchRisk, 6000);
    return () => clearInterval(interval);
  }, [docA, sessionId]);

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
        try {
          const [sumRes, fieldsRes] = await Promise.all([
            summarizeAgreement(sessionId, 'A'),
            extractLoanFields(sessionId, 'A'),
          ]);
          const sumText = sumRes.summary || 'Summary could not be generated. Please use the Ask LoanLens tab to query your agreement.';
          setSummaryA(sumText);
          setLoanFields(fieldsRes);
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('loanlens_summary_a', sumText);
            sessionStorage.setItem('loanlens_loan_fields', JSON.stringify(fieldsRes));
          }
        } catch (err) {
          console.error('Summary/fields error:', err);
          const fallback = 'Summary could not be generated. You can still use Ask LoanLens to query your agreement.';
          setSummaryA(fallback);
          setLoanFields(null);
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('loanlens_summary_a', fallback);
          }
        } finally {
          setSummarizingA(false);
          setLoadingFields(false);
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

  const highRiskCount = riskFlags.filter(f => f.risk_level === 'HIGH').length;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={16} />, requiresDocB: false },
    { id: 'risks', label: 'Risks', icon: <ShieldAlert size={16} />, requiresDocB: false },
    { id: 'details', label: 'Loan Details', icon: <FileText size={16} />, requiresDocB: false },
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
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 text-white p-2 rounded-lg">
            <ShieldCheck size={22} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-lg font-bold font-heading text-gray-900">LoanLens</h1>
            <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-widest">Loan Analysis Platform</p>
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
              {tab.id === 'compare' && !docB && <span className="text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full font-medium">Compare</span>}
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
              onNavigate={setActiveTab}
            />
          </div>
          <div className={activeTab === 'risks' ? 'block' : 'hidden'}>
            <RisksTab riskFlags={riskFlags} loading={riskLoading} />
          </div>
          <div className={activeTab === 'details' ? 'block' : 'hidden'}>
            <LoanDetailsTab loanFields={loanFields} loadingFields={loadingFields} />
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
