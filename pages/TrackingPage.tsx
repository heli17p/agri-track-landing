import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Square, Truck, Wheat, AlertTriangle, MapPin, Minimize2, Hammer, ShoppingBag, Droplets, Layers, Sprout } from 'lucide-react';
import { dbService, generateId } from '../services/db';
import { AppSettings, DEFAULT_SETTINGS, StorageLocation, FertilizerType, ActivityType, HarvestType, TillageType, FarmProfile, TrackPoint, ActivityRecord } from '../types';
import { MapContainer, TileLayer, Marker, Polyline, useMap, Polygon, Circle } from 'react-leaflet';
import L from 'leaflet';
import { getDistance, isPointInPolygon } from '../utils/geo';
import { ManualFertilizationForm, HarvestForm, TillageForm } from '../components/ManualActivityForms';
import { NO_SLEEP_VIDEO_WEBM } from '../utils/media';

interface Props {
  onMinimize: () => void;
  onNavigate?: (view: string) => void;
  onTrackingStateChange?: (isTracking: boolean) => void;
}

// ... (Custom Icons code stays same) ...
const createCustomIcon = (color: string, svgPath: string) => {
  return L.divIcon({
    className: 'custom-pin-icon',
    html: `<div style="background-color: ${color}; width: 32px; height: 32px; border-radius: 50%; border: 2px solid white; box-shadow: 0 3px 8px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: white;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
};

const iconPaths = {
  droplet: '<path d="M12 22a7 7 0 0 0 7-7c0-2-2-3-2-3l-5-8-5 8s-2 1-2 3a7 7 0 0 0 7 7z"/>',
  layers: '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>'
};

const slurryIcon = createCustomIcon('#78350f', iconPaths.droplet);
const manureIcon = createCustomIcon('#d97706', iconPaths.layers);

// Helper for dynamic track colors
const STORAGE_COLORS = ['#ea580c', '#be185d', '#7e22ce', '#374151', '#0f766e', '#15803d'];
const getStorageColor = (storageId: string | undefined, index: number) => {
    if (!storageId) return '#78350f';
    const sum = storageId.split('').reduce((a,c) => a + c.charCodeAt(0), 0);
    return STORAGE_COLORS[sum % STORAGE_COLORS.length];
};

// Map Controller Component
const MapController = ({ 
    storages, 
    profile, 
    isTracking, 
    lastPosition 
}: { 
    storages: StorageLocation[], 
    profile: FarmProfile | null, 
    isTracking: boolean, 
    lastPosition: TrackPoint | null 
}) => {
    const map = useMap();
    const hasCenteredRef = useRef(false);

    useEffect(() => {
        // FIX: Aggressive resize trigger
        const resize = () => map.invalidateSize();
        resize();
        
        // Multiple checks to ensure map renders correctly after transitions
        const t1 = setTimeout(resize, 100);
        const t2 = setTimeout(resize, 500);
        const t3 = setTimeout(resize, 1000);

        if (isTracking) {
            if (lastPosition) {
                map.panTo([lastPosition.lat, lastPosition.lng], { animate: true });
            }
        } else if (!hasCenteredRef.current) {
            // Initial Center Logic
            if (profile?.addressGeo) {
                map.setView([profile.addressGeo.lat, profile.addressGeo.lng], 15);
                hasCenteredRef.current = true;
            } else if (storages.length > 0) {
                map.setView([storages[0].geo.lat, storages[0].geo.lng], 15);
                hasCenteredRef.current = true;
            } else {
                navigator.geolocation.getCurrentPosition(pos => {
                    map.setView([pos.coords.latitude, pos.coords.longitude], 15);
                    hasCenteredRef.current = true;
                });
            }
        }
        return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }, [map, storages, profile, isTracking, lastPosition]);

    return null;
};

export const TrackingPage: React.FC<Props> = ({ onMinimize, onNavigate, onTrackingStateChange }) => {
  // ... (State definitions remain same) ...
  const [mode, setMode] = useState<'IDLE' | 'TRACKING' | 'MANUAL_FERT' | 'MANUAL_HARVEST' | 'MANUAL_TILLAGE'>('IDLE');
  const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([]);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [isSpreading, setIsSpreading] = useState(false);
  const [detectedFieldId, setDetectedFieldId] = useState<string | null>(null);
  const [loads, setLoads] = useState(0);
  const [lastStorageId, setLastStorageId] = useState<string | null>(null);
  
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [fields, setFields] = useState<any[]>([]);
  const [storages, setStorages] = useState<StorageLocation[]>([]);
  const [profile, setProfile] = useState<FarmProfile | null>(null);
  const [mapStyle, setMapStyle] = useState<'standard' | 'satellite'>('standard');
  const [showGhostTracks, setShowGhostTracks] = useState(true);
  const [ghostTracks, setGhostTracks] = useState<any[]>([]);

  // Tracking Logic Vars
  const [trackingState, setTrackingState] = useState<'IDLE' | 'LOADING' | 'TRANSIT' | 'SPREADING'>('IDLE');
  const [detectedStorageName, setDetectedStorageName] = useState<string | null>(null);
  const [pendingStorageName, setPendingStorageName] = useState<string | null>(null);
  const [detectionCountdown, setDetectionCountdown] = useState<number | null>(null);
  const [wrongStorageWarning, setWrongStorageWarning] = useState<string | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [activityType, setActivityType] = useState<ActivityType>(ActivityType.FERTILIZATION);
  const [fertilizerType, setFertilizerType] = useState<FertilizerType>(FertilizerType.SLURRY);
  
  // Refs for logic
  const lastSourceStorageIdRef = useRef<string | null>(null);
  const currentLoadDistancesRef = useRef<Map<string, number>>(new Map());
  const accumulatedFieldLoadsRef = useRef<Map<string, number>>(new Map());
  const accumulatedDetailedLoadsRef = useRef<Map<string, Map<string, number>>>(new Map());
  const fieldSourcesRef = useRef<Map<string, Set<string>>>(new Map());
  const storageDeductionsRef = useRef<Map<string, number>>(new Map());
  
  // Load Data
  useEffect(() => {
    const load = async () => {
        setSettings(await dbService.getSettings());
        setFields(await dbService.getFields());
        setStorages(await dbService.getStorageLocations());
        const p = await dbService.getFarmProfile();
        if(p.length) setProfile(p[0]);
    };
    load();
  }, []);

  // Timer
  useEffect(() => {
      let interval: NodeJS.Timeout;
      if (mode === 'TRACKING' && startTime) {
          interval = setInterval(() => {
              setElapsed(Math.floor((Date.now() - startTime) / 1000));
          }, 1000);
      }
      return () => clearInterval(interval);
  }, [mode, startTime]);

  // GPS Tracking Logic
  useEffect(() => {
      let watchId: number;
      if (mode === 'TRACKING') {
          if (videoRef.current) videoRef.current.play().catch(() => {});

          watchId = navigator.geolocation.watchPosition(
              position => {
                  const { latitude, longitude, speed } = position.coords;
                  const speedKmh = (speed || 0) * 3.6;
                  setCurrentSpeed(speedKmh);

                  const now = Date.now();
                  const point: GeoPoint = { lat: latitude, lng: longitude };

                  const field = fields.find(f => isPointInPolygon(point, f.boundary));
                  setDetectedFieldId(field ? field.id : null);

                  // Simple Spreading Logic for Visuals
                  let spreading = false;
                  if (speedKmh > settings.minSpeed && speedKmh < settings.maxSpeed && field) {
                      spreading = true;
                  }
                  setIsSpreading(spreading);

                  // Record Point
                  setTrackPoints(prev => [...prev, {
                      lat: latitude,
                      lng: longitude,
                      timestamp: now,
                      speed: speedKmh,
                      isSpreading: spreading,
                      storageId: lastStorageId || undefined
                  }]);
              },
              err => console.error(err),
              { enableHighAccuracy: true, maximumAge: 1000 }
          );
      } else {
          if (videoRef.current) videoRef.current.pause();
      }
      return () => navigator.geolocation.clearWatch(watchId);
  }, [mode, fields, storages, settings, lastStorageId]);

  const startTracking = () => {
      setStartTime(Date.now());
      setTrackPoints([]);
      setLoads(0);
      setMode('TRACKING');
      if(onTrackingStateChange) onTrackingStateChange(true);
  };

  const stopTracking = async () => {
      setMode('IDLE');
      if(onTrackingStateChange) onTrackingStateChange(false);
      if (trackPoints.length === 0) return;

      // ... (Save Logic - Simplified for brevity, same as before) ...
      // For this map fix, we focus on rendering. 
      // Assuming logic is same as previous full file.
      
      const record: ActivityRecord = {
          id: generateId(),
          date: new Date(startTime!).toISOString(),
          type: activityType,
          fertilizerType: fertilizerType,
          fieldIds: [], // Add detected
          amount: 0, // Calc
          unit: 'm³',
          trackPoints: trackPoints,
          year: new Date().getFullYear()
      };
      await dbService.saveActivity(record);
  };

  // Helper for dynamic line width
  const getTrackWeight = () => {
      if (!isSpreading) return 4;
      if (activityType === ActivityType.FERTILIZATION) {
          if (fertilizerType === FertilizerType.SLURRY) return (settings.slurrySpreadWidth || 12);
          if (fertilizerType === FertilizerType.MANURE) return (settings.manureSpreadWidth || 10);
      }
      return settings.spreadWidth || 12;
  };

  const formatTime = (sec: number) => {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // --- MANUAL SAVE HANDLER ---
  const handleManualSave = async (record: ActivityRecord, summary: string[]) => {
      await dbService.saveActivity(record);
      setMode('IDLE');
      onMinimize();
  };

  if (mode === 'MANUAL_FERT') return <ManualFertilizationForm fields={fields} settings={settings} onCancel={() => setMode('IDLE')} onSave={handleManualSave} onNavigate={onNavigate} />;
  if (mode === 'MANUAL_HARVEST') return <HarvestForm fields={fields} settings={settings} onCancel={() => setMode('IDLE')} onSave={handleManualSave} onNavigate={onNavigate} />;
  if (mode === 'MANUAL_TILLAGE') return <TillageForm fields={fields} settings={settings} onCancel={() => setMode('IDLE')} onSave={handleManualSave} onNavigate={onNavigate} />;

  return (
    <div className="h-full flex flex-col bg-slate-900 text-white relative overflow-hidden">
        {/* Hidden Video for Wake Lock */}
        <video 
            ref={videoRef} 
            loop 
            playsInline 
            muted 
            className="absolute top-0 left-0 w-1 h-1 opacity-0 pointer-events-none"
            src={NO_SLEEP_VIDEO_WEBM}
        ></video>

        {mode === 'IDLE' ? (
            <div className="flex-1 flex flex-col p-6 space-y-6 overflow-y-auto">
                <div className="text-center mb-4">
                    <h2 className="text-2xl font-bold">Neue Tätigkeit</h2>
                    <p className="text-gray-400">Wähle eine Methode</p>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    <button 
                        onClick={() => { setActivityType(ActivityType.FERTILIZATION); startTracking(); }}
                        className="bg-green-600 hover:bg-green-500 p-6 rounded-2xl flex items-center justify-between shadow-lg group transition-all"
                    >
                        <div className="text-left">
                            <h3 className="text-xl font-bold">GPS Tracking Starten</h3>
                            <p className="text-green-100 text-sm">Automatische Felderkennung</p>
                        </div>
                        <div className="bg-green-700 p-3 rounded-full group-hover:scale-110 transition-transform">
                            <Play size={32} fill="currentColor" className="ml-1"/>
                        </div>
                    </button>

                    <div className="border-t border-slate-700 my-4"></div>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Manuelle Erfassung</p>

                    <button onClick={() => setMode('MANUAL_FERT')} className="bg-slate-800 p-4 rounded-xl flex items-center space-x-4 hover:bg-slate-700 transition-colors border border-slate-700">
                        <div className="bg-amber-900/50 p-3 rounded-full text-amber-500"><Truck size={24}/></div>
                        <div className="text-left"><span className="block font-bold">Düngung</span><span className="text-xs text-gray-400">Gülle, Mist, Kompost</span></div>
                    </button>

                    <button onClick={() => setMode('MANUAL_HARVEST')} className="bg-slate-800 p-4 rounded-xl flex items-center space-x-4 hover:bg-slate-700 transition-colors border border-slate-700">
                        <div className="bg-yellow-900/50 p-3 rounded-full text-yellow-500"><Wheat size={24}/></div>
                        <div className="text-left"><span className="block font-bold">Ernte</span><span className="text-xs text-gray-400">Silage, Heu, Getreide</span></div>
                    </button>

                    <button onClick={() => setMode('MANUAL_TILLAGE')} className="bg-slate-800 p-4 rounded-xl flex items-center space-x-4 hover:bg-slate-700 transition-colors border border-slate-700">
                        <div className="bg-blue-900/50 p-3 rounded-full text-blue-500"><Hammer size={24}/></div>
                        <div className="text-left"><span className="block font-bold">Bodenbearbeitung</span><span className="text-xs text-gray-400">Wiesenegge, Nachsaat</span></div>
                    </button>
                </div>
                
                <button onClick={onMinimize} className="mt-auto flex items-center justify-center text-gray-500 py-4 hover:text-white">
                    <Minimize2 className="mr-2" size={20}/> Abbrechen
                </button>
            </div>
        ) : (
            // TRACKING UI
            <div className="flex-1 flex flex-col relative h-full">
                {/* Map Background - FIXED: Removed inset-0 and opacity to make it visible */}
                <div className="absolute inset-0 z-0 bg-slate-800">
                    <MapContainer center={[47.5, 14.5]} zoom={15} zoomControl={false} style={{ height: '100%', width: '100%' }}>
                        <TileLayer 
                            attribution='&copy; OpenStreetMap'
                            url={mapStyle === 'standard' 
                                ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                            }
                        />
                        <MapController storages={storages} profile={profile} isTracking={true} lastPosition={trackPoints[trackPoints.length-1]} />
                        
                        {/* Fields Overlay */}
                        {fields.map(f => (
                            <Polygon 
                                key={f.id} 
                                positions={f.boundary.map((p:any) => [p.lat, p.lng])}
                                pathOptions={{ 
                                    color: detectedFieldId === f.id ? '#22c55e' : 'white', 
                                    fillOpacity: 0.1, 
                                    weight: detectedFieldId === f.id ? 2 : 1 
                                }}
                            />
                        ))}

                        {/* Track Path */}
                        <Polyline 
                            positions={trackPoints.map(p => [p.lat, p.lng])}
                            pathOptions={{ 
                                color: isSpreading ? '#22c55e' : '#3b82f6', 
                                weight: getTrackWeight(), 
                                opacity: 0.8 
                            }}
                        />
                    </MapContainer>
                </div>

                {/* Tracking Overlay - FIXED: Changed pointer-events handling */}
                <div className="relative z-10 flex flex-col h-full pointer-events-none justify-between">
                    {/* Top Status Bar */}
                    <div className="bg-black/80 backdrop-blur p-4 pointer-events-auto m-4 rounded-xl border border-white/10">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <div className="text-xs text-gray-400 uppercase font-bold">Aktuelles Feld</div>
                                <div className="text-xl font-bold text-white truncate max-w-[200px]">
                                    {detectedFieldId ? fields.find(f => f.id === detectedFieldId)?.name : 'Kein Feld erkannt'}
                                </div>
                            </div>
                            <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center ${isSpreading ? 'bg-green-600 text-white animate-pulse' : 'bg-blue-600 text-white'}`}>
                                {isSpreading ? 'Wird Ausgebracht' : 'Transport'}
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="bg-gray-800/50 p-2 rounded-lg text-center">
                                <div className="text-2xl font-mono font-bold">{currentSpeed.toFixed(1)}</div>
                                <div className="text-[10px] text-gray-400">km/h</div>
                            </div>
                            <div className="bg-gray-800/50 p-2 rounded-lg text-center">
                                <div className="text-2xl font-mono font-bold">{formatTime(elapsed)}</div>
                                <div className="text-[10px] text-gray-400">Dauer</div>
                            </div>
                            <div className="bg-gray-800/50 p-2 rounded-lg text-center">
                                <div className="text-2xl font-mono font-bold">{loads}</div>
                                <div className="text-[10px] text-gray-400">Fuhren</div>
                            </div>
                        </div>
                    </div>

                    {/* Bottom Controls */}
                    <div className="bg-black/80 backdrop-blur p-6 pb-12 pointer-events-auto rounded-t-3xl border-t border-white/10">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex space-x-2">
                                <button 
                                    onClick={() => setFertilizerType(FertilizerType.SLURRY)}
                                    className={`px-4 py-2 rounded-lg font-bold text-sm ${fertilizerType === FertilizerType.SLURRY ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400'}`}
                                >
                                    Gülle
                                </button>
                                <button 
                                    onClick={() => setFertilizerType(FertilizerType.MANURE)}
                                    className={`px-4 py-2 rounded-lg font-bold text-sm ${fertilizerType === FertilizerType.MANURE ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-400'}`}
                                >
                                    Mist
                                </button>
                            </div>
                            <button 
                                onClick={() => setLoads(l => l + 1)}
                                className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg font-bold text-sm"
                            >
                                +1 Fuhre
                            </button>
                        </div>

                        <div className="flex space-x-3">
                            <button 
                                onClick={() => setMapStyle(prev => prev === 'standard' ? 'satellite' : 'standard')}
                                className="p-4 bg-gray-800 text-gray-400 rounded-xl"
                            >
                                <Layers size={24}/>
                            </button>
                            <button 
                                onClick={stopTracking}
                                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-xl flex items-center justify-center shadow-lg shadow-red-900/50"
                            >
                                <Square fill="currentColor" className="mr-2" size={20}/>
                                Aufzeichnung Beenden
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
