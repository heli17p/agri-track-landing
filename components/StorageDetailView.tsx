import React, { useEffect, useState, useMemo } from 'react';
import { X, Database, TrendingUp, AlertTriangle, Droplets, MapPin, Layers, Calendar, Filter } from 'lucide-react';
import { StorageLocation, ActivityRecord, Field, ActivityType, FertilizerType } from '../types';
import { dbService } from '../services/db';
import { MapContainer, TileLayer, Polyline, Polygon, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

interface Props {
  storage: StorageLocation;
  onClose: () => void;
}

// --- Helper to Zoom Map to Content ---
const FitBoundsToContent = ({ tracks, fields }: { tracks: any[], fields: Field[] }) => {
    const map = useMap();
    useEffect(() => {
        const t = setTimeout(() => {
            map.invalidateSize();
            const bounds = L.latLngBounds([]);
            tracks.forEach(segment => segment.forEach((p: any) => bounds.extend([p[0], p[1]])));
            fields.forEach(f => f.boundary.forEach(p => bounds.extend([p.lat, p.lng])));
            if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
        }, 400); 
        return () => clearTimeout(t);
    }, [map, tracks, fields]);
    return null;
};

// --- Color Helper ---
const SLURRY_PALETTE = ['#451a03', '#78350f', '#92400e', '#b45309', '#854d0e'];
const MANURE_PALETTE = ['#d97706', '#ea580c', '#f59e0b', '#c2410c', '#fb923c'];

const getStorageColor = (storageId: string | undefined, allStorages: StorageLocation[]) => {
    if (!storageId) return '#78350f'; 
    const storage = allStorages.find(s => s.id === storageId);
    if (!storage) return '#64748b';

    const sameTypeStorages = allStorages.filter(s => s.type === storage.type).sort((a, b) => a.id.localeCompare(b.id));
    const index = sameTypeStorages.findIndex(s => s.id === storageId);
    const safeIndex = index >= 0 ? index : 0;

    if (storage.type === FertilizerType.SLURRY) return SLURRY_PALETTE[safeIndex % SLURRY_PALETTE.length];
    return MANURE_PALETTE[safeIndex % MANURE_PALETTE.length];
};

export const StorageDetailView: React.FC<Props> = ({ storage, onClose }) => {
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [allStorages, setAllStorages] = useState<StorageLocation[]>([]);
  const [mapStyle, setMapStyle] = useState<'standard' | 'satellite'>('standard');
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [filterYear, setFilterYear] = useState<number | 'all'>('all');

  const percentFull = Math.min(100, (storage.currentLevel / storage.capacity) * 100);
  const isFull = percentFull >= 90;
  const isWarning = percentFull >= 75 && percentFull < 90;

  useEffect(() => {
      const loadHistory = async () => {
          setLoadingHistory(true);
          const allActs = await dbService.getActivities();
          const allFields = await dbService.getFields();
          const allSt = await dbService.getStorageLocations();
          setAllStorages(allSt);
          
          // Filter activities relevant to THIS storage
          const relevant = allActs.filter(a => {
              if (a.type !== ActivityType.FERTILIZATION) return false;
              // Check 1: Track Points (Precise - New Data)
              const hasTrack = a.trackPoints?.some(p => p.storageId === storage.id);
              // Check 2: Detailed Sources (Precise Manual/Calc)
              const hasSource = a.detailedFieldSources && Object.values(a.detailedFieldSources).some(fieldMap => fieldMap[storage.id] !== undefined);
              // Check 3: Legacy Distribution
              const hasLegacy = a.storageDistribution && a.storageDistribution[storage.id] !== undefined;
              return hasTrack || hasSource || hasLegacy;
          });

          setActivities(relevant);
          setFields(allFields);
          setLoadingHistory(false);
      };
      loadHistory();
  }, [storage.id]);

  const storageColor = getStorageColor(storage.id, allStorages);

  const availableYears = useMemo(() => {
      const years = new Set(activities.map(a => a.year));
      return Array.from(years).sort((a, b) => b - a);
  }, [activities]);

  const filteredActivities = useMemo(() => {
      return activities.filter(a => filterYear === 'all' || a.year === filterYear);
  }, [activities, filterYear]);

  // Extract Segments for Map (Based on Filtered Activities)
  const trackSegments = useMemo(() => {
      const segments: [number, number][][] = [];
      filteredActivities.forEach(act => {
          if (!act.trackPoints || act.trackPoints.length < 2) return;
          
          // Legacy check: If only this storage in distribution and no explicit IDs on points
          const isLegacySingleSource = 
            act.storageDistribution && 
            Object.keys(act.storageDistribution).length === 1 && 
            Object.keys(act.storageDistribution)[0] === storage.id &&
            !act.trackPoints.some(p => p.storageId); 

          let currentSegment: [number, number][] = [];
          
          act.trackPoints.forEach((p, i) => {
              // Match if: Explicit ID matches OR legacy inference
              const isMatch = (p.storageId === storage.id) || (isLegacySingleSource && !p.storageId);

              if (isMatch && p.isSpreading) {
                  currentSegment.push([p.lat, p.lng]);
              } else {
                  if (currentSegment.length > 1) segments.push(currentSegment);
                  currentSegment = [];
              }
          });
          if (currentSegment.length > 1) segments.push(currentSegment);
      });
      return segments;
  }, [filteredActivities, storage.id]);

  // Find fields that were fertilized by this storage
  const affectedFields = useMemo(() => {
      const affectedIds = new Set<string>();
      filteredActivities.forEach(act => {
          if (act.detailedFieldSources) {
              Object.keys(act.detailedFieldSources).forEach(fId => {
                  if (act.detailedFieldSources![fId][storage.id]) affectedIds.add(fId);
              });
          } else if (act.trackPoints) {
               // Legacy Check
               if (act.storageDistribution && act.storageDistribution[storage.id]) {
                   act.fieldIds.forEach(id => affectedIds.add(id));
               }
          }
      });
      return fields.filter(f => affectedIds.has(f.id));
  }, [filteredActivities, fields, storage.id]);

  return (
    <div className="fixed inset-0 z-[1000] flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={onClose}/>
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-slide-right">
        <div className="p-4 bg-slate-800 text-white flex justify-between items-center shrink-0 border-b-4" style={{ borderColor: storageColor }}>
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white/10 rounded-full">{storage.type === 'Gülle' ? <Droplets size={20} className="text-amber-200" /> : <Layers size={20} className="text-orange-200" />}</div>
            <div><h2 className="text-xl font-bold">{storage.name}</h2><div className="text-slate-300 text-sm">{storage.type} Lager</div></div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={24} /></button>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50">
            <div className="p-6 space-y-6">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-end mb-3"><span className="text-slate-500 font-bold uppercase text-xs tracking-wider">Aktueller Füllstand</span><span className={`font-bold text-2xl ${isFull ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-slate-800'}`}>{percentFull.toFixed(1)}%</span></div>
                    <div className="relative w-full bg-slate-200 rounded-full h-6 overflow-hidden shadow-inner"><div className={`h-full rounded-full transition-all duration-700 ease-out flex items-center justify-end pr-2 ${isFull ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${percentFull}%` }}></div></div>
                    <div className="flex justify-between mt-3 text-sm font-medium text-slate-600"><span>{storage.currentLevel.toFixed(1)} m³</span><span>{storage.capacity.toFixed(0)} m³ Kapazität</span></div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 border border-slate-100 rounded-2xl bg-white shadow-sm flex flex-col items-center text-center"><div className="bg-blue-50 p-2 rounded-full mb-2 text-blue-600"><Database size={20}/></div><div className="text-2xl font-bold text-slate-800">{storage.capacity}</div><div className="text-xs text-slate-400 uppercase font-bold mt-1">Kapazität (m³)</div></div>
                    <div className="p-4 border border-slate-100 rounded-2xl bg-white shadow-sm flex flex-col items-center text-center"><div className="bg-green-50 p-2 rounded-full mb-2 text-green-600"><TrendingUp size={20}/></div><div className="text-2xl font-bold text-slate-800">{storage.dailyGrowth}</div><div className="text-xs text-slate-400 uppercase font-bold mt-1">Zuwachs / Tag</div></div>
                </div>

                <div className="space-y-3">
                    <div className="flex flex-col space-y-3">
                         <div className="flex justify-between items-center"><h3 className="font-bold text-slate-700 flex items-center"><MapPin className="mr-2" size={18}/> Ausbringungshistorie</h3><button onClick={(e) => { e.preventDefault(); setMapStyle(prev => prev === 'standard' ? 'satellite' : 'standard'); }} className="text-xs bg-white border border-slate-200 px-2 py-1 rounded shadow-sm text-slate-600">{mapStyle === 'standard' ? 'Satellit' : 'Karte'}</button></div>
                         <div className="relative"><select value={filterYear} onChange={(e) => setFilterYear(e.target.value === 'all' ? 'all' : parseInt(e.target.value))} className="w-full pl-8 pr-2 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 appearance-none focus:outline-none focus:ring-2 focus:ring-green-500 shadow-sm"><option value="all">Alle Jahre (Gesamt)</option>{availableYears.map(y => (<option key={y} value={y}>{y}</option>))}</select><Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} /></div>
                    </div>

                    <div className="h-64 w-full rounded-xl overflow-hidden border border-slate-300 relative shadow-sm bg-slate-200">
                        <MapContainer key={`map-${filterYear}`} center={[47.5, 14.5]} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                             <TileLayer attribution='&copy; OpenStreetMap' url={mapStyle === 'standard' ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"} />
                            {!loadingHistory && (trackSegments.length > 0 || affectedFields.length > 0) && <FitBoundsToContent tracks={trackSegments} fields={affectedFields} />}
                            {affectedFields.map(f => (<Polygon key={f.id} positions={f.boundary.map(p => [p.lat, p.lng])} color={storageColor} fillOpacity={0.15} weight={1} dashArray="4, 4"><Popup>{f.name}</Popup></Polygon>))}
                            {trackSegments.map((segment, i) => (<Polyline key={`track-${i}`} positions={segment} {...{ pathOptions: { color: storageColor, weight: 4, opacity: 0.8 } } as any} />))}
                            {trackSegments.length === 0 && affectedFields.length === 0 && !loadingHistory && <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-[500]"><div className="text-center text-slate-500 text-sm font-medium">Keine Ausbringungsdaten<br/>{filterYear !== 'all' ? `im Jahr ${filterYear}` : 'gefunden'}.</div></div>}
                        </MapContainer>
                    </div>
                    {trackSegments.length > 0 && <div className="text-[10px] text-slate-500 flex items-center justify-center mt-1"><span className="w-8 h-1 rounded mr-2" style={{backgroundColor: storageColor}}></span><span>GPS-Spur aus {storage.name}</span></div>}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};
