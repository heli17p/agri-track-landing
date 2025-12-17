import React, { useEffect, useState, useMemo } from 'react';
import { dbService } from '../services/db';
import { ActivityRecord, FarmProfile, ActivityType, HarvestType, FertilizerType, TillageType, AppSettings, DEFAULT_SETTINGS, StorageLocation } from '../types';
import { Download, Cloud, RefreshCw, List, ChevronRight, Truck, Wheat, Hammer, Filter, ArrowUp, ArrowDown, Calendar, CheckCircle, Droplets, Layers, AlertTriangle, Calculator, Sprout, ShoppingBag } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { syncData } from '../services/sync';
import { ActivityDetailView } from '../components/ActivityDetailView';
import { StorageDetailView } from '../components/StorageDetailView';
import { getAppIcon } from '../utils/appIcons';

interface Props {
  onNavigate: (tab: string) => void;
}

export const Dashboard: React.FC<Props> = ({ onNavigate }) => {
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [fields, setFields] = useState<any[]>([]);
  const [storages, setStorages] = useState<StorageLocation[]>([]);
  const [profile, setProfile] = useState<FarmProfile | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [selectedActivity, setSelectedActivity] = useState<ActivityRecord | null>(null);
  const [selectedStorage, setSelectedStorage] = useState<StorageLocation | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [showSyncSuccess, setShowSyncSuccess] = useState(false);

  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear());
  const [filterType, setFilterType] = useState<'All' | ActivityType>('All');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const load = async () => {
    const acts = await dbService.getActivities();
    const flds = await dbService.getFields();
    const strs = await dbService.getStorageLocations();
    const profs = await dbService.getFarmProfile();
    const sets = await dbService.getSettings();

    setActivities(acts);
    setFields(flds);
    setStorages(strs);
    if (profs.length) setProfile(profs[0]);
    setSettings(sets);

    const storedSync = localStorage.getItem('lastSyncSuccess');
    if (storedSync) setLastSyncTime(storedSync);
    setLoading(false);
  };

  useEffect(() => { 
      load(); 
      const unsubSync = dbService.onSyncComplete(load);
      const unsubDb = dbService.onDatabaseChange(load);
      return () => { unsubSync(); unsubDb(); }
  }, []);

  const availableYears = useMemo(() => {
      const years = new Set(activities.map(a => a.year));
      years.add(new Date().getFullYear());
      return Array.from(years).sort((a, b) => b - a);
  }, [activities]);

  const yearStats = useMemo(() => {
      const stats = { 
          slurryVol: 0, manureVol: 0, 
          hayCount: 0, silageCount: 0, strawCount: 0, 
          harrowHa: 0, mulchHa: 0, weederHa: 0, reseedHa: 0,
          totalActivities: 0 
      };
      const yearActs = activities.filter(a => a.year === filterYear);
      stats.totalActivities = yearActs.length;
      
      yearActs.forEach(act => {
          if (act.type === ActivityType.FERTILIZATION) {
              if (act.fertilizerType === FertilizerType.MANURE) stats.manureVol += act.amount || 0;
              else stats.slurryVol += act.amount || 0;
          } else if (act.type === ActivityType.HARVEST) {
              if (act.notes?.includes(HarvestType.HAY)) stats.hayCount += act.amount || 0;
              else if (act.notes?.includes(HarvestType.STRAW)) stats.strawCount += act.amount || 0;
              else stats.silageCount += act.amount || 0;
          } else if (act.type === ActivityType.TILLAGE) {
              if (act.tillageType === TillageType.HARROW) stats.harrowHa += act.amount || 0;
              else if (act.tillageType === TillageType.MULCH) stats.mulchHa += act.amount || 0;
              else if (act.tillageType === TillageType.WEEDER) stats.weederHa += act.amount || 0;
              else if (act.tillageType === TillageType.RESEEDING) stats.reseedHa += act.amount || 0;
          }
      });
      return stats;
  }, [activities, filterYear]);

  const filteredActivities = useMemo(() => {
      return activities
        .filter(a => a.year === filterYear && (filterType === 'All' || a.type === filterType))
        .sort((a, b) => {
            const tA = new Date(a.date).getTime();
            const tB = new Date(b.date).getTime();
            return sortOrder === 'asc' ? tA - tB : tB - tA;
        });
  }, [activities, filterYear, filterType, sortOrder]);

  const handleSync = async () => {
    try { 
        setLoading(true); 
        await syncData(); 
        await load(); 
        setShowSyncSuccess(true); 
        setTimeout(() => setShowSyncSuccess(false), 2000); 
    } catch (e) { 
        alert('Synchronisierung fehlgeschlagen. Offline?'); 
    } finally { 
        setLoading(false); 
    }
  };

  const getActivityStyle = (act: ActivityRecord) => {
    const isHarvest = act.type === ActivityType.HARVEST;
    const isFert = act.type === ActivityType.FERTILIZATION;
    const Icon = isHarvest ? Wheat : isFert ? Truck : Hammer;
    
    let color = 'border-blue-500 bg-blue-50 text-blue-800';
    if (isHarvest) color = 'border-lime-500 bg-lime-50 text-lime-800';
    if (isFert) color = 'border-amber-700 bg-amber-50 text-amber-900';
    
    return { label: act.type, colorClass: color, Icon };
  };

  return (
    <div className="bg-slate-50 h-full overflow-y-auto pb-24 relative">
       {showSyncSuccess && (
           <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-full shadow-xl z-50 animate-in fade-in slide-in-from-top-4 font-bold">
               Sync OK
           </div>
       )}

       <div className="p-4 space-y-6">
           <div className="flex justify-between items-start">
               <div className="flex items-center space-x-3">
                   <img src={getAppIcon(settings.appIcon || 'standard')} className="w-14 h-14 rounded-2xl bg-white shadow-md border border-slate-200 object-contain p-1" alt="Logo" />
                   <div>
                       <h1 className="text-2xl font-black text-slate-800 tracking-tight">AgriTrack</h1>
                       <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">{profile?.operatorName || 'Kein Betrieb'}</p>
                   </div>
               </div>
               <button onClick={handleSync} className="p-3 bg-blue-100 text-blue-700 rounded-full shadow-sm hover:bg-blue-200 transition-colors">
                   {loading ? <RefreshCw className="animate-spin"/> : <Cloud />}
               </button>
           </div>

           <div className="flex justify-between items-center border-b border-slate-200 pb-2">
               <h2 className="text-lg font-bold text-slate-700">Übersicht</h2>
               <div className="relative">
                   <select 
                       value={filterYear} 
                       onChange={(e) => setFilterYear(parseInt(e.target.value))} 
                       className="bg-white px-8 py-1.5 rounded-lg font-bold text-slate-700 outline-none border border-slate-200 shadow-sm appearance-none"
                   >
                       {availableYears.map(y => (<option key={y} value={y}>{y}</option>))}
                   </select>
                   <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
               </div>
           </div>

           {/* STATISTIK-BOARD (Full Version - Immer sichtbar) */}
           <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-5">
               <div className="flex justify-between items-center">
                   <h3 className="font-bold text-lg text-slate-800 flex items-center">
                       <Calculator className="mr-2 text-blue-500" size={22}/> Jahresstatistik {filterYear}
                   </h3>
                   <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{yearStats.totalActivities} Einträge</span>
               </div>
               
               {yearStats.totalActivities === 0 ? (
                   <div className="text-center py-10 text-slate-400 text-sm italic border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/50">
                       <AlertTriangle className="mx-auto mb-2 opacity-20" size={32}/>
                       Noch keine Einträge im Jahr {filterYear}.<br/>Starten Sie eine neue Tätigkeit.
                   </div>
               ) : (
                   <div className="grid grid-cols-2 gap-4">
                       {(yearStats.slurryVol > 0) && (
                            <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 group transition-all hover:shadow-md">
                                <div className="text-amber-900 text-[10px] font-black uppercase mb-1 flex items-center"><Droplets size={12} className="mr-1"/> Gülle</div>
                                <div className="text-2xl font-black text-amber-950">{yearStats.slurryVol.toFixed(0)} <span className="text-xs">m³</span></div>
                            </div>
                       )}
                       {(yearStats.manureVol > 0) && (
                            <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 group transition-all hover:shadow-md">
                                <div className="text-orange-900 text-[10px] font-black uppercase mb-1 flex items-center"><Layers size={12} className="mr-1"/> Mist</div>
                                <div className="text-2xl font-black text-orange-950">{yearStats.manureVol.toFixed(0)} <span className="text-xs">m³</span></div>
                            </div>
                       )}
                       {(yearStats.silageCount > 0) && (
                            <div className="bg-lime-50 p-4 rounded-xl border border-lime-100 group transition-all hover:shadow-md">
                                <div className="text-lime-900 text-[10px] font-black uppercase mb-1 flex items-center"><Wheat size={12} className="mr-1"/> Silage</div>
                                <div className="text-2xl font-black text-lime-950">{yearStats.silageCount} <span className="text-xs">Stk</span></div>
                            </div>
                       )}
                       {(yearStats.harrowHa > 0) && (
                            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 group transition-all hover:shadow-md">
                                <div className="text-blue-900 text-[10px] font-black uppercase mb-1 flex items-center"><Sprout size={12} className="mr-1"/> Boden</div>
                                <div className="text-2xl font-black text-blue-950">{yearStats.harrowHa.toFixed(1)} <span className="text-xs">ha</span></div>
                            </div>
                       )}
                   </div>
               )}
           </div>

           {/* AKTIVITÄTSLISTE */}
           <div className="space-y-3">
                <div className="flex justify-between items-center px-1">
                    <h3 className="font-bold text-slate-500 uppercase text-xs tracking-widest">Letzte Aktivitäten</h3>
                    <button onClick={() => setSortOrder(s => s === 'asc' ? 'desc' : 'asc')} className="text-xs text-blue-600 font-bold flex items-center">
                        {sortOrder === 'asc' ? <ArrowUp size={12} className="mr-1"/> : <ArrowDown size={12} className="mr-1"/>}
                        Datum
                    </button>
                </div>
                
                {filteredActivities.length === 0 ? (
                    <div className="p-8 text-center bg-white rounded-2xl border border-slate-100 text-slate-400 text-sm">
                        Keine Einträge für die gewählten Filter.
                    </div>
                ) : (
                    filteredActivities.map((act) => {
                        const s = getActivityStyle(act);
                        return (
                            <div 
                                key={act.id} 
                                onClick={() => setSelectedActivity(act)} 
                                className={`p-4 rounded-2xl shadow-sm border-l-8 cursor-pointer hover:bg-white transition-all active:scale-[0.98] border border-slate-200 ${s.colorClass}`}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center space-x-3">
                                        <div className="p-2 bg-white/50 rounded-lg"><s.Icon size={20}/></div>
                                        <div>
                                            <span className="font-black text-slate-800">{s.label}</span>
                                            <div className="text-[10px] opacity-60 font-bold uppercase">{new Date(act.date).toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit' })} • {new Date(act.date).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}</div>
                                        </div>
                                    </div>
                                    <ChevronRight size={18} className="text-slate-300"/>
                                </div>
                                <div className="flex justify-between items-end mt-4">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gesamtmenge</div>
                                    <div className="text-2xl font-black text-slate-900">{act.amount} <span className="text-sm font-bold text-slate-500">{act.unit}</span></div>
                                </div>
                            </div>
                        );
                    })
                )}
           </div>
       </div>

       {/* DETAIL-OVERLAYS */}
       {selectedActivity && <ActivityDetailView activity={selectedActivity} onClose={() => setSelectedActivity(null)} onUpdate={load} />}
       {selectedStorage && <StorageDetailView storage={selectedStorage} onClose={() => setSelectedStorage(null)} />}
    </div>
  );
};
