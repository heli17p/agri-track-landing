
import React, { useState, useEffect, useMemo } from 'react';
import { X, Calendar, Save, Trash2, AlertTriangle, Truck, Hammer, MapPin, Layers, Database, CheckSquare, Square, MessageSquare, ShoppingBag, Wheat } from 'lucide-react';
import { ActivityRecord, ActivityType, Field, FertilizerType, StorageLocation, TrackPoint, AppSettings, DEFAULT_SETTINGS } from '../types';
import { dbService } from '../services/db';
import { MapContainer, TileLayer, Polyline, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';

interface Props {
  activity: ActivityRecord;
  onClose: () => void;
  onUpdate: () => void;
}

const FitBoundsToTrack = ({ points, fields }: { points: TrackPoint[], fields: Field[] }) => {
    const map = useMap();
    useEffect(() => {
        const t = setTimeout(() => {
            map.invalidateSize(); 
            const bounds = L.latLngBounds([]);
            if (points.length > 0) points.forEach(p => bounds.extend([p.lat, p.lng]));
            fields.forEach(f => f.boundary.forEach(p => bounds.extend([p.lat, p.lng])));
            if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
        }, 400);
        return () => clearTimeout(t);
    }, [map, points, fields]);
    return null;
};

const SLURRY_PALETTE = ['#451a03', '#78350f', '#92400e', '#b45309', '#854d0e'];
const MANURE_PALETTE = ['#d97706', '#ea580c', '#f59e0b', '#c2410c', '#fb923c'];

const getStorageColor = (storageId: string | undefined, allStorages: StorageLocation[]) => {
    if (!storageId) return '#3b82f6';
    const storage = allStorages.find(s => s.id === storageId);
    if (!storage) return '#64748b';
    const sameType = allStorages.filter(s => s.type === storage.type).sort((a, b) => a.id.localeCompare(b.id));
    const idx = Math.max(0, sameType.findIndex(s => s.id === storageId));
    return storage.type === FertilizerType.SLURRY ? SLURRY_PALETTE[idx % SLURRY_PALETTE.length] : MANURE_PALETTE[idx % MANURE_PALETTE.length];
};

export const ActivityDetailView: React.FC<Props> = ({ activity, onClose, onUpdate }) => {
  const [editedActivity, setEditedActivity] = useState<ActivityRecord>({ ...activity });
  const [allFields, setAllFields] = useState<Field[]>([]);
  const [allStorages, setAllStorages] = useState<StorageLocation[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm'>('idle');
  const [isDirty, setIsDirty] = useState(false);
  const [isEditingFields, setIsEditingFields] = useState(false);
  const [mapStyle, setMapStyle] = useState<'standard' | 'satellite'>('standard');

  useEffect(() => {
    const loadData = async () => {
        setAllFields(await dbService.getFields());
        setAllStorages(await dbService.getStorageLocations());
        setSettings(await dbService.getSettings());
    };
    loadData();
  }, []);

  const handleChange = (key: keyof ActivityRecord, value: any) => {
      setEditedActivity(prev => ({ ...prev, [key]: value }));
      setIsDirty(true);
  };

  const toggleField = (fieldId: string) => {
      const currentIds = new Set(editedActivity.fieldIds);
      if (currentIds.has(fieldId)) currentIds.delete(fieldId); else currentIds.add(fieldId);
      handleChange('fieldIds', Array.from(currentIds));
  };

  const handleSave = async () => {
      await dbService.saveActivity(editedActivity);
      onUpdate();
      onClose();
  };

  const handleDelete = async () => {
      if (deleteStep === 'idle') setDeleteStep('confirm');
      else {
          await dbService.deleteActivity(activity.id);
          onUpdate();
          onClose();
      }
  };

  const getHeaderStyle = () => {
    if (activity.type === ActivityType.FERTILIZATION) {
        return activity.fertilizerType === FertilizerType.MANURE 
            ? { bg: 'bg-orange-500', title: 'Mist Ausbringung', Icon: Truck }
            : { bg: 'bg-amber-800', title: 'Gülle Ausbringung', Icon: Truck };
    }
    if (activity.type === ActivityType.HARVEST) {
        const type = activity.tillageType || 'Ernte';
        const isZukauf = activity.notes?.toLowerCase().includes('zukauf');
        if (isZukauf) {
            return { bg: 'bg-blue-600', title: `Zukauf: ${type}`, Icon: ShoppingBag };
        }
        return { bg: 'bg-lime-600', title: `${type} Ernte`, Icon: Wheat };
    }
    return { bg: 'bg-blue-600', title: activity.tillageType || 'Bearbeitung', Icon: Hammer };
  };

  const headerStyle = getHeaderStyle();
  const dateStr = new Date(editedActivity.date).toISOString().substring(0, 10);
  const relevantFields = allFields.filter(f => editedActivity.fieldIds.includes(f.id));
  const totalAreaValue = relevantFields.reduce((sum, f) => sum + f.areaHa, 0);
  
  const trackWeight = (activity.fertilizerType === FertilizerType.MANURE ? (settings.manureSpreadWidth || 10) : (settings.slurrySpreadWidth || 12)) * 1.2;

  const trackSegments = useMemo(() => {
      const points = activity.trackPoints;
      if (!points || points.length < 2) return [];
      const segments = [];
      let currentPoints: [number, number][] = [[points[0].lat, points[0].lng]];
      let currentSpread = points[0].isSpreading;
      let currentStorageId = points[0].storageId;

      for (let i = 1; i < points.length; i++) {
          const p = points[i];
          if (p.isSpreading !== currentSpread || p.storageId !== currentStorageId) {
              segments.push({ points: currentPoints, isSpreading: currentSpread, storageId: currentStorageId });
              currentPoints = [[points[i-1].lat, points[i-1].lng], [p.lat, p.lng]];
              currentSpread = p.isSpreading;
              currentStorageId = p.storageId;
          } else { currentPoints.push([p.lat, p.lng]); }
      }
      segments.push({ points: currentPoints, isSpreading: currentSpread, storageId: currentStorageId });
      return segments;
  }, [activity.trackPoints]);

  return (
    <div className="fixed inset-0 z-[1100] flex justify-end" onClick={() => setDeleteStep('idle')}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300" onClick={e => e.stopPropagation()}>
        <div className={`p-4 ${headerStyle.bg} text-white flex justify-between items-center shrink-0`}>
             <div className="flex items-center space-x-3">
                 <headerStyle.Icon size={24} />
                 <div><h2 className="text-xl font-bold">{headerStyle.title}</h2><div className="text-white/80 text-xs">ID: {activity.id.substring(0, 8)}</div></div>
             </div>
             <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full"><X size={24} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-50">
            {((activity.trackPoints && activity.trackPoints.length > 0) || relevantFields.length > 0) && (
                <div className="h-64 w-full rounded-2xl overflow-hidden border border-slate-300 relative bg-slate-200">
                    <MapContainer center={[47.5, 14.5]} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                        <TileLayer url={mapStyle === 'standard' ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"} />
                        <FitBoundsToTrack points={activity.trackPoints || []} fields={relevantFields} />
                        {relevantFields.map(f => <Polygon key={f.id} positions={f.boundary.map(p => [p.lat, p.lng])} pathOptions={{ color: f.type === 'Acker' ? '#92400E' : '#15803D', fillOpacity: 0.1, weight: 1 }} />)}
                        {trackSegments.map((seg, idx) => {
                             const fallbackId = activity.storageDistribution ? Object.keys(activity.storageDistribution)[0] : undefined;
                             const color = getStorageColor(seg.storageId || (seg.isSpreading ? fallbackId : undefined), allStorages);
                             return (
                                 <React.Fragment key={idx}>
                                     <Polyline positions={seg.points} pathOptions={{ color: color, weight: seg.isSpreading ? trackWeight : 3, opacity: seg.isSpreading ? 0.8 : 0.5, lineCap: 'round' }} />
                                     {seg.isSpreading && <Polyline positions={seg.points} pathOptions={{ color: 'white', weight: 2, dashArray: '10, 15', opacity: 0.9 }} />}
                                 </React.Fragment>
                             );
                        })}
                    </MapContainer>
                    <button onClick={() => setMapStyle(prev => prev === 'standard' ? 'satellite' : 'standard')} className="absolute top-2 right-2 z-[400] bg-white/90 p-2 rounded-lg shadow text-slate-700"><Layers size={18} /></button>
                </div>
            )}

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Datum</label><input type="date" value={dateStr} onChange={e => handleChange('date', new Date(e.target.value).toISOString())} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 outline-none font-bold text-slate-700"/></div>
                <div className="grid grid-cols-2 gap-4"><div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Menge ({editedActivity.unit})</label><input type="number" value={editedActivity.amount || 0} onChange={e => handleChange('amount', parseFloat(e.target.value))} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 outline-none font-black text-xl text-slate-800"/></div>{editedActivity.loadCount !== undefined && (<div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Fuhren</label><input type="number" value={editedActivity.loadCount} readOnly className="w-full p-2.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 font-bold"/></div>)}</div>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="font-bold text-slate-700 mb-3 flex items-center text-sm">
                    <MessageSquare size={16} className="mr-2 text-slate-400"/> Notizen / Anmerkungen
                </h3>
                <textarea 
                    value={editedActivity.notes || ''} 
                    onChange={e => handleChange('notes', e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px] resize-none"
                    placeholder="Besonderheiten zu dieser Tätigkeit..."
                />
            </div>

            {activity.storageDistribution && (
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                    <h3 className="font-bold text-slate-700 mb-3 flex items-center text-sm"><Database size={16} className="mr-2 text-amber-600"/> Herkunft (Lager)</h3>
                    {Object.entries(activity.storageDistribution).map(([sId, amount]) => {
                         const store = allStorages.find(s => s.id === sId);
                         return <div key={sId} className="flex justify-between items-center p-2 bg-slate-50 rounded-lg mb-1 border border-slate-100"><div className="flex items-center text-sm font-bold text-slate-600"><span className="w-3 h-3 rounded-full mr-2" style={{backgroundColor: getStorageColor(sId, allStorages)}}></span>{store?.name || 'Unbekannt'}</div><span className="font-black text-slate-800">{amount} {activity.unit}</span></div>;
                    })}
                </div>
            )}

            <div className="space-y-3">
                <div className="flex justify-between items-center"><h3 className="font-bold text-slate-700 flex items-center text-sm"><MapPin size={16} className="mr-2 text-green-600"/> Beteiligte Felder</h3><button onClick={() => setIsEditingFields(!isEditingFields)} className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg border border-blue-100">{isEditingFields ? 'Fertig' : 'Bearbeiten'}</button></div>
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    {isEditingFields ? (
                        <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">{allFields.map(f => <div key={f.id} onClick={() => toggleField(f.id)} className="p-3 flex items-center cursor-pointer">{editedActivity.fieldIds.includes(f.id) ? <CheckSquare size={20} className="text-blue-600 mr-3"/> : <Square size={20} className="text-slate-300 mr-3"/>}<div className="flex-1 text-sm font-bold text-slate-700">{f.name}</div></div>)}</div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {relevantFields.map(f => {
                                let fieldAmt = editedActivity.fieldDistribution?.[f.id];
                                if (fieldAmt === undefined && editedActivity.amount && totalAreaValue > 0) {
                                    fieldAmt = Math.round((f.areaHa / totalAreaValue) * editedActivity.amount * 10) / 10;
                                }
                                return (
                                    <div key={f.id} className="p-3">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="font-bold text-slate-700 text-sm">{f.name}</div>
                                                <div className="text-[10px] text-slate-400 font-medium mb-1">{f.usage}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-sm font-black text-green-700">{fieldAmt || 0} {editedActivity.unit}</div>
                                                <div className="text-[9px] text-slate-400 font-bold uppercase">{f.areaHa} ha</div>
                                            </div>
                                        </div>
                                        {activity.detailedFieldSources && activity.detailedFieldSources[f.id] && (
                                            <div className="mt-2 space-y-1 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                                {Object.entries(activity.detailedFieldSources[f.id]).map(([sId, amount]) => {
                                                    const store = allStorages.find(s => s.id === sId);
                                                    const color = getStorageColor(sId, allStorages);
                                                    return (
                                                        <div key={sId} className="flex justify-between items-center text-[10px]">
                                                            <div className="flex items-center text-slate-500 font-semibold">
                                                                <span className="w-1.5 h-1.5 rounded-full mr-1.5" style={{backgroundColor: color}}></span>
                                                                {store?.name || 'Unbekannt'}
                                                            </div>
                                                            <span className="font-bold text-slate-700">{amount} {activity.unit}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>

        <div className="p-4 bg-white border-t border-slate-200 shrink-0 space-y-2">{isDirty && <button onClick={handleSave} className="w-full py-4 bg-green-600 text-white rounded-2xl font-black flex items-center justify-center shadow-lg shadow-green-100"><Save size={20} className="mr-2"/> Änderungen Speichern</button>}<button onClick={handleDelete} className={`w-full py-4 rounded-2xl font-black flex items-center justify-center border-2 ${deleteStep === 'confirm' ? 'bg-red-600 border-red-600 text-white animate-pulse' : 'bg-white border-red-50 text-red-500'}`}>{deleteStep === 'confirm' ? <><AlertTriangle size={20} className="mr-2"/> Unwiderruflich löschen?</> : <><Trash2 size={20} className="mr-2"/> Tätigkeit Löschen</>}</button></div>
      </div>
    </div>
  );
};

