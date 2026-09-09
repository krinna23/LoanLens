import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Scale, GitCompare, Sparkles, Loader2 } from 'lucide-react';
import { generateComparison } from '../../utils/api';

interface CompareTabProps {
  sessionId: string;
  canCompare: boolean;
  docAName: string;
  docBName: string;
}

export default function CompareTab({ sessionId, canCompare, docAName, docBName }: CompareTabProps) {
  const [comparing, setComparing] = useState(false);
  const [result, setResult] = useState<{ comparison: any[]; recommendation: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runComparison = async () => {
    setComparing(true);
    setError(null);
    try {
      const data = await generateComparison(sessionId);
      setResult(data);
    } catch (err) {
      setError("Failed to generate comparison. Please try again.");
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
        <h2 className="text-xl font-bold text-gray-900 mb-2">Upload Agreement B to compare</h2>
        <p className="text-gray-600 max-w-md">You need two agreements to run a comparison. Upload the second document using the button in the top navigation bar.</p>
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
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-max">
            <thead>
              <tr>
                <th className="p-4 border-b border-gray-200 bg-white font-semibold text-gray-700 w-1/4">Field</th>
                <th className="p-4 border-b border-gray-200 bg-blue-50 font-semibold text-blue-900 w-3/8 border-l">{docAName}</th>
                <th className="p-4 border-b border-gray-200 bg-purple-50 font-semibold text-purple-900 w-3/8 border-l">{docBName}</th>
              </tr>
            </thead>
            <tbody>
              {result.comparison.map((row: any, i: number) => {
                const diff = row.value_a !== row.value_b;
                const bothNotSpecified = (row.value_a === 'Not specified' || !row.value_a) && (row.value_b === 'Not specified' || !row.value_b);
                const formatName = (str: string) => str.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                
                return (
                  <tr key={i} className={`border-b border-gray-100 ${diff && !bothNotSpecified ? 'bg-yellow-50/50' : ''}`}>
                    <td className="p-4 font-medium text-sm text-gray-700">
                      {formatName(row.field)}
                      {diff && !bothNotSpecified && <span className="ml-2 text-yellow-600 font-bold text-xs" title="Differs">≠</span>}
                    </td>
                    <td className={`p-4 text-sm border-l border-gray-100 ${row.value_a === 'Not specified' || !row.value_a ? 'text-gray-400 italic' : 'text-gray-800'}`}>
                      {row.value_a || 'Not specified'}
                    </td>
                    <td className={`p-4 text-sm border-l border-gray-100 ${row.value_b === 'Not specified' || !row.value_b ? 'text-gray-400 italic' : 'text-gray-800'}`}>
                      {row.value_b || 'Not specified'}
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
        <div className="prose prose-sm max-w-none text-blue-900">
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
