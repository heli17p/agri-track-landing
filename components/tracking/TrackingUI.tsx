
import React from 'react';
import { Clock, Database, Droplets, Truck, Square, Layers, Ban, History, LocateFixed, XCircle, Beaker, Timer, Minimize2, Sun, Hammer } from 'lucide-react';
import { StorageLocation, FertilizerType, ActivityType } from '../../types';
import { HistoryFilterMode } from '../../pages/TrackingPage';

interface Props {
  trackingState: string;
  startTime: number | null;
  loadCounts: Record<string, number>;
  workedAreaHa: number; // NEU
  currentLocation: GeolocationPosition | null;
  detectionCountdown: number | null;
  pendingStorageId: string | null;
  storageWarning: string | null;
  onStopClick: () => void;
  onDiscardClick: () => void;
  onMapStyleToggle: () => void;
  onFollowToggle: () => void;
  onHistoryToggle: () => void;
  onTestModeToggle: () => void;
  onMinimizeClick: () => void;
  followUser: boolean;
  historyMode: HistoryFilterMode;
  subType: string;
  activityType: ActivityType | string;
  isTestMode: boolean;
  activeSourceId: string | null;
  storages: StorageLocation[];
  wakeLockActive?: boolean;
}

const SLURRY_PALETTE = ['#451a03', '#78350f', '#92400e', '#b45309', '#854d0e'];
const MANURE_PALETTE = ['#d97706', '#ea580c', '#f59e0b', '#c2410c', '#fb923c'];

const getStorageColor = (storageId: string, allStorages: StorageLocation[]) => {
  const storage = allStorages.find(s => s.id === storageId);
  if (!storage) return '#64748b';
  const sameType = allStorages.filter(s => s.type === storage.type).sort((a, b) => a.id.localeCompare(b.id));
  const idx = Math.max(0, sameType.findIndex(s => s.id === storageId));
  return storage.type === FertilizerType.SLURRY ? SLURRY_PALETTE[idx % SLURRY_PALETTE.length] : MANURE_PALETTE[idx % MANURE_PALETTE.length];
};

export const TrackingUI: React.FC<Props> = ({ 
  trackingState, 
  startTime, 
  loadCounts, 
  workedAreaHa,
  currentLocation, 
  detectionCountdown, 
  pendingStorageId,
  storageWarning, 
  onStopClick, 
  onDiscardClick,
  onMapStyleToggle, 
  onFollowToggle, 
  onHistoryToggle, 
  onTestModeToggle,
  onMinimizeClick,
  followUser, 
  historyMode, 
  subType, 
  activityType,
  isTestMode,
  activeSourceId,
  storages,
  wakeLockActive = false
}) => {
  const totalLoads = Object.values(loadCounts).reduce((a, b) => a + b, 0);
  const speed = ((currentLocation?.coords.speed || 0) * 3.6).toFixed(1);
  const duration = startTime ? Math.round((Date.now() - startTime) / 60000) : 0;

  const activeStorageName = activeSourceId ? storages.find(s => s.id === activeSourceId)?.name : null;
  const pendingStorageName = pendingStorageId ? storages.find(s => s.id === pendingStorageId)?.name : null;

  const usedStorages = Object.entries(loadCounts).filter(([_, count]) => count > 0);

  const isTillage = activityType === ActivityType.TILLAGE;
  
  const getStatusLabel = () => {
    if (trackingState === 'LOADING') return 'Laden...';
    if (trackingState === 'SPREADING') {
      return isTillage ? 'Bearbeitung' : 'Ausbringung';
    }
    return 'Transport';
  };

  const getStatusIcon = () => {
    if (trackingState === 'LOADING') return <Database size={18}/>;
    if (trackingState === 'SPREADING') {
      return isTillage ? <Hammer size={18}/> : <Droplets size={18}/>;
    }
    return <Truck size={18} className="text-blue-500" />;
  };

  return (
    <>
      <div className="fixed top-20 right-4 flex flex-col space-y-3 z-[1100]">
        <button onClick={onMinimizeClick} className="bg-white/95 p-3 rounded-2xl shadow-xl border border-slate-200 backdrop-blur text-blue-600 active:scale-95 transition-all hover:bg-blue-50" title="In Hintergrund schalten"><Minimize2 size={24} /></button>
        {wakeLockActive && (<div className="bg-amber-50 p-3 rounded-2xl shadow-xl border border-amber-600 text-white flex items-center justify-center animate-pulse" title="Bildschirm bleibt aktiv"><Sun size={24} fill="currentColor" /></div>)}
        <button onClick={onMapStyleToggle} className="bg-white/95 p-3 rounded-2xl shadow-xl border border-slate-200 backdrop-blur text-slate-700 active:scale-95 transition-all"><Layers size={24} /></button>
        <button onClick={onFollowToggle} className={`p-3 rounded-2xl shadow-xl border border-slate-200 backdrop-blur active:scale-95 transition-all ${followUser ? 'bg-blue-600 text-white' : 'bg-white/95 text-slate-700'}`}><LocateFixed size={24}/></button>
        <button onClick={onHistoryToggle} className={`p-3 rounded-2xl shadow-xl border border-slate-200 backdrop-blur active:scale-95 transition-all relative ${historyMode !== 'OFF' ? 'bg-purple-600 text-white' : 'bg-white/95 text-slate-700'}`}><History size={24}/>{historyMode !== 'OFF' && (<div className="absolute -bottom-1 -left-1 bg-white text-purple-700 text-[8px] font-black px-1.5 py-0.5 rounded-full border border-purple-200 shadow-sm">{historyMode === 'YEAR' ? 'JAHR' : '12M'}</div>)}</button>
        <button onClick={onTestModeToggle} className={`p-3 rounded-2xl shadow-xl border border-slate-200 backdrop-blur active:scale-95 transition-all ${isTestMode ? 'bg-orange-500 text-white animate-pulse' : 'bg-white/95 text-slate-700'}`}><Beaker size={24}/></button>
      </div>

      <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-[1100] w-full max-w-[85%] flex flex-col items-center space-y-3 pointer-events-none">
        {isTestMode && (<div className="bg-orange-600/90 backdrop-blur text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg animate-bounce text-center">Simulation Aktiv: Karte klicken zum Fahren</div>)}
        {storageWarning && (<div className="bg-orange-500/95 backdrop-blur text-white px-4 py-2 rounded-xl shadow-xl flex items-center space-x-2 animate-in slide-in-from-top-4 w-full justify-center"><Ban size={18}/><span className="font-bold text-xs">{storageWarning}</span></div>)}
        {detectionCountdown !== null && (
          <div className="bg-blue-600 text-white px-8 py-4 rounded-[2rem] shadow-[0_20px_50px_rgba(37,99,235,0.4)] flex flex-col items-center space-y-1 animate-in zoom-in-95 border-4 border-white pointer-events-auto">
             <div className="flex flex-col items-center"><div className="flex items-center space-x-2 mb-1"><Timer size={22} className="animate-spin-slow text-blue-200"/><span className="text-[11px] font-black uppercase tracking-tighter opacity-90">Lagerplatz erkannt</span></div>{pendingStorageName && (<span className="text-sm font-bold bg-white/20 px-3 py-0.5 rounded-full mb-2 border border-white/10">{pendingStorageName}</span>)}</div>
             <div className="flex items-baseline space-x-1"><span className="text-4xl font-mono font-black">{detectionCountdown}</span><span className="text-xl font-bold opacity-70">Sek</span></div>
             <div className="w-full bg-blue-800/50 h-1.5 rounded-full mt-2 overflow-hidden"><div className="bg-white h-full transition-all duration-1000 ease-linear" style={{ width: `${(detectionCountdown / 30) * 100}%` }}></div></div>
          </div>
        )}
        <div className={`bg-white/95 backdrop-blur shadow-2xl border border-slate-300 rounded-full px-5 py-2.5 flex items-center space-x-3 pointer-events-auto transition-all w-fit ${detectionCountdown !== null ? 'opacity-20 scale-75 blur-[1px]' : 'opacity-100'}`}><div className={`p-2 rounded-full text-white ${trackingState === 'LOADING' ? 'bg-amber-500 animate-pulse' : trackingState === 'SPREADING' ? 'bg-green-600 animate-pulse' : 'bg-blue-50'}`}>{getStatusIcon()}</div><div className="flex flex-col"><span className="text-[9px] font-bold text-slate-400 uppercase leading-none mb-0.5 tracking-tighter">{activeStorageName ? `Quelle: ${activeStorageName}` : 'Live-Status'}</span><span className="font-bold text-slate-800 text-sm leading-none">{getStatusLabel()}</span></div></div>
      </div>

      <div className="bg-white border-t-2 border-slate-200 p-4 pb-safe z-[1200] shadow-[0_-8px_30px_rgb(0,0,0,0.15)] shrink-0 relative">
        {activityType === ActivityType.FERTILIZATION && usedStorages.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 mb-4 px-4 pointer-events-none z-[1250]"><div className="flex flex-wrap justify-center gap-2 max-w-lg mx-auto">{usedStorages.map(([sId, count]) => { const s = storages.find(st => st.id === sId); const color = getStorageColor(sId, storages); return (<div key={sId} className="bg-white/90 backdrop-blur-md shadow-lg border border-slate-200 rounded-full pl-1 pr-3 py-1 flex items-center space-x-2 animate-in slide-in-from-bottom-4 duration-300 pointer-events-auto"><div className="w-6 h-6 rounded-full flex items-center justify-center text-white shadow-sm" style={{backgroundColor: color}}><span className="text-[11px] font-black">{count}</span></div><span className="text-[10px] font-black text-slate-700 tracking-tight uppercase">{s?.name || 'Unbekannt'}</span></div>);})}</div></div>
        )}
        <div className="flex items-center justify-between space-x-2">
          <div className="flex-1 flex items-center justify-around bg-slate-50 rounded-2xl py-3 px-2 border border-slate-100 shadow-inner">
            <div className="flex flex-col items-center"><span className="text-xl font-mono font-black text-slate-800 leading-none">{duration}</span><span className="text-[9px] text-slate-400 font-bold uppercase mt-1">Min</span></div>
            <div className="w-px h-8 bg-slate-200"></div>
            {/* DYNAMISCHE ANZEIGE: Fuhren vs Hektar */}
            {activityType === ActivityType.FERTILIZATION ? (
              <div className="flex flex-col items-center"><span className="text-xl font-mono font-black text-amber-600 leading-none">{totalLoads}</span><span className="text-[9px] text-slate-400 font-bold uppercase mt-1">Fuhren</span></div>
            ) : (
              <div className="flex flex-col items-center"><span className="text-xl font-mono font-black text-blue-600 leading-none">{workedAreaHa.toFixed(2)}</span><span className="text-[9px] text-slate-400 font-bold uppercase mt-1">Hektar</span></div>
            )}
            <div className="w-px h-8 bg-slate-200"></div>
            <div className="flex flex-col items-center"><span className="text-xl font-mono font-black text-blue-600 leading-none">{speed}</span><span className="text-[9px] text-slate-400 font-bold uppercase mt-1">km/h</span></div>
          </div>
          <div className="flex items-center space-x-3 ml-2">
            <button onClick={onDiscardClick} className="w-12 h-14 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-all active:scale-90 shadow-sm" title="Abbrechen"><XCircle size={28} /></button>
            <button onClick={onStopClick} className="w-20 h-14 bg-red-600 text-white rounded-2xl flex flex-col items-center justify-center shadow-lg shadow-red-200 hover:bg-red-700 active:scale-95 transition-all border-b-4 border-red-800"><Square size={20} fill="currentColor" className="mb-0.5"/><span className="text-[10px] font-black uppercase tracking-tighter">STOP</span></button>
          </div>
        </div>
        <div className="mt-2 text-center"><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{activityType} • {subType}</span></div>
      </div>
    </>
  );
};

