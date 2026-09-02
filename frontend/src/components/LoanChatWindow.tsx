import React, { useState, useRef, useEffect } from 'react';
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      let thoughts = '';
      let blockType = '';
      let sources = null;
      let riskFlag = null;

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
    } catch (err) {
      console.error(err);
      setMessages(prev => {
        const newMsgs = [...prev];
        newMsgs[newMsgs.length - 1].content = "Failed to connect to AI service.";
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
                  <div className="prose prose-sm prose-blue max-w-none text-gray-800 leading-relaxed">
                    {msg.content || (loading && i === messages.length - 1 ? <span className="animate-pulse">Thinking...</span> : "")}
                  </div>

                  {/* Sources Chips */}
                  {msg.sources && (
                    <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col gap-2">
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                        <FileText size={12} /> Sources Referenced
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {msg.sources.agreement_sources?.length > 0 && (
                          <SourceChip 
                            title={`Agreement Clause`} 
                            preview={msg.sources.agreement_sources[0].text} 
                            type="doc"
                          />
                        )}
                        {msg.sources.rbi_sources?.length > 0 && (
                          <SourceChip 
                            title={`RBI Guideline (${msg.sources.rbi_sources[0].status})`} 
                            preview={msg.sources.rbi_sources[0].text} 
                            type="rbi"
                          />
                        )}
                      </div>
                    </div>
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
        AI Reasoning Process
        {open ? <ChevronDown size={14} className="ml-auto" /> : <ChevronRight size={14} className="ml-auto" />}
      </button>
      {open && (
        <div className="px-3 py-2 border-t border-gray-200 text-xs text-gray-600 font-mono bg-gray-100/50 max-h-48 overflow-y-auto">
          {thoughts}
        </div>
      )}
    </div>
  )
}

function SourceChip({ title, preview, type }: { title: string, preview: string, type: 'doc'|'rbi' }) {
  const [open, setOpen] = useState(false);
  const isRbi = type === 'rbi';

  return (
    <div className={`relative ${isRbi ? 'bg-indigo-50 border-indigo-200 text-indigo-900' : 'bg-slate-50 border-slate-200 text-slate-800'} border rounded-md`}>
      <button onClick={() => setOpen(!open)} className="px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 hover:opacity-80 transition-opacity">
        <ShieldCheck size={14} className={isRbi ? "text-indigo-500" : "text-slate-500"} />
        {title}
        <ChevronDown size={12} className={`ml-1 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-10 top-full mt-1 left-0 w-72 p-3 bg-white border border-gray-200 shadow-xl rounded-lg text-xs leading-relaxed max-h-64 overflow-y-auto">
           {preview}
        </div>
      )}
    </div>
  )
}
