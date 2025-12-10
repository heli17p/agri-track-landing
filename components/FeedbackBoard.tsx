
import React, { useState, useEffect } from 'react';
import { MessageSquarePlus, ThumbsUp, CheckCircle2, Circle, Clock, MessageCircle, Send, User, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { FeedbackTicket, FeedbackComment } from '../types';
import { dbService, generateId } from '../services/db';

interface Props {
    isAdmin?: boolean;
}

export const FeedbackBoard: React.FC<Props> = ({ isAdmin = false }) => {
  const [tickets, setTickets] = useState<FeedbackTicket[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
  
  // New Ticket State
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [authorName, setAuthorName] = useState('');

  // New Comment State
  const [commentText, setCommentText] = useState('');

  useEffect(() => {
    loadTickets();
  }, []);

  const loadTickets = async () => {
      const t = await dbService.getFeedback();
      // Sort by date desc
      setTickets(t.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  };

  const handleVote = async (ticket: FeedbackTicket, e: React.MouseEvent) => {
      e.stopPropagation();
      const updated = { ...ticket, votes: ticket.votes + 1 };
      await dbService.saveFeedback(updated);
      loadTickets();
  };

  const handleStatusChange = async (ticket: FeedbackTicket, newStatus: 'OPEN' | 'IN_PROGRESS' | 'DONE') => {
      const updated = { ...ticket, status: newStatus };
      await dbService.saveFeedback(updated);
      loadTickets();
  };

  const handleDeleteTicket = async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if(window.confirm('Möchtest du dieses Ticket wirklich unwiderruflich löschen?')) {
          await dbService.deleteFeedback(id);
          loadTickets();
      }
  };

  const handleSubmitTicket = async () => {
      if (!newTitle.trim() || !newDesc.trim()) return;

      const ticket: FeedbackTicket = {
          id: generateId(),
          title: newTitle,
          description: newDesc,
          author: authorName || 'Anonym',
          date: new Date().toISOString(),
          status: 'OPEN',
          votes: 1,
          comments: []
      };

      await dbService.saveFeedback(ticket);
      
      // WhatsApp Notification Logic
      const settings = await dbService.getSettings();
      if (settings.enableWhatsApp && settings.adminPhone && !isAdmin) {
          const text = `*Neuer Wunsch für AgriTrack* 🚜\n\n*Von:* ${ticket.author}\n*Titel:* ${ticket.title}\n*Beschreibung:* ${ticket.description}`;
          const waUrl = `https://wa.me/${settings.adminPhone.replace('+', '')}?text=${encodeURIComponent(text)}`;
          window.open(waUrl, '_blank');
      }

      setNewTitle('');
      setNewDesc('');
      setIsAdding(false);
      loadTickets();
  };

  const handleSubmitComment = async (ticketId: string) => {
      if (!commentText.trim()) return;
      
      const ticket = tickets.find(t => t.id === ticketId);
      if (!ticket) return;

      const newComment: FeedbackComment = {
          id: generateId(),
          text: commentText,
          author: isAdmin ? 'Admin' : (authorName || 'Gast'),
          date: new Date().toISOString()
      };

      const updatedTicket = {
          ...ticket,
          comments: [...(ticket.comments || []), newComment]
      };

      await dbService.saveFeedback(updatedTicket);
      setCommentText('');
      loadTickets();
  };

  const getStatusBadge = (status: string) => {
      switch(status) {
          case 'DONE': return <span className="flex items-center text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded"><CheckCircle2 size={12} className="mr-1"/> Erledigt</span>;
          case 'IN_PROGRESS': return <span className="flex items-center text-xs font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded"><Clock size={12} className="mr-1"/> In Arbeit</span>;
          default: return <span className="flex items-center text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded"><Circle size={12} className="mr-1"/> Offen</span>;
      }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="mb-4 md:mb-0">
                <h2 className="text-2xl font-bold text-slate-800">Wunschliste & Feedback</h2>
                <p className="text-slate-500 text-sm mt-1">
                    Gestalte AgriTrack mit! Hier sammeln wir Ideen für neue Funktionen.
                </p>
            </div>
            <button 
                onClick={() => setIsAdding(!isAdding)}
                className="bg-agri-600 hover:bg-agri-700 text-white px-6 py-3 rounded-xl font-bold flex items-center shadow-lg transition-all"
            >
                <MessageSquarePlus className="mr-2" size={20}/>
                Wunsch äußern
            </button>
        </div>

        {/* Add New Form */}
        {isAdding && (
            <div className="bg-white p-6 rounded-2xl shadow-md border-2 border-agri-100 animate-in slide-in-from-top-4">
                <h3 className="font-bold text-lg text-slate-800 mb-4">Neuen Wunsch einreichen</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Kurzer Titel</label>
                        <input 
                            type="text" 
                            className="w-full border border-slate-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-agri-500"
                            placeholder="z.B. Mineraldünger Erfassung"
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Beschreibung</label>
                        <textarea 
                            className="w-full border border-slate-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-agri-500 h-24 resize-none"
                            placeholder="Beschreibe genau, was du brauchst..."
                            value={newDesc}
                            onChange={(e) => setNewDesc(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Dein Name (Optional)</label>
                        <input 
                            type="text" 
                            className="w-full border border-slate-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-agri-500"
                            placeholder="Betrieb ..."
                            value={authorName}
                            onChange={(e) => setAuthorName(e.target.value)}
                        />
                    </div>
                    <div className="flex justify-end space-x-3 pt-2">
                        <button 
                            onClick={() => setIsAdding(false)}
                            className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-lg"
                        >
                            Abbrechen
                        </button>
                        <button 
                            onClick={handleSubmitTicket}
                            className="px-6 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 shadow-md"
                        >
                            Absenden
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* List of Tickets */}
        <div className="space-y-4">
            {tickets.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <p className="text-slate-400 font-medium">Noch keine Wünsche vorhanden. Sei der Erste!</p>
                </div>
            ) : (
                tickets.map(ticket => (
                    <div key={ticket.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all hover:shadow-md">
                        {/* Ticket Card Header (Clickable for expand) */}
                        <div 
                            className="p-5 cursor-pointer"
                            onClick={() => setExpandedTicketId(expandedTicketId === ticket.id ? null : ticket.id)}
                        >
                            <div className="flex justify-between items-start">
                                <div className="flex-1 pr-4">
                                    <div className="flex items-center space-x-3 mb-2">
                                        {getStatusBadge(ticket.status)}
                                        <span className="text-xs text-slate-400">
                                            {new Date(ticket.date).toLocaleDateString()} • {ticket.author}
                                        </span>
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-800 mb-1">{ticket.title}</h3>
                                    <p className="text-slate-600 text-sm line-clamp-2">{ticket.description}</p>
                                </div>
                                
                                <div className="flex flex-col items-center space-y-2">
                                    <button 
                                        onClick={(e) => handleVote(ticket, e)}
                                        className="flex flex-col items-center justify-center bg-slate-50 hover:bg-green-50 border border-slate-200 hover:border-green-200 w-12 h-12 rounded-xl transition-all group"
                                    >
                                        <ThumbsUp size={18} className="text-slate-400 group-hover:text-green-600 mb-0.5" />
                                        <span className="text-xs font-bold text-slate-600 group-hover:text-green-700">{ticket.votes}</span>
                                    </button>

                                    {isAdmin && (
                                        <button 
                                            onClick={(e) => handleDeleteTicket(ticket.id, e)}
                                            className="flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-slate-200 hover:bg-red-50 hover:border-red-200 hover:text-red-500 text-slate-300 transition-colors"
                                            title="Ticket löschen"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                            
                            <div className="mt-4 flex items-center justify-center text-slate-300">
                                {expandedTicketId === ticket.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                            </div>
                        </div>

                        {/* Expanded Content (Details & Comments) */}
                        {expandedTicketId === ticket.id && (
                            <div className="bg-slate-50 border-t border-slate-100 p-5">
                                <p className="text-slate-700 text-sm mb-6 whitespace-pre-wrap">
                                    {ticket.description}
                                </p>

                                {/* Admin Status Control */}
                                {isAdmin && (
                                    <div className="mb-6 bg-red-50 border border-red-100 p-3 rounded-lg flex items-center space-x-3">
                                        <span className="text-xs font-bold text-red-800 uppercase">Admin Status:</span>
                                        <div className="flex space-x-2">
                                            {(['OPEN', 'IN_PROGRESS', 'DONE'] as const).map(s => (
                                                <button
                                                    key={s}
                                                    onClick={() => handleStatusChange(ticket, s)}
                                                    className={`px-3 py-1 rounded text-xs font-bold ${ticket.status === s ? 'bg-red-600 text-white' : 'bg-white text-slate-600 border'}`}
                                                >
                                                    {s === 'DONE' ? 'Erledigt' : s === 'IN_PROGRESS' ? 'In Arbeit' : 'Offen'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Comments Section */}
                                <div className="space-y-4">
                                    <h4 className="font-bold text-slate-700 text-sm flex items-center">
                                        <MessageCircle size={16} className="mr-2"/> Kommentare ({ticket.comments?.length || 0})
                                    </h4>
                                    
                                    <div className="space-y-3 pl-4 border-l-2 border-slate-200">
                                        {ticket.comments && ticket.comments.map(comment => (
                                            <div key={comment.id} className="bg-white p-3 rounded-lg shadow-sm border border-slate-100">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-xs font-bold text-slate-700 flex items-center">
                                                        <User size={12} className="mr-1"/> {comment.author}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400">
                                                        {new Date(comment.date).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-slate-600">{comment.text}</p>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Add Comment */}
                                    <div className="flex items-center space-x-2 pt-2">
                                        <input 
                                            type="text"
                                            value={commentText}
                                            onChange={(e) => setCommentText(e.target.value)}
                                            placeholder="Kommentar schreiben..."
                                            className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-agri-500"
                                            onKeyDown={(e) => e.key === 'Enter' && handleSubmitComment(ticket.id)}
                                        />
                                        <button 
                                            onClick={() => handleSubmitComment(ticket.id)}
                                            className="bg-slate-800 text-white p-2 rounded-lg hover:bg-slate-700"
                                        >
                                            <Send size={18}/>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ))
            )}
        </div>
    </div>
  );
};

