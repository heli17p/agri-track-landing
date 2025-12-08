
import React, { useState, useRef, useEffect } from 'react';
import { Send, Cpu, Terminal, Loader2, Copy, MessageSquarePlus, ThumbsUp, CheckCircle2, Lock, Phone, ExternalLink } from 'lucide-react';
import { ChatMessage, FeedbackTicket, AppSettings } from '../types';
import { sendMessageToAI } from '../services/gemini';
import { dbService, generateId } from '../services/db'; // Stelle sicher, dass dbService und generateId korrekt importiert werden

import { GenerateContentResponse } from '@google/genai';

interface Props {
    isAdmin?: boolean;
}

export const DevConsole: React.FC<Props> = ({ isAdmin = false }) => {
  const [activeTab, setActiveTab] = useState<'CHAT' | 'WISHES' | 'ADMIN_SETTINGS'>('CHAT');

  // Chat State
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init',
      role: 'model',
      text: isAdmin
        ? 'Servus Admin! 👋 \n\nIch bin bereit für technische Aufgaben. Soll ich Code prüfen oder Tickets bearbeiten?'
        : 'Servus! Ich bin AgriBot. \n\nIch helfe dir bei Fragen zur App oder nehme deine Wünsche auf. Was liegt dir am Herzen?',
      timestamp: Date.now()
    }
  ]);
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [notificationToast, setNotificationToast] = useState<string | null>(null);

  // Tickets State
  const [tickets, setTickets] = useState<FeedbackTicket[]>([]);

  // Admin Settings State
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    loadTickets();
    if(isAdmin) loadAdminSettings();
  }, [isAdmin]);

  const loadTickets = async () => {
      const t = await dbService.getFeedback();
      setTickets(t);
  };

  const loadAdminSettings = async () => {
      const s = await dbService.getSettings();
      setAppSettings(s);
  }

  const handleSaveAdminSettings = async () => {
      if(!appSettings) return;
      await dbService.saveSettings(appSettings);
      setNotificationToast("Einstellungen gespeichert.");
      setTimeout(() => setNotificationToast(null), 3000);
  }

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

    // Prepend Context for Bot
    const contextInput = isAdmin ? `[ADMIN_USER]: ${userMsg.text}` : userMsg.text;

    try {
      const streamResponse = await sendMessageToAI(contextInput);

      let fullResponseText = '';
      const modelMsgId = (Date.now() + 1).toString();

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
        text: 'Entschuldigung, meine Verbindung ist unterbrochen. Bitte versuche es später noch einmal.',
        timestamp: Date.now()
      }]);
    } finally {
      setIsThinking(false);
    }
  };

  const createTicketFromChat = async () => {
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
      if (!lastUserMsg) return;

      const ticket: FeedbackTicket = {
          id: generateId(),
          title: lastUserMsg.text.substring(0, 30) + (lastUserMsg.text.length > 30 ? '...' : ''),
          description: lastUserMsg.text,
          author: isAdmin ? 'Admin' : 'Unbekannter Landwirt',
          date: new Date().toISOString(),
          status: 'OPEN',
          votes: 1
      };

      await dbService.saveFeedback(ticket);
      loadTickets();
      if(isAdmin) setActiveTab('WISHES');

      // WhatsApp Logic
      const settings = await dbService.getSettings();
      let whatsappTriggered = false;
      let waUrl = '';

      if (settings.enableWhatsApp && settings.adminPhone && !isAdmin) {
          const text = `Hallo Admin! 👋\n\nNeuer Wunsch in AgriTrack:\n"${ticket.description}"`;
          waUrl = `https://wa.me/${settings.adminPhone.replace('+', '')}?text=${encodeURIComponent(text)}`;

          // Try to open automatically (works best on mobile, might be blocked on PC)
          window.open(waUrl, '_blank');
          whatsappTriggered = true;
      }

      setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'model',
          text: whatsappTriggered
            ? '✅ Ich öffne WhatsApp für dich!\n\nFalls sich kein Fenster geöffnet hat (passiert oft am PC), klicke bitte auf den Button unten:'
            : '✅ Ich habe das als Wunsch auf die Liste gesetzt! Danke für deinen Input.',
          timestamp: Date.now(),
          actionLink: whatsappTriggered ? waUrl : undefined,
          actionLabel: whatsappTriggered ? 'WhatsApp Web öffnen' : undefined
      }]);
  };

  const handleVote = async (ticket: FeedbackTicket) => {
      const updated = { ...ticket, votes: ticket.votes + 1 };
      await dbService.saveFeedback(updated);
      loadTickets();
  };

  const handleStatusChange = async (ticket: FeedbackTicket, newStatus: 'OPEN' | 'IN_PROGRESS' | 'DONE') => {
      const updated = { ...ticket, status: newStatus };
      await dbService.saveFeedback(updated);
      loadTickets();
  };

  const renderMessageText = (text: string) => {
    const parts = text.split(/(

)/g);
    return parts.map((part, index) => {
      if (part.startsWith('')) {
        
    const content = part.slice(3, -3).replace(/^typescript||tsx|json\n/, '');
        return (
          <div key={index} className="my-3 relative group">
            <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={() => navigator.clipboard.writeText(content)}
                    className="p-1 bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                    title="Code kopieren"
                >
                    <Copy className="w-4 h-4" />
                </button>
            </div>
            <pre className="bg-black/50 p-4 rounded-lg overflow-x-auto border border-gray-700 font-mono text-sm text-green-400">
              <code>{content}</code>
            </pre>
          </div>
        );
      }
      return <span key={index} className="whitespace-pre-wrap">{part}</span>;
    });
  };

  return (
    <div className="flex flex-col h-[600px] bg-slate-900 rounded-xl overflow-hidden border border-slate-700 shadow-2xl relative">

      {notificationToast && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-full shadow-lg z-50 animate-in fade-in slide-in-from-top-4 flex items-center text-sm">
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {notificationToast}
          </div>
      )}

      {/* Header */}
      <div className="bg-slate-800 p-4 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className={`p-2 rounded-lg ${isAdmin ? 'bg-red-900' : 'bg-agri-900'}`}>
            {isAdmin ? <Lock className="text-red-500 w-5 h-5"/> : <Cpu className="text-agri-500 w-5 h-5" />}
          </div>
          <div>
            <h3 className="text-white font-bold">{isAdmin ? 'Admin Konsole' : 'AgriBot Support'}</h3>
            <p className="text-xs text-agri-500 flex items-center">
              <span className={`w-1.5 h-1.5 rounded-full mr-1 animate-pulse ${isAdmin ? 'bg-red-500' : 'bg-agri-500'}`}></span>
              {isAdmin ? 'Systemsteuerung aktiv' : 'Support Online'}
            </p>
          </div>
        </div>

        {/* Tabs - Only show advanced tabs for Admin */}
        <div className="flex bg-slate-900 rounded-lg p-1">
            <button
                onClick={() => setActiveTab('CHAT')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'CHAT' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
                Chat
            </button>
            {isAdmin && (
                <>
                    <button
                        onClick={() => setActiveTab('WISHES')}
                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center ${activeTab === 'WISHES' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                    >
                        Tickets
                        {tickets.length > 0 && <span className="ml-2 bg-agri-600 text-white text-[10px] px-1.5 rounded-full">{tickets.length}</span>}
                    </button>
                    <button
                        onClick={() => setActiveTab('ADMIN_SETTINGS')}
                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center ${activeTab === 'ADMIN_SETTINGS' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                    >
                        Config
                    </button>
                </>
            )}
        </div>
      </div>

      {/* --- CHAT VIEW --- */}
      {activeTab === 'CHAT' && (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-sm scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                {messages.map((msg) => (
                <div
                    key={msg.id}
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                    <div
                        className={`max-w-[90%] rounded-lg p-4 relative group ${
                            msg.role === 'user'
                            ? isAdmin ? 'bg-red-900/50 text-white border border-red-700' : 'bg-agri-700 text-white'
                            : 'bg-slate-800 text-gray-300 border border-slate-700'
                        }`}
                    >
                        <div>{renderMessageText(msg.text)}</div>

                        {/* Action: Create Ticket from User Message (Available to both but behaves differently) */}
                        {msg.role === 'user' && (
                            <div className="absolute -left-10 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={createTicketFromChat}
                                    className="p-2 bg-slate-700 rounded-full hover:bg-green-600 text-white shadow-lg"
                                    title="Wunsch senden (WhatsApp)"
                                >
                                    <MessageSquarePlus size={16} />
                                </button>
                            </div>
                        )}

                        {msg.role === 'model' && (
                            <div className="mt-2 pt-2 border-t border-white/5 flex items-center text-xs text-gray-500">
                            <Terminal className="w-3 h-3 mr-1" />
                            AgriBot {isAdmin ? 'Core' : 'Support'}
                            </div>
                        )}
                    </div>

                    {/* ACTION BUTTON (e.g. WhatsApp Link) */}
                    {msg.actionLink && (
                        <a
                            href={msg.actionLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 flex items-center bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg transition-colors"
                        >
                            <ExternalLink size={16} className="mr-2"/>
                            {msg.actionLabel || 'Link öffnen'}
                        </a>
                    )}
                </div>
                ))}
                {isThinking && (
                <div className="flex justify-start">
                    <div className="bg-slate-800 text-agri-500 p-3 rounded-lg flex items-center space-x-2 border border-slate-700">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-xs">Analysiere Anfrage...</span>
                    </div>
                </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-4 bg-slate-800 border-t border-slate-700">
                <div className="relative">
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); } }} // Enter to prevent new line, not send
                    placeholder={isAdmin ? "Befehl eingeben (z.B. 'Generiere neuen Code für...')" : "Schreibe deinen Wunsch oder Fehler hier..."}
                    className="w-full bg-slate-900 text-white rounded-lg pl-4 pr-12 py-3 focus:outline-none focus:ring-2 focus:ring-agri-500 border border-slate-700 resize-none h-20"
                />
                <button
                    onClick={handleSend}
                    disabled={isThinking || !input.trim()}
                    className="absolute right-2 top-2 p-2 bg-agri-600 hover:bg-agri-500 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    <Send className="w-5 h-5" />
                </button>
                </div>
                <div className="flex justify-between items-center mt-2">
                    <p className="text-xs text-gray-500">
                        {isAdmin ? 'Admin Mode: Code-Generierung aktiviert.' : 'Tipp: Beschreibe Probleme so genau wie möglich.'}
                    </p>
                    {input.length > 10 && !isAdmin && (
                        <button
                            onClick={createTicketFromChat}
                            className="text-xs bg-green-900/50 text-green-400 border border-green-800 px-3 py-1 rounded hover:bg-green-900 flex items-center"
                        >
                            <MessageSquarePlus size={12} className="mr-1"/>
                            Direkt per WhatsApp senden
                        </button>
                    )}
                </div>
            </div>
          </>
      )}

      {/* --- WISHES / TICKETS VIEW (ADMIN ONLY) --- */}
      {activeTab === 'WISHES' && isAdmin && (
          <div className="flex-1 overflow-y-auto bg-slate-900 p-4">
              <div className="flex justify-between items-center mb-6">
                  <h2 className="text-white font-bold text-lg">Ticket Inbox</h2>
                  <span className="text-xs text-gray-500">Verwaltung der User-Wünsche</span>
              </div>

              {tickets.length === 0 ? (
                  <div className="text-center py-12 text-gray-600 border border-dashed border-slate-700 rounded-xl">
                      <p>Keine offenen Tickets.</p>
                  </div>
              ) : (
                  <div className="space-y-4">
                      {tickets.map(ticket => (
                          <div key={ticket.id} className="bg-slate-800 border border-slate-700 p-4 rounded-xl hover:border-slate-600 transition-all">
                              <div className="flex justify-between items-start mb-2">
                                  <h3 className="text-white font-bold">{ticket.title}</h3>
                                  <select
                                    value={ticket.status}
                                    onChange={(e) => handleStatusChange(ticket, e.target.value as any)}
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border-none focus:ring-0 cursor-pointer ${
                                      ticket.status === 'DONE' ? 'bg-green-900 text-green-400' :
                                      ticket.status === 'IN_PROGRESS' ? 'bg-blue-900 text-blue-400' :
                                      'bg-slate-700 text-slate-400'
                                  }`}
                                  >
                                      <option value="OPEN">Offen</option>
                                      <option value="IN_PROGRESS">In Arbeit</option>
                                      <option value="DONE">Fertig</option>
                                  </select>
                              </div>
                              <p className="text-gray-400 text-sm mb-4">
                                  {ticket.description}
                              </p>
                              <div className="flex justify-between items-center border-t border-slate-700 pt-3">
                                  <div className="text-xs text-gray-500">
                                      {new Date(ticket.date).toLocaleDateString()} • {ticket.author}
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <button
                                        onClick={() => handleVote(ticket)}
                                        className="flex items-center space-x-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-full transition-colors"
                                    >
                                        <ThumbsUp size={12} />
                                        <span>{ticket.votes}</span>
                                    </button>
                                  </div>
                              </div>
                          </div>
                      ))}
                  </div>
              )}
          </div>
      )}

      {/* --- ADMIN SETTINGS VIEW --- */}
      {activeTab === 'ADMIN_SETTINGS' && isAdmin && appSettings && (
          <div className="flex-1 overflow-y-auto bg-slate-900 p-6">
              <h2 className="text-white font-bold text-lg mb-6 flex items-center">
                  <Lock className="mr-2 text-red-500" size={20}/>
                  Geschützte Einstellungen
              </h2>

              <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-6">

                  {/* WhatsApp Settings */}
                  <div className="space-y-3">
                      <div className="flex items-start space-x-3">
                          <div className="p-2 bg-green-900 rounded-lg">
                              <Phone className="text-green-400" size={20}/>
                          </div>
                          <div className="flex-1">
                              <label className="block text-sm font-bold text-gray-300 mb-1">Admin Handynummer (WhatsApp)</label>
                              <input
                                  type="text"
                                  value={appSettings.adminPhone || ''}
                                  onChange={(e) => setAppSettings({...appSettings, adminPhone: e.target.value})}
                                  className="w-full bg-slate-900 border border-slate-600 rounded-lg p-2 text-white focus:border-green-500 outline-none"
                                  placeholder="43664xxxxxxx"
                              />
                              <p className="text-xs text-gray-500 mt-1">
                                  Format: Ländervorwahl ohne Plus (z.B. 43 für Österreich)
                              </p>
                          </div>
                      </div>

                      <div className="flex items-center space-x-3 pt-2 pl-12">
                          <input
                              type="checkbox"
                              id="waNotify"
                              checked={appSettings.enableWhatsApp || false}
                              onChange={(e) => setAppSettings({...appSettings, enableWhatsApp: e.target.checked})}
                              className="w-4 h-4 rounded border-gray-600 bg-slate-900 text-green-600 focus:ring-green-500"
                          />
                          <label htmlFor="waNotify" className="text-sm text-gray-300 select-none cursor-pointer">
                              WhatsApp "Click-to-Chat" aktivieren
                          </label>
                      </div>
                  </div>

              </div>

              <button
                  onClick={handleSaveAdminSettings}
                  className="mt-6 w-full bg-red-700 hover:bg-red-600 text-white font-bold py-3 rounded-xl transition-colors shadow-lg"
              >
                  Konfiguration Speichern
              </button>
          </div>
      )}
    </div>
  );
};






