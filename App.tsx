
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

const AdminLoginModal = ({ onLogin, onClose }: { onLogin: () => void, onClose: () => void }) => {
    const [pass, setPass] = useState('');
    const [email, setEmail] = useState('');
    const [cloudPass, setCloudPass] = useState('');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [isCloudAdmin, setIsCloudAdmin] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg(null);
        setLoading(true);

        // Option 1: Real Cloud Auth
        if (isCloudAdmin) {
            if (!email || !cloudPass) {
                setErrorMsg("Bitte E-Mail und Passwort eingeben.");
                setLoading(false);
                return;
            }

            try {
                // Timeout Promise (10 seconds)
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error("Zeitüberschreitung (Server antwortet nicht).")), 10000)
                );

                const authPromise = isRegistering 
                    ? authService.register(email, cloudPass) 
                    : authService.login(email, cloudPass);

                // Race: Login vs Timeout
                await Promise.race([authPromise, timeoutPromise]);
                
                onLogin(); // Success
            } catch (e: any) {
                setErrorMsg(e.message || "Authentifizierung fehlgeschlagen.");
            } finally {
                // Only set loading false if component is still mounted (implied by execution flow)
                setLoading(false);
            }
            return;
        }

        // Option 2: Local Admin (Viewer Mode)
        if (pass === 'admin' || pass === '1234') {
            onLogin();
        } else {
            setErrorMsg("Falsches lokales Passwort.");
        }
        setLoading(false);
    };

    return (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
                    <X size={20}/>
                </button>
                <div className="flex flex-col items-center mb-6">
                    <div className="p-3 bg-red-100 rounded-full text-red-600 mb-3">
                        <Lock size={24}/>
                    </div>
                    <h3 className="text-xl font-bold text-slate-800">Admin Login</h3>
                    <p className="text-sm text-slate-500">Systembetreuung</p>
                </div>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Toggle Mode */}
                    <div className="flex items-center justify-center mb-4">
                        <label className="flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={isCloudAdmin} 
                                onChange={(e) => { setIsCloudAdmin(e.target.checked); setIsRegistering(false); setErrorMsg(null); }}
                                className="sr-only peer"
                            />
                            <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                            <span className="ms-3 text-sm font-medium text-gray-700">Cloud-Login (für DB Zugriff)</span>
                        </label>
                    </div>

                    {isCloudAdmin ? (
                        <>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                                <input 
                                    type="email" 
                                    autoFocus
                                    placeholder="Admin E-Mail"
                                    className="w-full border border-slate-300 pl-10 p-3 rounded-lg outline-none focus:ring-2 focus:ring-red-500"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                />
                            </div>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                                <input 
                                    type="password" 
                                    placeholder="Passwort"
                                    className="w-full border border-slate-300 pl-10 p-3 rounded-lg outline-none focus:ring-2 focus:ring-red-500"
                                    value={cloudPass}
                                    onChange={e => setCloudPass(e.target.value)}
                                />
                            </div>
                            
                            <div className="flex justify-center text-xs">
                                <button 
                                    type="button"
                                    onClick={() => { setIsRegistering(!isRegistering); setErrorMsg(null); }}
                                    className={`font-bold hover:underline ${isRegistering ? 'text-blue-600' : 'text-slate-500'}`}
                                >
                                    {isRegistering ? 'Zurück zum Login' : 'Noch kein Konto? Hier Registrieren'}
                                </button>
                            </div>
                        </>
                    ) : (
                        <div>
                            <input 
                                type="password" 
                                autoFocus
                                placeholder="Lokales Passwort eingeben"
                                className="w-full border border-slate-300 p-3 rounded-lg outline-none focus:ring-2 focus:ring-red-500"
                                value={pass}
                                onChange={e => { setPass(e.target.value); setErrorMsg(null); }}
                            />
                        </div>
                    )}

                    {errorMsg && (
                        <div className="bg-red-50 text-red-600 p-2 rounded text-xs font-bold border border-red-100">
                            {errorMsg}
                        </div>
                    )}
                    
                    <button disabled={loading} className={`w-full text-white py-3 rounded-lg font-bold flex items-center justify-center disabled:opacity-50 ${isRegistering ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-900 hover:bg-slate-800'}`}>
                        {loading ? 'Lade...' : (isRegistering ? 'Konto erstellen' : 'Anmelden')} <ArrowRight size={16} className="ml-2"/>
                    </button>
                </form>
            </div>
        </div>
    );
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.HOME);
  
  // Auth State
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  
  // User Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  // UI State for Tracking Mode
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Admin View State
  const [adminView, setAdminView] = useState<'TICKETS' | 'FARMS'>('TICKETS');

  useEffect(() => {
      // 1. Check Guest Mode Preference
      const guestPref = localStorage.getItem('agritrack_guest_mode');
      if (guestPref === 'true') {
          setIsGuest(true);
      }

      // 2. Listen to Firebase Auth
      const unsubscribe = authService.onAuthStateChanged((user) => {
          if (user) {
              setIsAuthenticated(true);
              setIsGuest(false); // Logged in overrides guest
              localStorage.removeItem('agritrack_guest_mode'); // Clear guest flag
              setCurrentUserEmail(user.email);
              
              // Trigger sync on startup if logged in (Critical for mobile)
              syncData().catch(err => console.error("Auto-sync failed on app start:", err));
          } else {
              setIsAuthenticated(false);
          }
          setIsLoadingAuth(false);
      });

      return () => unsubscribe();
  }, []);

  // --- AUTOMATIC STORAGE GROWTH ---
  useEffect(() => {
      // 1. Initial check (calculates growth since last open)
      dbService.processStorageGrowth();

      // 2. Periodic check (every minute)
      const interval = setInterval(() => {
          dbService.processStorageGrowth();
      }, 60000); // 60s

      return () => clearInterval(interval);
  }, []);

  // Helper to allow Hero to switch tab
  const launchApp = () => setActiveTab(Tab.APP);

  const handleAdminLogin = () => {
      setIsAdmin(true);
      setShowLoginModal(false);
      setActiveTab(Tab.ADMIN);
  };

  const handleAdminLogout = () => {
      setIsAdmin(false);
      setActiveTab(Tab.HOME);
  };

  const handleUserLogout = async () => {
      const wasGuest = isGuest;
      await authService.logout();
      setIsGuest(false);
      setIsAuthenticated(false);
      localStorage.removeItem('agritrack_guest_mode');
      
      // UX Improvement: Redirect logic
      if (wasGuest) {
          setActiveTab(Tab.APP); // Back to login screen
      } else {
          setActiveTab(Tab.HOME);
      }
  };

  const handleGuestAccess = () => {
      setIsGuest(true);
      localStorage.setItem('agritrack_guest_mode', 'true');
  };

  // --- RENDERING ---

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

  return (
    <div className="w-full h-full flex flex-col bg-gray-50 font-sans overflow-hidden">
      
      {showLoginModal && <AdminLoginModal onLogin={handleAdminLogin} onClose={() => setShowLoginModal(false)} />}

      {/* Guest Banner - Hide when in full screen tracking */}
      {isGuest && !isFullScreen && (
          <div className="bg-slate-800 text-slate-300 text-xs py-1 px-4 text-center flex justify-center items-center relative z-[60] shrink-0">
              <CloudOff size={12} className="mr-2"/>
              <span>Gastmodus: Daten werden nur lokal gespeichert.</span>
              <button 
                onClick={() => { 
                    setIsGuest(false); 
                    localStorage.removeItem('agritrack_guest_mode'); 
                    setActiveTab(Tab.APP); 
                }} 
                className="ml-4 underline hover:text-white font-bold"
              >
                  Jetzt anmelden
              </button>
          </div>
      )}

      {/* Navigation - Hide when in full screen tracking */}
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
                    <button
                        onClick={() => setActiveTab(Tab.HOME)}
                        className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                        activeTab === Tab.HOME
                            ? 'border-agri-500 text-gray-900'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        <LayoutDashboard className="w-4 h-4 mr-2" />
                        Übersicht
                    </button>
                    <button
                        onClick={() => setActiveTab(Tab.APP)}
                        className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                        activeTab === Tab.APP
                            ? 'border-agri-500 text-gray-900'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        <Smartphone className="w-4 h-4 mr-2" />
                        Web App
                    </button>
                    
                    {isAdmin && (
                        <button
                            onClick={() => setActiveTab(Tab.ADMIN)}
                            className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                            activeTab === Tab.ADMIN
                                ? 'border-red-500 text-red-700'
                                : 'border-transparent text-gray-500 hover:text-red-600 hover:border-red-200'
                            }`}
                        >
                            <Lock className="w-4 h-4 mr-2" />
                            Admin Konsole
                        </button>
                    )}

                    <button
                        onClick={() => setActiveTab(Tab.CHANGELOG)}
                        className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                        activeTab === Tab.CHANGELOG
                            ? 'border-agri-500 text-gray-900'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        <History className="w-4 h-4 mr-2" />
                        Versionen
                    </button>
                    </div>

                    {/* Login/Logout Button Group */}
                    <div className="border-l border-gray-200 pl-4 flex items-center space-x-2">
                        {isAdmin ? (
                            <button 
                                onClick={handleAdminLogout}
                                className="text-xs font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded-full hover:bg-red-100 transition-colors"
                                title="Admin Logout"
                            >
                                <Lock size={14}/>
                            </button>
                        ) : (
                            <button 
                                onClick={() => setShowLoginModal(true)}
                                className="text-gray-300 hover:text-gray-500 p-2 rounded-full hover:bg-gray-100 transition-colors"
                                title="Admin Login"
                            >
                                <Lock size={16} />
                            </button>
                        )}

                        {isAuthenticated || isGuest ? (
                            <div className="relative group">
                                <button 
                                    onClick={handleUserLogout}
                                    className={`flex items-center text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
                                        isGuest 
                                        ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' 
                                        : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                                    }`}
                                    title={isGuest ? "Jetzt anmelden" : "Abmelden"}
                                >
                                    <User size={16} className="mr-2"/>
                                    <span className="max-w-[100px] truncate hidden sm:block">{isAuthenticated ? (currentUserEmail || 'User') : 'Gast'}</span>
                                    {isGuest ? (
                                        <ArrowRight size={14} className="ml-2"/>
                                    ) : (
                                        <LogOut size={14} className="ml-2 text-slate-400 group-hover:text-red-500"/>
                                    )}
                                </button>
                            </div>
                        ) : (
                            <button 
                                onClick={() => setActiveTab(Tab.APP)}
                                className="text-sm font-bold text-agri-600 hover:text-agri-700 px-3 py-1"
                            >
                                Anmelden
                            </button>
                        )}
                    </div>
                </div>
            </div>
            </div>
        </nav>
      )}

      {/* Main Content */}
      <main className={`flex-1 relative overflow-hidden flex flex-col w-full h-full`}>
        {activeTab === Tab.HOME && !isFullScreen && (
          <div className="h-full overflow-y-auto">
            <Hero onLaunchApp={launchApp} />
            <AppShowcase />
            <div className="bg-white border-b border-gray-200">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
                <div className="text-center py-10">
                    <h2 className="text-3xl font-bold text-slate-800">Einfach. Sicher. Kostenlos.</h2>
                    <p className="mt-4 text-gray-500">AgriTrack Austria.</p>
                </div>
              </div>
            </div>
            {!isAdmin && (
                <div className="bg-slate-900 py-16">
                    <div className="max-w-4xl mx-auto px-4">
                        <div className="text-center mb-8">
                            <h2 className="text-2xl font-bold text-white">Deine Meinung zählt!</h2>
                            <p className="text-gray-400">Hast du eine Idee für die App? Wirf sie in den Kummerkasten.</p>
                        </div>
                        <FeedbackBoard isAdmin={false} />
                    </div>
                </div>
            )}
            
            {/* Footer inside scrollable area for Home */}
            <footer className="bg-white border-t border-gray-200 mt-auto shrink-0">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex flex-col md:flex-row justify-between items-center">
                    <div className="mb-4 md:mb-0">
                    <p className="text-sm text-gray-500">
                        &copy; {new Date().getFullYear()} AgriTrack Austria. Open Source & Forever Live.
                    </p>
                    </div>
                    <div className="flex space-x-6 text-sm text-gray-500">
                    <a href="#" className="hover:text-agri-600 transition-colors">Impressum</a>
                    </div>
                </div>
                </div>
            </footer>
          </div>
        )}

        {/* --- PROTECTED APP TAB --- */}
        {activeTab === Tab.APP && (
          <div className="absolute inset-0 bg-gray-100 flex flex-col">
            {isAuthenticated || isGuest ? (
               <AgriTrackApp onFullScreenToggle={setIsFullScreen} />
            ) : (
               <div className="h-full w-full flex items-center justify-center">
                   <AuthPage onLoginSuccess={() => {}} onGuestAccess={handleGuestAccess} />
               </div>
            )}
          </div>
        )}

        {/* --- ADMIN TAB --- */}
        {activeTab === Tab.ADMIN && isAdmin && !isFullScreen && (
          <div className="h-full bg-slate-900 flex flex-col">
              {/* Admin Sub-Nav */}
              <div className="bg-slate-800 p-2 flex justify-center space-x-4 border-b border-slate-700">
                  <button 
                    onClick={() => setAdminView('TICKETS')}
                    className={`px-4 py-2 rounded-lg font-bold transition-colors ${adminView === 'TICKETS' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`}
                  >
                      <MessageSquarePlus className="inline mr-2 h-4 w-4"/> Tickets & Chat
                  </button>
                  <button 
                    onClick={() => setAdminView('FARMS')}
                    className={`px-4 py-2 rounded-lg font-bold transition-colors ${adminView === 'FARMS' ? 'bg-green-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`}
                  >
                      <Database className="inline mr-2 h-4 w-4"/> Hof Manager
                  </button>
              </div>

              {/* Admin Content */}
              <div className="flex-1 overflow-y-auto">
                  {adminView === 'TICKETS' ? (
                      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                        <div className="mb-8 text-center">
                            <h2 className="text-3xl font-bold text-white">Admin Konsole</h2>
                        </div>
                        <FeedbackBoard isAdmin={true} />
                      </div>
                  ) : (
                      <AdminFarmManager />
                  )}
              </div>
          </div>
        )}

        {activeTab === Tab.CHANGELOG && !isFullScreen && (
          <div className="h-full overflow-y-auto">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <VersionHistory />
            </div>
          </div>
        )}
      </main>

    </div>
  );
};

export default App;

