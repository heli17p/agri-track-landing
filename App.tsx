
import React, { useState, useEffect } from 'react';
import { Hero } from './components/Hero';
import { DevConsole } from './components/DevConsole';
import { VersionHistory } from './components/VersionHistory';
import { AgriTrackApp } from './components/AgriTrackApp';
import { AppShowcase } from './components/AppShowcase';
import { Tab } from './types';
import { LayoutDashboard, TerminalSquare, History, Sprout, Check, Shield, Zap, Smartphone, Lock, User, X, ArrowRight } from 'lucide-react';

const AdminLoginModal = ({ onLogin, onClose }: { onLogin: () => void, onClose: () => void }) => {
    const [pass, setPass] = useState('');
    const [error, setError] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Simple demo password check
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
                <div className="mt-4 text-center text-xs text-slate-400">
                    (Demo Passwort: admin)
                </div>
            </div>
        </div>
    );
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.HOME);

  // Auth State
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  useEffect(() => {
      console.log("AgriTrack Austria: System Check - Online v2.4.1");
  }, []);

  // Helper to allow Hero to switch tab
  const launchApp = () => setActiveTab(Tab.APP);

  const handleAdminLogin = () => {
      setIsAdmin(true);
      setShowLoginModal(false);
      setActiveTab(Tab.ADMIN); // Go straight to admin console
  };

  const handleLogout = () => {
      setIsAdmin(false);
      setActiveTab(Tab.HOME);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">

      {showLoginModal && <AdminLoginModal onLogin={handleAdminLogin} onClose={() => setShowLoginModal(false)} />}

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

                {/* Login/Logout Button */}
                <div className="border-l border-gray-200 pl-4">
                    {isAdmin ? (
                        <button
                            onClick={handleLogout}
                            className="flex items-center text-xs font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded-full hover:bg-red-100 transition-colors"
                        >
                            <User size={14} className="mr-2"/> Abmelden
                        </button>
                    ) : (
                        <button
                            onClick={() => setShowLoginModal(true)}
                            className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition-colors"
                            title="Admin Login"
                        >
                            <Lock size={18} />
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

            {/* Visual Showcase of the App */}
            <AppShowcase />

            {/* AgriCloud Focused Section */}
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

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-4">Warum AgriTrack?</h3>
                  <div className="prose text-gray-600">
                    <p>
                      Entwickelt von Landwirten für Landwirte. Im Gegensatz zu großen Agrarkonzernen gehören
                      die Daten bei uns dir.
                    </p>
                    <p className="mt-4">
                      Dieses Projekt ist als "Living Software" konzipiert. Über den Support-Chat kannst
                      du direkt mit der KI sprechen, die den Code wartet. Deine Ideen werden sofort in Tickets umgewandelt.
                    </p>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <h3 className="text-lg font-semibold mb-4 text-gray-800">Aktueller Status</h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                      <span className="text-gray-500">Neueste Version</span>
                      <span className="font-mono font-bold text-agri-700">v2.4.0</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                      <span className="text-gray-500">Aktive Installationen</span>
                      <span className="font-bold text-gray-900">1.240</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                      <span className="text-gray-500">Letztes Update</span>
                      <span className="text-gray-900">Vor 2 Tagen</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">System Gesundheit</span>
                      <span className="text-green-600 font-medium flex items-center">
                        <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                        Operational
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Public Support Section */}
            {!isAdmin && (
                <div className="bg-slate-900 py-16">
                    <div className="max-w-4xl mx-auto px-4">
                        <div className="text-center mb-8">
                            <h2 className="text-2xl font-bold text-white">Hast du einen Wunsch?</h2>
                            <p className="text-gray-400">Sprich mit AgriBot. Er leitet deine Ideen direkt an die Entwicklung weiter.</p>
                        </div>
                        <DevConsole isAdmin={false} />
                    </div>
                </div>
            )}
          </>
        )}

        {activeTab === Tab.APP && (
          <div className="bg-gray-100 min-h-[calc(100vh-64px)] py-4">
            <AgriTrackApp />
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
                Willkommen im Maschinenraum. Hier kannst du den Code anpassen, Tickets verwalten und Systemeinstellungen ändern.
              </p>
            </div>
            <DevConsole isAdmin={true} />
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

