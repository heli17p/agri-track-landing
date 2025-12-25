
import React, { useEffect, useState, useMemo } from 'react';
import { dbService } from '../services/db';
import { ActivityRecord, FarmProfile, ActivityType, HarvestType, FertilizerType, TillageType, AppSettings, DEFAULT_SETTINGS, StorageLocation } from '../types';
import { Download, Cloud, RefreshCw, List, ChevronRight, Truck, Wheat, Hammer, Filter, ArrowUp, ArrowDown, Calendar, CheckCircle, Droplets, Layers, AlertTriangle, Calculator, Sprout, ShoppingBag, MessageSquare } from 'lucide-react';
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

  // Filter & Sort State
  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear());
  const [filterType, setFilterType] = useState<'All' | ActivityType>('All');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const load = async () => {
    // Note: We don't set loading=true here to avoid flickering on background updates
    const acts = await dbService.getActivities();
    setActivities(acts);
    
    setFields(await dbService.getFields());
    setStorages(await dbService.getStorageLocations());

    const profiles = await dbService.getFarmProfile();
    if (profiles.length) setProfile(profiles[0]);
    
    const s = await dbService.getSettings();
    setSettings(s);

    // Check for sync timestamp
    const storedSync = localStorage.getItem('lastSyncSuccess');
    if (storedSync) setLastSyncTime(storedSync);

    if (loading) setLoading(false);
  };

  useEffect(() => { 
      load(); 
      
      // 1. Listen to Sync Completion (Updates timestamp UI and data)
      const unsubscribeSync = dbService.onSyncComplete(() => {
          load();
      });

      // 2. Listen to ANY Database Change (Updates storage growth, local edits, etc.)
      const unsubscribeDb = dbService.onDatabaseChange(() => {
          load();
      });

      return () => {
          unsubscribeSync();
          unsubscribeDb();
      }
  }, []);

  // Compute available years from data
  const availableYears = useMemo(() => {
      const years = new Set(activities.map(a => a.year));
      years.add(new Date().getFullYear());
      return Array.from(years).sort((a, b) => b - a);
  }, [activities]);

  // Dynamic Total Area Calculation based on actual fields
  const totalArea = useMemo(() => {
      return fields.reduce((sum, f) => sum + (f.areaHa || 0), 0);
  }, [fields]);

  // Calculate Year Statistics (Independent of Type Filter)
  const yearStats = useMemo(() => {
      const stats = {
          slurryVol: 0,
          manureVol: 0,
          hayCount: 0,
          silageCount: 0,
          strawCount: 0,
          harrowHa: 0,
          mulchHa: 0,
          weederHa: 0,
          reseedHa: 0
      };

      const yearActivities = activities.filter(a => a.year === filterYear);

      yearActivities.forEach(act => {
          // Fertilizer
          if (act.type === ActivityType.FERTILIZATION) {
              if (act.fertilizerType === FertilizerType.MANURE) {
                  stats.manureVol += act.amount || 0;
              } else {
                  stats.slurryVol += act.amount || 0;
              }
          }
          // Harvest
          else if (act.type === ActivityType.HARVEST) {
              const type = act.tillageType || '';
              const notes = act.notes || '';
              if (type.includes(HarvestType.HAY) || notes.includes(HarvestType.HAY)) {
                  stats.hayCount += act.amount || 0;
              } else if (type.includes(HarvestType.STRAW) || notes.includes(HarvestType.STRAW)) {
                  stats.strawCount += act.amount || 0;
              } else if (type.includes(HarvestType.SILAGE) || notes.includes(HarvestType.SILAGE) || type === "") {
                  // Nur als Silage zählen, wenn explizit Silage gewählt oder Typ leer (Fallback für Altdaten)
                  stats.silageCount += act.amount || 0;
              }
          }
          // Tillage
          else if (act.type === ActivityType.TILLAGE) {
              const amount = act.amount || 0;
              if (act.tillageType === TillageType.HARROW) stats.harrowHa += amount;
              else if (act.tillageType === TillageType.MULCH) stats.mulchHa += amount;
              else if (act.tillageType === TillageType.WEEDER) stats.weederHa += amount;
              else if (act.tillageType === TillageType.RESEEDING) stats.reseedHa += amount;
              else stats.harrowHa += amount; // Fallback
          }
      });

      return stats;
  }, [activities, filterYear]);

  // Apply Filters and Sort for the LIST
  const filteredActivities = useMemo(() => {
      return activities
        .filter(a => {
            const yearMatch = a.year === filterYear;
            const typeMatch = filterType === 'All' || a.type === filterType;
            return yearMatch && typeMatch;
        })
        .sort((a, b) => {
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });
  }, [activities, filterYear, filterType, sortOrder]);

  const generatePDF = () => {
    const doc = new jsPDF();

    // Header
    doc.setFontSize(18);
    doc.text(`Tätigkeitsnachweis ${filterYear}`, 14, 20);
    
    doc.setFontSize(10);
    doc.text(`Betrieb: ${profile?.operatorName || '-'}`, 14, 30);
    doc.text(`Betriebsnummer: ${profile?.farmId || '-'}`, 14, 35);
    doc.text(`Erstellt am: ${new Date().toLocaleDateString('de-AT')}`, 14, 40);
    doc.text(`Gesamtfläche: ${totalArea.toFixed(2)} ha`, 14, 45);
    
    // Add Stats Summary to PDF
    doc.setFontSize(12);
    doc.text("Jahreszusammenfassung:", 14, 55);
    doc.setFontSize(9);
    let yPos = 62;
    if(yearStats.slurryVol > 0) { doc.text(`- Gülle gesamt: ${yearStats.slurryVol} m³ (${(yearStats.slurryVol/totalArea).toFixed(2)} m³/ha)`, 14, yPos); yPos += 5; }
    if(yearStats.manureVol > 0) { doc.text(`- Mist gesamt: ${yearStats.manureVol} m³ (${(yearStats.manureVol/totalArea).toFixed(2)} m³/ha)`, 14, yPos); yPos += 5; }
    if(yearStats.silageCount > 0) { doc.text(`- Silageballen: ${yearStats.silageCount} Stk`, 14, yPos); yPos += 5; }
    if(yearStats.hayCount > 0) { doc.text(`- Heuballen: ${yearStats.hayCount} Stk`, 14, yPos); yPos += 5; }
    if(yearStats.strawCount > 0) { doc.text(`- Strohballen: ${yearStats.strawCount} Stk`, 14, yPos); yPos += 5; }
    
    // Tillage Stats in PDF
    if(yearStats.harrowHa > 0) { doc.text(`- Wiesenegge gesamt: ${yearStats.harrowHa.toFixed(2)} ha`, 14, yPos); yPos += 5; }
    if(yearStats.mulchHa > 0) { doc.text(`- Schlegeln gesamt: ${yearStats.mulchHa.toFixed(2)} ha`, 14, yPos); yPos += 5; }
    if(yearStats.weederHa > 0) { doc.text(`- Striegel gesamt: ${yearStats.weederHa.toFixed(2)} ha`, 14, yPos); yPos += 5; }
    if(yearStats.reseedHa > 0) { doc.text(`- Nachsaat gesamt: ${yearStats.reseedHa.toFixed(2)} ha`, 14, yPos); yPos += 5; }

    // Table
    if (filterType !== 'All') {
        doc.text(`Filter: ${filterType}`, 14, yPos + 5);
        yPos += 5;
    }

    // Prepare data from FILTERED list
    const exportData = filteredActivities.map(act => {
            const date = new Date(act.date).toLocaleDateString('de-AT');
            const involvedFieldsList = fields.filter(f => act.fieldIds.includes(f.id));
            let involvedFieldNames = involvedFieldsList.map(f => {
                let suffix = '';
                if (act.fieldDistribution && act.fieldDistribution[f.id]) {
                    suffix = ` (${act.fieldDistribution[f.id]} ${act.unit})`;
                }
                return f.usage ? `${f.name} (${f.usage})${suffix}` : `${f.name}${suffix}`;
            }).join(', ');
            
            const isZukauf = act.notes?.toLowerCase().includes('zukauf');
            if (involvedFieldNames === '' && isZukauf) {
                involvedFieldNames = 'Zukauf (Keine Fläche)';
            } else if (!involvedFieldNames && act.fieldIds.length > 0) {
                 involvedFieldNames = '(Gelöschte Felder)';
            }

            let typeLabel: string = act.type;
            if (act.type === ActivityType.HARVEST) {
                // Dynamische Bezeichnung nutzen
                const type = act.tillageType || 'Silage';
                typeLabel = isZukauf ? `Zukauf - ${type}` : `Ernte - ${type}`;
            } else if (act.type === ActivityType.FERTILIZATION) {
                 typeLabel = act.fertilizerType === FertilizerType.MANURE ? "Düngung - Mist" : "Düngung - Gülle";
            } else if (act.type === ActivityType.TILLAGE) {
                 typeLabel = act.tillageType || "Bodenbearbeitung";
            }

            let amount = `${act.amount} ${act.unit}`;
            if (act.loadCount) { amount += ` (${act.loadCount} Fuhren)`; }

            return [date, involvedFieldNames, typeLabel, amount, act.notes || ''];
        });

    autoTable(doc, {
        startY: yPos + 10,
        head: [['Datum', 'Schlag (Feldstück)', 'Maßnahme / Kultur', 'Menge', 'Anmerkung']],
        body: exportData,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [22, 163, 74] },
        columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 50 }, 2: { cellWidth: 35 }, 3: { cellWidth: 30 }, 4: { cellWidth: 'auto' } }
    });
    
    doc.save(`Tätigkeitsnachweis_${filterYear}_${profile?.farmId || 'Betrieb'}.pdf`);
  };

  const handleSync = async () => {
    try {
        setLoading(true);
        await syncData();
        await load();
        setShowSyncSuccess(true);
        setTimeout(() => setShowSyncSuccess(false), 2000);
    } catch (e) {
        alert('Sync fehlgeschlagen. Offline?');
    } finally {
        setLoading(false);
    }
  }

  const getActivityStyle = (act: ActivityRecord) => {
    let label = act.type === ActivityType.HARVEST ? 'Ernte' : act.type === ActivityType.TILLAGE ? 'Bodenbearbeitung' : 'Düngung';
    let colorClass = 'border-slate-500';
    let bgClass = 'bg-slate-50';
    let textClass = 'text-slate-800';
    let Icon = Wheat;

    if (act.type === ActivityType.HARVEST) {
        Icon = Wheat;
        const type = act.tillageType || '';
        const notes = act.notes || '';
        const isZukauf = notes.toLowerCase().includes('zukauf');

        if (isZukauf) {
            label = `Zukauf: ${type || 'Erntegut'}`;
            colorClass = 'border-blue-400';
            bgClass = 'bg-blue-50';
            textClass = 'text-blue-800';
            Icon = ShoppingBag;
        } else if (type.includes(HarvestType.HAY) || notes.includes(HarvestType.HAY)) {
            label = 'Heu Ernte';
            colorClass = 'border-yellow-400';
            bgClass = 'bg-yellow-50';
            textClass = 'text-yellow-800';
        } else if (type.includes(HarvestType.STRAW) || notes.includes(HarvestType.STRAW)) {
            label = 'Stroh Ernte';
            colorClass = 'border-amber-400';
            bgClass = 'bg-amber-50';
            textClass = 'text-amber-800';
        } else if (type !== "") {
            // Jedes andere Erntegut (wie Hackgut) dynamisch anzeigen
            label = `${type} Ernte`;
            colorClass = 'border-lime-600';
            bgClass = 'bg-lime-50';
            textClass = 'text-lime-900';
        } else {
            label = 'Silage Ernte';
            colorClass = 'border-lime-500';
            bgClass = 'bg-lime-50';
            textClass = 'text-lime-800';
        }
    } else if (act.type === ActivityType.FERTILIZATION) {
        Icon = Truck;
        if (act.fertilizerType === FertilizerType.MANURE) {
            label = 'Mist Ausbringung';
            colorClass = 'border-orange-500';
            bgClass = 'bg-orange-50';
            textClass = 'text-orange-800';
        } else {
            label = 'Gülle Ausbringung';
            colorClass = 'border-amber-900';
            bgClass = 'bg-amber-50';
            textClass = 'text-amber-900';
        }
    } else if (act.type === ActivityType.TILLAGE) {
        Icon = Hammer;
        label = act.tillageType || 'Bodenbearbeitung';
        colorClass = 'border-blue-500';
        bgClass = 'bg-blue-50';
        textClass = 'text-blue-800';

        if (act.tillageType === TillageType.MULCH) { 
             colorClass = 'border-indigo-500';
             bgClass = 'bg-indigo-50';
             textClass = 'text-indigo-800';
        } else if (act.tillageType === TillageType.WEEDER) { 
             colorClass = 'border-sky-400';
             bgClass = 'bg-sky-50';
             textClass = 'text-sky-800';
        } else if (act.tillageType === TillageType.RESEEDING) { 
             colorClass = 'border-teal-500';
             bgClass = 'bg-teal-50';
             textClass = 'text-teal-800';
        }
    }
    return { label, colorClass, bgClass, textClass, Icon };
  };

  const getSmartDateHeader = (dateStr: string) => {
      const date = new Date(dateStr);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);
      if (date.toDateString() === today.toDateString()) return 'Heute';
      if (date.toDateString() === yesterday.toDateString()) return 'Gestern';
      return date.toLocaleDateString('de-AT', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div className="bg-slate-50 h-full overflow-y-auto pb-24 scroll-smooth relative">
       {showSyncSuccess && (
           <div className="absolute top-16 left-1/2 transform -translate-x-1/2 bg-green-600/90 backdrop-blur text-white px-4 py-2 rounded-full shadow-xl z-50 flex items-center animate-in fade-in slide-in-from-top-4 duration-300">
               <CheckCircle size={18} className="mr-2"/> 
               <span className="font-bold text-sm">Sync OK</span>
           </div>
       )}

       <div className="p-4 space-y-6">
           <div className="flex justify-between items-start">
               <div>
                   <div className="flex items-center space-x-3 mb-2">
                       <img 
                            src={getAppIcon(settings.appIcon || 'standard')} 
                            alt="Logo" 
                            className="w-12 h-12 rounded-xl shadow-sm border border-slate-200 object-contain bg-white" 
                       />
                       <div>
                           <h1 className="text-xl font-bold text-slate-800 leading-none">AgriTrack Austria</h1>
                           <p className="text-slate-500 text-xs font-medium mt-1">{profile?.operatorName || 'Kein Betrieb'}</p>
                       </div>
                   </div>
                   {lastSyncTime && (
                       <p className="text-[10px] text-slate-400 mt-2 flex items-center">
                           <CheckCircle size={10} className="mr-1"/> 
                           Sync: {new Date(lastSyncTime).toLocaleDateString('de-AT')} {new Date(lastSyncTime).toLocaleTimeString('de-AT', {hour: '2-digit', minute:'2-digit'})}
                       </p>
                   )}
               </div>
               <button onClick={handleSync} className="p-2 bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 shadow-sm mt-1">
                   {loading ? <RefreshCw className="animate-spin"/> : <Cloud />}
               </button>
           </div>
           
           <div className="flex items-center justify-between border-b border-slate-200 pb-2">
               <h2 className="text-lg font-bold text-slate-700">Übersicht</h2>
               <div className="relative">
                   <select 
                       value={filterYear} 
                       onChange={(e) => setFilterYear(parseInt(e.target.value))}
                       className="pl-8 pr-3 py-1 bg-slate-100 text-slate-700 rounded-lg text-sm font-bold border-none outline-none appearance-none"
                   >
                       {availableYears.map(y => (
                           <option key={y} value={y}>{y}</option>
                       ))}
                   </select>
                   <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
               </div>
           </div>

           <div className="grid grid-cols-2 gap-4">
                <div onClick={() => onNavigate('fields')} className="bg-white p-4 rounded-xl shadow-sm cursor-pointer hover:bg-green-50 transition-colors border border-transparent hover:border-green-100 group">
                    <div className="flex justify-between items-start mb-2"><div className="text-slate-500 text-xs uppercase font-bold">Fläche Ges.</div><List size={18} className="text-green-600" /></div>
                    <div className="text-2xl font-bold text-green-600 mb-1">{totalArea.toFixed(2)} ha</div>
                    <div className="text-xs text-green-700 font-medium flex items-center group-hover:underline">Felder verwalten <ChevronRight size={14} className="ml-1"/></div>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm"><div className="text-slate-500 text-xs uppercase font-bold">Einträge ({filterYear})</div><div className="text-2xl font-bold text-blue-600">{filteredActivities.length}</div></div>
           </div>

           {(yearStats.slurryVol > 0 || yearStats.manureVol > 0 || yearStats.silageCount > 0 || yearStats.hayCount > 0 || yearStats.strawCount > 0 || yearStats.harrowHa > 0 || yearStats.mulchHa > 0 || yearStats.weederHa > 0 || yearStats.reseedHa > 0) && (
               <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 space-y-4">
                   <h3 className="font-bold text-lg text-slate-800 flex items-center"><Calculator className="mr-2 text-slate-500" size={20}/> Jahresstatistik {filterYear}</h3>
                   
                   {/* DÜNGUNG */}
                   {(yearStats.slurryVol > 0 || yearStats.manureVol > 0) && (
                       <div className="space-y-3">
                           <div className="text-xs font-bold text-slate-400 uppercase border-b border-slate-100 pb-1">Wirtschaftsdünger</div>
                           <div className="grid grid-cols-2 gap-3">
                               {yearStats.slurryVol > 0 && (
                                   <div className="bg-amber-50 p-3 rounded-lg border border-amber-100">
                                       <div className="flex items-center text-amber-900 text-xs font-bold mb-1"><Droplets size={12} className="mr-1"/> Gülle</div>
                                       <div className="text-lg font-bold text-amber-900">{yearStats.slurryVol.toFixed(0)} m³</div>
                                       <div className="text-[10px] text-amber-700 font-medium">Ø {(totalArea > 0 ? yearStats.slurryVol / totalArea : 0).toFixed(1)} m³/ha</div>
                                   </div>
                               )}
                               {yearStats.manureVol > 0 && (
                                   <div className="bg-orange-50 p-3 rounded-lg border border-orange-100">
                                       <div className="flex items-center text-orange-900 text-xs font-bold mb-1"><Layers size={12} className="mr-1"/> Mist</div>
                                       <div className="text-lg font-bold text-orange-900">{yearStats.manureVol.toFixed(0)} m³</div>
                                       <div className="text-[10px] text-orange-700 font-medium">Ø {(totalArea > 0 ? yearStats.manureVol / totalArea : 0).toFixed(1)} m³/ha</div>
                                   </div>
                               )}
                           </div>
                       </div>
                   )}

                   {/* ERNTE */}
                   {(yearStats.silageCount > 0 || yearStats.hayCount > 0 || yearStats.strawCount > 0) && (
                       <div className="space-y-3 pt-2">
                           <div className="text-xs font-bold text-slate-400 uppercase border-b border-slate-100 pb-1">Ernteertrag</div>
                           <div className="grid grid-cols-2 gap-3">
                               {yearStats.silageCount > 0 && (
                                   <div className="bg-lime-50 p-3 rounded-lg border border-lime-100">
                                       <div className="flex items-center text-lime-800 text-xs font-bold mb-1"><Wheat size={12} className="mr-1"/> Silage</div>
                                       <div className="text-lg font-bold text-lime-900">{yearStats.silageCount} <span className="text-xs">Ballen</span></div>
                                   </div>
                               )}
                               {yearStats.hayCount > 0 && (
                                   <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100">
                                       <div className="flex items-center text-yellow-800 text-xs font-bold mb-1"><Wheat size={12} className="mr-1"/> Heu</div>
                                       <div className="text-lg font-bold text-yellow-900">{yearStats.hayCount} <span className="text-xs">Ballen</span></div>
                                   </div>
                               )}
                               {yearStats.strawCount > 0 && (
                                   <div className="bg-yellow-100 p-3 rounded-lg border border-yellow-200">
                                       <div className="flex items-center text-yellow-900 text-xs font-bold mb-1"><ShoppingBag size={12} className="mr-1"/> Stroh</div>
                                       <div className="text-lg font-bold text-yellow-900">{yearStats.strawCount} <span className="text-xs">Ballen</span></div>
                                   </div>
                               )}
                           </div>
                       </div>
                   )}

                   {/* BODENBEARBEITUNG */}
                   {(yearStats.harrowHa > 0 || yearStats.mulchHa > 0 || yearStats.weederHa > 0 || yearStats.reseedHa > 0) && (
                       <div className="space-y-3 pt-2">
                           <div className="text-xs font-bold text-slate-400 uppercase border-b border-slate-100 pb-1">Bodenbearbeitung</div>
                           <div className="grid grid-cols-2 gap-3">
                               {yearStats.harrowHa > 0 && (
                                   <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                                       <div className="flex items-center text-blue-800 text-xs font-bold mb-1"><Hammer size={12} className="mr-1"/> Egge</div>
                                       <div className="text-lg font-bold text-blue-900">{yearStats.harrowHa.toFixed(1)} <span className="text-xs">ha</span></div>
                                   </div>
                               )}
                               {yearStats.mulchHa > 0 && (
                                   <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                                       <div className="flex items-center text-indigo-800 text-xs font-bold mb-1"><Hammer size={12} className="mr-1"/> Mulchen</div>
                                       <div className="text-lg font-bold text-indigo-900">{yearStats.mulchHa.toFixed(1)} <span className="text-xs">ha</span></div>
                                   </div>
                               )}
                               {yearStats.weederHa > 0 && (
                                   <div className="bg-sky-50 p-3 rounded-lg border border-sky-100">
                                       <div className="flex items-center text-sky-800 text-xs font-bold mb-1"><Hammer size={12} className="mr-1"/> Striegel</div>
                                       <div className="text-lg font-bold text-sky-900">{yearStats.weederHa.toFixed(1)} <span className="text-xs">ha</span></div>
                                   </div>
                               )}
                               {yearStats.reseedHa > 0 && (
                                   <div className="bg-teal-50 p-3 rounded-lg border border-teal-100">
                                       <div className="flex items-center text-teal-800 text-xs font-bold mb-1"><Sprout size={12} className="mr-1"/> Nachsaat</div>
                                       <div className="text-lg font-bold text-teal-900">{yearStats.reseedHa.toFixed(1)} <span className="text-xs">ha</span></div>
                                   </div>
                               )}
                           </div>
                       </div>
                   )}
               </div>
           )}

           {storages.length > 0 && (
             <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 space-y-3">
               <div className="flex justify-between items-center"><h3 className="font-bold text-lg text-slate-800">Lagerstände (Aktuell)</h3><span className="text-xs text-slate-400 font-medium cursor-pointer hover:text-blue-500" onClick={() => onNavigate('settings')}>Verwalten</span></div>
               <div className="grid grid-cols-1 gap-3">
                   {storages.map(s => {
                       const percent = s.capacity > 0 ? Math.min(100, (s.currentLevel / s.capacity) * 100) : 0;
                       const isFull = percent >= 90;
                       const isWarning = percent >= 75 && !isFull;
                       const barColor = isFull ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-green-500';
                       const textColor = isFull ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-slate-600';
                       return (
                           <div key={s.id} onClick={() => setSelectedStorage(s)} className="border border-slate-100 rounded-lg p-3 cursor-pointer hover:bg-slate-50 transition-colors">
                               <div className="flex justify-between items-center mb-1"><div className="flex items-center space-x-2">{s.type === FertilizerType.SLURRY ? <Droplets size={14} className="text-slate-400"/> : <Layers size={14} className="text-slate-400"/>}<span className="font-bold text-sm text-slate-700">{s.name}</span></div><div className={`text-xs font-bold ${textColor}`}>{percent.toFixed(0)}%{isFull && <AlertTriangle size={12} className="inline ml-1 mb-0.5"/>}</div></div>
                               <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden"><div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${percent}%` }}></div></div>
                               <div className="flex justify-between mt-1 text-[10px] text-slate-400 font-medium"><span>{s.currentLevel.toFixed(1)} m³</span><span>{s.capacity.toFixed(0)} m³ Max</span></div>
                           </div>
                       )
                   })}
               </div>
             </div>
           )}

           <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 space-y-3">
               <h3 className="font-bold text-lg text-slate-800">Tätigkeiten Liste</h3>
               <div className="flex space-x-2 overflow-x-auto pb-1 hide-scrollbar">
                    <button onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')} className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200">{sortOrder === 'desc' ? <ArrowDown size={18}/> : <ArrowUp size={18}/>}</button>
                    <button onClick={() => setFilterType('All')} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${filterType === 'All' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}>Alle</button>
                    <button onClick={() => setFilterType(ActivityType.HARVEST)} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${filterType === ActivityType.HARVEST ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-500'}`}>Ernte</button>
                    <button onClick={() => setFilterType(ActivityType.FERTILIZATION)} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${filterType === ActivityType.FERTILIZATION ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-500'}`}>Düngung</button>
                    <button onClick={() => setFilterType(ActivityType.TILLAGE)} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${filterType === ActivityType.TILLAGE ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>Boden</button>
               </div>
           </div>

           <div className="space-y-3">
                {filteredActivities.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 bg-white rounded-xl border border-slate-100 border-dashed"><Filter size={32} className="mx-auto mb-2 opacity-50"/><p>Keine Einträge für diese Auswahl.</p></div>
                ) : (
                    filteredActivities.map((act, index) => {
                        const style = getActivityStyle(act);
                        const involvedFields = fields.filter(f => act.fieldIds.includes(f.id));
                        const totalAreaValue = involvedFields.reduce((sum, f) => sum + f.areaHa, 0);
                        const currentDateStr = new Date(act.date).toDateString();
                        const prevDateStr = index > 0 ? new Date(filteredActivities[index - 1].date).toDateString() : null;
                        const showHeader = currentDateStr !== prevDateStr;

                        return (
                            <React.Fragment key={act.id}>
                                {showHeader && (
                                    <div className="relative flex items-center justify-center mt-6 mb-3">
                                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-300/50"></div></div>
                                        <span className="relative bg-slate-200 text-slate-700 px-3 py-1 rounded-full text-xs font-bold border border-slate-300 shadow-sm uppercase tracking-wide z-10">{getSmartDateHeader(act.date)}</span>
                                    </div>
                                )}
                                <div onClick={() => setSelectedActivity(act)} className={`p-3 rounded-lg shadow-sm border-l-4 cursor-pointer hover:bg-white transition-all ${style.colorClass} ${style.bgClass}`}>
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center space-x-2"><style.Icon size={16} className={style.textClass} /><span className={`font-bold text-sm ${style.textClass}`}>{style.label}</span></div>
                                        <span className="text-xs text-slate-500 font-medium">{new Date(act.date).toLocaleTimeString('de-AT', {hour: '2-digit', minute:'2-digit'})}</span>
                                    </div>
                                    <div className="space-y-1 mb-2 pl-6 border-l border-black/5">
                                        {involvedFields.length > 0 ? involvedFields.slice(0, 3).map(f => {
                                            let detailText = `${f.areaHa.toFixed(2)} ha`;
                                            if (act.type === ActivityType.HARVEST && act.amount && totalAreaValue > 0) {
                                                const share = (f.areaHa / totalAreaValue) * act.amount;
                                                detailText = `${share.toFixed(1)} ${act.unit}`;
                                            }
                                            if (act.fieldDistribution && act.fieldDistribution[f.id]) {
                                                detailText = `${act.fieldDistribution[f.id]} ${act.unit}`;
                                            }
                                            return (<div key={f.id} className="flex justify-between text-xs text-slate-600"><div className="flex flex-col truncate max-w-[150px]"><span className="font-medium">{f.name}</span>{f.usage && <span className="text-[10px] text-slate-400">{f.usage}</span>}</div><span className="font-medium bg-white/50 px-1 rounded h-fit">{detailText}</span></div>);
                                        }) : (act.notes?.toLowerCase().includes('zukauf') ? (<span className="text-xs italic text-slate-500">Zukauf (Keine Felder)</span>) : (<span className="text-xs italic text-slate-400">Gelöschte Felder</span>))}
                                        {involvedFields.length > 3 && (<div className="text-xs text-slate-400 italic pl-1">+ {involvedFields.length - 3} weitere</div>)}
                                    </div>
                                    {act.notes && act.notes.trim() !== "" && (<div className="mt-2 mb-2 pl-6"><div className="flex items-start text-[10px] text-slate-500 italic bg-white/40 p-1.5 rounded-lg border border-black/5"><MessageSquare size={10} className="mr-1.5 mt-0.5 shrink-0 text-slate-400"/><span className="line-clamp-2">{act.notes}</span></div></div>)}
                                    <div className="border-t border-slate-200/50 pt-2 flex justify-end items-center"><span className="text-xs text-slate-500 mr-2 uppercase font-bold">Gesamt</span><div className="text-right"><div className="font-bold text-slate-800">{act.amount} {act.unit}</div>{act.loadCount && act.loadCount > 0 && (<div className="text-xs text-slate-500 font-medium">({act.loadCount} Fuhren)</div>)}</div></div>
                                </div>
                            </React.Fragment>
                        );
                    })
                )}
           </div>

           <button onClick={generatePDF} className="w-full bg-slate-800 text-white py-3 rounded-xl flex items-center justify-center font-semibold shadow-lg hover:bg-slate-900 transition"><Download className="mr-2" size={20}/> Bericht {filterYear} Exportieren (PDF)</button>
       </div>
       {selectedActivity && (<ActivityDetailView activity={selectedActivity} onClose={() => setSelectedActivity(null)} onUpdate={load} />)}
       {selectedStorage && (<StorageDetailView storage={selectedStorage} onClose={() => setSelectedStorage(null)} />)}
    </div>
  );
};

