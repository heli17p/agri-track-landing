import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Truck, Wheat, AlertTriangle, MapPin, Minimize2, Hammer, ShoppingBag, Droplets, Layers, Sprout } from 'lucide-react';
import { dbService, generateId } from '../services/db';
import { AppSettings, DEFAULT_SETTINGS, StorageLocation, FertilizerType, ActivityType, HarvestType, TillageType, FarmProfile, TrackPoint, ActivityRecord } from '../types';
import { MapContainer, TileLayer, Marker, Polyline, useMap, Polygon } from 'react-leaflet';
import L from 'leaflet';
import { getDistance, isPointInPolygon } from '../utils/geo';
import { ManualFertilizationForm, HarvestForm, TillageForm } from '../components/ManualActivityForms';

interface Props {
  onMinimize: () => void;
  onNavigate?: (view: string) => void;
}

// Custom Icons
const tractorIcon = L.divIcon({
  className: 'custom-gps-icon',
  html: '<div style="background-color: #16a34a; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

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
        // FIX: Force resize immediately and after delay
        map.invalidateSize();
        const t = setTimeout(() => map.invalidateSize(), 300);

        if (isTracking) {
            if (lastPosition) {
                map.panTo([lastPosition.lat, lastPosition.lng], { animate: true });
            }
            return () => clearTimeout(t);
        }

        // Initial Center Logic
        if (!hasCenteredRef.current) {
            if (profile?.addressGeo) {
                map.setView([profile.addressGeo.lat, profile.addressGeo.lng], 15);
                hasCenteredRef.current = true;
            } else if (storages.length > 0) {
                map.setView([storages[0].geo.lat, storages[0].geo.lng], 15);
                hasCenteredRef.current = true;
            } else {
                // Try getting current location once
                navigator.geolocation.getCurrentPosition(pos => {
                    map.setView([pos.coords.latitude, pos.coords.longitude], 15);
                    hasCenteredRef.current = true;
                });
            }
        }
        return () => clearTimeout(t);
    }, [map, storages, profile, isTracking, lastPosition]);

    return null;
};

export const TrackingPage: React.FC<Props> = ({ onMinimize, onNavigate }) => {
  const [mode, setMode] = useState<'IDLE' | 'TRACKING' | 'MANUAL_FERT' | 'MANUAL_HARVEST' | 'MANUAL_TILLAGE'>('IDLE');
  
  // Tracking State
  const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([]);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [isSpreading, setIsSpreading] = useState(false);
  const [detectedFieldId, setDetectedFieldId] = useState<string | null>(null);
  const [loads, setLoads] = useState(0);
  const [lastStorageId, setLastStorageId] = useState<string | null>(null); // To detect refill
  
  // Settings & Data
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [fields, setFields] = useState<any[]>([]);
  const [storages, setStorages] = useState<StorageLocation[]>([]);
  const [profile, setProfile] = useState<FarmProfile | null>(null);

  // Wake Lock for Screen
  const videoRef = useRef<HTMLVideoElement>(null);

  // Activity Type Selection for Tracking
  const [activityType, setActivityType] = useState<ActivityType>(ActivityType.FERTILIZATION);
  const [fertilizerType, setFertilizerType] = useState<FertilizerType>(FertilizerType.SLURRY);

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
          // Enable Wake Lock via Video Hack
          if (videoRef.current) {
              videoRef.current.play().catch(() => {});
          }

          watchId = navigator.geolocation.watchPosition(
              position => {
                  const { latitude, longitude, speed } = position.coords;
                  const speedKmh = (speed || 0) * 3.6;
                  setCurrentSpeed(speedKmh);

                  const now = Date.now();
                  const point: GeoPoint = { lat: latitude, lng: longitude };

                  // 1. Detect Field
                  const field = fields.find(f => isPointInPolygon(point, f.boundary));
                  setDetectedFieldId(field ? field.id : null);

                  // 2. Detect Storage (Refill)
                  const nearbyStorage = storages.find(s => getDistance(point, s.geo) < settings.storageRadius);
                  if (nearbyStorage) {
                      // Logic: If we were away and now are back at storage -> New Load?
                      // Simple logic: Just entering storage area doesn't count, leaving does?
                      // Or simple counter.
                      if (lastStorageId !== nearbyStorage.id) {
                          setLastStorageId(nearbyStorage.id);
                          // Auto-increment load if we came from field? 
                          // For simplicity, we assume refill happens if we are near storage and speed is low.
                      }
                  } else {
                      // Left storage area
                      if (lastStorageId) {
                          setLoads(l => l + 1);
                          setLastStorageId(null);
                      }
                  }

                  // 3. Spreading Logic (Auto)
                  let spreading = false;
                  if (speedKmh > settings.minSpeed && speedKmh < settings.maxSpeed && field) {
                      spreading = true;
                  }
                  setIsSpreading(spreading);

                  // 4. Record Point
                  setTrackPoints(prev => [...prev, {
                      lat: latitude,
                      lng: longitude,
                      timestamp: now,
                      speed: speedKmh,
                      isSpreading: spreading,
                      storageId: lastStorageId || undefined // Tag point with source if known (or last known)
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
      setLoads(0); // Start with 0, first trip counts when leaving storage or manually
      setMode('TRACKING');
  };

  const stopTracking = async () => {
      setMode('IDLE');
      if (trackPoints.length === 0) return;

      // Analysis
      const duration = elapsed;
      
      // Calculate field distribution based on spreading points
      const fieldDist: Record<string, number> = {}; // FieldID -> Duration/Amount
      const fieldSources: Record<string, Set<string>> = {}; // FieldID -> Set<StorageID>

      let spreadingTime = 0;
      
      trackPoints.forEach(p => {
          if (p.isSpreading) {
              const f = fields.find(field => isPointInPolygon(p, field.boundary));
              if (f) {
                  fieldDist[f.id] = (fieldDist[f.id] || 0) + 1; // Count points
                  spreadingTime++;
                  
                  // Track Source per Field
                  // Note: Logic needs `lastStorageId` to be persisted in trackpoints effectively
                  // For now we assume a simple model.
              }
          }
      });

      // Convert points count to share ratio
      const totalPoints = Object.values(fieldDist).reduce((a, b) => a + b, 0);
      const involvedFieldIds = Object.keys(fieldDist);

      // Amount Calculation
      let totalAmount = 0;
      let unit = 'm³';
      
      if (activityType === ActivityType.FERTILIZATION) {
          const loadVol = fertilizerType === FertilizerType.SLURRY ? settings.slurryLoadSize : settings.manureLoadSize;
          totalAmount = Math.max(1, loads) * loadVol; // At least 1 load if tracked
      } else {
          // Harvest/Tillage: Amount is area based usually
          unit = 'ha';
          totalAmount = involvedFieldIds.reduce((sum, id) => sum + (fields.find(f => f.id === id)?.areaHa || 0), 0);
      }

      // Distribute amount to fields
      const finalDist: Record<string, number> = {};
      involvedFieldIds.forEach(fid => {
          const ratio = fieldDist[fid] / totalPoints;
          finalDist[fid] = parseFloat((totalAmount * ratio).toFixed(2));
      });

      const record: ActivityRecord = {
          id: generateId(),
          date: new Date(startTime!).toISOString(),
          type: activityType,
          fertilizerType: activityType === ActivityType.FERTILIZATION ? fertilizerType : undefined,
          fieldIds: involvedFieldIds,
          amount: totalAmount,
          unit: unit,
          loadCount: loads > 0 ? loads : 1,
          fieldDistribution: finalDist,
          trackPoints: trackPoints, // Save GPS trace
          year: new Date().getFullYear(),
          notes: `GPS Track: ${Math.floor(duration/60)} min`
      };

      await dbService.saveActivity(record);
      
      // Update Storage Levels if Fertilization
      if (activityType === ActivityType.FERTILIZATION) {
          // Simple logic: Deduct from first found storage or warn
          // Better: Use `lastStorageId` tracking.
      }
  };

  const formatTime = (sec: number) => {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // --- MANUAL SAVE HANDLER ---
  const handleManualSave = async (record: ActivityRecord, summary: string[]) => {
      await dbService.saveActivity(record);
      
      // Update Storage if applicable (Simple deduction logic)
      if (record.type === ActivityType.FERTILIZATION && record.fertilizerType && record.amount) {
          // Find matching storage (e.g. first of type)
          const targetStorage = storages.find(s => s.type === record.fertilizerType);
          if (targetStorage) {
              const updated = { 
                  ...targetStorage, 
                  currentLevel: Math.max(0, targetStorage.currentLevel - record.amount) 
              };
              await dbService.saveStorageLocation(updated);
          }
      }

      setMode('IDLE');
      onMinimize(); // Go back to dashboard
  };

  // --- RENDER MODES ---

  if (mode === 'MANUAL_FERT') {
      return <ManualFertilizationForm fields={fields} settings={settings} onCancel={() => setMode('IDLE')} onSave={handleManualSave} onNavigate={onNavigate} />;
  }
  
  if (mode === 'MANUAL_HARVEST') {
      return <HarvestForm fields={fields} settings={settings} onCancel={() => setMode('IDLE')} onSave={handleManualSave} onNavigate={onNavigate} />;
  }

  if (mode === 'MANUAL_TILLAGE') {
      return <TillageForm fields={fields} settings={settings} onCancel={() => setMode('IDLE')} onSave={handleManualSave} onNavigate={onNavigate} />;
  }

  return (
    <div className="h-full flex flex-col bg-slate-900 text-white relative overflow-hidden">
        {/* Hidden Video for Wake Lock */}
        <video 
            ref={videoRef} 
            loop 
            playsInline 
            muted 
            className="absolute top-0 left-0 w-1 h-1 opacity-0 pointer-events-none"
            src="data:video/webm;base64,GkXfo0AgQoaBAUL3gQFC8oEEQvOBCEKCQAR3ZWJtQoeBAkKFgQIYX4BNQI0VSalmAAAAAAAVsalmAAAAAAAFqUbfQCoCWGtzaHU0gQFC94EBQreBAkF2gQlMdm9yYmlzQoUBAAAAAAAAE4EDAQAAAAAAACqbAQ4AAAAAAABpYgAAAAAAANF7AAAAAAAAVrp/"
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
                {/* Map Background */}
                <div className="absolute inset-0 z-0 opacity-60">
                    <MapContainer center={[47.5, 14.5]} zoom={15} zoomControl={false} style={{ height: '100%', width: '100%' }}>
                        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
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
                            pathOptions={{ color: isSpreading ? '#22c55e' : '#3b82f6', weight: 4 }}
                        />
                    </MapContainer>
                </div>

                {/* Tracking Overlay */}
                <div className="relative z-10 flex flex-col h-full pointer-events-none">
                    {/* Top Status Bar */}
                    <div className="bg-black/80 backdrop-blur p-4 pointer-events-auto">
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

                    <div className="flex-1"></div>

                    {/* Bottom Controls */}
                    <div className="bg-black/80 backdrop-blur p-6 pb-12 pointer-events-auto rounded-t-3xl">
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

                        <button 
                            onClick={stopTracking}
                            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-xl flex items-center justify-center shadow-lg shadow-red-900/50"
                        >
                            <Square fill="currentColor" className="mr-2" size={20}/>
                            Aufzeichnung Beenden
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
