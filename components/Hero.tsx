import React, { useState } from 'react';
import { Download, Cloud, ShieldCheck, Tractor, X, Smartphone, Monitor, Apple } from 'lucide-react';

export const Hero: React.FC = () => {
  const [showDownloadModal, setShowDownloadModal] = useState(false);

  return (
    <div className="relative bg-soil-900 text-white overflow-hidden">
      <div className="absolute inset-0 opacity-10 bg-[url('https://picsum.photos/1920/1080')] bg-cover bg-center" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32">
        <div className="lg:w-2/3">
          <div className="flex items-center space-x-2 text-agri-500 mb-4 font-semibold tracking-wide uppercase">
            <Tractor className="w-6 h-6" />
            <span>Open Source Landwirtschaft</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-tight mb-6">
            AgriTrack Austria <br />
            <span className="text-agri-500">Datenhoheit leicht gemacht.</span>
          </h1>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl">
            Die App für deine Feldarbeit. Synchronisiert einfach über 
            <span className="text-white font-bold"> Google Drive</span>, 
            <span className="text-white font-bold"> Dropbox</span> oder deinen eigenen
            <span className="text-white font-bold"> Unraid Server</span>.
            <br className="hidden md:block"/>
            Vollständig transparent und durch die Community gewartet.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4">
            <button 
              onClick={() => setShowDownloadModal(true)}
              className="bg-agri-500 hover:bg-agri-700 text-white font-bold py-4 px-8 rounded-lg flex items-center justify-center transition-all shadow-lg shadow-agri-900/50"
            >
              <Download className="mr-2 w-5 h-5" />
              App Herunterladen (v2.4.0)
            </button>
            <button className="bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 text-white font-bold py-4 px-8 rounded-lg flex items-center justify-center transition-all">
              <Cloud className="mr-2 w-5 h-5" />
              So funktioniert der Sync
            </button>
          </div>

          <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm text-gray-400">
            <div className="flex items-center">
              <ShieldCheck className="w-5 h-5 mr-2 text-agri-500" />
              <span>100% Deine Daten</span>
            </div>
            <div className="flex items-center">
              <span className="w-5 h-5 mr-2 text-agri-500 flex items-center justify-center font-bold border border-agri-500 rounded-full text-xs">AI</span>
              <span>KI-Gewarteter Code</span>
            </div>
            <div className="flex items-center">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse" />
              <span>1,240 Landwirte Online</span>
            </div>
          </div>
        </div>
      </div>

      {/* Download Modal */}
      {showDownloadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-white text-gray-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <button 
              onClick={() => setShowDownloadModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-6 h-6" />
            </button>
            
            <h3 className="text-2xl font-bold mb-2">Version wählen</h3>
            <p className="text-gray-500 mb-6">Wähle die passende Version für dein Gerät.</p>
            
            <div className="space-y-4">
              {/* Android */}
              <a href="#" className="flex items-center p-4 border border-gray-200 rounded-xl hover:border-agri-500 hover:bg-agri-50 transition-all group">
                <div className="bg-green-100 p-3 rounded-lg group-hover:bg-green-200">
                  <Smartphone className="w-6 h-6 text-green-700" />
                </div>
                <div className="ml-4 flex-1">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold">Android (.apk)</h4>
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-bold">Empfohlen</span>
                  </div>
                  <p className="text-sm text-gray-500">Direkter Download für Smartphone/Tablet.</p>
                </div>
                <Download className="w-5 h-5 text-gray-400 group-hover:text-agri-600" />
              </a>

              {/* iOS */}
              <div className="flex items-center p-4 border border-gray-200 rounded-xl hover:border-gray-300 transition-all group cursor-not-allowed opacity-70">
                <div className="bg-gray-100 p-3 rounded-lg">
                  <Apple className="w-6 h-6 text-gray-700" />
                </div>
                <div className="ml-4 flex-1">
                  <h4 className="font-bold">iOS / iPhone</h4>
                  <p className="text-sm text-gray-500">Als Web-App zum Home-Screen hinzufügen.</p>
                </div>
              </div>

              {/* Server */}
              <a href="#" className="flex items-center p-4 border border-gray-200 rounded-xl hover:border-agri-500 hover:bg-agri-50 transition-all group">
                <div className="bg-blue-100 p-3 rounded-lg group-hover:bg-blue-200">
                  <Monitor className="w-6 h-6 text-blue-700" />
                </div>
                <div className="ml-4 flex-1">
                  <h4 className="font-bold">Docker / Unraid</h4>
                  <p className="text-sm text-gray-500">Für die eigene Server-Installation.</p>
                </div>
                <Download className="w-5 h-5 text-gray-400 group-hover:text-agri-600" />
              </a>
            </div>

            <div className="mt-6 text-center text-xs text-gray-400">
              Downloads werden über GitHub Releases bereitgestellt.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};