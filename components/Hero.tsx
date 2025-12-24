
import React, { useState, useEffect } from 'react';
import { Cloud, ShieldCheck, Tractor, X, Smartphone, WifiOff, Lock, PlayCircle } from 'lucide-react';
import { dbService } from '../services/db';

interface HeroProps {
  onLaunchApp: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onLaunchApp }) => {
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [displayCount, setDisplayCount] = useState<number>(50); // Startwert fest auf 50

  useEffect(() => {
    const fetchAndAnimate = async () => {
        // Holen der echten Anzahl aus der Cloud
        const cloudCount = await dbService.getGlobalUserCount();
        const targetCount = 50 + cloudCount; // 50 Basis-Betriebe + Cloud-Registrierungen
        
        // Animationsparameter
        const startValue = 50;
        const duration = 2000; // 2 Sekunden Animationsdauer
        const startTime = performance.now();

        const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Easing: easeOutExpo für einen geschmeidigen Stopp am Ende
            const easeOutExpo = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
            
            const currentCount = Math.floor(startValue + (targetCount - startValue) * easeOutExpo);
            setDisplayCount(currentCount);

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    };
    
    fetchAndAnimate();
  }, []);

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
            <span className="text-agri-500">Bürokratie endet am Feld.</span>
          </h1>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl">
            Tätigkeiten erfassen & Fuhren tracken. Einfach. Schnell. Kostenlos.
            <br />
            Synchronisiert automatisch über die <span className="text-white font-bold">AgriCloud</span>. 
            Direkt im Browser nutzbar.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4">
            <button 
              onClick={onLaunchApp}
              className="bg-agri-500 hover:bg-agri-700 text-white font-bold py-4 px-8 rounded-lg flex items-center justify-center transition-all shadow-lg shadow-agri-900/50"
            >
              <PlayCircle className="mr-2 w-6 h-6" />
              App Jetzt Starten
            </button>
            <button 
              onClick={() => setShowSyncModal(true)}
              className="bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 text-white font-bold py-4 px-8 rounded-lg flex items-center justify-center transition-all"
            >
              <Cloud className="mr-2 w-5 h-5" />
              Wie funktioniert der Speicher?
            </button>
          </div>

          <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm text-gray-400">
            <div className="flex items-center">
              <ShieldCheck className="w-5 h-5 mr-2 text-agri-500" />
              <span>100% Datentrennung</span>
            </div>
            <div className="flex items-center">
              <span className="w-5 h-5 mr-2 text-agri-500 flex items-center justify-center font-bold border border-agri-500 rounded-full text-xs">AI</span>
              <span>KI-Gewarteter Code</span>
            </div>
            <div className="flex items-center">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse" />
              <span className="tabular-nums font-black text-white text-base mr-1">
                {displayCount.toLocaleString('de-AT')}
              </span>
              <span className="font-medium">aktive Betriebe</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sync Info Modal */}
      {showSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-white text-gray-900 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative overflow-hidden">
            <button 
              onClick={() => setShowSyncModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-6 h-6" />
            </button>
            
            <div className="text-center mb-8">
              <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Cloud className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-2xl font-bold mb-2">So funktioniert die AgriCloud</h3>
              <p className="text-gray-600">
                Wir nutzen Google Firebase Technologie. <br/>Kostenlos, Sicher und Wartungsfrei.
              </p>
            </div>

            <div className="grid gap-6">
              
              <div className="flex items-start bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div className="bg-white p-2 rounded-lg shadow-sm border border-gray-200 shrink-0">
                  <Lock className="w-6 h-6 text-agri-600" />
                </div>
                <div className="ml-4">
                  <h4 className="font-bold text-gray-900">1. Das Schließfach-Prinzip</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    Stell dir vor, die Cloud ist eine Bank mit Schließfächern. Dein Login ist der Schlüssel.
                    Niemand sonst hat diesen Schlüssel. Technisch ist es <strong>unmöglich</strong>, dass ein anderer Betrieb deine Daten sieht.
                  </p>
                </div>
              </div>

              <div className="flex items-start bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div className="bg-white p-2 rounded-lg shadow-sm border border-gray-200 shrink-0">
                  <WifiOff className="w-6 h-6 text-gray-600" />
                </div>
                <div className="ml-4">
                  <h4 className="font-bold text-gray-900">2. Funktioniert auch Offline</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    Kein Netz am Acker? Kein Problem. AgriTrack speichert alles auf dem Handy. 
                    Sobald du wieder Empfang hast, wird automatisch synchronisiert.
                  </p>
                </div>
              </div>

            </div>

            <div className="mt-8 pt-6 border-t border-gray-100 text-center">
               <button 
                onClick={() => setShowSyncModal(false)}
                className="bg-agri-600 hover:bg-agri-700 text-white font-bold py-3 px-8 rounded-lg transition-colors"
              >
                Alles klar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

