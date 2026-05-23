'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  rowCount?: number;
}

const SUGGESTIONS = [
  'Who joined in August 2023?',
  'Whose visas are expired or expiring soon?',
  'How many employees are in India vs US?',
  'Who are the WFH employees?',
  'Show me all employees by department',
  'Who has H1B visas?',
  'List all open action items',
  'Who has not had a monthly review this month?',
];

export default function HrChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [expanded, setExpanded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function ask(question: string) {
    if (!question.trim() || loading) return;
    const q = question.trim();
    setInput('');
    setExpanded(true);
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setLoading(true);

    try {
      const res  = await fetch('/api/hr-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.answer ?? 'No response received.',
        rowCount: data.rowCount,
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '❌ Failed to reach the AI. Please try again.',
      }]);
    }
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input); }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b bg-gradient-to-r from-[#0f1e3d] to-[#1a3a6b]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-400/30 flex items-center justify-center text-lg">🤖</div>
          <div>
            <div className="text-white font-semibold text-sm">HR AI Assistant</div>
            <div className="text-white/50 text-xs">Ask anything about your team</div>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Suggestions — shown when no messages */}
      {messages.length === 0 && (
        <div className="p-5">
          <p className="text-xs text-gray-400 mb-3 font-medium uppercase tracking-wide">Try asking…</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => ask(s)}
                className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      {(messages.length > 0 || loading) && (
        <div className="px-5 py-4 space-y-4 max-h-80 overflow-y-auto">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-sm shrink-0 mt-0.5">🤖</div>
              )}
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-sm'
                  : 'bg-gray-50 text-gray-800 border border-gray-100 rounded-tl-sm'
              }`}>
                <div className="whitespace-pre-wrap">{msg.content}</div>
                {msg.role === 'assistant' && msg.rowCount !== undefined && msg.rowCount > 0 && (
                  <div className="text-xs text-gray-400 mt-2">{msg.rowCount} record{msg.rowCount !== 1 ? 's' : ''} found</div>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs text-white font-bold shrink-0 mt-0.5">You</div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex gap-3 justify-start">
              <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-sm shrink-0">🤖</div>
              <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex gap-1.5 items-center h-5">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t bg-gray-50">
        <div className="flex gap-2 items-center">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about employees, visas, performance…"
            className="flex-1 px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={() => ask(input)}
            disabled={!input.trim() || loading}
            className="px-4 py-2.5 bg-blue-600 text-white text-sm rounded-xl font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors shrink-0"
          >
            Ask
          </button>
        </div>
      </div>
    </div>
  );
}
