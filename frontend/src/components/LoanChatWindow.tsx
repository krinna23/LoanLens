import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { API_BASE_URL } from '../utils/api';
import { Send, FileText, Bot, AlertTriangle, ShieldCheck, User as UserIcon, BrainCircuit, ChevronDown, ChevronRight } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  sources?: any;
  riskFlag?: any;
}

export default function LoanChatWindow({ sessionId, mode }: { sessionId: string; mode: 'A' | 'B' }) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window !== 'undefined' && sessionId) {
      try {
        const saved = sessionStorage.getItem(`loanlens_chat_${sessionId}_${mode}`);
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return [];
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionId && messages.length > 0) {
      try {
        sessionStorage.setItem(`loanlens_chat_${sessionId}_${mode}`, JSON.stringify(messages));
      } catch {}
    }
  }, [messages, sessionId, mode]);

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(() => { scrollToBottom(); }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !sessionId) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    // Initial placeholder for assistant message
    setMessages(prev => [...prev, { role: 'assistant', content: '', thinking: '' }]);

    try {
      const response = await fetch(`${API_BASE_URL}/loan_chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, session_id: sessionId, agreement_label: mode }),
      });

      if (!response.ok) {
        const errText = await response.text();
        let errMsg = "AI service returned an error.";
        try {
          const parsed = JSON.parse(errText);
          errMsg = parsed.detail || errMsg;
        } catch {
          if (errText) errMsg = errText;
        }
        throw new Error(errMsg);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      let thoughts = '';
      let blockType = '';
      let sources: any = null;
      let riskFlag: any = null;

      while (true) {
        if (!reader) break;
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            const dataStr = line.slice(6);
            if (!dataStr.trim()) continue;
            
            try {
              const data = JSON.parse(dataStr);
              
              if (data.type === 'sources') {
                sources = data;
              } else if (data.type === 'risk_flag') {
                riskFlag = data;
              } else if (data.type === 'block_start') {
                blockType = data.block_type;
              } else if (data.type === 'thinking') {
                thoughts += data.text;
                // Update specific stream blocks securely
                setMessages(prev => {
                  const newMsgs = [...prev];
                  newMsgs[newMsgs.length - 1].thinking = thoughts;
                  return newMsgs;
                });
              } else if (data.type === 'text') {
                assistantContent += data.text;
                setMessages(prev => {
                  const newMsgs = [...prev];
                  newMsgs[newMsgs.length - 1].content = assistantContent;
                  newMsgs[newMsgs.length - 1].sources = sources;
                  newMsgs[newMsgs.length - 1].riskFlag = riskFlag;
                  return newMsgs;
                });
              }
            } catch (e) {
              // Partial stream json catch
            }
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      setMessages(prev => {
        const newMsgs = [...prev];
        const last = newMsgs[newMsgs.length - 1];
        if (last && last.role === 'assistant') {
          if (!last.content) {
            last.content = err?.message ? `Failed to connect to AI service: ${err.message}` : "Failed to connect to AI service. Please try again.";
          }
        }
        return newMsgs;
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="text-blue-600" size={24} />
          <h3 className="font-semibold text-gray-900 font-heading">LoanLens AI Assistant</h3>
        </div>
        <div className="text-xs font-semibold px-2.5 py-1 bg-white border border-gray-200 rounded text-gray-600 shadow-sm">
          Discussing: Document {mode}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-60">
            <ShieldCheck size={48} className="text-blue-500 mb-4" />
            <h3 className="text-lg font-semibold font-heading text-gray-800">Ready to Analyze</h3>
            <p className="text-sm max-w-sm mt-2 text-gray-600">Ask any question about your loan agreement. I will cross-reference the exact clauses with RBI policies.</p>
          </div>
        )}
        
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-10 h-10 rounded-full bg-blue-100 flex-shrink-0 flex items-center justify-center shadow-sm border border-blue-200 text-blue-600">
                <Bot size={20} />
              </div>
            )}
            
            <div className={`max-w-[80%] ${msg.role === 'user' ? 'bg-blue-600 text-white shadow-md rounded-2xl rounded-tr-sm px-5 py-3' : 'bg-transparent'}`}>
              {msg.role === 'assistant' ? (
                <div className="space-y-4">
                  {/* Thinking Block */}
                  {msg.thinking && (
                    <ThinkingBlock thoughts={msg.thinking} />
                  )}
                  
                  {/* Content */}
                  <div className="prose prose-sm prose-blue max-w-none text-gray-800 leading-relaxed
                    prose-headings:font-bold prose-headings:text-gray-900
                    prose-h3:text-base prose-h3:mt-4 prose-h3:mb-2 prose-h3:first:mt-0
                    prose-p:my-1 prose-p:leading-relaxed
                    prose-ul:my-1 prose-ul:pl-4 prose-li:my-0.5
                    prose-ol:my-1 prose-ol:pl-4
                    prose-strong:text-gray-900 prose-strong:font-semibold
                    prose-table:text-sm prose-table:border-collapse
                    prose-th:bg-gray-100 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:border prose-th:border-gray-300 prose-th:font-semibold
                    prose-td:px-3 prose-td:py-2 prose-td:border prose-td:border-gray-200
                    prose-hr:my-3">
                    {msg.content
                      ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      : loading && i === messages.length - 1
                        ? <span className="animate-pulse text-gray-400">Analyzing...</span>
                        : null
                    }
                  </div>

                  {/* Sources Section */}
                  {msg.sources && (
                    <SourcesSection sources={msg.sources} />
                  )}

                  {/* Risk Alert */}
                  {msg.riskFlag && msg.riskFlag.risk_level !== "LOW" && (
                     <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-3 text-sm text-amber-900 shadow-sm">
                       <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={18} />
                       <div>
                         <span className="font-semibold">{msg.riskFlag.risk_level} Risk Detected: </span>
                         {msg.riskFlag.deviation_description}
                       </div>
                     </div>
                  )}
                </div>
              ) : (
                <div className="text-[15px]">{msg.content}</div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-gray-100 bg-white">
          <div className="text-[10px] text-gray-400 text-center mb-2">Answers are AI-generated and not definitive financial/legal advice.</div>
          <div className="flex relative items-end shadow-sm">
            <textarea
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 pb-3 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none text-[15px] max-h-32 min-h-[52px]"
              placeholder="Ask about interest rates, hidden fees, or KYC rules..."
              value={input}
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              onChange={(e) => setInput(e.target.value)}
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="absolute right-2 bottom-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg p-2 transition-colors disabled:opacity-50"
            >
              <Send size={18} />
            </button>
          </div>
      </div>
    </div>
  );
}

function ThinkingBlock({ thoughts }: { thoughts: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-100 transition-colors">
        <BrainCircuit size={14} className="text-blue-500" />
        Analysis Summary
        {open ? <ChevronDown size={14} className="ml-auto" /> : <ChevronRight size={14} className="ml-auto" />}
      </button>
      {open && (
        <div className="px-3 py-2 border-t border-gray-200 text-xs text-gray-600 bg-gray-100/50 max-h-48 overflow-y-auto leading-relaxed">
          {thoughts}
        </div>
      )}
    </div>
  )
}

function SourcesSection({ sources }: { sources: any }) {
  const [activeTab, setActiveTab] = useState<'doc' | 'rbi' | null>(null);

  const docSource = sources.agreement_sources?.[0];
  const rbiSource = sources.rbi_sources?.[0];

  if (!docSource && !rbiSource) return null;

  return (
    <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col gap-2.5">
      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
        <FileText size={12} /> Sources Referenced
      </span>
      <div className="flex flex-wrap gap-2">
        {docSource && (
          <button
            onClick={() => setActiveTab(activeTab === 'doc' ? null : 'doc')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md border flex items-center gap-1.5 transition-all ${
              activeTab === 'doc'
                ? 'bg-slate-200 border-slate-400 text-slate-900 shadow-sm'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <FileText size={13} className="text-slate-500" />
            <span>Agreement Clause</span>
            <ChevronDown size={12} className={`transition-transform ${activeTab === 'doc' ? 'rotate-180' : ''}`} />
          </button>
        )}
        {rbiSource && (
          <button
            onClick={() => setActiveTab(activeTab === 'rbi' ? null : 'rbi')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md border flex items-center gap-1.5 transition-all ${
              activeTab === 'rbi'
                ? 'bg-indigo-100 border-indigo-400 text-indigo-950 shadow-sm'
                : 'bg-indigo-50 border-indigo-200 text-indigo-800 hover:bg-indigo-100/70'
            }`}
          >
            <ShieldCheck size={13} className="text-indigo-600" />
            <span>RBI Guideline {rbiSource.status ? `(${rbiSource.status})` : ''}</span>
            <ChevronDown size={12} className={`transition-transform ${activeTab === 'rbi' ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {activeTab === 'doc' && docSource && (
        <div className="mt-1 w-full bg-slate-50/90 border border-slate-200 rounded-lg p-3 text-xs leading-relaxed text-slate-800 break-words whitespace-pre-wrap">
          {docSource.filename && (
            <div className="font-semibold text-slate-600 mb-1">Source: {docSource.filename}</div>
          )}
          {docSource.text}
        </div>
      )}

      {activeTab === 'rbi' && rbiSource && (
        <div className="mt-1 w-full bg-indigo-50/70 border border-indigo-200 rounded-lg p-3 text-xs leading-relaxed text-indigo-950 break-words whitespace-pre-wrap">
          {rbiSource.filename && (
            <div className="font-semibold text-indigo-700 mb-1">Reference: {rbiSource.filename}</div>
          )}
          {rbiSource.text}
        </div>
      )}
    </div>
  );
}
