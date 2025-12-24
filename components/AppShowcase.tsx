
import React from 'react';
import { BarChart3, Map, Smartphone, FileText, CheckCircle2, Droplets, Truck, Wheat, Calendar, Hammer } from 'lucide-react';

const DashboardMockup = () => (
    <div className="w-full h-full bg-slate-50 p-4 font-sans text-left overflow-hidden select-none">
        {/* Mockup Header */}
        <div className="flex justify-between items-center mb-4">
            <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-agri-600 rounded-lg flex items-center justify-center text-white shadow-sm">
                    <BarChart3 size={16} />
                </div>
                <span className="font-bold text-slate-800 text-sm">Übersicht 2024</span>
            </div>
            <div className="flex space-x-1">
                <div className="w-2 h-2 rounded-full bg-slate-300"></div>
                <div className="w-2 h-2 rounded-full bg-slate-300"></div>
            </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-100">
                <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Fläche Ges.</div>
                <div className="text-lg font-black text-agri-600">42.85 ha</div>
            </div>
            <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-100">
                <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Einträge</div>
                <div className="text-lg font-black text-blue-600">124</div>
            </div>
        </div>

        {/* Storage Widget */}
        <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 mb-4">
            <div className="flex justify-between items-center mb-2">
                <div className="flex items-center text-slate-700 text-[10px] font-bold">
                    <Droplets size={12} className="mr-1 text-amber-600"/>
                    Hauptgrube Hof
                </div>
                <span className="text-[10px] font-bold text-amber-600">82%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div className="bg-amber-500 h-full rounded-full" style={{ width: '82%' }}></div>
            </div>
            <div className="flex justify-between mt-1 text-[8px] text-slate-400 font-bold">
                <span>328 m³</span>
                <span>400 m³ Max</span>
            </div>
        </div>

        {/* Activity List Preview */}
        <div className="space-y-2">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">Letzte Aktivitäten</div>
            <div className="bg-amber-50 border-l-4 border-amber-900 p-2.5 rounded-r-lg shadow-sm flex justify-between items-center">
                <div className="flex items-center space-x-2">
                    <Truck size={14} className="text-amber-900"/>
                    <div>
                        <div className="text-[10px] font-bold text-amber-900">Gülle Ausbringung</div>
                        <div className="text-[8px] text-amber-700">Wiese beim Haus • 12 m³</div>
                    </div>
                </div>
                <div className="text-[8px] font-bold text-slate-400">HEUTE</div>
            </div>
            <div className="bg-lime-50 border-l-4 border-lime-500 p-2.5 rounded-r-lg shadow-sm flex justify-between items-center opacity-60">
                <div className="flex items-center space-x-2">
                    <Wheat size={14} className="text-lime-700"/>
                    <div>
                        <div className="text-[10px] font-bold text-lime-800">Silage Ernte</div>
                        <div className="text-[8px] text-lime-600">Acker Süd • 45 Ballen</div>
                    </div>
                </div>
            </div>
        </div>
    </div>
);

export const AppShowcase: React.FC = () => {
  return (
    <div className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-base font-semibold leading-7 text-agri-600">Einblicke</h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Moderne Landwirtschaft auf deinem Smartphone
          </p>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            AgriTrack Austria wurde entwickelt, um den Alltag am Hof zu vereinfachen. 
            Weniger Zettelwirtschaft, mehr Zeit für das Wesentliche.
          </p>
        </div>

        <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
          <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-3">
            
            {/* Feature 1: Dashboard (MOCKUP INSTEAD OF IMAGE) */}
            <div className="flex flex-col">
              <dt className="text-base font-semibold leading-7 text-gray-900 flex items-center gap-x-3 mb-4">
                <BarChart3 className="h-6 w-6 text-agri-600" aria-hidden="true" />
                Alles im Blick
              </dt>
              <dd className="mt-1 flex flex-auto flex-col text-base leading-7 text-gray-600">
                <div className="mb-6 overflow-hidden rounded-2xl bg-slate-200 shadow-2xl ring-1 ring-gray-900/10 aspect-[4/5] sm:aspect-[4/3] relative group border-8 border-slate-800">
                    <DashboardMockup />
                    <div className="absolute inset-0 bg-gradient-to-t from-gray-900/20 to-transparent pointer-events-none"></div>
                    <div className="absolute bottom-4 left-4 text-white font-black text-[10px] tracking-widest uppercase border border-white/30 bg-black/40 backdrop-blur px-3 py-1 rounded-full">
                        Live Übersicht
                    </div>
                </div>
                <p className="flex-auto">
                  Das Dashboard zeigt dir sofort, wie viel Gülle, Mist oder Erntegut du in diesem Jahr bewegt hast. 
                  Inklusive automatischer Berechnung pro Hektar und Füllstandsprognose.
                </p>
              </dd>
            </div>

            {/* Feature 2: Tracking */}
            <div className="flex flex-col">
              <dt className="text-base font-semibold leading-7 text-gray-900 flex items-center gap-x-3 mb-4">
                <Smartphone className="h-6 w-6 text-agri-600" aria-hidden="true" />
                GPS Tracking
              </dt>
              <dd className="mt-1 flex flex-auto flex-col text-base leading-7 text-gray-600">
                <div className="mb-6 overflow-hidden rounded-2xl bg-gray-900 shadow-xl ring-1 ring-gray-400/10 aspect-[4/5] sm:aspect-[4/3] relative group">
                     <img 
                        src="https://images.unsplash.com/photo-1625246333195-58197bd47d26?auto=format&fit=crop&q=80&w=800" 
                        alt="Traktor GPS" 
                        className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105 opacity-90"
                    />
                     <div className="absolute inset-0 bg-gradient-to-t from-gray-900/60 to-transparent"></div>
                     <div className="absolute bottom-4 left-4 text-white font-medium text-sm border border-white/30 bg-black/30 backdrop-blur px-3 py-1 rounded-full">
                        Live Erfassung
                    </div>
                </div>
                <p className="flex-auto">
                  Handy in die Kabine legen, Tätigkeit wählen und losfahren. 
                  Die App erkennt automatisch, welches Feld du gerade bearbeitest und zählt die Fuhren mit.
                </p>
              </dd>
            </div>

            {/* Feature 3: Maps */}
            <div className="flex flex-col">
              <dt className="text-base font-semibold leading-7 text-gray-900 flex items-center gap-x-3 mb-4">
                <Map className="h-6 w-6 text-agri-600" aria-hidden="true" />
                Feldverwaltung
              </dt>
              <dd className="mt-1 flex flex-auto flex-col text-base leading-7 text-gray-600">
                <div className="mb-6 overflow-hidden rounded-2xl bg-gray-900 shadow-xl ring-1 ring-gray-400/10 aspect-[4/5] sm:aspect-[4/3] relative group">
                     <img 
                        src="https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&q=80&w=800" 
                        alt="Feldkarte Drohne" 
                        className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105 opacity-90"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-gray-900/60 to-transparent"></div>
                    <div className="absolute bottom-4 left-4 text-white font-medium text-sm border border-white/30 bg-black/30 backdrop-blur px-3 py-1 rounded-full">
                        Interaktive Karte
                    </div>
                </div>
                <p className="flex-auto">
                  Importiere deine Feldstücke (eAMA Shapefile) oder zeichne sie direkt auf der Karte ein. 
                  Teile Flächen, weise Farben zu und behalte den Überblick über deine Grenzen.
                </p>
              </dd>
            </div>

          </dl>
        </div>
        
        {/* Additional Features List */}
        <div className="mt-24 border-t border-gray-200 pt-16">
            <h3 className="text-2xl font-bold tracking-tight text-gray-900 text-center mb-12">Weitere Funktionen</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                <div className="flex gap-4">
                    <div className="mt-1 bg-green-100 p-2 rounded-lg h-fit">
                        <FileText className="h-5 w-5 text-green-700"/>
                    </div>
                    <div>
                        <h4 className="font-bold text-gray-900">PDF Export</h4>
                        <p className="text-sm text-gray-600 mt-1">Erstelle fertige Berichte für Kontrollen oder den Eigenbedarf mit einem Klick.</p>
                    </div>
                </div>
                <div className="flex gap-4">
                    <div className="mt-1 bg-blue-100 p-2 rounded-lg h-fit">
                        <CheckCircle2 className="h-5 w-5 text-blue-700"/>
                    </div>
                    <div>
                        <h4 className="font-bold text-gray-900">Offline-Fähig</h4>
                        <p className="text-sm text-gray-600 mt-1">Kein Netz am Acker? Die App speichert alles lokal und synchronisiert, sobald du wieder Empfang hast.</p>
                    </div>
                </div>
            </div>
        </div>

      </div>
    </div>
  );
};

