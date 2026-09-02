import React, { useEffect, useState } from 'react';
import { getRiskSummary } from '../utils/api';
import { AlertCircle, FileText, CheckCircle2, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';

interface RiskFlag {
  id: string;
  clause_text: string;
  rbi_rule_matched: string;
  deviation_description: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  reason: string;
  rbi_document_status?: string;
}

function RiskMeter({ flags }: { flags: RiskFlag[] }) {
  const high = flags.filter(f => f.risk_level === 'HIGH').length;
  const medium = flags.filter(f => f.risk_level === 'MEDIUM').length;
  const low = flags.filter(f => f.risk_level === 'LOW').length;
  const total = flags.length;

  // Score: 0–100 where 100 = all HIGH
  const score = total === 0 ? 0 : Math.round(((high * 3 + medium * 1.5) / (total * 3)) * 100);

  const meterColor = high > 0 ? 'bg-red-500' : medium > 0 ? 'bg-amber-400' : 'bg-green-500';
  const meterLabel = high > 0 ? 'High Risk Detected' : medium > 0 ? 'Medium Risk' : total > 0 ? 'Low Risk' : 'No Risk Data Yet';
  const MeterIcon = high > 0 ? ShieldAlert : medium > 0 ? ShieldQuestion : ShieldCheck;
  const iconColor = high > 0 ? 'text-red-500' : medium > 0 ? 'text-amber-500' : 'text-green-500';

  return (
    <div className="p-4 border-b border-gray-100 bg-white">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MeterIcon size={20} className={iconColor} />
          <span className={`text-sm font-bold ${high > 0 ? 'text-red-700' : medium > 0 ? 'text-amber-700' : 'text-green-700'}`}>
            {meterLabel}
          </span>
        </div>
        <span className="text-xs text-gray-400">{total} clause{total !== 1 ? 's' : ''} checked</span>
      </div>

      {/* Bar */}
      <div className="w-full bg-gray-100 rounded-full h-2 mb-3 overflow-hidden">
        <div
          className={`h-2 rounded-full transition-all duration-700 ${meterColor}`}
          style={{ width: total === 0 ? '0%' : `${Math.max(score, 4)}%` }}
        />
      </div>

      {/* Count chips */}
      {total > 0 && (
        <div className="flex gap-2">
          {high > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
              {high} HIGH
            </span>
          )}
          {medium > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
              {medium} MEDIUM
            </span>
          )}
          {low > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
              {low} LOW
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function RiskSummaryPanel({ sessionId }: { sessionId: string }) {
  const [flags, setFlags] = useState<RiskFlag[]>([]);
  const [loading, setLoading] = useState(true);

  // Poll for new risk flags (populated by chat + auto-scan on upload)
  useEffect(() => {
    const fetchFlags = async () => {
      try {
        const data = await getRiskSummary(sessionId);
        setFlags(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchFlags();
    const interval = setInterval(fetchFlags, 5000);
    return () => clearInterval(interval);
  }, [sessionId]);

  const getRiskStyle = (level: string) => {
    switch (level) {
      case 'HIGH': return 'bg-red-50 border-red-200 text-red-800';
      case 'MEDIUM': return 'bg-amber-50 border-amber-200 text-amber-800';
      case 'LOW': return 'bg-green-50 border-green-200 text-green-800';
      default: return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  const getRiskIcon = (level: string) => {
    switch (level) {
      case 'HIGH': return <AlertCircle size={16} className="text-red-500 flex-shrink-0" />;
      case 'MEDIUM': return <AlertCircle size={16} className="text-amber-500 flex-shrink-0" />;
      case 'LOW': return <CheckCircle2 size={16} className="text-green-500 flex-shrink-0" />;
      default: return <FileText size={16} className="text-gray-500 flex-shrink-0" />;
    }
  };

  if (loading && flags.length === 0) return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full">
      <div className="p-4 border-b border-gray-100 bg-gray-50">
        <h3 className="font-semibold text-gray-900">Clause Risk Summary</h3>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-400 text-sm animate-pulse">Loading risk data...</p>
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full">
      <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 font-heading">Clause Risk Summary</h3>
        <span className="text-xs font-medium px-2 py-1 bg-gray-200 text-gray-600 rounded-full">{flags.length} Checked</span>
      </div>

      {/* Risk Meter */}
      <RiskMeter flags={flags} />
      
      <div className="p-4 overflow-y-auto flex-1 space-y-3">
        {flags.length === 0 ? (
          <div className="text-center py-10 flex flex-col items-center">
             <FileText className="text-gray-300 mb-3" size={48} />
             <p className="text-gray-500 font-medium">No risks tracked yet</p>
             <p className="text-gray-400 text-sm mt-1 text-balance">Risk flags will appear here automatically after upload or when you chat.</p>
          </div>
        ) : (
          // Sort HIGH → MEDIUM → LOW
          [...flags]
            .sort((a, b) => {
              const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
              return (order[a.risk_level] ?? 3) - (order[b.risk_level] ?? 3);
            })
            .map((flag) => (
              <div key={flag.id} className={`p-3 rounded-lg border flex flex-col gap-2 ${getRiskStyle(flag.risk_level)}`}>
                <div className="flex items-center gap-2">
                  {getRiskIcon(flag.risk_level)}
                  <span className="font-bold text-xs tracking-wide">{flag.risk_level} RISK</span>
                  {flag.rbi_document_status === 'WITHDRAWN' && (
                    <span className="ml-auto text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">RBI WITHDRAWN</span>
                  )}
                </div>
                <p className="font-medium text-sm">{flag.deviation_description || "Compliant clause"}</p>
                <div className="text-xs opacity-90 space-y-1">
                  <p><strong>Reason:</strong> {flag.reason}</p>
                  {flag.rbi_rule_matched && (
                    <p className="opacity-70 line-clamp-2"><strong>RBI Standard:</strong> {flag.rbi_rule_matched.substring(0, 100)}...</p>
                  )}
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  );
}
