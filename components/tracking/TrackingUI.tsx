
import React from 'react';
import { Navigation, Clock, Database, Droplets, Truck, Square, Layers, Ban, History, LocateFixed } from 'lucide-react';

interface Props {
  trackingState: string;
  startTime: number | null;
  loadCounts: Record<string, number>;
  currentLocation: GeolocationPosition | null;
  detectionCountdown: number | null;
  storageWarning: string | null;
  onStopClick: () => void;
  onMapStyleToggle: () => void;
  onFollowToggle: () => void;
  onHistoryToggle: () => void;
  followUser: boolean;
  historyMode: string;
  subType: string;
  activityType: string;
}

export const TrackingUI: React.FC<Props> = ({ trackingState, startTime, loadCounts, currentLocation, detectionCountdown, storageWarning, onStopClick, onMapStyleToggle, onFollowToggle, onHistoryToggle, followUser, historyMode, subType, activityType }) => {
  const totalLoads = Object.values(loadCounts).reduce((a, b) => a + b, 0);
  const speed = ((currentLocation?.coords.speed || 0) * 3.6).toFixed(1);
  const duration = startTime ? Math.round((Date.now() - startTime) / 60000) : 0;

  return (
    <>
      <div className="absolute top-4 right-4 flex flex-col space-y-2 z-[400]">
        <button onClick={onMapStyleToggle} className="bg-white/90 p-3 rounded-xl shadow-lg border border-slate-200"><Layers size={24} className="text-slate-700"/></button>
        <button onClick={onFollowToggle} className={`p-3 rounded-xl shadow-lg border border-slate-200 ${followUser ? 'bg-blue-600 text-white' : 'bg-white/90 text-slate-700'}`}><LocateFixed size={24}/></button>
        <button onClick={onHistoryToggle} className={`p-3 rounded-xl shadow-lg border border-slate-200 transition-colors ${historyMode !== 'OFF' ? 'bg-purple-600 text-white' : 'bg-white/90 text-slate-700'}`}><History size={24}/></button>
      </div>

      <div className="absolute top-24 left-1/2 transform -translate-x-1/2 z-[400] w-full max-w-[90%] flex flex-col items-center space-y-2 pointer-events-none">
        {storageWarning && <div className="bg-orange-500/95 backdrop-blur text-white px-4 py-2 rounded-xl shadow-xl flex items-center space-x-2 animate-in slide-in-from-top-4 w-full justify-center"><Ban size={20}/><span className="font-bold text-xs">{storageWarning}</span></div>}
        <div className="bg-white/95 backdrop-blur shadow-xl border border-slate-300 rounded-full px-5 py-3 flex items-center space-x-3 pointer-events-auto transition-all w-fit">
          <div className={`p-2 rounded-full text-white ${trackingState === 'LOADING' ? 'bg-amber-500 animate-pulse' : trackingState === 'SPREADING' ? 'bg-green-600 animate-pulse' : 'bg-blue-500'}`}>
            {trackingState === 'LOADING' ? <Database size={20}/> : trackingState === 'SPREADING' ? <Droplets size={20}/> : <Truck size={20}/>}
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Status</span>
            <span className="font-bold text-slate-800 text-sm">{detectionCountdown ? `Timer: ${detectionCountdown}s` : trackingState === 'LOADING' ? 'Laden...' : trackingState === 'SPREADING' ? 'Ausbringung' : 'Transport'}</span>
          </div>
        </div>
      </div>

      <div className="bg-white border-t border-slate-200 p-4 pb-safe z-10 shrink-0">
        <div className="flex items-center justify-between space-x-4">
          <div className="flex-1">
            <div className="text-xs text-slate-500 font-bold uppercase mb-1">{activityType} • {subType}</div>
            <div className="flex items-end space-x-6">
              <div><span className="text-2xl font-mono font-bold text-slate-800">{duration}</span><span className="text-xs text-slate-400 ml-1">min</span></div>
              {activityType === 'Düngung' && <div><span className="text-2xl font-mono font-bold text-slate-800">{totalLoads}</span><span className="text-xs text-slate-400 ml-1">Fuhren</span></div>}
              <div><span className="text-2xl font-mono font-bold text-slate-800">{speed}</span><span className="text-xs text-slate-400 ml-1">km/h</span></div>
            </div>
          </div>
          <button onClick={onStopClick} className="w-16 h-16 bg-red-600 text-white rounded-2xl flex items-center justify-center shadow-lg hover:bg-red-700 active:scale-95 transition-all"><Square size={24} fill="currentColor"/></button>
        </div>
      </div>
    </>
  );
};

