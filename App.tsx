
import React, { useState, useEffect } from 'react';
import { Hero } from './components/Hero';
import { FeedbackBoard } from './components/FeedbackBoard';
import { VersionHistory } from './components/VersionHistory';
import { AgriTrackApp } from './components/AgriTrackApp';
import { AppShowcase } from './components/AppShowcase';
import { AuthPage } from './pages/AuthPage';
import { Tab } from './types';
import { LayoutDashboard, MessageSquarePlus, History, Sprout, Check, Shield, Zap, Smartphone, Lock, User, X, ArrowRight, LogOut, CloudOff, Database, Mail, UserPlus } from 'lucide-react';
import { authService } from './services/auth';
import { dbService } from './services/db';
import { syncData } from './services/sync';
import { AdminFarmManager } from './components/AdminFarmManager';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.HOME);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [adminView, setAdminView] = useState<'TICKETS' | 'FARMS'>('TICKETS');

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
              if (user.emailVerified) syncData().catch(e => console.log("Sync delay", e));
          } else {
              setIsAuthenticated(false);
              setIsEmailVerified(false);
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

  // Ein Nutzer gilt als "bereit", wenn er Gast ist ODER eingeloggt UND verifiziert
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
                    <div className="hidden md:flex space-x-8 items-center mr-8">
                    <button onClick={() => setActiveTab(Tab.HOME)} className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${activeTab === Tab.HOME ? 'border-agri-500 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}><LayoutDashboard className="w-4 h-4 mr-2" /> Übersicht</button>
                    <button onClick={() => setActiveTab(Tab.APP)} className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${activeTab === Tab.APP ? 'border-agri-500 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}><Smartphone className="w-4 h-4 mr-2" /> Web App</button>
                    <button onClick={() => setActiveTab(Tab.FEEDBACK)} className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${activeTab === Tab.FEEDBACK ? 'border-agri-500 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}><MessageSquarePlus className="w-4 h-4 mr-2" /> Kummerkasten</button>
                    </div>
                    <div className="border-l border-gray-200 pl-4 flex items-center space-x-2">
                        {isAuthenticated || isGuest ? (
                            <button onClick={handleUserLogout} className="flex items-center text-sm font-medium px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg hover:text-red-600 transition-colors">
                                <User size={16} className="mr-2"/>
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
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12"><FeedbackBoard isAdmin={false} /></div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;

