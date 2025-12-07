import React, { useState } from 'react';
import { Hero } from './components/Hero';
import { DevConsole } from './components/DevConsole';
import { VersionHistory } from './components/VersionHistory';
import { Tab } from './types';
import { LayoutDashboard, TerminalSquare, History, Sprout, Smartphone, Server, HardDrive } from 'lucide-react';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.HOME);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center cursor-pointer" onClick={() => setActiveTab(Tab.HOME)}>
              <Sprout className="h-8 w-8 text-agri-600" />
              <span className="ml-2 text-xl font-bold text-gray-900 tracking-tight">AgriTrack<span className="text-agri-600">.AT</span></span>
            </div>
            <div className="hidden md:flex space-x-8 items-center">
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
                onClick={() => setActiveTab(Tab.DEV_LAB)}
                className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                  activeTab === Tab.DEV_LAB
                    ? 'border-agri-500 text-gray-900'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <TerminalSquare className="w-4 h-4 mr-2" />
                Dev Labor (AI)
              </button>
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
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-grow">
        {activeTab === Tab.HOME && (
          <>
            <Hero />
            
            {/* Sync Options Section */}
            <div className="bg-white border-b border-gray-200">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                <div className="text-center mb-12">
                  <h2 className="text-3xl font-bold text-gray-900">Wähle deinen Speicherort</h2>
                  <p className="mt-4 text-xl text-gray-600">
                    Keine Server-Kenntnisse nötig. Starte einfach mit dem, was du schon hast.
                  </p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {/* Option 1: Easy */}
                  <div className="bg-gray-50 rounded-xl p-8 border border-gray-200 hover:border-agri-500 transition-colors cursor-pointer group">
                    <div className="bg-blue-100 w-12 h-12 rounded-lg flex items-center justify-center mb-6 group-hover:bg-blue-200 transition-colors">
                      <Smartphone className="w-6 h-6 text-blue-600" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Einfach & Schnell</h3>
                    <p className="text-sm font-semibold text-blue-600 mb-4 uppercase tracking-wider">Google Drive / Dropbox</p>
                    <p className="text-gray-600">
                      Perfekt für den Start. Melde dich einfach mit deinem Google- oder Dropbox-Konto an. Die Daten liegen in deinem privaten Cloud-Ordner.
                    </p>
                  </div>

                  {/* Option 2: Advanced */}
                  <div className="bg-gray-50 rounded-xl p-8 border border-gray-200 hover:border-agri-500 transition-colors cursor-pointer group">
                    <div className="bg-purple-100 w-12 h-12 rounded-lg flex items-center justify-center mb-6 group-hover:bg-purple-200 transition-colors">
                      <HardDrive className="w-6 h-6 text-purple-600" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Datenschutz Plus</h3>
                    <p className="text-sm font-semibold text-purple-600 mb-4 uppercase tracking-wider">Nextcloud</p>
                    <p className="text-gray-600">
                      Für alle, die mehr Kontrolle wollen. Verbinde AgriTrack mit deiner Nextcloud-Instanz oder einem österreichischen Speicheranbieter.
                    </p>
                  </div>

                  {/* Option 3: Pro */}
                  <div className="bg-gray-50 rounded-xl p-8 border border-gray-200 hover:border-agri-500 transition-colors cursor-pointer group">
                    <div className="bg-orange-100 w-12 h-12 rounded-lg flex items-center justify-center mb-6 group-hover:bg-orange-200 transition-colors">
                      <Server className="w-6 h-6 text-orange-600" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Technik Profi</h3>
                    <p className="text-sm font-semibold text-orange-600 mb-4 uppercase tracking-wider">Unraid / NAS</p>
                    <p className="text-gray-600">
                      Das Original. Volle Kontrolle über Docker-Container, Backups und lokale Synchronisierung ohne Internetzwang.
                    </p>
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
                      die Daten bei uns dir. Der Sync erfolgt ausschließlich mit dem Speicher deiner Wahl.
                    </p>
                    <p className="mt-4">
                      Dieses Projekt ist als "Living Software" konzipiert. Über den Tab <strong>Dev Labor</strong> kannst
                      du direkt mit der KI sprechen, die den Code wartet. Deine Ideen werden sofort in Code umgewandelt
                      und getestet.
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
                      <span className="font-bold text-gray-900">1,240</span>
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
          </>
        )}

        {activeTab === Tab.DEV_LAB && (
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="mb-8 text-center">
              <h2 className="text-3xl font-bold text-gray-900">AgriBot <span className="text-agri-600">Dev Labor</span></h2>
              <p className="mt-2 text-gray-600 max-w-2xl mx-auto">
                Dieses Projekt stirbt nie. Sprich mit der KI, um Bugs zu melden oder neue Features zu bauen. 
                Der Code generiert sich in Echtzeit.
              </p>
            </div>
            <DevConsole />
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
              <a href="#" className="hover:text-agri-600 transition-colors">Unraid Template</a>
              <a href="#" className="hover:text-agri-600 transition-colors">Community</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;