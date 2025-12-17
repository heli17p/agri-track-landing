import React, { useState, useEffect, useMemo } from 'react';
import { X, Calendar, Save, Trash2, AlertTriangle, Truck, Wheat, MapPin, FileText, Hammer, PlusCircle, CheckSquare, Square, Check, Layers, Droplets, ShoppingBag, Database } from 'lucide-react';
import { ActivityRecord, ActivityType, Field, FertilizerType, HarvestType, TillageType, StorageLocation, TrackPoint, AppSettings, DEFAULT_SETTINGS } from '../types';
import { dbService } from '../services/db';
import { MapContainer, TileLayer, Polyline, Polygon, useMap, Popup } from 'react-leaflet';
import L from 'leaflet';

interface Props {
  activity: ActivityRecord;
  onClose: () => void;
  onUpdate: () => void; // Refresh parent list
}

// Helper to zoom map to track
const FitBoundsToTrack = ({ points, fields }: { points: TrackPoint[], fields: Field[] }) => {
    const map = useMap();
    useEffect(() => {
        const t = setTimeout(() => {
            map.invalidateSize(); // Fix gray tiles in modal
            
            if (points.length > 0) {
                const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
                
                // Include fields in bounds
                fields.forEach(f => {
                     f.boundary.forEach(p => bounds.extend([p.lat, p.lng]));
                });

                map.fitBounds(bounds, { padding: [20, 20] });
            } else if (fields.length > 0) {
                 // Fallback if no track but fields
                 const bounds = L.latLngBounds([]);
                 fields.forEach(f => {
                     f.boundary.forEach(p => bounds.extend([p.lat, p.lng]));
                });
                if(bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
            }
        }, 300);
        return () => clearTimeout(t);
    }, [map, points, fields]);
    return null;
};

// --- COLOR PALETTES FOR STORAGE TYPES (Synced with TrackingPage) ---
// Gülle: Earthy, liquid browns
const SLURRY_PALETTE = [
    '#451a03', // Amber 950 (Very Dark Brown)
    '#78350f', // Amber 900 (Standard Brown)
    '#92400e', // Amber 800
    '#b45309', // Amber 700
    '#854d0e', // Yellow 800 (Olive/Mud)
];

// Mist: Solid, warmer orange/reds
const MANURE_PALETTE = [
    '#d97706', // Amber 600 (Icon Color - Matches Marker)
    '#ea580c', // Orange 600 (Standard Orange)
    '#f59e0b', // Amber 500 (Yellow-Orange)
    '#c2410c', // Orange 700 (Rust)
    '#fb923c', // Orange 400 (Light Orange)
];

const getStorageColor = (storageId: string | undefined, allStorages: StorageLocation[]) => {
    if (!storageId) return '#3b82f6'; // Default Blue (No Storage / Transit)
    
    const storage = allStorages.find(s => s.id === storageId);
    if (!storage) return '#64748b'; // Slate (Unknown)

    // Find all storages of the SAME type to determine index
    // Sort by ID to ensure colors stay consistent across reloads
    const sameTypeStorages = allStorages
        .filter(s => s.type === storage.type)
        .sort((a, b) => a.id.localeCompare(b.id));
    
    const index = sameTypeStorages.findIndex(s => s.id === storageId);
    const safeIndex = index >= 0 ? index : 0;

    if (storage.type === FertilizerType.SLURRY) {
        return SLURRY_PALETTE[safeIndex % SLURRY_PALETTE.length];
    } else {
        return MANURE_PALETTE[safeIndex % MANURE_PALETTE.length];
    }
};

export const ActivityDetailView: React.FC<Props> = ({ activity, onClose, onUpdate }) => {
  const [editedActivity, setEditedActivity] = useState<ActivityRecord>({ ...activity });
  
  // Load ALL fields to allow adding new ones
  const [allFields, setAllFields] = useState<Field[]>([]);
  const [allStorages, setAllStorages] = useState<StorageLocation[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  
  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm'>('idle');
  const [isDirty, setIsDirty] = useState(false);
  
  // Field Edit Mode
  const [isEditingFields, setIsEditingFields] = useState(false);
  
  // Map State
  const [mapStyle, setMapStyle] = useState<'standard' | 'satellite'>('standard');

  useEffect(() => {
    const loadData = async () => {
        const fields = await dbService.getFields();
        setAllFields(fields);
        const s = await dbService.getStorageLocations();
        setAllStorages(s);
        const settings = await dbService.getSettings();
        setSettings(settings);
    };
    loadData();
  }, []);

  const handleChange = (key: keyof ActivityRecord, value: any) => {
      setEditedActivity(prev => {
          const next = { ...prev, [key]: value };
          setIsDirty(true);
          return next;
      });
  };

  const toggleField = (fieldId: string) => {
      const currentIds = new Set(editedActivity.fieldIds);
      if (currentIds.has(fieldId)) {
          currentIds.delete(fieldId);
      } else {
          currentIds.add(fieldId);
      }
      handleChange('fieldIds', Array.from(currentIds));
  };

  const handleSave = async () => {
      await dbService.saveActivity(editedActivity);
      onUpdate();
      onClose();
  };

  const handleDelete = async () => {
      if (deleteStep === 'idle') {
          setDeleteStep('confirm');
      } else {
          await dbService.deleteActivity(activity.id);
          onUpdate();
          onClose();
      }
  };

  // Determine Header Style
  const getHeaderStyle = () => {
    if (activity.type === ActivityType.HARVEST) {
        const notes = activity.notes || '';
        if (notes.includes(HarvestType.HAY)) {
            return { bg: 'bg-yellow-500', title: 'Heu Ernte', Icon: Wheat };
        } else if (notes.includes(HarvestType.STRAW)) {
            return { bg: 'bg-yellow-600', title: 'Stroh Ernte / Zukauf', Icon: ShoppingBag };
        }
        return { bg: 'bg-lime-600', title: 'Silage Ernte', Icon: Wheat };
    } 
    
    if (activity.type === ActivityType.FERTILIZATION) {
        if (activity.fertilizerType === FertilizerType.MANURE) {
            return { bg: 'bg-orange-500', title: 'Mist Ausbringung', Icon: Truck };
        }
        return { bg: 'bg-amber-800', title: 'Gülle Ausbringung', Icon: Truck };
    }

    if (activity.type === ActivityType.TILLAGE) {
        const type = activity.tillageType || 'Bodenbearbeitung';
        let bg = 'bg-blue-600'; // Default Harrow (Blue)

        if (activity.tillageType === TillageType.MULCH) { // Schlegeln (Indigo)
             bg = 'bg-indigo-600';
        } else if (activity.tillageType === TillageType.WEEDER) { // Striegeln (Sky)
             bg = 'bg-sky-500';
        } else if (activity.tillageType === TillageType.RESEEDING) { // Nachsaat (Teal)
             bg = 'bg-teal-600';
        }
        
        return { bg, title: type, Icon: Hammer };
    }

    return { bg: 'bg-slate-600', title: 'Tätigkeit', Icon: FileText };
  };

  const headerStyle = getHeaderStyle();

  // Format date for input
  const dateStr = new Date(editedActivity.date).toISOString().substring(0, 10);

  // Derived state for display
  const relevantFields = allFields.filter(f => editedActivity.fieldIds.includes(f.id));
  
  // Calculate Totals for Summary Header
  const totalArea = relevantFields.reduce((sum, f) => sum + f.areaHa, 0);
  const totalVolume = editedActivity.amount || 0;
  const averagePerHa = totalArea > 0 ? (totalVolume / totalArea).toFixed(1) : "0";
  
  // Calculate pixel weight based on specific spreadWidth setting (2px per meter)
  let widthMeters = settings.spreadWidth || 12;
  if (activity.type === ActivityType.FERTILIZATION) {
      if (activity.fertilizerType === FertilizerType.MANURE) {
          widthMeters = settings.manureSpreadWidth || 10;
      } else {
          widthMeters = settings.slurrySpreadWidth || 12;
      }
  }
  const trackWeight = widthMeters * 2;

  // --- Track Segmentation Logic (Detailed Segmentation by ID) ---
  const trackSegments = useMemo(() => {
      const points = activity.trackPoints;
      if (!points || points.length < 2) return [];

      const segments: { points: [number, number][], isSpreading: boolean, storageId?: string }[] = [];
      let currentPoints: [number, number][] = [[points[0].lat, points[0].lng]];
      let currentSpreadState = points[0].isSpreading;
      let currentStorageId = points[0].storageId;

      for (let i = 1; i < points.length; i++) {
          const p = points[i];
          const prevP = points[i-1];

          // Break segment if spreading state changes OR source storage changes
          const stateChanged = p.isSpreading !== currentSpreadState;
          const storageChanged = p.storageId !== currentStorageId;

          if (stateChanged || storageChanged) {
              segments.push({ points: currentPoints, isSpreading: currentSpreadState, storageId: currentStorageId });
              // Start new segment overlapping with previous point to ensure connectivity
              currentPoints = [[prevP.lat, prevP.lng], [p.lat, p.lng]];
              currentSpreadState = p.isSpreading;
              currentStorageId = p.storageId;
          } else {
              currentPoints.push([p.lat, p.lng]);
          }
      }
      // Push final segment
      segments.push({ points: currentPoints, isSpreading: currentSpreadState, storageId: currentStorageId });

      return segments;
  }, [activity.trackPoints]);

  // Identify unique storage IDs present in the track for the legend
  const uniqueTrackStorageIds = useMemo(() => {
      const ids = new Set<string>();
      activity.trackPoints?.forEach(p => {
          if (p.storageId) ids.add(p.storageId);
      });
      return Array.from(ids);
  }, [activity.trackPoints]);

  return (
    <div className="fixed inset-0 z-[1100] flex justify-end" onClick={() => setDeleteStep('idle')}>
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" 
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      />

      {/* Panel */}
      <div 
        className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`p-4 ${headerStyle.bg} text-white flex justify-between items-center shrink-0`}>
             <div className="flex items-center space-x-3">
                 <div className="p-2 bg-white/20 rounded-full">
                     <headerStyle.Icon size={24} />
                 </div>
                 <div>
                     <h2 className="text-xl font-bold">{headerStyle.title}</h2>
                     <div className="text-white/80 text-sm">{activity.id.substring(0, 8)}...</div>
                 </div>
             </div>
             <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full">
                 <X size={24} />
             </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-50">
            
            {/* MAP SECTION */}
            {((activity.trackPoints && activity.trackPoints.length > 0) || relevantFields.length > 0) && (
                <div className="h-64 w-full rounded-xl overflow-hidden border border-slate-300 relative shadow-sm bg-slate-200">
                    <MapContainer center={[47.5, 14.5]} zoom={13} style={{ height: '100%', width: '100%' }}>
                         <TileLayer 
                            attribution='&copy; OpenStreetMap'
                            url={mapStyle === 'standard' 
                                ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                            }
                        />
                        <FitBoundsToTrack points={activity.trackPoints || []} fields={relevantFields} />

                        {/* Fields */}
                        {relevantFields.map(f => (
                            <Polygon 
                                key={f.id}
                                positions={f.boundary.map(p => [p.lat, p.lng])}
                                color={f.type === 'Acker' ? '#d97706' : '#16a34a'}
                                fillOpacity={0.2}
                                weight={1}
                            >
                                <Popup>{f.name}</Popup>
                            </Polygon>
                        ))}

                        {/* Track Segments Visualization */}
                        {trackSegments.map((segment, index) => {
                             if (segment.isSpreading) {
                                 const color = getStorageColor(segment.storageId, allStorages);
                                 // SPREADING STYLE (Double Line)
                                 return (
                                     <React.Fragment key={`seg-${index}`}>
                                         {/* Wide colored base */}
                                         <Polyline 
                                            positions={segment.points} 
                                            {...{ pathOptions: { 
                                                color: color, 
                                                weight: trackWeight,
                                                opacity: 0.8,
                                                lineCap: 'butt'
                                            }} as any}
                                         />
                                         {/* Thin white center */}
                                         <Polyline 
                                            positions={segment.points} 
                                            {...{ pathOptions: { 
                                                color: 'white', 
                                                weight: 2, 
                                                dashArray: '5, 5',
                                                opacity: 0.9
                                            }} as any}
                                         />
                                     </React.Fragment>
                                 );
                             } else {
                                 // TRANSIT STYLE (Thin Blue)
                                 return (
                                     <Polyline 
                                        key={`seg-${index}`}
                                        positions={segment.points} 
                                        {...{ pathOptions: { 
                                            color: '#3b82f6', // Blue
                                            weight: 3,
                                            opacity: 0.7 
                                        }} as any}
                                     />
                                 );
                             }
                        })}
                    </MapContainer>
                    
                    {/* Map Controls */}
                    <div className="absolute top-2 right-2 z-[400]">
                         <button 
                            onClick={(e) => { e.preventDefault(); setMapStyle(prev => prev === 'standard' ? 'satellite' : 'standard'); }}
                            className="bg-white/90 p-2 rounded shadow text-slate-700 hover:text-green-600 backdrop-blur"
                            title="Satellit/Karte"
                         >
                             <Layers size={16} />
                         </button>
                    </div>

                    {/* Dynamic Legend for Sources */}
                    {uniqueTrackStorageIds.length > 0 && (
                        <div className="absolute top-2 left-2 z-[400] bg-white/90 backdrop-blur p-2 rounded-lg shadow border border-slate-200 max-w-[150px]">
                            <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Quellen</div>
                            {uniqueTrackStorageIds.map(id => {
                                const storage = allStorages.find(s => s.id === id);
                                const name = storage ? storage.name : 'Unbekannt';
                                const color = getStorageColor(id, allStorages);
                                return (
                                    <div key={id} className="flex items-center text-[10px] text-slate-700 mb-0.5 last:mb-0">
                                        <span className="w-2.5 h-2.5 rounded-full mr-1.5 shrink-0" style={{backgroundColor: color, border: '1px solid white'}}></span>
                                        <span className="truncate">{name}</span>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Main Data Form */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-4">
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Datum</label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                        <input 
                            type="date"
                            value={dateStr}
                            onChange={(e) => handleChange('date', new Date(e.target.value).toISOString())}
                            className="w-full pl-10 p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none font-medium"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Menge ({editedActivity.unit})</label>
                        <input 
                            type="number"
                            value={editedActivity.amount || 0}
                            onChange={(e) => handleChange('amount', parseFloat(e.target.value))}
                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none font-bold text-lg"
                        />
                    </div>
                    {editedActivity.loadCount !== undefined && (
                         <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Anzahl Fuhren</label>
                            <input 
                                type="number"
                                value={editedActivity.loadCount}
                                readOnly
                                className="w-full p-2 bg-slate-100 border border-slate-300 rounded-lg text-slate-500"
                            />
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                    {editedActivity.fertilizerType && (
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Art</label>
                            <input 
                                type="text"
                                value={editedActivity.fertilizerType}
                                readOnly
                                className="w-full p-2 bg-slate-100 border border-slate-300 rounded-lg text-slate-500"
                            />
                        </div>
                    )}
                    {editedActivity.tillageType && (
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Art</label>
                            <input 
                                type="text"
                                value={editedActivity.tillageType}
                                readOnly
                                className="w-full p-2 bg-slate-100 border border-slate-300 rounded-lg text-slate-500"
                            />
                        </div>
                    )}
                </div>

                <div>
                     <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Notizen</label>
                     <div className="relative">
                        <FileText className="absolute left-3 top-3 text-slate-400" size={16}/>
                        <textarea 
                            value={editedActivity.notes || ''}
                            onChange={(e) => handleChange('notes', e.target.value)}
                            rows={3}
                            className="w-full pl-10 p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-sm"
                        />
                     </div>
                </div>
            </div>
            
            {/* Storage Distribution Display */}
            {activity.storageDistribution && (
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="font-bold text-slate-700 mb-2 flex items-center">
                        <Truck size={16} className="mr-2"/> Entnahme (Lager)
                    </h3>
                    <div className="divide-y divide-slate-100">
                        {Object.entries(activity.storageDistribution).map(([sId, amount]) => {
                             const store = allStorages.find(s => s.id === sId);
                             const color = getStorageColor(sId, allStorages);
                             
                             // Calculate specific loads for this storage
                             let loadStr = "";
                             if (activity.loadCount && activity.amount && activity.amount > 0) {
                                 const loads = (amount / activity.amount) * activity.loadCount;
                                 loadStr = ` (${Number.isInteger(loads) ? loads.toFixed(0) : loads.toFixed(1)} Fuhren)`;
                             }

                             return (
                                 <div key={sId} className="flex justify-between py-2 text-sm">
                                     <div className="flex items-center text-slate-600">
                                         {/* Legend dot match map */}
                                         <span className="w-2.5 h-2.5 rounded-full mr-2" style={{backgroundColor: color}}></span>
                                         <span>{store ? store.name : 'Unbekanntes Lager'}</span>
                                     </div>
                                     <span className="font-bold text-slate-800">{amount} {activity.unit}{loadStr}</span>
                                 </div>
                             )
                        })}
                    </div>
                </div>
            )}

            {/* Involved Fields Section */}
            <div>
                <div className="flex justify-between items-center mb-2">
                    <h3 className="font-bold text-slate-700 flex items-center">
                        <MapPin size={16} className="mr-2"/> Beteiligte Felder ({editedActivity.fieldIds.length})
                    </h3>
                    <button 
                        onClick={() => setIsEditingFields(!isEditingFields)}
                        className={`text-xs px-2 py-1 rounded border font-medium flex items-center ${isEditingFields ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
                    >
                        {isEditingFields ? <Check size={14} className="mr-1"/> : <PlusCircle size={14} className="mr-1"/>}
                        {isEditingFields ? 'Fertig' : 'Bearbeiten'}
                    </button>
                </div>

                {/* SUMMARY HEADER (Requested Feature) */}
                {!isEditingFields && relevantFields.length > 0 && activity.unit === 'm³' && (
                    <div className="bg-green-50 text-green-800 text-xs px-3 py-2 rounded-t-xl border border-green-200 border-b-0 flex justify-between items-center font-medium">
                        <span>Gesamt: {totalArea.toFixed(2)} ha • {totalVolume} {activity.unit}</span>
                        <span>Ø {averagePerHa} {activity.unit}/ha</span>
                    </div>
                )}

                <div className={`bg-white shadow-sm border border-slate-200 overflow-hidden ${!isEditingFields && relevantFields.length > 0 && activity.unit === 'm³' ? 'rounded-b-xl rounded-t-none border-t-0' : 'rounded-xl'}`}>
                    {isEditingFields ? (
                        // EDIT MODE: List ALL fields with Checkboxes
                        <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
                             {allFields.length === 0 ? (
                                <div className="p-4 text-center text-slate-400">Keine Felder verfügbar.</div>
                             ) : (
                                 allFields.map(f => {
                                     const isSelected = editedActivity.fieldIds.includes(f.id);
                                     return (
                                        <div 
                                            key={f.id} 
                                            onClick={() => toggleField(f.id)}
                                            className={`p-3 flex items-center cursor-pointer hover:bg-slate-50 ${isSelected ? 'bg-blue-50/50' : ''}`}
                                        >
                                            <div className={`mr-3 ${isSelected ? 'text-blue-600' : 'text-slate-300'}`}>
                                                {isSelected ? <CheckSquare size={20}/> : <Square size={20}/>}
                                            </div>
                                            <div className="flex-1">
                                                <div className="font-medium text-slate-700 text-sm">{f.name}</div>
                                                <div className="text-xs text-slate-500">{f.areaHa.toFixed(2)} ha {f.usage && `• ${f.usage}`}</div>
                                            </div>
                                        </div>
                                     );
                                 })
                             )}
                        </div>
                    ) : (
                        // VIEW MODE: List only relevant fields
                        <div className="divide-y divide-slate-100">
                            {relevantFields.length === 0 ? (
                                <div className="p-4 text-slate-400 text-sm italic">Keine Felder verknüpft (oder gelöscht).</div>
                            ) : (
                                relevantFields.map(f => (
                                    <div key={f.id} className="p-3">
                                        <div className="flex justify-between items-center">
                                            <div className="flex flex-col">
                                                <span className="font-medium text-slate-700">{f.name}</span>
                                                {f.usage && <span className="text-[10px] text-slate-500">{f.usage}</span>}
                                            </div>
                                            
                                            <div className="flex flex-col items-end">
                                                <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-500">
                                                    {f.areaHa.toFixed(2)} ha
                                                </span>
                                                {/* Show distribution if available */}
                                                {activity.fieldDistribution && activity.fieldDistribution[f.id] && (
                                                    <div className="text-[10px] font-bold text-green-600 mt-0.5 text-right">
                                                        {/* Total amount for THIS field */}
                                                        {activity.fieldDistribution[f.id]} {activity.unit}
                                                        
                                                        {/* Calculate SPECIFIC m3/ha and loads for THIS field */}
                                                        {(() => {
                                                            const count = activity.fieldDistribution![f.id];
                                                            let loadStr = "";
                                                            let haStr = "";

                                                            // Loads for this field
                                                            if (activity.loadCount && activity.amount && activity.amount > 0) {
                                                                const fieldLoads = (count / activity.amount) * activity.loadCount;
                                                                loadStr = `(${Number.isInteger(fieldLoads) ? fieldLoads.toFixed(0) : fieldLoads.toFixed(1)} Fuhren)`;
                                                            }
                                                            
                                                            // m3/ha for this field (Specific Volume / Specific Area)
                                                            if (activity.unit === 'm³' && f.areaHa > 0) {
                                                                const perHa = (count / f.areaHa).toFixed(1);
                                                                haStr = `${perHa} m³/ha`;
                                                            }

                                                            return (
                                                                <div className="flex flex-col items-end">
                                                                    {/* Shows specifically calculated per/ha for this field */}
                                                                    {haStr && <span className="text-green-700">{haStr}</span>}
                                                                    {loadStr && <span className="text-slate-400 font-normal">{loadStr}</span>}
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* DETAILED SOURCE BREAKDOWN (New Feature) */}
                                        {activity.detailedFieldSources && activity.detailedFieldSources[f.id] && (
                                            <div className="mt-1 ml-2 pl-2 border-l-2 border-slate-100 text-[10px] text-slate-500">
                                                {Object.entries(activity.detailedFieldSources[f.id]).map(([sId, amount]) => {
                                                    const store = allStorages.find(s => s.id === sId);
                                                    const color = getStorageColor(sId, allStorages);
                                                    return (
                                                        <div key={sId} className="flex items-center space-x-1">
                                                            <span className="w-1.5 h-1.5 rounded-full" style={{backgroundColor: color}}></span>
                                                            <span>{store ? store.name : 'Unbekannt'}: {amount} {activity.unit}</span>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-slate-200 shrink-0 flex flex-col space-y-2">
            {isDirty && (
                <button 
                    onClick={handleSave}
                    className="w-full py-3 bg-green-600 text-white rounded-xl font-bold flex items-center justify-center hover:bg-green-700 shadow-lg"
                >
                    <Save size={20} className="mr-2"/> Änderungen Speichern
                </button>
            )}

            <button 
                onClick={handleDelete}
                className={`w-full py-3 border-2 rounded-xl font-bold flex items-center justify-center transition-all ${
                    deleteStep === 'confirm' 
                    ? 'bg-red-600 border-red-600 text-white' 
                    : 'bg-white border-red-100 text-red-500 hover:bg-red-50'
                }`}
            >
                 {deleteStep === 'confirm' ? (
                     <>
                        <AlertTriangle size={20} className="mr-2"/> Wirklich löschen?
                     </>
                 ) : (
                     <>
                        <Trash2 size={20} className="mr-2"/> Tätigkeit Löschen
                     </>
                 )}
            </button>
        </div>

      </div>
    </div>
  );
};
