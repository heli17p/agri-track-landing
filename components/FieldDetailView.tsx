
import React, { useEffect, useState, useMemo } from 'react';
import { X, Calendar, Leaf, Ruler, MapPin, Palette, Map as MapIcon, Save, Trash2, AlertTriangle, Truck, Wheat, Hammer, FileText, Database, Filter, Droplets, Layers, Edit2, Tag, Check } from 'lucide-react';
import { Field, ActivityRecord, ActivityType, FertilizerType, HarvestType, TillageType, StorageLocation } from '../types';
import { dbService } from '../services/db';
import { ActivityDetailView } from './ActivityDetailView';

interface Props {
  field: Field;
  onClose: () => void;
  onEditGeometry?: (field: Field) => void;
  onDelete?: (id: string) => Promise<void>;
  onUpdate?: () => void;
}

const SLURRY_PALETTE = ['#451a03', '#78350f', '#92400e', '#b45309', '#854d0e'];
const MANURE_PALETTE = ['#d97706', '#ea580c', '#f59e0b', '#c2410c', '#fb923c'];

// Vordefinierte Farben für die Schlag-Markierung
const FIELD_COLORS = [
    { label: 'Standard', value: undefined }, // Nutzt Logik basierend auf Typ
    { label: 'Grünland', value: '#15803D' },
    { label: 'Acker', value: '#92400E' },
    { label: 'Wiese hell', value: '#84CC16' },
    { label: 'Weide', value: '#65a30d' },
    { label: 'Mais/Getreide', value: '#EAB308' },
    { label: 'Spezial', value: '#2563eb' },
    { label: 'Achtung', value: '#ef4444' },
];

const getStorageColor = (storageId: string | undefined, allStorages: StorageLocation[]) => {
    if (!storageId) return '#78350f'; 
    const storage = allStorages.find(s => s.id === storageId);
    if (!storage) return '#64748b';
    const sameTypeStorages = allStorages.filter(s => s.type === storage.type).sort((a, b) => a.id.localeCompare(b.id));
    const index = sameTypeStorages.findIndex(s => s.id === storageId);
    const safeIndex = Math.max(0, index);
    return storage.type === FertilizerType.SLURRY ? SLURRY_PALETTE[safeIndex % SLURRY_PALETTE.length] : MANURE_PALETTE[safeIndex % MANURE_PALETTE.length];
};

export const FieldDetailView: React.FC<Props> = ({ field, onClose, onEditGeometry, onDelete, onUpdate }) => {
  const [history, setHistory] = useState<ActivityRecord[]>([]);
  const [allFields, setAllFields] = useState<Field[]>([]);
  const [storages, setStorages] = useState<StorageLocation[]>([]);
  const [editedField, setEditedField] = useState<Field>({ ...field });
  const [isDirty, setIsDirty] = useState(false);
  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm'>('idle');
  const [selectedActivity, setSelectedActivity] = useState<ActivityRecord | null>(null);
  const [filterYear, setFilterYear] = useState<number | 'all'>('all');
  const [filterType, setFilterType] = useState<ActivityType | 'all'>('all');

  const loadHistory = async () => {
      if (field.id) {
          const activities = await dbService.getActivitiesForField(field.id);
          setHistory(activities);
      }
  };

  useEffect(() => {
    const loadData = async () => {
      if (field.id) {
          await loadHistory();
          setAllFields(await dbService.getFields());
          setStorages(await dbService.getStorageLocations());
      }
    };
    loadData();
    setEditedField({ ...field });
    setIsDirty(false);
    setDeleteStep('idle');
  }, [field.id]);

  const handleChange = (key: keyof Field, value: any) => {
    setEditedField(prev => {
        const next = { ...prev, [key]: value };
        setIsDirty(true);
        return next;
    });
  };

  const handleSave = async () => {
    await dbService.saveField(editedField);
    setIsDirty(true); // Verhindert Schließen ohne Rückmeldung wenn gewünscht, aber hier setzen wir Dirty zurück
    setIsDirty(false);
    if (onUpdate) onUpdate();
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (!onDelete) return;
      if (deleteStep === 'idle') setDeleteStep('confirm');
      else onDelete(field.id);
  };

  const getActivityStyle = (act: ActivityRecord) => {
    let label = act.type === ActivityType.HARVEST ? 'Ernte' : act.type === ActivityType.TILLAGE ? 'Bodenbearbeitung' : 'Düngung';
    let colorClass = 'border-slate-500';
    let bgClass = 'bg-slate-50';
    let textClass = 'text-slate-800';
    let Icon = Wheat;

    if (act.type === ActivityType.HARVEST) {
        Icon = Wheat;
        if (act.notes?.includes(HarvestType.HAY)) { label = 'Heu Ernte'; colorClass = 'border-yellow-400'; bgClass = 'bg-yellow-50'; textClass = 'text-yellow-800'; }
        else { label = 'Silage Ernte'; colorClass = 'border-lime-500'; bgClass = 'bg-lime-50'; textClass = 'text-lime-800'; }
    } else if (act.type === ActivityType.FERTILIZATION) {
        Icon = Truck;
        if (act.fertilizerType === FertilizerType.MANURE) { label = 'Mist Ausbringung'; colorClass = 'border-orange-500'; bgClass = 'bg-orange-50'; textClass = 'text-orange-800'; }
        else { label = 'Gülle Ausbringung'; colorClass = 'border-amber-900'; bgClass = 'bg-amber-50'; textClass = 'text-amber-900'; }
    } else if (act.type === ActivityType.TILLAGE) {
        Icon = Hammer;
        label = act.tillageType || 'Bodenbearbeitung';
        colorClass = 'border-blue-500'; bgClass = 'bg-blue-50'; textClass = 'text-blue-800';
    }
    return { label, colorClass, bgClass, textClass, Icon };
  };

  const availableYears = useMemo(() => {
      const years = new Set(history.map(a => a.year));
      return Array.from(years).sort((a, b) => b - a);
  }, [history]);

  const filteredHistory = useMemo(() => {
      return history.filter(act => {
          const yearMatch = filterYear === 'all' || act.year === filterYear;
          const typeMatch = filterType === 'all' || act.type === filterType;
          return yearMatch && typeMatch;
      });
  }, [history, filterYear, filterType]);

  // Aktuelle Kopfzeilen-Farbe bestimmen
  const currentHeaderColor = editedField.color || (editedField.type === 'Acker' ? '#92400E' : '#15803D');

  return (
    <div className="fixed inset-0 z-[1000] flex justify-end" onClick={() => setDeleteStep('idle')}>
      <div className="absolute inset-0 bg-black/30" onClick={(e) => { e.stopPropagation(); onClose(); }} />
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-slide-right" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-4 text-white flex justify-between items-center shrink-0 transition-all shadow-sm z-10" style={{ backgroundColor: currentHeaderColor }}>
          <div className="flex-1 mr-4">
             <input type="text" value={editedField.name} onChange={(e) => handleChange('name', e.target.value)} className="w-full bg-transparent border-b border-white/30 text-xl font-bold text-white placeholder-white/70 focus:outline-none focus:border-white"/>
             <div className="text-white/80 text-sm flex items-center mt-1"><Leaf size={14} className="mr-1"/> <select value={editedField.type} onChange={(e) => handleChange('type', e.target.value)} className="bg-transparent border-none text-white text-sm focus:ring-0 cursor-pointer p-0"><option value="Grünland" className="text-slate-800">Grünland</option><option value="Acker" className="text-slate-800">Acker</option></select></div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-black/20 rounded-full transition-colors"><X size={24} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-50">
          {/* Geometrie & Infos */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                <div className="flex items-center text-slate-500 mb-1 text-xs uppercase font-bold"><Ruler size={14} className="mr-1" /> Fläche (ha)</div>
                <input type="number" step="0.01" value={editedField.areaHa} onChange={(e) => handleChange('areaHa', parseFloat(e.target.value))} className="w-full bg-transparent text-2xl font-bold text-slate-800 focus:outline-none border-b border-transparent focus:border-green-500" readOnly/>
            </div>
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                <div className="flex items-center text-slate-500 mb-1 text-xs uppercase font-bold"><MapPin size={14} className="mr-1" /> Nutzung</div>
                <input type="text" value={editedField.usage || ''} onChange={(e) => handleChange('usage', e.target.value)} className="w-full bg-transparent text-lg font-bold text-slate-800 focus:outline-none border-b border-transparent focus:border-green-500"/>
            </div>
          </div>

          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
              <div className="flex items-center text-slate-500 mb-1 text-xs uppercase font-bold"><Tag size={14} className="mr-1" /> Codes (eAMA / Referenz)</div>
              <input 
                type="text" 
                value={editedField.codes || ''} 
                onChange={(e) => handleChange('codes', e.target.value)} 
                className="w-full bg-transparent text-lg font-bold text-slate-800 focus:outline-none border-b border-transparent focus:border-blue-500"
                placeholder="Noch kein Code hinterlegt"
              />
          </div>

          {/* FARBAUSWAHL - NEU */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center text-slate-500 mb-3 text-xs uppercase font-bold"><Palette size={14} className="mr-1" /> Farbe auf Karte</div>
              <div className="flex flex-wrap gap-3">
                  {FIELD_COLORS.map((col) => (
                      <button
                        key={col.label}
                        onClick={() => handleChange('color', col.value)}
                        className={`w-10 h-10 rounded-full border-4 flex items-center justify-center transition-all ${editedField.color === col.value ? 'border-slate-300 scale-110 shadow-md' : 'border-transparent hover:scale-105'}`}
                        style={{ backgroundColor: col.value || (editedField.type === 'Acker' ? '#92400E' : '#15803D') }}
                        title={col.label}
                      >
                          {editedField.color === col.value && <Check size={18} className="text-white" />}
                          {!col.value && !editedField.color && <Check size={18} className="text-white" />}
                      </button>
                  ))}
              </div>
          </div>

          <button 
            onClick={() => onEditGeometry && onEditGeometry(editedField)}
            className="w-full py-4 bg-blue-50 text-blue-700 border-2 border-blue-200 rounded-2xl font-black flex items-center justify-center hover:bg-blue-100 transition-all shadow-sm group"
          >
              <MapIcon size={20} className="mr-2 group-hover:scale-110 transition-transform"/>
              Geometrie auf Karte bearbeiten
          </button>

          {field.detailedSources && Object.keys(field.detailedSources).length > 0 && (
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                  <h3 className="font-bold text-slate-700 text-sm flex items-center"><Database size={16} className="mr-2 text-amber-600"/> Dünger-Herkunft (Gesamt)</h3>
                  <div className="space-y-2">
                      {Object.entries(field.detailedSources).map(([sId, amount]) => {
                          const store = storages.find(s => s.id === sId);
                          const color = getStorageColor(sId, storages);
                          return (
                              <div key={sId} className="flex justify-between items-center p-2 bg-slate-50 rounded-lg border border-slate-100">
                                  <div className="flex items-center text-xs font-bold text-slate-600">
                                      <span className="w-2.5 h-2.5 rounded-full mr-2" style={{backgroundColor: color}}></span>
                                      {store?.name || 'Unbekanntes Lager'}
                                  </div>
                                  <span className="font-black text-slate-800 text-xs">{amount.toFixed(1)} m³</span>
                              </div>
                          );
                      })}
                  </div>
              </div>
          )}

          {/* Aktivitäten-Historie */}
          <div className="pt-2">
            <div className="flex justify-between items-center mb-3"><h3 className="font-bold text-lg flex items-center text-slate-700"><Calendar size={20} className="mr-2 text-green-600"/> Aktivitäten</h3></div>
            <div className="flex space-x-2 mb-4">
                <div className="relative flex-1"><select value={filterYear} onChange={(e) => setFilterYear(e.target.value === 'all' ? 'all' : parseInt(e.target.value))} className="w-full pl-8 pr-2 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 appearance-none focus:outline-none focus:ring-2 focus:ring-green-500"><option value="all">Alle Jahre</option>{availableYears.map(y => (<option key={y} value={y}>{y}</option>))}</select><Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} /></div>
                <div className="relative flex-1"><select value={filterType} onChange={(e) => setFilterType(e.target.value as any)} className="w-full pl-8 pr-2 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 appearance-none focus:outline-none focus:ring-2 focus:ring-green-500"><option value="all">Alle Typen</option><option value={ActivityType.FERTILIZATION}>Düngung</option><option value={ActivityType.HARVEST}>Ernte</option><option value={ActivityType.TILLAGE}>Boden</option></select><Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} /></div>
            </div>
            
            <div className="space-y-3 pb-20">
              {filteredHistory.length === 0 ? <div className="text-center py-6 text-slate-400 italic text-sm border border-dashed border-slate-200 rounded-lg">Keine Aktivitäten.</div> : filteredHistory.map((act) => {
                  const style = getActivityStyle(act);
                  let amountHeader = null;
                  if (act.fieldDistribution && act.fieldDistribution[field.id]) {
                      amountHeader = <span className="font-bold text-slate-800">{act.fieldDistribution[field.id]} {act.unit}</span>;
                  }
                  return (
                    <div key={act.id} className="relative pl-4 border-l-2 border-slate-200 pb-2 last:pb-0">
                      <div className="absolute -left-[5px] top-4 w-2.5 h-2.5 rounded-full bg-slate-300"></div>
                      <div onClick={() => setSelectedActivity(act)} className={`p-3 rounded-lg shadow-sm border-l-4 cursor-pointer hover:bg-white transition-all ${style.colorClass} ${style.bgClass}`}>
                        <div className="flex justify-between items-start">
                           <div className="flex items-center space-x-2"><style.Icon size={16} className={style.textClass} /><div><span className={`font-bold text-sm ${style.textClass}`}>{style.label}</span><div className="text-xs text-slate-500">{new Date(act.date).toLocaleDateString('de-AT')}</div></div></div>
                           <div className="text-right">{amountHeader}</div>
                        </div>
                        {act.detailedFieldSources && act.detailedFieldSources[field.id] && (
                            <div className="mt-2 text-[10px] text-slate-500 border-t border-slate-200 pt-1 space-y-1">
                                {Object.entries(act.detailedFieldSources[field.id]).map(([sId, amount]) => {
                                    const store = storages.find(s => s.id === sId);
                                    const color = getStorageColor(sId, storages);
                                    return (
                                        <div key={sId} className="flex justify-between items-center">
                                            <div className="flex items-center"><span className="w-1.5 h-1.5 rounded-full mr-1.5" style={{backgroundColor: color}}></span><span>{store ? store.name : 'Unbekannt'}</span></div>
                                            <span className="font-bold text-slate-600">{amount} {act.unit}</span>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        <div className="p-4 pb-safe bg-white border-t border-slate-200 shrink-0 flex flex-col space-y-2 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
            {isDirty && <button onClick={handleSave} className="w-full py-3 bg-green-600 text-white rounded-xl font-bold flex items-center justify-center hover:bg-green-700 shadow-md transition-all"><Save size={20} className="mr-2"/> Speichern</button>}
            {onDelete && <button type="button" onClick={handleDeleteClick} className={`w-full py-3 border-2 rounded-xl font-bold flex items-center justify-center transition-all cursor-pointer select-none active:scale-[0.98] ${deleteStep === 'confirm' ? 'bg-red-600 border-red-600 text-white' : 'bg-white border-red-100 text-red-500 hover:bg-red-50 hover:border-red-200'}`}>{deleteStep === 'confirm' ? <><AlertTriangle size={20} className="mr-2"/> Wirklich unwiderruflich löschen?</> : <><Trash2 size={20} className="mr-2"/> Feld löschen</>}</button>}
        </div>
        {selectedActivity && <ActivityDetailView activity={selectedActivity} onClose={() => setSelectedActivity(null)} onUpdate={loadHistory} />}
      </div>
    </div>
  );
};

