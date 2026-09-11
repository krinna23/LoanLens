import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Scale, GitCompare, Sparkles, Loader2, ArrowRightLeft } from 'lucide-react';
import { generateComparison } from '../../utils/api';

interface CompareTabProps {
  sessionId: string;
  canCompare: boolean;
  docAName: string;
  docBName: string;
  onUploadB?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  uploadingB?: boolean;
}

export default function CompareTab({ sessionId, canCompare, docAName, docBName, onUploadB, uploadingB }: CompareTabProps) {
  const [comparing, setComparing] = useState(false);
  const [result, setResult] = useState<{ comparison: any[]; recommendation: string } | null>(() => {
    if (typeof window !== 'undefined' && sessionId) {
      try {
        const saved = sessionStorage.getItem(`loanlens_comparison_${sessionId}`);
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return null;
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (result && typeof window !== 'undefined' && sessionId) {
      try {
        sessionStorage.setItem(`loanlens_comparison_${sessionId}`, JSON.stringify(result));
      } catch {}
    }
  }, [result, sessionId]);

  const runComparison = async () => {
    setComparing(true);
    setError(null);
    try {
      const data = await generateComparison(sessionId);
      setResult(data);
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(`loanlens_comparison_${sessionId}`, JSON.stringify(data));
        } catch {}
      }
    } catch (err: any) {
      setError(err?.message || "Failed to generate comparison. Please try again.");
    } finally {
      setComparing(false);
    }
  };

  if (!canCompare) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-12 shadow-sm flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mb-4">
          <Scale size={32} className="text-purple-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Upload Agreement B to Compare</h2>
        <p className="text-gray-600 max-w-md mb-6">You need two agreements to run a comparison. Upload your second loan document to see a side-by-side term extraction, differences, and AI recommendation.</p>
        {onUploadB && (
          <label className="cursor-pointer bg-purple-600 hover:bg-purple-700 text-white font-semibold px-6 py-3 rounded-xl inline-flex items-center gap-2 transition-colors shadow-md shadow-purple-500/20">
            {uploadingB ? <Loader2 size={18} className="animate-spin" /> : <ArrowRightLeft size={18} />}
            <span>{uploadingB ? "Processing Agreement B..." : "Upload Agreement B (PDF / DOCX / TXT)"}</span>
            <input type="file" className="hidden" accept=".pdf,.txt,.docx" onChange={onUploadB} disabled={uploadingB} />
          </label>
        )}
      </div>
    );
  }

  if (comparing) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-12 shadow-sm flex flex-col items-center justify-center text-center">
        <Loader2 size={40} className="animate-spin text-purple-500 mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Comparing Agreements...</h2>
        <p className="text-gray-500">Extracting and comparing terms from both agreements. This might take a few seconds.</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-12 shadow-sm flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mb-4">
          <GitCompare size={32} className="text-purple-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-4">Ready to Compare</h2>
        <p className="text-gray-600 max-w-md mb-8">LoanLens will analyze both agreements and extract 12 key terms for comparison.</p>
        <button 
          onClick={runComparison}
          className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-8 rounded-lg shadow-md transition-colors"
        >
          Run Comparison
        </button>
        {error && <p className="text-red-500 mt-4 text-sm">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-gray-200 flex items-center gap-2 bg-gray-50">
          <GitCompare className="text-purple-600" size={20} />
          <h2 className="text-lg font-bold text-gray-900">Side-by-Side Analysis</h2>
        </div>
        <div className="w-full overflow-hidden">
          <table className="w-full table-fixed text-left border-collapse">
            <thead>
              <tr>
                <th className="p-3.5 border-b border-gray-200 bg-white font-semibold text-gray-700 w-1/4">Field</th>
                <th className="p-3.5 border-b border-gray-200 bg-blue-50 font-semibold text-blue-900 w-[37.5%] border-l break-words">{docAName}</th>
                <th className="p-3.5 border-b border-gray-200 bg-purple-50 font-semibold text-purple-900 w-[37.5%] border-l break-words">{docBName}</th>
              </tr>
            </thead>
            <tbody>
              {result.comparison.map((row: any, i: number) => {
                const fieldName = row.field_name || row.field || '';
                const valA = row.agreement_a_value ?? row.value_a ?? 'Not specified';
                const valB = row.agreement_b_value ?? row.value_b ?? 'Not specified';
                const diff = valA !== valB;
                const bothNotSpecified = (valA === 'Not specified' || !valA) && (valB === 'Not specified' || !valB);
                const formatName = (str?: string) => (str || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                
                return (
                  <tr key={i} className={`border-b border-gray-100 ${diff && !bothNotSpecified ? 'bg-yellow-50/50' : ''}`}>
                    <td className="p-3.5 font-medium text-sm text-gray-700 capitalize break-words">
                      {formatName(fieldName)}
                      {diff && !bothNotSpecified && <span className="ml-2 text-yellow-600 font-bold text-xs" title="Differs">≠</span>}
                    </td>
                    <td className={`p-3.5 text-sm border-l border-gray-100 break-words whitespace-normal ${valA === 'Not specified' || !valA ? 'text-gray-400 italic' : 'text-gray-800'}`}>
                      {valA || 'Not specified'}
                    </td>
                    <td className={`p-3.5 text-sm border-l border-gray-100 break-words whitespace-normal ${valB === 'Not specified' || !valB ? 'text-gray-400 italic' : 'text-gray-800'}`}>
                      {valB || 'Not specified'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4 border-b border-blue-200 pb-3">
          <Sparkles className="text-blue-600" size={20} />
          <h2 className="text-lg font-bold text-blue-900">LoanLens Analysis</h2>
        </div>
        <div className="prose prose-sm max-w-none text-blue-900 prose-headings:text-blue-950 prose-headings:font-bold prose-p:text-blue-900 prose-li:text-blue-900 prose-strong:text-blue-950">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.recommendation}</ReactMarkdown>
        </div>
        <p className="mt-4 text-xs text-blue-500 italic">AI-generated recommendation. Please consult a financial advisor for professional guidance.</p>
      </div>

      <div className="flex justify-end">
        <button onClick={runComparison} className="text-sm text-purple-600 hover:text-purple-800 font-medium underline">
          Re-run Comparison
        </button>
      </div>
    </div>
  );
}
