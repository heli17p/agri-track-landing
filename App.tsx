import React, { useState, useEffect } from 'react';
import { Hero } from './components/Hero';
import { FeedbackBoard } from './components/FeedbackBoard';
import { VersionHistory } from './components/VersionHistory';
import { AgriTrackApp } from './components/AgriTrackApp';
import { AppShowcase } from './components/AppShowcase';
import { AuthPage } from './pages/AuthPage';
import { Tab } from './types';
import { LayoutDashboard, MessageSquarePlus, History, Sprout, Check, Shield, Zap, Smartphone, Lock, User, X, ArrowRight, LogOut, CloudOff } from 'lucide-react';
import { authService } from './services/auth';
import { dbService } from './services/db';

const AdminLoginModal = ({ onLogin, onClose }: { onLogin: () => void, onClose: () => void }) => {
    const [pass, setPass] = useState('');
    const [error, setError] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (pass === 'admin' || pass === '1234') {
            onLogin();
        } else {
            setError(true);
        }
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
                    <p className="text-sm text-slate-500">Nur für Systembetreuer</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <input 
                            type="password" 
                            autoFocus
                            placeholder="Passwort eingeben"
                            className="w-full border border-slate-300 p-3 rounded-lg outline-none focus:ring-2 focus:ring-red-500"
                            value={pass}
                            onChange={e => { setPass(e.target.value); setError(false); }}
                        />
                        {error && <p className="text-xs text-red-500 mt-1 font-bold">Falsches Passwort.</p>}
                    </div>
                    <button className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold flex items-center justify-center hover:bg-slate-800">
                        Anmelden <ArrowRight size={16} className="ml-2"/>
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
          } else {
              setIsAuthenticated(false);
          }
          setIsLoadingAuth(false);
      });

      return () => unsubscribe();
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
      const wasGuest = isGuest; // Capture state before reset
      
      await authService.logout();
      setIsGuest(false);
      setIsAuthenticated(false);
      localStorage.removeItem('agritrack_guest_mode');
      
      // UX Improvement: 
      // If it was a guest clicking "Exit/Login", send them to Login Page (Tab.APP).
      // If it was a real user logging out, send them to Home (Tab.HOME).
      if (wasGuest) {
          setActiveTab(Tab.APP);
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
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      
      {showLoginModal && <AdminLoginModal onLogin={handleAdminLogin} onClose={() => setShowLoginModal(false)} />}

      {/* Guest Banner - Now visible on ALL tabs for better awareness */}
      {isGuest && (
          <div className="bg-slate-800 text-slate-300 text-xs py-1 px-4 text-center flex justify-center items-center relative z-[60]">
              <CloudOff size={12} className="mr-2"/>
              <span>Gastmodus: Daten werden nur lokal gespeichert.</span>
              <button 
                onClick={() => { 
                    setIsGuest(false); 
                    localStorage.removeItem('agritrack_guest_mode'); 
                    setActiveTab(Tab.APP); // Force Navigation to Login
                }} 
                className="ml-4 underline hover:text-white font-bold"
              >
                  Jetzt anmelden
              </button>
          </div>
      )}

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
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
                
                {/* Admin Tab (Protected) */}
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
                    
                    {/* Admin Toggle */}
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

                    {/* User Profile / Logout */}
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
                        // Show Login Button in Header if not logged in
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

      {/* Main Content */}
      <main className="flex-grow">
        {activeTab === Tab.HOME && (
          <>
            <Hero onLaunchApp={launchApp} />
            <AppShowcase />
            <div className="bg-white border-b border-gray-200">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
                <div className="lg:text-center mb-16">
                  <h2 className="text-base text-agri-600 font-semibold tracking-wide uppercase">Eine Lösung für Alle</h2>
                  <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
                    Schluss mit dem Technik-Chaos.
                  </p>
                  <p className="mt-4 max-w-2xl text-xl text-gray-500 lg:mx-auto">
                    Wir haben alle komplizierten Server-Optionen gestrichen. AgriTrack setzt jetzt zu 100% auf die AgriCloud.
                    Einfacher geht es nicht.
                  </p>
                </div>

                <div className="relative bg-agri-50 rounded-2xl p-8 md:p-12 border border-agri-100 overflow-hidden">
                  <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-agri-200 rounded-full opacity-50 blur-2xl"></div>
                  <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-32 h-32 bg-green-200 rounded-full opacity-50 blur-2xl"></div>
                  
                  <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
                    {/* Feature 1 */}
                    <div className="flex flex-col items-center text-center">
                      <div className="flex items-center justify-center h-16 w-16 rounded-full bg-white text-green-600 shadow-sm mb-6">
                        <Zap className="w-8 h-8" />
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 mb-2">Sofort Startklar</h3>
                      <p className="text-gray-600">
                        Keine IP-Adressen. Keine Ports. App öffnen, loslegen. Du bist in 30 Sekunden einsatzbereit.
                      </p>
                    </div>

                    {/* Feature 2 */}
                    <div className="flex flex-col items-center text-center">
                      <div className="flex items-center justify-center h-16 w-16 rounded-full bg-white text-green-600 shadow-sm mb-6">
                        <Shield className="w-8 h-8" />
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 mb-2">Google Sicherheit</h3>
                      <p className="text-gray-600">
                        Deine Daten liegen nicht auf einem Hobby-Server im Keller, sondern in den Hochsicherheits-Zentren von Google.
                      </p>
                    </div>

                    {/* Feature 3 */}
                    <div className="flex flex-col items-center text-center">
                      <div className="flex items-center justify-center h-16 w-16 rounded-full bg-white text-green-600 shadow-sm mb-6">
                        <Check className="w-8 h-8" />
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 mb-2">Dauerhaft Kostenlos</h3>
                      <p className="text-gray-600">
                        Dank des großzügigen "Spark"-Tarifs von Firebase bleibt die Nutzung für den durchschnittlichen Landwirt komplett gratis.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Public Feedback Section */}
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
          </>
        )}

        {/* --- PROTECTED APP TAB --- */}
        {activeTab === Tab.APP && (
          <div className="bg-gray-100 min-h-[calc(100vh-64px)] py-4">
            {isAuthenticated || isGuest ? (
               <AgriTrackApp />
            ) : (
               <div className="h-full flex flex-col items-center justify-center min-h-[60vh]">
                   <AuthPage onLoginSuccess={() => {}} onGuestAccess={handleGuestAccess} />
               </div>
            )}
          </div>
        )}

        {activeTab === Tab.ADMIN && isAdmin && (
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="mb-8 text-center">
              <div className="inline-flex items-center justify-center p-3 bg-red-100 text-red-600 rounded-full mb-4">
                 <Lock size={32} />
              </div>
              <h2 className="text-3xl font-bold text-gray-900">Admin <span className="text-red-600">Konsole</span></h2>
              <p className="mt-2 text-gray-600 max-w-2xl mx-auto">
                Willkommen im Maschinenraum. Hier kannst du die Wünsche der Kollegen verwalten und priorisieren.
              </p>
            </div>
            <FeedbackBoard isAdmin={true} />
          </div>
        )}

        {activeTab === Tab.CHANGELOG && (
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <VersionHistory />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="mb-4 md:mb-0">
              <p className="text-sm text-gray-500">
                &copy; {new Date().getFullYear()} AgriTrack Austria. Open Source & Forever Live.
              </p>
            </div>
            <div className="flex space-x-6 text-sm text-gray-500">
              <a href="#" className="hover:text-agri-600 transition-colors">GitHub Repository</a>
              <a href="#" className="hover:text-agri-600 transition-colors">Datenschutz</a>
              <a href="#" className="hover:text-agri-600 transition-colors">Impressum</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
