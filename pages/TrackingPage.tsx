import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Circle, Polyline, Polygon, useMap, Popup } from 'react-leaflet';
import { Play, Pause, Square, Navigation, RotateCcw, Save, LocateFixed, ChevronDown, Minimize2, Settings, Layers, AlertTriangle, Truck, Wheat, Hammer, FileText, Trash2, Droplets, Database } from 'lucide-react';
import { dbService, generateId } from '../services/db';
import { Field, StorageLocation, ActivityRecord, TrackPoint, ActivityType, FertilizerType, AppSettings, DEFAULT_SETTINGS, TillageType, HarvestType } from '../types';
import { getDistance, isPointInPolygon } from '../utils/geo';
import { ManualFertilizationForm, HarvestForm, TillageForm } from '../components/ManualActivityForms';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// --- ICONS & ASSETS ---

const createCustomIcon = (color: string, svgPath: string) => {
  return L.divIcon({
    className: 'custom-pin-icon',
    html: `<div style="background-color: ${color}; width: 32px; height: 32px; border-radius: 50%; border: 2px solid white; box-shadow: 0 3px 8px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: white; position: relative;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg><div style="width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid ${color}; position: absolute; bottom: -7px; left: 50%; transform: translateX(-50%);"></div></div>`,
    iconSize: [32, 40],
    iconAnchor: [16, 40], 
    popupAnchor: [0, -42]
  });
};

const iconPaths = {
  droplet: '<path d="M12 22a7 7 0 0 0 7-7c0-2-2-3-2-3l-5-8-5 8s-2 1-2 3a7 7 0 0 0 7 7z"/>',
  layers: '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>'
};

const slurryIcon = createCustomIcon('#78350f', iconPaths.droplet); 
const manureIcon = createCustomIcon('#d97706', iconPaths.layers); 

// --- HELPERS ---

// Map Controller to follow user position
const MapController = ({ center, zoom, follow }: { center: [number, number] | null, zoom: number, follow: boolean }) => {
    const map = useMap();
    useEffect(() => {
        if (center && follow) {
            map.setView(center, zoom, { animate: true });
        }
    }, [center, zoom, follow, map]);
    
    // Fix map rendering issues on mount
    useEffect(() => {
        const t = setTimeout(() => map.invalidateSize(), 200);
        return () => clearTimeout(t);
    }, [map]);
    
    return null;
};

// Colors for storages
const STORAGE_COLORS = ['#ea580c', '#be185d', '#7e22ce', '#374151', '#0f766e', '#15803d'];
const getStorageColor = (storageId: string | undefined, index: number = 0) => {
    if (!storageId) return '#78350f'; 
    const sum = storageId.split('').reduce((a,c) => a + c.charCodeAt(0), 0);
    return STORAGE_COLORS[sum % STORAGE_COLORS.length];
};

// Types
type TrackingState = 'IDLE' | 'LOADING' | 'TRANSIT' | 'SPREADING';

interface Props {
  onMinimize: () => void;
  onNavigate: (view: string) => void;
  onTrackingStateChange: (isActive: boolean) => void;
}

export const TrackingPage: React.FC<Props> = ({ onMinimize, onNavigate, onTrackingStateChange }) => {
  // --- STATE ---
  
  // Data
  const [fields, setFields] = useState<Field[]>([]);
  const [storages, setStorages] = useState<StorageLocation[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // Tracking Core
  const [trackingState, setTrackingState] = useState<TrackingState>('IDLE');
  const [currentLocation, setCurrentLocation] = useState<GeolocationPosition | null>(null);
  const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([]);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  
  // Activity Config
  const [activityType, setActivityType] = useState<ActivityType>(ActivityType.FERTILIZATION);
  const [subType, setSubType] = useState<string>('Gülle'); // Gülle, Mist, Silage, etc.
  
  // Storage Detection Logic
  const pendingStorageIdRef = useRef<string | null>(null);
  const [detectionCountdown, setDetectionCountdown] = useState<number | null>(null);
  const activeLoadingStorageRef = useRef<StorageLocation | null>(null);

  // UI State
  const [mapStyle, setMapStyle] = useState<'standard' | 'satellite'>('standard');
  const [followUser, setFollowUser] = useState(true);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveNotes, setSaveNotes] = useState('');
  
  // Manual Forms
  const [manualMode, setManualMode] = useState<ActivityType | null>(null);

  // Refs for interval management
  const watchIdRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<any>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // --- INIT ---
  useEffect(() => {
    const init = async () => {
        setFields(await dbService.getFields());
        setStorages(await dbService.getStorageLocations());
        setSettings(await dbService.getSettings());
    };
    init();
    return () => {
        stopGPS();
        releaseWakeLock();
    };
  }, []);

  // Update parent about tracking state
  useEffect(() => {
      onTrackingStateChange(trackingState !== 'IDLE');
  }, [trackingState, onTrackingStateChange]);

  // Re-acquire wake lock if visibility changes (e.g. user switches tabs and comes back)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && trackingState !== 'IDLE') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [trackingState]);

  // --- WAKE LOCK ---
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch (err) {
      console.error('Wake Lock Error:', err);
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      } catch(e) { console.error(e); }
    }
  };

  // --- GPS LOGIC ---
  const startGPS = async () => {
      if (!navigator.geolocation) {
          alert("GPS wird von diesem Browser nicht unterstützt.");
          return;
      }

      await requestWakeLock();

      setStartTime(Date.now());
      setTrackingState('TRANSIT');
      setTrackPoints([]);
      setIsPaused(false);

      watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => handleNewPosition(pos),
          (err) => console.error("GPS Error", err),
          { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
      );
  };

  const stopGPS = () => {
      if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
      }
      if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
      }
      releaseWakeLock();
  };

  const handleNewPosition = (pos: GeolocationPosition) => {
      setCurrentLocation(pos);
      if (isPaused) return;

      const { latitude, longitude, speed, accuracy } = pos.coords;
      
      // Filter poor accuracy points (> 30m)
      if (accuracy > 30) return;

      const speedKmh = (speed || 0) * 3.6;
      const point: TrackPoint = {
          lat: latitude,
          lng: longitude,
          timestamp: pos.timestamp,
          speed: speedKmh,
          isSpreading: false // default, updated below
      };

      // 1. STORAGE DETECTION (Only if Fertilization)
      if (activityType === ActivityType.FERTILIZATION) {
          checkStorageProximity(point, speedKmh);
      }

      // 2. STATE MACHINE (Only if not Loading)
      if (trackingState !== 'LOADING') {
          // Detect Spreading vs Transit based on Speed & Field Proximity
          
          // Check if inside any field
          const inField = fields.some(f => isPointInPolygon(point, f.boundary));
          
          // Determine if spreading
          let isSpreading = false;
          
          if (activityType === ActivityType.FERTILIZATION || activityType === ActivityType.TILLAGE) {
             const minSpeed = settings.minSpeed || 2.0;
             const maxSpeed = settings.maxSpeed || 15.0;
             
             if (inField && speedKmh >= minSpeed && speedKmh <= maxSpeed) {
                 isSpreading = true;
             }
          } else if (activityType === ActivityType.HARVEST) {
             if (inField && speedKmh >= 1.0 && speedKmh <= 20.0) {
                 isSpreading = true;
             }
          }

          const newState = isSpreading ? 'SPREADING' : 'TRANSIT';
          if (newState !== trackingState) setTrackingState(newState);
          
          point.isSpreading = isSpreading;
      } else {
          // If LOADING, we are not spreading
          point.isSpreading = false;
          // Tag point with storage ID if we are loading from one
          if (activeLoadingStorageRef.current) {
              point.storageId = activeLoadingStorageRef.current.id;
          }
      }

      // Add to track
      setTrackPoints(prev => [...prev, point]);
  };

  const checkStorageProximity = (point: TrackPoint, speedKmh: number) => {
      // Only for Fertilization
      if (activityType !== ActivityType.FERTILIZATION) return;

      const detectionRadius = settings.storageRadius || 20; // meters
      
      // Find nearest storage
      let nearest: StorageLocation | null = null;
      let minDist = Infinity;

      storages.forEach(s => {
          const dist = getDistance(point, s.geo);
          if (dist < minDist) {
              minDist = dist;
              nearest = s;
          }
      });

      if (nearest && minDist <= detectionRadius) {
          // We are close to a storage
          const nearestId = (nearest as StorageLocation).id;

          if (trackingState === 'LOADING' && activeLoadingStorageRef.current?.id === nearestId) {
              // Already loading from this storage, reset pending check
              pendingStorageIdRef.current = null;
              if (detectionCountdown !== null) {
                  setDetectionCountdown(null);
                  if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
              }
              return;
          }

          // If we are moving very slowly or stopped, start countdown to switch to LOADING
          if (speedKmh < 3.0) {
              if (pendingStorageIdRef.current !== nearestId) {
                  // New detection
                  pendingStorageIdRef.current = nearestId;
                  startDetectionCountdown(nearest as StorageLocation);
              }
          } else {
              // Moving too fast, cancel countdown
              cancelDetection();
          }
      } else {
          // Left proximity
          cancelDetection();
          
          // If we were LOADING, switch back to TRANSIT
          if (trackingState === 'LOADING') {
              // Only switch if we moved significantly away (hysteresis +5m)
              if (!nearest || minDist > (detectionRadius + 5)) {
                  setTrackingState('TRANSIT');
                  activeLoadingStorageRef.current = null;
              }
          }
      }
  };

  const startDetectionCountdown = (storage: StorageLocation) => {
      if (detectionCountdown !== null) return; // Already counting
      
      setDetectionCountdown(5); // 5 seconds to confirm
      
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      
      countdownIntervalRef.current = setInterval(() => {
          setDetectionCountdown(prev => {
              if (prev === null) return null;
              if (prev <= 1) {
                  // Countdown finished -> Switch to LOADING
                  clearInterval(countdownIntervalRef.current);
                  setTrackingState('LOADING');
                  activeLoadingStorageRef.current = storage;
                  
                  // Auto-switch subtype to storage type
                  if (storage.type === FertilizerType.MANURE) setSubType('Mist');
                  else setSubType('Gülle');

                  return null;
              }
              return prev - 1;
          });
      }, 1000);
  };

  const cancelDetection = () => {
      pendingStorageIdRef.current = null;
      setDetectionCountdown(null);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
  };

  // --- SAVE ---
  const handleFinish = async () => {
      stopGPS();
      setTrackingState('IDLE'); // This hides the UI overlays immediately
      
      // Calculate Stats
      const totalDist = trackPoints.length > 1 ? trackPoints.reduce((acc, p, i) => {
          if (i === 0) return 0;
          return acc + getDistance(trackPoints[i-1], p);
      }, 0) : 0; // meters

      // Calculate Area (approximate by spread width * distance spreading)
      // Filter spreading points
      let spreadDist = 0;
      let lastSpreadPoint: TrackPoint | null = null;
      
      trackPoints.forEach(p => {
          if (p.isSpreading) {
              if (lastSpreadPoint) {
                  spreadDist += getDistance(lastSpreadPoint, p);
              }
              lastSpreadPoint = p;
          } else {
              lastSpreadPoint = null;
          }
      });

      // Area in Hectares
      const width = activityType === ActivityType.FERTILIZATION 
          ? (subType === 'Mist' ? settings.manureSpreadWidth : settings.slurrySpreadWidth) 
          : 6; // Default width
      
      const calculatedAreaHa = (spreadDist * (width || 12)) / 10000;

      // Identify Fields
      const fieldIds = new Set<string>();
      
      // We just list fields touched by spreading points
      fields.forEach(f => {
          const pointsInField = trackPoints.filter(p => p.isSpreading && isPointInPolygon(p, f.boundary));
          if (pointsInField.length > 5) { // Threshold to ignore noise
              fieldIds.add(f.id);
          }
      });
      
      // Calculate detailed distribution (per field and per source)
      const detailedFieldSources: Record<string, Record<string, number>> = {};
      const fieldDist: Record<string, number> = {};
      
      trackPoints.forEach(p => {
          if (!p.isSpreading) return;
          
          fields.forEach(f => {
              if (isPointInPolygon(p, f.boundary)) {
                  // It's in this field
                  // Add minimal amount (approx based on distance between points would be better, but count is ok for ratio)
                  const fieldId = f.id;
                  const storageId = p.storageId || 'unknown';
                  
                  if (!detailedFieldSources[fieldId]) detailedFieldSources[fieldId] = {};
                  if (!detailedFieldSources[fieldId][storageId]) detailedFieldSources[fieldId][storageId] = 0;
                  
                  // We just count points for distribution ratio
                  detailedFieldSources[fieldId][storageId]++;
                  
                  if (!fieldDist[fieldId]) fieldDist[fieldId] = 0;
                  fieldDist[fieldId]++;
              }
          });
      });

      const record: ActivityRecord = {
          id: generateId(),
          date: new Date(startTime || Date.now()).toISOString(),
          type: activityType,
          fertilizerType: activityType === ActivityType.FERTILIZATION ? (subType === 'Mist' ? FertilizerType.MANURE : FertilizerType.SLURRY) : undefined,
          tillageType: activityType === ActivityType.TILLAGE ? (subType as TillageType) : undefined,
          fieldIds: Array.from(fieldIds),
          amount: 0, // User must verify
          unit: activityType === ActivityType.HARVEST ? 'Stk' : (activityType === ActivityType.TILLAGE ? 'ha' : 'm³'),
          trackPoints: trackPoints,
          notes: saveNotes + `\nAutomatisch erfasst. Dauer: ${((Date.now() - (startTime||0))/60000).toFixed(0)} min`,
          year: new Date().getFullYear(),
      };
      
      if (activityType === ActivityType.TILLAGE) {
          record.amount = parseFloat(calculatedAreaHa.toFixed(2));
          // Pre-fill distribution for tillage
          const dist: Record<string, number> = {};
          fields.forEach(f => {
              if (fieldIds.has(f.id)) dist[f.id] = f.areaHa; // Simple assumption: full field worked
          });
          record.fieldDistribution = dist;
      }

      await dbService.saveActivity(record);
      
      // Sync
      dbService.syncActivities();

      alert("Aktivität gespeichert!");
      onNavigate('DASHBOARD');
  };

  const handleDiscard = () => {
      if(confirm("Aufzeichnung wirklich verwerfen? Alle Daten gehen verloren.")) {
          stopGPS();
          setTrackingState('IDLE');
          setTrackPoints([]);
          setShowSaveModal(false);
          setDetectionCountdown(null);
          pendingStorageIdRef.current = null;
      }
  };

  const handleManualSave = async (record: ActivityRecord) => {
      await dbService.saveActivity(record);
      dbService.syncActivities(); // Background
      alert("Gespeichert!");
      setManualMode(null);
      onNavigate('DASHBOARD');
  }

  // --- RENDER HELPERS ---
  const pendingStorageName = useMemo(() => {
      if (!pendingStorageIdRef.current) return '';
      return storages.find(s => s.id === pendingStorageIdRef.current)?.name || 'Lager';
  }, [storages, detectionCountdown]); // dependent on countdown state

  const detectedStorageName = activeLoadingStorageRef.current?.name || 'Lager';

  // --- MANUAL MODE RENDER ---
  if (manualMode) {
      if (manualMode === ActivityType.FERTILIZATION) return <ManualFertilizationForm fields={fields} settings={settings} onCancel={() => setManualMode(null)} onSave={handleManualSave} onNavigate={onNavigate} />;
      if (manualMode === ActivityType.HARVEST) return <HarvestForm fields={fields} settings={settings} onCancel={() => setManualMode(null)} onSave={handleManualSave} onNavigate={onNavigate} />;
      if (manualMode === ActivityType.TILLAGE) return <TillageForm fields={fields} settings={settings} onCancel={() => setManualMode(null)} onSave={handleManualSave} onNavigate={onNavigate} />;
  }

  // --- SELECTION SCREEN (IDLE) ---
  if (trackingState === 'IDLE') {
      return (
          <div className="h-full bg-white flex flex-col overflow-y-auto">
              {/* Header */}
              <div className="bg-slate-900 text-white p-6 shrink-0">
                  <h1 className="text-2xl font-bold mb-2">Neue Tätigkeit</h1>
                  <p className="text-slate-400 text-sm">Wähle eine Methode um zu starten.</p>
              </div>

              {/* Quick Start Tracking */}
              <div className="p-6 space-y-6">
                  <div className="bg-green-50 border border-green-200 rounded-2xl p-5 shadow-sm">
                      <h2 className="text-lg font-bold text-green-900 mb-4 flex items-center">
                          <Navigation className="mr-2 fill-green-600 text-green-600"/> GPS Aufzeichnung starten
                      </h2>
                      
                      <div className="space-y-4">
                          <div>
                              <label className="block text-xs font-bold text-green-800 uppercase mb-2">Tätigkeit</label>
                              <div className="grid grid-cols-3 gap-2">
                                  <button onClick={() => { setActivityType(ActivityType.FERTILIZATION); setSubType('Gülle'); }} className={`py-2 rounded-lg border-2 text-sm font-bold transition-all ${activityType === ActivityType.FERTILIZATION ? 'border-green-600 bg-white text-green-700 shadow' : 'border-transparent bg-green-100/50 text-green-800/50'}`}>
                                      Düngung
                                  </button>
                                  <button onClick={() => { setActivityType(ActivityType.HARVEST); setSubType('Silage'); }} className={`py-2 rounded-lg border-2 text-sm font-bold transition-all ${activityType === ActivityType.HARVEST ? 'border-green-600 bg-white text-green-700 shadow' : 'border-transparent bg-green-100/50 text-green-800/50'}`}>
                                      Ernte
                                  </button>
                                  <button onClick={() => { setActivityType(ActivityType.TILLAGE); setSubType('Wiesenegge'); }} className={`py-2 rounded-lg border-2 text-sm font-bold transition-all ${activityType === ActivityType.TILLAGE ? 'border-green-600 bg-white text-green-700 shadow' : 'border-transparent bg-green-100/50 text-green-800/50'}`}>
                                      Boden
                                  </button>
                              </div>
                          </div>
                          
                          {/* Subtype Selector */}
                          <div>
                              <label className="block text-xs font-bold text-green-800 uppercase mb-2">Art</label>
                              <select 
                                value={subType} 
                                onChange={(e) => setSubType(e.target.value)}
                                className="w-full p-3 rounded-xl border border-green-200 bg-white font-bold text-slate-700 outline-none focus:ring-2 focus:ring-green-500"
                              >
                                  {activityType === ActivityType.FERTILIZATION && (
                                      <>
                                          <option value="Gülle">Gülle</option>
                                          <option value="Mist">Mist</option>
                                      </>
                                  )}
                                  {activityType === ActivityType.HARVEST && (
                                      <>
                                          <option value="Silage">Silage</option>
                                          <option value="Heu">Heu</option>
                                          <option value="Stroh">Stroh</option>
                                      </>
                                  )}
                                  {activityType === ActivityType.TILLAGE && (
                                      <>
                                          <option value="Wiesenegge">Wiesenegge</option>
                                          <option value="Schlegeln">Schlegeln</option>
                                          <option value="Striegel">Striegel</option>
                                          <option value="Nachsaat">Nachsaat</option>
                                          <option value="Pflug">Pflug</option>
                                      </>
                                  )}
                              </select>
                          </div>

                          <button 
                            onClick={startGPS}
                            className="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold shadow-lg shadow-green-900/20 flex items-center justify-center text-lg active:scale-[0.98] transition-all"
                          >
                              <Play size={24} className="mr-2 fill-white"/> Start
                          </button>
                      </div>
                  </div>

                  {/* Manual Entry Options */}
                  <div>
                      <h3 className="font-bold text-slate-700 mb-3">Oder manuell erfassen</h3>
                      <div className="grid grid-cols-1 gap-3">
                          <button onClick={() => setManualMode(ActivityType.FERTILIZATION)} className="flex items-center p-4 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm group">
                              <div className="p-2 bg-amber-100 text-amber-700 rounded-lg mr-4 group-hover:bg-amber-200"><Truck size={20}/></div>
                              <span className="font-bold text-slate-600">Düngung nachtragen</span>
                          </button>
                          <button onClick={() => setManualMode(ActivityType.HARVEST)} className="flex items-center p-4 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm group">
                              <div className="p-2 bg-lime-100 text-lime-700 rounded-lg mr-4 group-hover:bg-lime-200"><Wheat size={20}/></div>
                              <span className="font-bold text-slate-600">Ernte nachtragen</span>
                          </button>
                          <button onClick={() => setManualMode(ActivityType.TILLAGE)} className="flex items-center p-4 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm group">
                              <div className="p-2 bg-blue-100 text-blue-700 rounded-lg mr-4 group-hover:bg-blue-200"><Hammer size={20}/></div>
                              <span className="font-bold text-slate-600">Bodenbearbeitung nachtragen</span>
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      );
  }

  // --- TRACKING UI ---

  const currentLat = currentLocation?.coords.latitude || 47.5;
  const currentLng = currentLocation?.coords.longitude || 14.5;

  return (
    <div className="h-full relative bg-slate-900 flex flex-col">
        {/* MAP */}
        <div className="flex-1 relative z-0">
            <MapContainer center={[currentLat, currentLng]} zoom={16} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                <TileLayer 
                    attribution='&copy; OpenStreetMap'
                    url={mapStyle === 'standard' 
                        ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    }
                />
                
                <MapController center={currentLocation ? [currentLat, currentLng] : null} zoom={16} follow={followUser} />
                
                {/* Fields Overlay */}
                {fields.map(f => (
                    <Polygon 
                        key={f.id} 
                        positions={f.boundary.map(p => [p.lat, p.lng])}
                        pathOptions={{ color: f.type === 'Acker' ? '#d97706' : '#15803d', fillOpacity: 0.3, weight: 1 }}
                    />
                ))}

                {/* Live Track */}
                {trackPoints.length > 0 && (
                    <Polyline 
                        positions={trackPoints.map(p => [p.lat, p.lng])}
                        pathOptions={{ color: '#ef4444', weight: 4 }}
                    />
                )}

                {/* Current Location Marker */}
                {currentLocation && (
                    <Marker 
                        position={[currentLat, currentLng]}
                        icon={L.divIcon({
                            className: 'tracker-icon',
                            html: '<div class="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg pulse-ring"></div>',
                            iconSize: [16, 16],
                            iconAnchor: [8, 8]
                        })}
                    />
                )}

                {/* Storages (Visible mainly in Fertilization mode, but good to see in general) */}
                {activityType === ActivityType.FERTILIZATION && storages.map(s => (
                     <React.Fragment key={s.id}>
                         <Circle 
                            center={[s.geo.lat, s.geo.lng]}
                            radius={settings.storageRadius || 20}
                            pathOptions={{ 
                                color: getStorageColor(s.id), 
                                fillColor: getStorageColor(s.id), 
                                fillOpacity: 0.2,
                                dashArray: '5, 5'
                            }}
                         />
                         <Marker 
                            position={[s.geo.lat, s.geo.lng]}
                            icon={s.type === FertilizerType.SLURRY ? slurryIcon : manureIcon}
                         />
                     </React.Fragment>
                ))}
            </MapContainer>
            
            {/* Map Controls */}
            <div className="absolute top-4 right-4 flex flex-col space-y-2 z-[400]">
                 <button onClick={() => setMapStyle(prev => prev === 'standard' ? 'satellite' : 'standard')} className="bg-white/90 p-3 rounded-xl shadow-lg border border-slate-200"><Layers size={24} className="text-slate-700"/></button>
                 <button onClick={() => setFollowUser(!followUser)} className={`p-3 rounded-xl shadow-lg border border-slate-200 ${followUser ? 'bg-blue-600 text-white' : 'bg-white/90 text-slate-700'}`}><LocateFixed size={24}/></button>
            </div>

            {/* Minimize Button */}
            <button 
                onClick={onMinimize}
                className="absolute top-4 left-4 z-[400] bg-white/90 p-2 rounded-lg shadow-lg border border-slate-200 text-slate-600"
            >
                <Minimize2 size={24} />
            </button>

            {/* 3. STATUS PILL (FLOATING) */}
            <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-lg border border-slate-200 z-10 flex items-center space-x-2 pointer-events-none">
                {(() => {
                    let className = 'bg-slate-400';
                    let style = {};
                    
                    if (trackingState === 'SPREADING') {
                        className = 'bg-green-500 animate-pulse';
                    } else if (trackingState === 'TRANSIT') {
                        className = 'bg-blue-500';
                    } else if (trackingState === 'LOADING' || (detectionCountdown !== null && pendingStorageIdRef.current)) {
                        // Dynamic Color Match for Storage
                        const targetId = activeLoadingStorageRef.current?.id || pendingStorageIdRef.current;
                        const index = storages.findIndex(s => s.id === targetId);
                        const color = getStorageColor(targetId, index >= 0 ? index : 0);
                        
                        className = 'animate-pulse';
                        style = { backgroundColor: color, boxShadow: `0 0 6px ${color}` };
                    }

                    return <div className={`w-3 h-3 rounded-full ${className}`} style={style}></div>;
                })()}
                
                <span className="font-bold text-sm text-slate-700">
                    {detectionCountdown 
                        ? `Erkenne ${pendingStorageName}: ${detectionCountdown}s...` 
                        : (trackingState === 'LOADING' ? `LADEN (${detectedStorageName})` : trackingState === 'TRANSIT' ? 'Transferfahrt' : 'Ausbringung')
                    }
                </span>
            </div>
        </div>

        {/* BOTTOM CONTROLS */}
        <div className="bg-white border-t border-slate-200 p-4 pb-safe z-10 shrink-0">
             {showSaveModal ? (
                 <div className="space-y-4 animate-in slide-in-from-bottom-10">
                     <div className="flex justify-between items-center">
                         <h3 className="font-bold text-lg text-slate-800">Aufzeichnung beenden</h3>
                         <button 
                            onClick={handleDiscard}
                            className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg border border-red-100 font-bold flex items-center hover:bg-red-100"
                         >
                             <Trash2 size={14} className="mr-1"/> Verwerfen / Löschen
                         </button>
                     </div>
                     <div>
                         <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Notizen</label>
                         <textarea 
                            value={saveNotes} 
                            onChange={e => setSaveNotes(e.target.value)}
                            className="w-full border p-2 rounded-lg"
                            placeholder="Wetter, Besonderheiten..."
                            rows={2}
                         />
                     </div>
                     <div className="flex space-x-3">
                         <button onClick={() => setShowSaveModal(false)} className="flex-1 py-3 bg-slate-100 font-bold text-slate-600 rounded-xl">Zurück</button>
                         <button onClick={handleFinish} className="flex-1 py-3 bg-green-600 text-white font-bold rounded-xl shadow-lg">Speichern</button>
                     </div>
                 </div>
             ) : (
                 <div className="flex items-center justify-between space-x-4">
                     {/* Info Block */}
                     <div className="flex-1">
                         <div className="text-xs text-slate-500 font-bold uppercase mb-1">{activityType} • {subType}</div>
                         <div className="flex items-end space-x-2">
                             <span className="text-2xl font-mono font-bold text-slate-800">
                                 {startTime ? ((Date.now() - startTime) / 60000).toFixed(0) : 0}
                             </span>
                             <span className="text-xs text-slate-400 mb-1.5">min</span>
                             
                             <span className="text-2xl font-mono font-bold text-slate-800 ml-4">
                                 {((currentLocation?.coords.speed || 0) * 3.6).toFixed(1)}
                             </span>
                             <span className="text-xs text-slate-400 mb-1.5">km/h</span>
                         </div>
                     </div>

                     {/* Action Button */}
                     <button 
                        onClick={() => setShowSaveModal(true)}
                        className="w-16 h-16 bg-red-600 text-white rounded-2xl flex items-center justify-center shadow-lg hover:bg-red-700 active:scale-95 transition-all"
                     >
                         <Square size={24} fill="currentColor" />
                     </button>
                 </div>
             )}
        </div>
    </div>
  );
};
