import React, { useState, useRef, useEffect } from 'react';
import { Send, Cpu, Code, Terminal, Loader2 } from 'lucide-react';
import { ChatMessage } from '../types';
import { sendMessageToAI } from '../services/gemini';
import { GenerateContentResponse } from '@google/genai';

export const DevConsole: React.FC = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init',
      role: 'model',
      text: 'Servus! Ich bin AgriBot, die künstliche Intelligenz hinter AgriTrack. Ich warte den Code, wenn die Menschen schlafen. Hast du eine Idee für ein neues Feature oder hast du einen Bug gefunden? Lass es uns direkt fixen.',
      timestamp: Date.now()
    }
  ]);
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsThinking(true);

    try {
      const streamResponse = await sendMessageToAI(userMsg.text);
      
      let fullResponseText = '';
      const modelMsgId = (Date.now() + 1).toString();
      
      // Add placeholder for model message
      setMessages(prev => [...prev, {
        id: modelMsgId,
        role: 'model',
        text: '',
        timestamp: Date.now()
      }]);

      for await (const chunk of streamResponse) {
        const c = chunk as GenerateContentResponse;
        if (c.text) {
            fullResponseText += c.text;
            setMessages(prev => prev.map(msg => 
                msg.id === modelMsgId ? { ...msg, text: fullResponseText } : msg
            ));
        }
      }
    } catch (error) {
      console.error("AI Error", error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'model',
        text: 'Entschuldigung, meine Verbindung zum Mainframe ist unterbrochen. Bitte versuche es später noch einmal.',
        timestamp: Date.now()
      }]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[600px] bg-slate-900 rounded-xl overflow-hidden border border-slate-700 shadow-2xl">
      {/* Header */}
      <div className="bg-slate-800 p-4 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-agri-900 rounded-lg">
            <Cpu className="text-agri-500 w-5 h-5" />
          </div>
          <div>
            <h3 className="text-white font-bold">AgriBot Dev-Labor</h3>
            <p className="text-xs text-agri-500 flex items-center">
              <span className="w-1.5 h-1.5 bg-agri-500 rounded-full mr-1 animate-pulse"></span>
              System Online • v2.5-flash
            </p>
          </div>
        </div>
        <div className="px-3 py-1 bg-black/30 rounded text-xs text-gray-400 font-mono border border-white/5">
          TEST-ENV: ACTIVE
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-sm scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg p-4 ${
                msg.role === 'user'
                  ? 'bg-agri-700 text-white'
                  : 'bg-slate-800 text-gray-300 border border-slate-700'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.text}</div>
              {msg.role === 'model' && (
                <div className="mt-2 pt-2 border-t border-white/5 flex items-center text-xs text-gray-500">
                  <Terminal className="w-3 h-3 mr-1" />
                  AgriBot Maintainer
                </div>
              )}
            </div>
          </div>
        ))}
        {isThinking && (
           <div className="flex justify-start">
             <div className="bg-slate-800 text-agri-500 p-3 rounded-lg flex items-center space-x-2 border border-slate-700">
               <Loader2 className="w-4 h-4 animate-spin" />
               <span className="text-xs">Analysiere Codebasis...</span>
             </div>
           </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-slate-800 border-t border-slate-700">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Beschreibe ein Feature oder einen Bug (z.B. 'Füge einen Ernte-Kalender hinzu')..."
            className="w-full bg-slate-900 text-white rounded-lg pl-4 pr-12 py-3 focus:outline-none focus:ring-2 focus:ring-agri-500 border border-slate-700 resize-none h-14"
          />
          <button
            onClick={handleSend}
            disabled={isThinking || !input.trim()}
            className="absolute right-2 top-2 p-2 bg-agri-600 hover:bg-agri-500 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2 text-center">
          Code-Änderungen werden in die Staging-Umgebung gepusht.
        </p>
      </div>
    </div>
  );
};