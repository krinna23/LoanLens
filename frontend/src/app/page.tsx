"use client";

import React, { useState, useEffect } from 'react';
import ProfileForm from '@/components/ProfileForm';
import LoanChatWindow from '@/components/LoanChatWindow';
import RiskSummaryPanel from '@/components/RiskSummaryPanel';
import ComparisonTable from '@/components/ComparisonTable';
import { uploadAgreement, summarizeAgreement } from '@/utils/api';
import { ShieldCheck, UploadCloud, FileType, CheckCircle2, FileText, ArrowRightLeft, Loader2, BookOpen, AlertTriangle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

// Simple markdown renderer for the summary (bold, headers, bullets)
function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="text-sm text-gray-700 space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith('## ')) {
          return <h3 key={i} className="font-bold text-gray-900 text-base mt-4 mb-1 first:mt-0">{line.slice(3)}</h3>;
        }
        if (line.startsWith('- **')) {
          const match = line.match(/- \*\*(.+?)\*\*: (.+)/);
          if (match) return (
            <div key={i} className="flex gap-2">
              <span className="font-semibold text-gray-800 min-w-[140px]">{match[1]}:</span>
              <span className="text-gray-600">{match[2]}</span>
            </div>
          );
        }
        if (line.startsWith('- ')) {
          return <div key={i} className="flex gap-2 items-start"><span className="text-blue-400 mt-0.5">•</span><span>{line.slice(2)}</span></div>;
        }
        if (line.trim()) return <p key={i}>{line}</p>;
        return null;
      })}
    </div>
  );
}

export default function Home() {
  const [sessionId, setSessionId] = useState<string>('');
  const [profileComplete, setProfileComplete] = useState(false);
  
  const [uploadingA, setUploadingA] = useState(false);
  const [docA, setDocA] = useState<any>(null);
  const [summaryA, setSummaryA] = useState<string | null>(null);
  const [summarizingA, setSummarizingA] = useState(false);

  const [uploadingB, setUploadingB] = useState(false);
  const [docB, setDocB] = useState<any>(null);

  const [mode, setMode] = useState<'A' | 'B'>('A');
  const [showComparison, setShowComparison] = useState(false);
  const [showSummary, setShowSummary] = useState(true);

  useEffect(() => {
    setSessionId(uuidv4());
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, label: 'A'|'B') => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    
    if (label === 'A') setUploadingA(true);
    else setUploadingB(true);

    try {
      const res = await uploadAgreement(file, sessionId, label);
      if (label === 'A') {
        setDocA(res.document);
        // Auto-summarize right after upload
        setSummarizingA(true);
        setShowSummary(true);
        try {
          const sumRes = await summarizeAgreement(sessionId, 'A');
          setSummaryA(sumRes.summary);
        } catch {
          setSummaryA('Summary could not be generated. You can still use the chatbot to ask questions about your agreement.');
        } finally {
          setSummarizingA(false);
        }
      } else {
        setDocB(res.document);
        setShowComparison(true);
      }
    } catch (err) {
      alert("Failed to upload document");
    } finally {
      if (label === 'A') setUploadingA(false);
      else setUploadingB(false);
    }
  };

  if (!profileComplete) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <ProfileForm sessionId={sessionId} onComplete={() => setProfileComplete(true)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans flex flex-col h-screen">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex flex-row items-center justify-between shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 text-white p-2 rounded-lg shadow-md border border-blue-700">
            <ShieldCheck size={24} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-xl font-bold font-heading tracking-tight text-gray-900">LoanLens</h1>
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest">Intelligent RAG Assistant</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4 text-sm font-medium">
           {/* Document A Upload */}
           <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 py-1.5 px-3 rounded-full">
             {docA ? (
               <><CheckCircle2 className="text-green-500" size={16} /> <span className="text-gray-700 font-semibold max-w-[120px] truncate">{docA.filename}</span></>
             ) : (
               <>
                  <label className="cursor-pointer flex items-center gap-2 hover:text-blue-600 transition-colors text-gray-600">
                    <UploadCloud size={16} /> <span>Upload Agreement A</span>
                    <input type="file" className="hidden" accept=".pdf,.txt,.docx" onChange={(e) => handleUpload(e, 'A')} />
                  </label>
                  {uploadingA && <span className="animate-pulse text-blue-500 text-xs">...</span>}
               </>
             )}
           </div>

           {/* Document B Upload (Only allowed if A is done) */}
           {docA && (
             <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 py-1.5 px-3 rounded-full">
               {docB ? (
                 <><CheckCircle2 className="text-purple-500" size={16} /> <span className="text-gray-700 font-semibold max-w-[120px] truncate">{docB.filename}</span></>
               ) : (
                 <>
                    <label className="cursor-pointer flex items-center gap-2 hover:text-purple-600 transition-colors text-gray-600">
                      <ArrowRightLeft size={16} /> <span>Upload Agreement B (Compare)</span>
                      <input type="file" className="hidden" accept=".pdf,.txt,.docx" onChange={(e) => handleUpload(e, 'B')} />
                    </label>
                    {uploadingB && <span className="animate-pulse text-purple-500 text-xs">...</span>}
                 </>
               )}
             </div>
           )}
        </div>
      </header>

      {/* Main Workspace Layout */}
      {!docA ? (
        <div className="flex-1 flex items-center justify-center p-6 bg-gradient-to-br from-blue-50/50 to-white">
          <div className="text-center max-w-lg">
            <FileText size={64} className="mx-auto text-blue-200 mb-6" />
            <h2 className="text-3xl font-bold font-heading text-gray-900 mb-4">Start your structural analysis</h2>
            <p className="text-gray-500 mb-8 leading-relaxed">Upload a loan agreement PDF to cross-reference clauses against RBI guidelines, uncover hidden risks, and understand complex financial terminology in plain language.</p>
            <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30 font-semibold px-8 py-4 rounded-xl inline-flex items-center gap-3 transition-transform hover:scale-105">
              <UploadCloud size={20} />
              Upload Agreement to Begin
              <input type="file" className="hidden" accept=".pdf,.txt,.docx" onChange={(e) => handleUpload(e, 'A')} />
            </label>
            {uploadingA && <p className="mt-4 text-sm font-semibold text-blue-600 animate-pulse">Processing document chunks and embeddings...</p>}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden grid grid-cols-12 gap-6 p-6">
          {/* Left panel: Chat UI or Summary */}
          <div className="col-span-12 xl:col-span-8 flex flex-col h-full bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden relative">
             {/* Tab bar */}
             <div className="absolute top-4 right-4 z-20 flex bg-gray-100 p-1 rounded-lg border border-gray-200 shadow-sm">
                <button
                  onClick={() => { setShowSummary(true); setShowComparison(false); }}
                  className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${showSummary && !showComparison ? 'bg-white shadow-sm text-green-700' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  <BookOpen size={13} /> Summary
                </button>
                <button onClick={() => { setMode('A'); setShowComparison(false); setShowSummary(false); }} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${mode === 'A' && !showComparison && !showSummary ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-800'}`}>Chat: Doc A</button>
                {docB && (
                  <button onClick={() => { setMode('B'); setShowComparison(false); setShowSummary(false); }} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${mode === 'B' && !showComparison && !showSummary ? 'bg-white shadow-sm text-purple-700' : 'text-gray-500 hover:text-gray-800'}`}>Chat: Doc B</button>
                )}
                {docB && (
                  <div className="w-px h-6 bg-gray-300 mx-1 self-center" />
                )}
                {docB && (
                  <button onClick={() => { setShowComparison(true); setShowSummary(false); }} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${showComparison ? 'bg-gray-800 shadow-sm text-white' : 'text-gray-500 hover:text-gray-800'}`}>
                    <ArrowRightLeft size={14} /> Compare
                  </button>
                )}
             </div>
             
             <div className="flex-1 h-full pt-12">
               {showComparison ? (
                  <div className="h-full bg-gray-50 p-6 overflow-y-auto">
                    <ComparisonTable sessionId={sessionId} canCompare={!!docB} />
                  </div>
               ) : showSummary ? (
                  <div className="h-full bg-gray-50 p-6 overflow-y-auto">
                    <div className="max-w-2xl mx-auto">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="bg-green-100 text-green-700 p-2 rounded-lg">
                          <BookOpen size={20} />
                        </div>
                        <div>
                          <h2 className="font-bold text-gray-900 text-lg">Agreement Summary</h2>
                          <p className="text-xs text-gray-500">{docA.filename}</p>
                        </div>
                      </div>

                      {summarizingA ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                          <Loader2 className="animate-spin text-blue-500" size={40} />
                          <p className="text-gray-500 font-medium">Analyzing your agreement...</p>
                          <p className="text-gray-400 text-sm">Reading clauses and comparing against RBI guidelines</p>
                        </div>
                      ) : summaryA ? (
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                          <SimpleMarkdown text={summaryA} />
                          <div className="mt-6 pt-4 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-400">
                            <AlertTriangle size={12} className="text-amber-400" />
                            AI-generated summary. Always verify details with the original document and a financial advisor.
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-10 text-gray-400">No summary available.</div>
                      )}

                      <div className="mt-6 bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
                        <ShieldCheck size={20} className="text-blue-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-blue-800 text-sm">Ready to dig deeper?</p>
                          <p className="text-blue-600 text-xs mt-1">Switch to <strong>Chat: Doc A</strong> above to ask specific questions about interest rates, fees, prepayment clauses, or anything else in your agreement.</p>
                        </div>
                      </div>
                    </div>
                  </div>
               ) : (
                  <LoanChatWindow sessionId={sessionId} mode={mode} />
               )}
             </div>
          </div>

          {/* Right panel: Live Risk Dashboard */}
          <div className="col-span-12 xl:col-span-4 h-full"> 
            <RiskSummaryPanel sessionId={sessionId} />
          </div>
        </div>
      )}
    </div>
  );
}
