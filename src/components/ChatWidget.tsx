'use client'
// src/components/ChatWidget.tsx

import { useState, useRef, useEffect } from 'react'

type Message = { role: 'user' | 'assistant'; content: string }

export default function ChatWidget({ apartmentId }: { apartmentId?: string }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: apartmentId
        ? "Hi! I can answer questions about this apartment or help you compare it with others. What do you want to know?"
        : "Hi! I'm your UIUC apartment advisor. Tell me your budget, preferred location, and what matters most — I'll help you find the right place." }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    const next: Message[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, apartment_id: apartmentId }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply ?? 'Sorry, something went wrong.' }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I had trouble connecting. Try again.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-20 right-4 z-50 w-80 sm:w-96 bg-[#FAFAF8] border border-[#E2DED8] rounded-2xl shadow-xl flex flex-col overflow-hidden" style={{ maxHeight: '70vh' }}>
          {/* Header */}
          <div className="bg-[#13294B] px-4 py-3 flex items-center justify-between">
            <div>
              <div className="text-white font-semibold text-sm">🤖 AI Apartment Advisor</div>
              <div className="text-blue-200 text-xs">Powered by Claude</div>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/60 hover:text-white text-lg leading-none">✕</button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] text-sm px-3 py-2 rounded-xl leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-[#13294B] text-white rounded-br-sm'
                      : 'bg-[#EDECEA] text-[#1C1917] rounded-bl-sm'
                  }`}
                  style={{ whiteSpace: 'pre-wrap' }}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-[#EDECEA] text-[#78716C] text-sm px-3 py-2 rounded-xl rounded-bl-sm">
                  <span className="animate-pulse">Thinking…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-[#E2DED8] px-3 py-3 flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="Ask anything…"
              className="flex-1 text-sm bg-[#F2F0EB] border border-[#E2DED8] rounded-xl px-3 py-2 outline-none focus:border-[#13294B] text-[#1C1917] placeholder:text-[#A8A29E]"
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="bg-[#E84A27] text-white px-3 py-2 rounded-xl text-sm font-medium hover:bg-[#c93d1e] transition-colors disabled:opacity-40"
            >
              →
            </button>
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-4 right-4 z-50 bg-[#13294B] text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-2xl hover:bg-[#0f1f38] transition-colors"
        aria-label="Open AI chat"
      >
        {open ? '✕' : '🤖'}
      </button>
    </>
  )
}
