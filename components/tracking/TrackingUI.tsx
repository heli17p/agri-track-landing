
import React from 'react';
import { Clock, Database, Droplets, Truck, Square, Layers, Ban, History, LocateFixed, XCircle } from 'lucide-react';

interface Props {
  trackingState: string;
  startTime: number | null;
  loadCounts: Record<string, number>;
  currentLocation: GeolocationPosition | null;
  detectionCountdown: number | null;
  storageWarning: string | null;
  onStopClick: () => void;
  onDiscardClick: () => void;
  onMapStyleToggle: () => void;
  onFollowToggle: () => void;
  onHistoryToggle: () => void;
  followUser: boolean;
  historyMode: string;
  subType: string;
  activityType: string;
}

export const TrackingUI: React.FC<Props> = ({ 
  trackingState, 
  startTime, 
  loadCounts, 
  currentLocation, 
  detectionCountdown, 
  storageWarning, 
  onStopClick, 
  onDiscardClick,
  onMapStyleToggle, 
  onFollowToggle, 
  onHistoryToggle, 
  followUser, 
  historyMode, 
  subType, 
  activityType 
}) => {
  const totalLoads = Object.values(loadCounts).reduce((a, b) => a + b, 0);
  const speed = ((currentLocation?.coords.speed || 0) * 3.6).toFixed(1);
  const duration = startTime ? Math.round((Date.now() - startTime) / 60000) : 0;

  return (
    <>
      {/* Schwebende Karten-Buttons (Rechts) - FIXED POSITION */}
      <div className="fixed top-20 right-4 flex flex-col space-y-3 z-[1000]">
        <button onClick={onMapStyleToggle} className="bg-white/95 p-3 rounded-2xl shadow-xl border border-slate-200 backdrop-blur text-slate-700 active:scale-95 transition-all">
          <Layers size={24} />
        </button>
        <button onClick={onFollowToggle} className={`p-3 rounded-2xl shadow-xl border border-slate-200 backdrop-blur active:scale-95 transition-all ${followUser ? 'bg-blue-600 text-white' : 'bg-white/95 text-slate-700'}`}>
          <LocateFixed size={24}/>
        </button>
        <button onClick={onHistoryToggle} className={`p-3 rounded-2xl shadow-xl border border-slate-200 backdrop-blur active:scale-95 transition-all ${historyMode !== 'OFF' ? 'bg-purple-600 text-white' : 'bg-white/95 text-slate-700'}`}>
          <History size={24}/>
        </button>
      </div>

      {/* Status Anzeige (Oben Mitte) - FIXED POSITION */}
      <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-[1000] w-full max-w-[80%] flex flex-col items-center space-y-2 pointer-events-none">
        {storageWarning && (
          <div className="bg-orange-500/95 backdrop-blur text-white px-4 py-2 rounded-xl shadow-xl flex items-center space-x-2 animate-in slide-in-from-top-4 w-full justify-center">
            <Ban size={18}/>
            <span className="font-bold text-xs">{storageWarning}</span>
          </div>
        )}
        
        <div className="bg-white/95 backdrop-blur shadow-2xl border border-slate-300 rounded-full px-5 py-2.5 flex items-center space-x-3 pointer-events-auto transition-all w-fit">
          <div className={`p-2 rounded-full text-white ${trackingState === 'LOADING' ? 'bg-amber-500 animate-pulse' : trackingState === 'SPREADING' ? 'bg-green-600 animate-pulse' : 'bg-blue-500'}`}>
            {trackingState === 'LOADING' ? <Database size={18}/> : trackingState === 'SPREADING' ? <Droplets size={18}/> : <Truck size={18}/>}
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] font-bold text-slate-400 uppercase leading-none mb-0.5 tracking-tighter">Live-Status</span>
            <span className="font-bold text-slate-800 text-sm leading-none">
              {detectionCountdown ? `Laden in: ${detectionCountdown}s` : trackingState === 'LOADING' ? 'Laden...' : trackingState === 'SPREADING' ? 'Ausbringung' : 'Transport'}
            </span>
          </div>
        </div>
      </div>

      {/* DIE FIXIERTE INFO- & STEUERUNGSLEISTE (UNTEN) */}
      <div className="bg-white border-t-2 border-slate-200 p-4 pb-safe z-[1001] shadow-[0_-8px_30px_rgb(0,0,0,0.12)] shrink-0">
        <div className="flex items-center justify-between space-x-2">
          
          {/* STATS AREA */}
          <div className="flex-1 flex items-center justify-around bg-slate-50 rounded-2xl py-3 px-2 border border-slate-100">
            <div className="flex flex-col items-center">
              <span className="text-xl font-mono font-black text-slate-800 leading-none">{duration}</span>
              <span className="text-[9px] text-slate-400 font-bold uppercase mt-1">Min</span>
            </div>
            
            <div className="w-px h-8 bg-slate-200"></div>
            
            {activityType === 'Düngung' && (
              <>
                <div className="flex flex-col items-center">
                  <span className="text-xl font-mono font-black text-amber-600 leading-none">{totalLoads}</span>
                  <span className="text-[9px] text-slate-400 font-bold uppercase mt-1">Fuhren</span>
                </div>
                <div className="w-px h-8 bg-slate-200"></div>
              </>
            )}

            <div className="flex flex-col items-center">
              <span className="text-xl font-mono font-black text-blue-600 leading-none">{speed}</span>
              <span className="text-[9px] text-slate-400 font-bold uppercase mt-1">km/h</span>
            </div>
          </div>

          {/* BUTTON AREA */}
          <div className="flex items-center space-x-3 ml-2">
            {/* Abbrechen (X) */}
            <button 
              onClick={onDiscardClick} 
              className="w-12 h-14 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-all active:scale-90"
              title="Abbrechen"
            >
              <XCircle size={28} />
            </button>
            
            {/* Stop & Speichern */}
            <button 
              onClick={onStopClick} 
              className="w-20 h-14 bg-red-600 text-white rounded-2xl flex flex-col items-center justify-center shadow-lg shadow-red-200 hover:bg-red-700 active:scale-95 transition-all"
            >
              <Square size={20} fill="currentColor" className="mb-0.5"/>
              <span className="text-[10px] font-black uppercase tracking-tighter">STOP</span>
            </button>
          </div>

        </div>
        <div className="mt-2 text-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{activityType} • {subType}</span>
        </div>
      </div>
    </>
  );
};

