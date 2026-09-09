import React from 'react';
import { ShieldCheck, ShieldAlert, ShieldQuestion, Loader2 } from 'lucide-react';

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

interface RisksTabProps {
  riskFlags: RiskFlag[];
  loading: boolean;
}

export default function RisksTab({ riskFlags, loading }: RisksTabProps) {
  const highRisk = riskFlags.filter(r => r.risk_level === 'HIGH').length;
  const medRisk = riskFlags.filter(r => r.risk_level === 'MEDIUM').length;
  const lowRisk = riskFlags.filter(r => r.risk_level === 'LOW').length;
  const total = riskFlags.length;

  const getBorderColor = (level: string) => {
    switch(level) {
      case 'HIGH': return 'border-l-4 border-l-red-500';
      case 'MEDIUM': return 'border-l-4 border-l-amber-500';
      case 'LOW': return 'border-l-4 border-l-green-500';
      default: return 'border-l-4 border-l-gray-300';
    }
  };

  const getBadgeColor = (level: string) => {
    switch(level) {
      case 'HIGH': return 'bg-red-100 text-red-700 border-red-200';
      case 'MEDIUM': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'LOW': return 'bg-green-100 text-green-700 border-green-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getRegStatusBadge = (status: string) => {
    switch(status) {
      case 'ACTIVE': return 'bg-green-100 text-green-800';
      case 'WITHDRAWN': return 'bg-red-100 text-red-800';
      case 'SUPERSEDED': return 'bg-amber-100 text-amber-800';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const sortedFlags = [...riskFlags].sort((a, b) => {
    const levels = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
    return levels[b.risk_level] - levels[a.risk_level];
  });

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Risk Overview</h2>
        
        {loading ? (
          <div className="flex items-center gap-3 text-gray-600 py-4">
            <Loader2 className="animate-spin" size={20} />
            <span>Scanning clauses...</span>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-gray-700">Total flags checked: {total}</span>
              <div className="flex gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">{highRisk} High</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">{medRisk} Medium</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">{lowRisk} Low</span>
              </div>
            </div>
            
            {total > 0 && (
              <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden flex">
                <div style={{ width: `${(highRisk/total)*100}%` }} className="h-full bg-red-500"></div>
                <div style={{ width: `${(medRisk/total)*100}%` }} className="h-full bg-amber-500"></div>
                <div style={{ width: `${(lowRisk/total)*100}%` }} className="h-full bg-green-500"></div>
              </div>
            )}
          </div>
        )}
      </div>

      {!loading && total === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
            <ShieldCheck size={32} className="text-blue-500" />
          </div>
          <p className="text-gray-600 max-w-md">No risk flags detected yet. Upload a loan agreement and the AI will automatically analyze clause risks.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedFlags.map(flag => (
            <div key={flag.id} className={`bg-white border border-gray-200 rounded-xl p-5 shadow-sm ${getBorderColor(flag.risk_level)}`}>
              <div className="flex flex-wrap gap-2 mb-3 items-center">
                <span className={`px-2 py-1 rounded text-xs font-bold border ${getBadgeColor(flag.risk_level)}`}>
                  {flag.risk_level} RISK
                </span>
                {flag.rbi_document_status && (
                  <span className={`px-2 py-1 rounded text-xs font-bold ${getRegStatusBadge(flag.rbi_document_status)}`}>
                    {flag.rbi_document_status}
                  </span>
                )}
              </div>
              
              <h3 className="font-bold text-gray-900 mb-1">{flag.deviation_description || "Potential Clause Issue"}</h3>
              <p className="text-gray-600 text-sm mb-4">{flag.reason}</p>
              
              <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                <p className="text-xs text-gray-500 font-mono mb-1">AGREEMENT EVIDENCE</p>
                <blockquote className="text-sm font-mono text-gray-700 italic">
                  &ldquo;{flag.clause_text.length > 200 ? flag.clause_text.substring(0, 200) + '...' : flag.clause_text}&rdquo;
                </blockquote>
              </div>
              
              {flag.rbi_source_document && (
                <div className="mt-3 text-xs text-gray-500 flex gap-1">
                  <span className="font-semibold">Source:</span> {flag.rbi_source_document}
                </div>
              )}
            </div>
          ))}
          
          {total > 0 && (
            <p className="text-xs text-gray-400 italic text-center pt-4">
              Note: A WITHDRAWN status indicates the regulatory guideline matched is no longer active.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
