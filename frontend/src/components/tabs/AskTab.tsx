import React, { useState } from 'react';
import LoanChatWindow from '../LoanChatWindow';

interface AskTabProps {
  sessionId: string;
  mode: 'A' | 'B';
  onModeChange: (mode: 'A' | 'B') => void;
  hasDocB: boolean;
}

const SUGGESTED_QUESTIONS = [
  "What is my interest rate?",
  "Are there any hidden fees?",
  "Explain the prepayment clause",
  "What are the default conditions?",
  "What is the total cost of this loan?",
  "Are there any rate reset conditions?"
];

export default function AskTab({ sessionId, mode, onModeChange, hasDocB }: AskTabProps) {
  const [toast, setToast] = useState(false);

  const handleCopy = (q: string) => {
    navigator.clipboard.writeText(q);
    setToast(true);
    setTimeout(() => setToast(false), 2000);
  };

  return (
    <div className="h-[75vh] flex flex-col space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-gray-200 rounded-xl p-4 shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-700">Asking about:</span>
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => onModeChange('A')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === 'A' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Document A
            </button>
            {hasDocB && (
              <button
                onClick={() => onModeChange('B')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === 'B' ? 'bg-white shadow-sm text-purple-600' : 'text-gray-600 hover:text-gray-900'}`}
              >
                Document B
              </button>
            )}
          </div>
        </div>
        
        <div className="flex-1 overflow-x-auto whitespace-nowrap scrollbar-hide flex items-center gap-2 relative">
          {SUGGESTED_QUESTIONS.map((q, i) => (
            <button
              key={i}
              onClick={() => handleCopy(q)}
              className="inline-block bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 text-xs text-gray-600 hover:text-blue-700 px-3 py-1.5 rounded-full transition-colors shrink-0"
            >
              {q}
            </button>
          ))}
          {toast && (
            <div className="absolute right-0 bg-gray-800 text-white text-xs px-3 py-1.5 rounded-full animate-fade-in-up shadow-md">
              Copied to clipboard
            </div>
          )}
        </div>
      </div>
      
      <div className="flex-1 min-h-0 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
        <LoanChatWindow key={`${sessionId}-${mode}`} sessionId={sessionId} mode={mode} />
      </div>
    </div>
  );
}
