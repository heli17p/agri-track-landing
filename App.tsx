
import React, { useState, useEffect } from 'react';
import { Hero } from './components/Hero';
import { FeedbackBoard } from './components/FeedbackBoard';
import { VersionHistory } from './components/VersionHistory';
import { AgriTrackApp } from './components/AgriTrackApp';
import { AppShowcase } from './components/AppShowcase';
import { AuthPage } from './pages/AuthPage';
import { Tab, FeedbackTicket } from './types';
import { LayoutDashboard, MessageSquarePlus, History, Sprout, Check, Shield, Zap, Smartphone, Lock, User, X, ArrowRight, LogOut, CloudOff, Database, Mail, UserPlus, ThumbsUp, MessageCircle, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { authService } from './services/auth';
import { dbService } from './services/db';
import { syncData } from './services/sync';
import { AdminFarmManager } from './components/AdminFarmManager';

// Liste der berechtigten Admin-E-Mails (immer klein schreiben hier)
const ADMIN_EMAILS = [
  'admin@agritrack.at', 
  'office@agritrack.at',
  'helmut.preiser@gmx.at'
];

// Kleine Vorschau-Komponente für die Landingpage
const CommunityTeaser: React.FC<{ onNavigate: () => void }> = ({ onNavigate }) => {
  const [topTickets, setTopTickets] = useState<FeedbackTicket[]>([]);

  useEffect(() => {
    const load = async () => {
      const tickets = await dbService.getFeedback();
      setTopTickets(tickets.sort((a, b) => b.votes - a.votes).slice(0, 3));
    };
    load();
  }, []);

  return (
    <section className="bg-slate-50 py-24 border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="lg:flex lg:items-center lg:justify-between mb-12">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
              Community-gesteuerte Entwicklung
            </h2>
            <p className="mt-4 text-lg text-gray-500">
              Du entscheidest, was als nächstes kommt. Stimme für neue Funktionen ab oder melde Fehler direkt im Kummerkasten.
            </p>
          </div>
          <div className="mt-8 lg:mt-0">
            <button 
              onClick={onNavigate}
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-bold rounded-xl text-white bg-agri-600 hover:bg-agri-700 shadow-lg shadow-agri-900/20 transition-all"
            >
              Zum Kummerkasten
              <ArrowUpRight className="ml-2 w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {topTickets.length > 0 ? topTickets.map(ticket => (
            <div key={ticket.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col h-full">
              <div className="flex justify-between items-start mb-4">
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${ticket.status === 'DONE' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                  {ticket.status === 'DONE' ? 'Erledigt' : 'In Arbeit'}
                </span>
                <div className="flex items-center text-slate-400">
                  <ThumbsUp size={14} className="mr-1" />
                  <span className="text-xs font-bold">{ticket.votes}</span>
                </div>
              </div>
              <h4 className="font-bold text-slate-800 mb-2 line-clamp-1">{ticket.title}</h4>
              <p className="text-sm text-slate-500 line-clamp-2 mb-6 flex-1">{ticket.description}</p>
              <div className="flex items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest pt-4 border-t border-slate-50">
                <MessageCircle size={12} className="mr-1.5" />
                {ticket.comments?.length || 0} Kommentare
              </div>
            </div>
          )) : (
            <div className="col-span-3 text-center py-12 text-slate-400 italic">
              Lade Community-Wünsche...
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.HOME);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
      const guestPref = localStorage.getItem('agritrack_guest_mode');
      if (guestPref === 'true') setIsGuest(true);

      const unsubscribe = authService.onAuthStateChanged((user) => {
          if (user) {
              setIsAuthenticated(true);
              setIsEmailVerified(user.emailVerified);
              setIsGuest(false);
              localStorage.removeItem('agritrack_guest_mode');
              setCurrentUserEmail(user.email);
              
              // VERBESSERTE ADMIN PRÜFUNG: Case-Insensitive
              const email = user.email?.toLowerCase() || '';
              const adminList = ADMIN_EMAILS.map(e => e.toLowerCase());
              
              if (email && adminList.includes(email)) {
                  setIsAdmin(true);
                  console.log("Admin-Status erkannt für:", email);
              } else {
                  setIsAdmin(false);
              }

              if (user.emailVerified) syncData().catch(e => console.log("Sync delay", e));
          } else {
              setIsAuthenticated(false);
              setIsEmailVerified(false);
              setIsAdmin(false);
          }
          setIsLoadingAuth(false);
      });
      return () => unsubscribe();
  }, []);

  useEffect(() => {
      dbService.processStorageGrowth();
      const interval = setInterval(() => dbService.processStorageGrowth(), 60000);
      return () => clearInterval(interval);
  }, []);

  const handleUserLogout = async () => {
      await authService.logout();
      setIsGuest(false);
      setIsAuthenticated(false);
      setIsAdmin(false);
      setActiveTab(Tab.HOME);
  };

  if (isLoadingAuth) {
      return (
          <div className="min-h-screen bg-slate-50 flex items-center justify-center">
              <div className="animate-pulse flex flex-col items-center">
                  <div className="w-12 h-12 bg-agri-200 rounded-full mb-4"></div>
                  <div className="h-4 bg-slate-200 rounded w-32"></div>
              </div>
          </div>
      );
  }

  const isAppReady = isGuest || (isAuthenticated && isEmailVerified);

  return (
    <div className="w-full h-full flex flex-col bg-gray-50 font-sans overflow-hidden">
      {isGuest && !isFullScreen && (
          <div className="bg-slate-800 text-slate-300 text-xs py-1 px-4 text-center flex justify-center items-center relative z-[60] shrink-0">
              <CloudOff size={12} className="mr-2"/>
              <span>Gastmodus: Daten werden nur lokal gespeichert.</span>
              <button onClick={() => { setIsGuest(false); localStorage.removeItem('agritrack_guest_mode'); setActiveTab(Tab.APP); }} className="ml-4 underline hover:text-white font-bold">Jetzt anmelden</button>
          </div>
      )}

      {!isFullScreen && (
        <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shrink-0">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
                <div className="flex items-center cursor-pointer" onClick={() => setActiveTab(Tab.HOME)}>
                <Sprout className="h-8 w-8 text-agri-600" />
                <span className="ml-2 text-xl font-bold text-gray-900 tracking-tight">AgriTrack<span className="text-agri-600">.AT</span></span>
                </div>
                <div className="flex items-center">
                    <div className="hidden md:flex space-x-6 items-center mr-8">
                    <button onClick={() => setActiveTab(Tab.HOME)} className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${activeTab === Tab.HOME ? 'border-agri-500 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}><LayoutDashboard className="w-4 h-4 mr-2" /> Übersicht</button>
                    <button onClick={() => setActiveTab(Tab.APP)} className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${activeTab === Tab.APP ? 'border-agri-500 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}><Smartphone className="w-4 h-4 mr-2" /> Web App</button>
                    <button onClick={() => setActiveTab(Tab.FEEDBACK)} className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${activeTab === Tab.FEEDBACK ? 'border-agri-500 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}><MessageSquarePlus className="w-4 h-4 mr-2" /> Kummerkasten</button>
                    </div>

                    <div className="border-l border-gray-200 pl-4 flex items-center space-x-3">
                        {/* ADMIN BUTTON AUCH AUF MOBILE ZEIGEN WENN ADMIN */}
                        {isAdmin && (
                          <button 
                            onClick={() => setActiveTab(Tab.ADMIN)} 
                            className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === Tab.ADMIN ? 'bg-red-600 text-white shadow-lg' : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'}`}
                          >
                            <ShieldCheck className="w-3.5 h-3.5 mr-1" /> 
                            Admin
                          </button>
                        )}

                        {isAuthenticated || isGuest ? (
                            <button onClick={handleUserLogout} className={`flex items-center text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${isAdmin ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'} hover:bg-red-100`}>
                                {isAdmin ? <ShieldCheck size={16} className="mr-2"/> : <User size={16} className="mr-2"/>}
                                <span className="max-w-[100px] truncate hidden sm:block">{isAuthenticated ? (currentUserEmail || 'User') : 'Gast'}</span>
                                <LogOut size={14} className="ml-2"/>
                            </button>
                        ) : (
                            <button onClick={() => setActiveTab(Tab.APP)} className="text-sm font-bold text-agri-600 hover:text-agri-700 px-3 py-1">Anmelden</button>
                        )}
                    </div>
                </div>
            </div>
            </div>
        </nav>
      )}

      <main className="flex-1 relative overflow-hidden flex flex-col w-full h-full">
        {activeTab === Tab.HOME && !isFullScreen && (
          <div className="h-full overflow-y-auto">
            <Hero 
              onLaunchApp={() => setActiveTab(Tab.APP)} 
              onNavigateToFeedback={() => setActiveTab(Tab.FEEDBACK)}
            />
            <AppShowcase />
            <CommunityTeaser onNavigate={() => setActiveTab(Tab.FEEDBACK)} />
            <footer className="bg-white border-t border-gray-200 mt-auto shrink-0 py-8 text-center text-gray-500 text-sm">
                &copy; {new Date().getFullYear()} AgriTrack Austria. Open Source & Forever Live.
            </footer>
          </div>
        )}

        {activeTab === Tab.APP && (
          <div className="absolute inset-0 bg-gray-100 flex flex-col">
            {isAppReady ? (
               <AgriTrackApp onFullScreenToggle={setIsFullScreen} />
            ) : (
               <AuthPage onLoginSuccess={() => setIsEmailVerified(true)} onGuestAccess={() => setIsGuest(true)} />
            )}
          </div>
        )}

        {activeTab === Tab.FEEDBACK && !isFullScreen && (
          <div className="h-full overflow-y-auto bg-slate-50">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
              <FeedbackBoard isAdmin={isAdmin} />
            </div>
          </div>
        )}

        {activeTab === Tab.ADMIN && isAdmin && !isFullScreen && (
          <div className="h-full overflow-y-auto bg-slate-900">
            <AdminFarmManager />
          </div>
        )}
      </main>
    </div>
  );
};

export default App;

