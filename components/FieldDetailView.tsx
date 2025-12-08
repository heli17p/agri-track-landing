import React, { useEffect, useState, useMemo } from 'react';
import { X, Calendar, Leaf, Ruler, MapPin, Palette, Map as MapIcon, Save, Trash2, AlertTriangle, Truck, Wheat, Hammer, FileText, Database, Filter } from 'lucide-react';
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

// --- Color Helper (Shared) ---
// UPDATED: Removed Blue (#1d4ed8) to avoid conflict with Transit Track (#3b82f6)
const STORAGE_COLORS = ['#ea580c', '#be185d', '#7e22ce', '#374151', '#0f766e', '#15803d'];
const getStorageColor = (storageId: string | undefined) => {
    if (!storageId) return '#78350f'; // Default Brown (Legacy)
    const sum = storageId.split('').reduce((a,c) => a + c.charCodeAt(0), 0);
    return STORAGE_COLORS[sum % STORAGE_COLORS.length];
};

export const FieldDetailView: React.FC<Props> = ({ field, onClose, onEditGeometry, onDelete, onUpdate }) => {
  const [history, setHistory] = useState<ActivityRecord[]>([]);
  
  // Need all fields to calculate proportional shares for multi-field harvests (fallback logic)
  const [allFields, setAllFields] = useState<Field[]>([]);
  const [storages, setStorages] = useState<StorageLocation[]>([]);

  // Local state for editing
  const [editedField, setEditedField] = useState<Field>({ ...field });
  const [isDirty, setIsDirty] = useState(false);
  
  // 2-Step Delete State
  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm'>('idle');

  // Activity Edit State
  const [selectedActivity, setSelectedActivity] = useState<ActivityRecord | null>(null);

  // Filter State
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
          
          // Load all fields for calculations
          const fields = await dbService.getFields();
          setAllFields(fields);

          // Load storages to display source names
          const s = await dbService.getStorageLocations();
          setStorages(s);
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
    setIsDirty(false);
    if (onUpdate) onUpdate();
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
      // Stop ALL propagation immediately
      e.preventDefault();
      e.stopPropagation();

      if (!onDelete) return;

      if (!field.id) {
          alert("Fehler: ID fehlt. Bitte App neu laden.");
          return;
      }

      if (deleteStep === 'idle') {
          // First click: Arm the button
          setDeleteStep('confirm');
      } else {
          // Second click: Execute
          onDelete(field.id);
      }
  };

  // Reset delete step if user clicks elsewhere in the modal (on background of modal)
  const handleBackgroundClick = () => {
      if (deleteStep === 'confirm') setDeleteStep('idle');
  };
  
  // Logic to calculate share for this specific field
  const getAmountDisplay = (act: ActivityRecord) => {
      if (!act.amount) return null;

      // 1. Explicit Distribution (From GPS Tracking or Manual Entry with calc)
      if (act.fieldDistribution && act.fieldDistribution[field.id] !== undefined) {
           const count = act.fieldDistribution[field.id];
           
           // If m3, show m3/ha based strictly on this field's volume / area
           let suffix = "";
           if (act.unit === 'm³' && field.areaHa > 0) {
               const perHa = (count / field.areaHa).toFixed(1);
               suffix = ` (${perHa} m³/ha)`;
           }

           // Calculate loads for this field specifically
           // Loads = (Volume for Field / Total Volume) * Total Loads
           let loadStr = "";
           if (act.loadCount && act.amount && act.amount > 0) {
               const fieldLoads = (count / act.amount) * act.loadCount;
               // Round nicely (e.g. 10.0 -> 10, 10.5 -> 10.5)
               const formattedLoads = Number.isInteger(fieldLoads) ? fieldLoads.toFixed(0) : fieldLoads.toFixed(1);
               loadStr = `${formattedLoads} Fuhren`;
           }

           return (
              <div className="flex flex-col items-end">
                  {/* SHOW SPECIFIC AMOUNT ONLY - Replaced Total */}
                  <span className="font-bold text-slate-800">{count} {act.unit}{suffix}</span>
                  {loadStr && (
                       <span className="text-[10px] text-slate-600 font-normal">
                          {loadStr}
                       </span>
                  )}
              </div>
           );
      }
      
      // 2. Single Field Activity (The Total IS the Specific)
      if (act.fieldIds.length <= 1) {
          // Even if simple record, calculate m3/ha if possible
          let suffix = "";
           if (act.unit === 'm³' && field.areaHa > 0) {
               const perHa = (act.amount / field.areaHa).toFixed(1);
               suffix = ` (${perHa} m³/ha)`;
           }

          return (
              <div className="flex flex-col items-end">
                  <span className="font-bold text-slate-800">{act.amount.toFixed(1)} {act.unit}{suffix}</span>
                  {act.loadCount && (
                      <span className="text-[10px] text-slate-600 font-normal">
                          {act.loadCount} Fuhren
                      </span>
                  )}
              </div>
          );
      }
      
      // 3. Multi-field Fallback (Proportional Estimate if no distribution data exists)
      // Find all fields involved
      const involvedFields = allFields.filter(f => act.fieldIds.includes(f.id));
      const totalArea = involvedFields.reduce((sum, f) => sum + f.areaHa, 0);
      
      if (totalArea <= 0) return `${act.amount} ${act.unit}`; // Fallback if areas are 0

      // Calculate my share based on area proportion
      const myShare = (field.areaHa / totalArea) * act.amount;
      
      return (
          <div className="flex flex-col items-end">
              <span className="font-bold text-slate-800">{myShare.toFixed(1)} {act.unit} (Anteil)</span>
          </div>
      );
  };

  // Helper for Activity Styling (Consistent with Dashboard)
  const getActivityStyle = (act: ActivityRecord) => {
    let label = act.type === ActivityType.HARVEST ? 'Ernte' : act.type === ActivityType.TILLAGE ? 'Bodenbearbeitung' : 'Düngung';
    let colorClass = 'border-slate-500';
    let bgClass = 'bg-slate-50';
    let textClass = 'text-slate-800';
    let Icon = Wheat;

    if (act.type === ActivityType.HARVEST) {
        Icon = Wheat;
        const isHay = act.notes && act.notes.includes(HarvestType.HAY);
        if (isHay) {
            label = 'Heu Ernte';
            colorClass = 'border-yellow-400';
            bgClass = 'bg-yellow-50';
            textClass = 'text-yellow-800';
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
        
        // Default Blue
        colorClass = 'border-blue-500';
        bgClass = 'bg-blue-50';
        textClass = 'text-blue-800';

        // Specific Shades
        if (act.tillageType === TillageType.MULCH) { // Schlegeln (Indigo)
             colorClass = 'border-indigo-500';
             bgClass = 'bg-indigo-50';
             textClass = 'text-indigo-800';
        } else if (act.tillageType === TillageType.WEEDER) { // Striegeln (Sky)
             colorClass = 'border-sky-400';
             bgClass = 'bg-sky-50';
             textClass = 'text-sky-800';
        } else if (act.tillageType === TillageType.RESEEDING) { // Nachsaat (Teal)
             colorClass = 'border-teal-500';
             bgClass = 'bg-teal-50';
             textClass = 'text-teal-800';
        }
    }
    
    return { label, colorClass, bgClass, textClass, Icon };
  };

  // --- Filter Logic ---
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

  return (
    <div className="fixed inset-0 z-[1000] flex justify-end" onClick={handleBackgroundClick}>
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/30" 
        onClick={(e) => {
            e.stopPropagation();
            onClose();
        }}
      />

      {/* Slide-over Panel */}
      <div 
        className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-slide-right"
        onClick={(e) => e.stopPropagation()} // Stop clicks from closing modal or resetting delete logic incorrectly
      >
        
        {/* Header */}
        <div 
            className="p-4 text-white flex justify-between items-center shrink-0 transition-colors shadow-sm z-10"
            style={{ backgroundColor: editedField.color || (editedField.type === 'Acker' ? '#92400E' : '#15803D') }}
        >
          <div className="flex-1 mr-4">
             {/* Editable Title */}
             <input 
                type="text" 
                value={editedField.name} 
                onChange={(e) => handleChange('name', e.target.value)}
                className="w-full bg-transparent border-b border-white/30 text-xl font-bold text-white placeholder-white/70 focus:outline-none focus:border-white"
             />
             <div className="text-white/80 text-sm flex items-center mt-1">
               <Leaf size={14} className="mr-1"/> 
               <select 
                  value={editedField.type} 
                  onChange={(e) => handleChange('type', e.target.value)}
                  className="bg-transparent border-none text-white text-sm focus:ring-0 cursor-pointer p-0"
               >
                   <option value="Grünland" className="text-slate-800">Grünland</option>
                   <option value="Acker" className="text-slate-800">Acker</option>
               </select>
             </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-black/20 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-50" onClick={() => setDeleteStep('idle')}>
          
          {/* Key Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
              <div className="flex items-center text-slate-500 mb-1 text-xs uppercase font-bold">
                <Ruler size={14} className="mr-1" /> Fläche (ha)
              </div>
              <input 
                 type="number"
                 step="0.01"
                 value={editedField.areaHa}
                 onChange={(e) => handleChange('areaHa', parseFloat(e.target.value))}
                 className="w-full bg-transparent text-2xl font-bold text-slate-800 focus:outline-none border-b border-transparent focus:border-green-500"
              />
            </div>
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
              <div className="flex items-center text-slate-500 mb-1 text-xs uppercase font-bold">
                <MapPin size={14} className="mr-1" /> Nutzung
              </div>
              <input 
                 type="text"
                 value={editedField.usage}
                 onChange={(e) => handleChange('usage', e.target.value)}
                 className="w-full bg-transparent text-lg font-bold text-slate-800 focus:outline-none border-b border-transparent focus:border-green-500"
              />
            </div>
          </div>

          {/* Customization Section */}
          <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-3 shadow-sm">
             <h3 className="font-bold text-slate-700 text-sm">Anpassung</h3>
             
             <div className="flex items-center justify-between">
                <label className="flex items-center text-sm text-slate-600">
                    <Palette size={16} className="mr-2"/> Farbe
                </label>
                <input 
                    type="color" 
                    value={editedField.color || '#cccccc'}
                    onChange={(e) => handleChange('color', e.target.value)}
                    className="h-8 w-16 p-0 border-0 rounded cursor-pointer"
                />
             </div>

             {onEditGeometry && (
                 <button 
                    onClick={() => onEditGeometry(field)}
                    className="w-full py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-sm font-medium flex items-center justify-center hover:bg-blue-100"
                 >
                    <MapIcon size={16} className="mr-2" /> Geometrie auf Karte bearbeiten
                 </button>
             )}
          </div>

          {/* Additional Info */}
          <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-blue-900 text-sm">
            <strong className="block text-xs uppercase text-blue-400 mb-1">eAMA Codes</strong>
            <input 
                type="text" 
                value={editedField.codes || ''} 
                onChange={(e) => handleChange('codes', e.target.value)}
                placeholder="z.B. BIO, UMW"
                className="w-full bg-transparent border-b border-blue-200 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* History Timeline */}
          <div className="pt-2">
            <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-lg flex items-center text-slate-700">
                  <Calendar size={20} className="mr-2 text-green-600"/> Aktivitäten
                </h3>
            </div>
            
            {/* Filters */}
            <div className="flex space-x-2 mb-4">
                <div className="relative flex-1">
                     <select 
                        value={filterYear}
                        onChange={(e) => setFilterYear(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                        className="w-full pl-8 pr-2 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 appearance-none focus:outline-none focus:ring-2 focus:ring-green-500"
                     >
                        <option value="all">Alle Jahre</option>
                        {availableYears.map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                     </select>
                     <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                </div>
                <div className="relative flex-1">
                     <select 
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value as any)}
                        className="w-full pl-8 pr-2 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 appearance-none focus:outline-none focus:ring-2 focus:ring-green-500"
                     >
                        <option value="all">Alle Typen</option>
                        <option value={ActivityType.FERTILIZATION}>Düngung</option>
                        <option value={ActivityType.HARVEST}>Ernte</option>
                        <option value={ActivityType.TILLAGE}>Boden</option>
                     </select>
                     <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                </div>
            </div>
            
            <div className="space-y-3 pb-20">
              {filteredHistory.length === 0 ? (
                <div className="text-center py-6 text-slate-400 italic text-sm border border-dashed border-slate-200 rounded-lg">
                  {history.length > 0 ? "Keine Aktivitäten für diesen Filter." : "Noch keine Aktivitäten aufgezeichnet."}
                </div>
              ) : (
                filteredHistory.map((act) => {
                  const style = getActivityStyle(act);
                  
                  // UPDATED LOGIC: Prefer Precise Field Source -> Fallback to Trip Distribution
                  let storageNames = null;

                  // 1. Precise tracking (New)
                  if (act.fieldSources && act.fieldSources[field.id]) {
                      const sourceIds = act.fieldSources[field.id];
                      storageNames = sourceIds
                          .map(sid => storages.find(s => s.id === sid)?.name)
                          .filter(Boolean)
                          .join(', ');
                  }
                  // 2. Legacy fallback
                  else if (act.storageDistribution) {
                       storageNames = Object.keys(act.storageDistribution)
                          .map(sid => storages.find(s => s.id === sid)?.name)
                          .filter(Boolean)
                          .join(', ');
                  }

                  return (
                    <div key={act.id} className="relative pl-4 border-l-2 border-slate-200 pb-2 last:pb-0">
                      <div className="absolute -left-[5px] top-4 w-2.5 h-2.5 rounded-full bg-slate-300"></div>
                      <div 
                          onClick={() => setSelectedActivity(act)}
                          className={`p-3 rounded-lg shadow-sm border-l-4 cursor-pointer hover:bg-white transition-all ${style.colorClass} ${style.bgClass}`}
                      >
                        <div className="flex justify-between items-start">
                           <div className="flex items-center space-x-2">
                             <style.Icon size={16} className={style.textClass} />
                             <div>
                               <span className={`font-bold text-sm ${style.textClass}`}>{style.label}</span>
                               <div className="text-xs text-slate-500">
                                  {new Date(act.date).toLocaleDateString('de-AT')}
                               </div>
                               {/* Display Storage Source if available */}
                               {storageNames && (
                                   <div className="text-[10px] text-slate-500 flex items-center mt-1">
                                       <Database size={10} className="mr-1 opacity-70"/>
                                       <span className="truncate max-w-[140px]">Von: {storageNames}</span>
                                   </div>
                               )}
                             </div>
                           </div>
                           <div className="text-right">
                             {act.amount ? (
                               // Keep Amount display logic but ensure text fits style if needed, currently slate-800 is safe
                               getAmountDisplay(act)
                             ) : null}
                           </div>
                        </div>
                        
                        {/* New Detailed Breakdown Visualization */}
                        {act.detailedFieldSources && act.detailedFieldSources[field.id] && (
                            <div className="mt-2 text-[10px] text-slate-500 border-t border-slate-200 pt-1">
                                {Object.entries(act.detailedFieldSources[field.id]).map(([sId, amount]) => {
                                    const store = storages.find(s => s.id === sId);
                                    const color = getStorageColor(sId);
                                    return (
                                        <div key={sId} className="flex justify-between items-center">
                                            <div className="flex items-center">
                                                <span className="w-1.5 h-1.5 rounded-full mr-1.5" style={{backgroundColor: color}}></span>
                                                <span>{store ? store.name : 'Unbekannt'}</span>
                                            </div>
                                            <span className="font-bold text-slate-600">{amount} {act.unit}</span>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                        
                        {act.notes && (
                          <div className="mt-2 text-xs text-slate-600 italic whitespace-pre-line truncate max-h-12 overflow-hidden border-t border-black/5 pt-1">
                             {act.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 pb-safe bg-white border-t border-slate-200 shrink-0 flex flex-col space-y-2 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
            {isDirty && (
                <button 
                    onClick={handleSave}
                    className="w-full py-3 bg-green-600 text-white rounded-xl font-bold flex items-center justify-center hover:bg-green-700 shadow-md transition-all"
                >
                    <Save size={20} className="mr-2"/> Speichern
                </button>
            )}
            
            {onDelete && (
                <button 
                    type="button"
                    onClick={handleDeleteClick}
                    className={`w-full py-3 border-2 rounded-xl font-bold flex items-center justify-center transition-all cursor-pointer select-none active:scale-[0.98] ${
                        deleteStep === 'confirm' 
                            ? 'bg-red-600 border-red-600 text-white' 
                            : 'bg-white border-red-100 text-red-500 hover:bg-red-50 hover:border-red-200'
                    }`}
                >
                    {deleteStep === 'confirm' ? (
                        <>
                            <AlertTriangle size={20} className="mr-2"/> Wirklich unwiderruflich löschen?
                        </>
                    ) : (
                        <>
                            <Trash2 size={20} className="mr-2"/> Feld löschen
                        </>
                    )}
                </button>
            )}
        </div>

        {/* Nested Activity Detail Overlay */}
        {selectedActivity && (
            <ActivityDetailView 
                activity={selectedActivity}
                onClose={() => setSelectedActivity(null)}
                onUpdate={loadHistory}
            />
        )}

      </div>
    </div>
  );
};
