import React, { useState } from 'react';
import { generateComparison } from '../utils/api';
import { GitCompare, Loader2, Sparkles, Scale } from 'lucide-react';

export default function ComparisonTable({ sessionId, canCompare }: { sessionId: string; canCompare: boolean }) {
  const [comparing, setComparing] = useState(false);
  const [result, setResult] = useState<{ comparison: any[]; recommendation: string } | null>(null);
  const [error, setError] = useState("");

  const handleCompare = async () => {
    setComparing(true);
    setError("");
    try {
      const data = await generateComparison(sessionId);
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Failed to compare. Ensure both Document A and Document B are uploaded.");
    } finally {
      setComparing(false);
    }
  };

  if (!canCompare && !result) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center flex flex-col items-center">
        <Scale size={48} className="text-gray-300 mb-4" />
        <h3 className="font-semibold text-lg text-gray-900 font-heading">Loan Comparison</h3>
        <p className="text-gray-500 mt-2 max-w-sm">Upload a second loan agreement (Agreement B) and switch to comparison mode to automatically extract and compare terms.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <GitCompare className="text-blue-600" size={20} />
          <h3 className="font-semibold text-gray-900 font-heading">Side-by-Side Analysis</h3>
        </div>
        {!result && (
          <button 
            onClick={handleCompare} 
            disabled={comparing}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-70"
          >
            {comparing ? <Loader2 size={16} className="animate-spin" /> : "Run Comparison"}
          </button>
        )}
      </div>

      <div className="p-4">
        {error && <p className="text-red-500 text-sm mb-4 bg-red-50 p-3 rounded-lg border border-red-100">{error}</p>}
        
        {comparing && !result && (
           <div className="py-12 flex flex-col items-center justify-center text-gray-500">
             <Loader2 size={32} className="animate-spin text-blue-500 mb-4" />
             <p className="font-medium animate-pulse">Extracting parameters and analyzing...</p>
           </div>
        )}

        {result && (
          <div className="space-y-6">
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-100 text-gray-700 uppercase tracking-wider text-xs">
                  <tr>
                    <th className="px-6 py-4 font-semibold border-b border-gray-200 w-1/3">Field</th>
                    <th className="px-6 py-4 font-semibold border-b border-gray-200 w-1/3 bg-blue-50/50">Agreement A</th>
                    <th className="px-6 py-4 font-semibold border-b border-gray-200 w-1/3 bg-purple-50/50">Agreement B</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {result.comparison.map((row: any) => (
                    <tr key={row.field_name} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900 capitalize">{row.field_name.replace(/_/g, " ")}</td>
                      <td className="px-6 py-4 text-gray-700 bg-blue-50/30">{row.agreement_a_value}</td>
                      <td className="px-6 py-4 text-gray-700 bg-purple-50/30">{row.agreement_b_value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 p-6 rounded-xl">
              <div className="flex items-center gap-2 mb-3 text-blue-800">
                 <Sparkles size={18} />
                 <h4 className="font-semibold text-lg font-heading">AI Recommendation</h4>
              </div>
              <p className="text-gray-800 leading-relaxed text-sm">{result.recommendation}</p>
              <div className="mt-4 text-xs text-amber-700 bg-amber-50 inline-block px-3 py-1.5 rounded border border-amber-200">
                 Disclaimer: This analysis does not constitute financial advice. Please consult a qualified financial advisor before proceeding.
              </div>
            </div>
            
            <div className="flex justify-end">
                <button onClick={handleCompare} className="text-sm text-gray-500 hover:text-blue-600 transition-colors flex items-center gap-1"><GitCompare size={14} /> Re-run Comparison</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
