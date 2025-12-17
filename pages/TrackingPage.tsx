import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Circle, Polyline, Polygon, useMap, Popup, useMapEvents } from 'react-leaflet';
import { Play, Pause, Square, Navigation, RotateCcw, Save, LocateFixed, ChevronDown, Minimize2, Settings, Layers, AlertTriangle, Truck, Wheat, Hammer, FileText, Trash2, Droplets, Database, Clock, ArrowRight, Ban, History, Calendar, CheckCircle, Home, Share2, Loader2, ZoomIn, ZoomOut, Plus, Minus } from 'lucide-react';
import { dbService, generateId } from '../services/db';
import { Field, StorageLocation, ActivityRecord, TrackPoint, ActivityType, FertilizerType, AppSettings, DEFAULT_SETTINGS, TillageType, HarvestType, FarmProfile } from '../types';
import { getDistance, isPointInPolygon } from '../utils/geo';
import { ManualFertilizationForm, HarvestForm, TillageForm } from '../components/ManualActivityForms';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// --- COLOR CONSTANTS ---
const MAP_COLORS = {
    standard: {
        acker: '#92400E',    // Amber-900
        grunland: '#15803D', // Green-700
        default: '#3b82f6'
    },
    satellite: {
        acker: '#F59E0B',    // Amber-500
        grunland: '#84CC16', // Lime-500
        default: '#60a5fa'
    }
};

// --- COLOR PALETTES FOR STORAGE TYPES ---
const SLURRY_PALETTE = ['#451a03', '#78350f', '#92400e', '#b45309', '#854d0e'];
const MANURE_PALETTE = ['#d97706', '#ea580c', '#f59e0b', '#c2410c', '#fb923c'];

const getStorageColor = (storageId: string | undefined, allStorages: StorageLocation[]) => {
    if (!storageId) return '#3b82f6'; // Default Blue
    const storage = allStorages.find(s => s.id === storageId);
    if (!storage) return '#64748b'; 

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

const getCursorIcon = (heading: number | null, type: 'tractor' | 'arrow' | 'dot') => {
    const rotation = heading || 0;
    let content = '';
    let size = [32, 32];
    let anchor = [16, 16];

    if (type === 'tractor') {
        content = `
            <svg viewBox="0 0 50 50" width="100%" height="100%" style="filter: drop-shadow(0px 2px 3px rgba(0,0,0,0.4));">
                <rect x="5" y="30" width="12" height="18" rx="2" fill="#1e293b" stroke="#0f172a" stroke-width="1"/>
                <rect x="33" y="30" width="12" height="18" rx="2" fill="#1e293b" stroke="#0f172a" stroke-width="1"/>
                <rect x="8" y="5" width="8" height="10" rx="2" fill="#1e293b" stroke="#0f172a" stroke-width="1"/>
                <rect x="34" y="5" width="8" height="10" rx="2" fill="#1e293b" stroke="#0f172a" stroke-width="1"/>
                <path d="M20 4 L30 4 L30 20 L34 22 L34 40 L16 40 L16 22 L20 20 Z" fill="#16a34a" stroke="#14532d" stroke-width="1"/>
                <rect x="14" y="24" width="22" height="14" rx="1" fill="#ffffff" fill-opacity="0.9" stroke="#94a3b8" stroke-width="2"/>
            </svg>
        `;
        size = [36, 36]; anchor = [18, 18];
    } else if (type === 'arrow') {
        content = `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="#2563eb" stroke="white" stroke-width="2" style="filter: drop-shadow(0px 2px 3px rgba(0,0,0,0.4));"><path d="M12 2 L22 22 L12 18 L2 22 Z" /></svg>`;
        size = [28, 28]; anchor = [14, 14];
    } else {
        content = `<div style="width: 100%; height: 100%; background-color: #2563eb; border: 2px solid white; border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.5);"></div>`;
        size = [16, 16]; anchor = [8, 8];
    }

    const html = `<div style="transform: rotate(${rotation}deg); transition: transform 0.3s ease; width: ${size[0]}px; height: ${size[1]}px; display: flex; align-items: center; justify-content: center;">${content}</div>`;

    return L.divIcon({ className: 'vehicle-cursor', html: html, iconSize: [size[0], size[1]], iconAnchor: [anchor[0], anchor[1]] });
};

const iconPaths = {
  droplet: '<path d="M12 22a7 7 0 0 0 7-7c0-2-2-3-2-3l-5-8-5 8s-2 1-2 3a7 7 0 0 0 7 7z"/>',
  layers: '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>',
  house: '<path d="M3 21h18M5 21V7l8-5 8 5v14"/>',
};

const slurryIcon = createCustomIcon('#78350f', iconPaths.droplet); 
const manureIcon = createCustomIcon('#d97706', iconPaths.layers); 
const farmIcon = createCustomIcon('#2563eb', iconPaths.house);

// Map Controller
const MapController = ({ center, zoom, follow, onZoomChange }: { center: [number, number] | null, zoom: number, follow: boolean, onZoomChange: (z: number) => void }) => {
    const map = useMap();
    useEffect(() => { if (center) map.setView(center, zoom, { animate: follow }); }, [center, zoom, follow, map]);
    useEffect(() => { const t = setTimeout(() => map.invalidateSize(), 200); return () => clearTimeout(t); }, [map]);
    useMapEvents({ zoomend: () => onZoomChange(map.getZoom()) });
    return null;
};

// Types
type TrackingState = 'IDLE' | 'LOADING' | 'TRANSIT' | 'SPREADING';
type HistoryMode = 'OFF' | 'RECENT' | 'YEAR' | 'ALL_12M';
type VehicleIconType = 'tractor' | 'arrow' | 'dot';

interface Props {
  onMinimize: () => void;
  onNavigate: (view: string) => void;
  onTrackingStateChange: (isActive: boolean) => void;
}

export const TrackingPage: React.FC<Props> = ({ onMinimize, onNavigate, onTrackingStateChange }) => {
  // State
  const [fields, setFields] = useState<Field[]>([]);
  const [storages, setStorages] = useState<StorageLocation[]>([]);
  const [profile, setProfile] = useState<FarmProfile | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // Refs for Live Tracking
  const settingsRef = useRef<AppSettings>(DEFAULT_SETTINGS);
  const fieldsRef = useRef<Field[]>([]);
  const storagesRef = useRef<StorageLocation[]>([]);
  const activityTypeRef = useRef<ActivityType>(ActivityType.FERTILIZATION);
  const subTypeRef = useRef<string>('Gülle');

  // Tracking Core
  const [trackingState, setTrackingState] = useState<TrackingState>('IDLE');
  const trackingStateRef = useRef<TrackingState>('IDLE');

  const [currentLocation, setCurrentLocation] = useState<GeolocationPosition | null>(null);
  const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([]);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  
  // Load Counting & Source Tracking
  const [loadCounts, setLoadCounts] = useState<Record<string, number>>({}); 
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  
  // NEW: Per-Load Tracking Logic
  const currentLoadIndexRef = useRef<number>(1);
  const activeSourceIdRef = useRef<string | null>(null);

  // Activity Config
  const [activityType, setActivityType] = useState<ActivityType>(ActivityType.FERTILIZATION);
  const [subType, setSubType] = useState<string>('Gülle');
  
  // Storage Detection Logic
  const pendingStorageIdRef = useRef<string | null>(null);
  const [detectionCountdown, setDetectionCountdown] = useState<number | null>(null);
  const activeLoadingStorageRef = useRef<StorageLocation | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  // UI State
  const [mapStyle, setMapStyle] = useState<'standard' | 'satellite'>('standard');
  const [followUser, setFollowUser] = useState(true);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveNotes, setSaveNotes] = useState('');
  const [summaryRecord, setSummaryRecord] = useState<ActivityRecord | null>(null);
  const [currentZoom, setCurrentZoom] = useState(18);
  
  // Finish & Edit State
  const [distributionOverrides, setDistributionOverrides] = useState<Record<string, number>>({});
  const [detectedFieldsList, setDetectedFieldsList] = useState<Field[]>([]);
  
  // Visuals
  const [vehicleIconType, setVehicleIconType] = useState<VehicleIconType>('tractor');
  
  // History
  const [historyMode, setHistoryMode] = useState<HistoryMode>('OFF');
  const [allHistoryTracks, setAllHistoryTracks] = useState<ActivityRecord[]>([]);
  
  // Manual Forms (Imported Components)
  const [manualMode, setManualMode] = useState<ActivityType | null>(null);

  // System Refs
  const watchIdRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<any>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Sync Refs
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { fieldsRef.current = fields; }, [fields]);
  useEffect(() => { storagesRef.current = storages; }, [storages]);
  useEffect(() => { activityTypeRef.current = activityType; }, [activityType]);
  useEffect(() => { subTypeRef.current = subType; }, [subType]);
  useEffect(() => { trackingStateRef.current = trackingState; }, [trackingState]);
  useEffect(() => { activeSourceIdRef.current = activeSourceId; }, [activeSourceId]);

  // Init
  useEffect(() => {
    const init = async () => {
        setFields(await dbService.getFields());
        setStorages(await dbService.getStorageLocations());
        setSettings(await dbService.getSettings());
        const profiles = await dbService.getFarmProfile();
        if (profiles.length > 0) setProfile(profiles[0]);

        const allActs = await dbService.getActivities();
        const pastTracks = allActs
            .filter(a => a.type === ActivityType.FERTILIZATION && a.trackPoints && a.trackPoints.length > 0)
            .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setAllHistoryTracks(pastTracks);
    };
    init();
    const unsub = dbService.onDatabaseChange(init);
    return () => { stopGPS(); releaseWakeLock(); unsub(); };
  }, []);

  useEffect(() => { onTrackingStateChange(trackingState !== 'IDLE'); }, [trackingState, onTrackingStateChange]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && trackingState !== 'IDLE') requestWakeLock();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [trackingState]);

  useEffect(() => {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
          if (trackingState !== 'IDLE') { e.preventDefault(); e.returnValue = ''; }
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [trackingState]);

  const requestWakeLock = async () => {
    try { if ('wakeLock' in navigator) wakeLockRef.current = await navigator.wakeLock.request('screen'); } catch (err) { console.error(err); }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) { try { await wakeLockRef.current.release(); wakeLockRef.current = null; } catch(e) { console.error(e); } }
  };

  // --- GPS ---
  const startGPS = async () => {
      if (!navigator.geolocation) { alert("GPS wird nicht unterstützt."); return; }
      setGpsLoading(true);
      try {
          await new Promise((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, (err) => reject(err), { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 });
          });
      } catch (error: any) {
          setGpsLoading(false);
          alert("GPS Fehler: " + (error.message || "Kein Signal"));
          return;
      }

      await requestWakeLock();
      setStartTime(Date.now());
      setTrackingState('TRANSIT');
      setTrackPoints([]);
      setLoadCounts({});
      setActiveSourceId(null);
      currentLoadIndexRef.current = 1; // Start with Load 1
      setIsPaused(false);
      setStorageWarning(null);
      setSummaryRecord(null);
      setGpsLoading(false);

      watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => handleNewPosition(pos),
          (err) => console.error("GPS Error", err),
          { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
      );
  };

  const stopGPS = () => {
      if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
      if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
      releaseWakeLock();
  };

  const handleNewPosition = (pos: GeolocationPosition) => {
      setCurrentLocation(pos);
      if (isPaused) return;

      const currentFields = fieldsRef.current;
      const currentSettings = settingsRef.current;
      const currentActivity = activityTypeRef.current;
      const currentState = trackingStateRef.current;

      const { latitude, longitude, speed, accuracy } = pos.coords;
      if (accuracy > 30) return;

      const speedKmh = (speed || 0) * 3.6;
      
      const point: TrackPoint = {
          lat: latitude,
          lng: longitude,
          timestamp: pos.timestamp,
          speed: speedKmh,
          isSpreading: false,
          storageId: activeSourceIdRef.current || undefined,
          loadIndex: currentLoadIndexRef.current // KEY: Tag point with current load ID
      };

      if (currentActivity === ActivityType.FERTILIZATION) checkStorageProximity(point, speedKmh);

      if (currentState !== 'LOADING') {
          const inField = currentFields.some(f => isPointInPolygon(point, f.boundary));
          let isSpreading = false;
          if (currentActivity === ActivityType.FERTILIZATION || currentActivity === ActivityType.TILLAGE) {
             const minSpeed = currentSettings.minSpeed || 2.0;
             const maxSpeed = currentSettings.maxSpeed || 15.0;
             if (inField && speedKmh >= minSpeed && speedKmh <= maxSpeed) isSpreading = true;
          }
          const newState = isSpreading ? 'SPREADING' : 'TRANSIT';
          if (newState !== currentState) setTrackingState(newState);
          point.isSpreading = isSpreading;
      } else {
          point.isSpreading = false;
          if (activeLoadingStorageRef.current) point.storageId = activeLoadingStorageRef.current.id;
      }

      setTrackPoints(prev => [...prev, point]);
  };

  const checkStorageProximity = (point: TrackPoint, speedKmh: number) => {
      const currentStorages = storagesRef.current;
      const currentSettings = settingsRef.current;
      const currentActivity = activityTypeRef.current;
      const currentSubType = subTypeRef.current;
      const currentState = trackingStateRef.current;

      if (currentActivity !== ActivityType.FERTILIZATION) return;
      const detectionRadius = currentSettings.storageRadius || 20;
      
      if (currentState === 'LOADING' && activeLoadingStorageRef.current) {
          const distToActive = getDistance(point, activeLoadingStorageRef.current.geo);
          if (distToActive > detectionRadius && speedKmh > 2.0) {
              setTrackingState('TRANSIT');
              activeLoadingStorageRef.current = null;
              cancelDetection();
              setStorageWarning(null);
              return;
          }
          return; 
      }

      let nearest: StorageLocation | null = null;
      let minDist = Infinity;
      currentStorages.forEach(s => {
          const dist = getDistance(point, s.geo);
          if (dist < minDist) { minDist = dist; nearest = s; }
      });

      if (nearest && minDist <= detectionRadius) {
          const nearestLoc = nearest as StorageLocation;
          if (nearestLoc.type !== currentSubType) {
              setStorageWarning(`${nearestLoc.name} falscher Typ!`);
              cancelDetection(); return; 
          }
          setStorageWarning(null);
          const nearestId = nearestLoc.id;

          if (speedKmh < 3.0) {
              if (pendingStorageIdRef.current !== nearestId) {
                  pendingStorageIdRef.current = nearestId;
                  startDetectionCountdown(nearestLoc);
              }
          } else { cancelDetection(); }
      } else { cancelDetection(); setStorageWarning(null); }
  };

  const startDetectionCountdown = (storage: StorageLocation) => {
      if (countdownIntervalRef.current) return; 
      setDetectionCountdown(60); 
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      
      countdownIntervalRef.current = setInterval(() => {
          setDetectionCountdown(prev => {
              if (prev === null) return null;
              if (prev <= 1) {
                  if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
                  countdownIntervalRef.current = null;

                  setTrackingState('LOADING');
                  activeLoadingStorageRef.current = storage;
                  
                  setLoadCounts(prevCounts => ({ ...prevCounts, [storage.id]: (prevCounts[storage.id] || 0) + 1 }));
                  
                  // NEW: Increment Load Index (start next load session)
                  currentLoadIndexRef.current += 1;
                  
                  setActiveSourceId(storage.id);
                  return null;
              }
              return prev - 1;
          });
      }, 1000);
  };

  const cancelDetection = () => {
      pendingStorageIdRef.current = null;
      setDetectionCountdown(null);
      if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
  };

  // --- STOP & CALCULATE ---
  const stopTrackingAndCalculate = () => {
      stopGPS();
      setTrackingState('IDLE');

      // 1. Group points by loadIndex
      const pointsByLoad: Record<number, TrackPoint[]> = {};
      const loads = new Set<number>();
      
      trackPoints.forEach(p => {
          const idx = p.loadIndex || 1; // Default to 1 if missing
          if (!pointsByLoad[idx]) pointsByLoad[idx] = [];
          pointsByLoad[idx].push(p);
          loads.add(idx);
      });

      const loadDistribution: Record<string, number> = {}; 
      const fieldIds = new Set<string>();

      // 2. Iterate each load separately to perform precise distribution
      loads.forEach(loadIdx => {
          const points = pointsByLoad[loadIdx];
          let loadTotalDist = 0;
          const loadFieldDist: Record<string, number> = {};
          
          // Calculate distance driven *spreading* for THIS specific load
          for (let i = 1; i < points.length; i++) {
              const p1 = points[i-1];
              const p2 = points[i];
              if (p2.isSpreading) {
                  const d = getDistance(p1, p2);
                  loadTotalDist += d;
                  const f = fields.find(field => isPointInPolygon(p2, field.boundary));
                  if (f) {
                      loadFieldDist[f.id] = (loadFieldDist[f.id] || 0) + d;
                      fieldIds.add(f.id);
                  }
              }
          }

          // Distribute 1.0 Load (or partial load) across fields based on distance share in *this* trip
          if (loadTotalDist > 0) {
              Object.keys(loadFieldDist).forEach(fid => {
                  const ratio = loadFieldDist[fid] / loadTotalDist;
                  // Add proportion of 1 load to the total count for this field
                  loadDistribution[fid] = (loadDistribution[fid] || 0) + ratio;
              });
          }
      });

      const relevantFields = fields.filter(f => fieldIds.has(f.id));
      setDetectedFieldsList(relevantFields);

      // Round for UI
      const uiDistribution: Record<string, number> = {};
      Object.keys(loadDistribution).forEach(fid => {
          uiDistribution[fid] = parseFloat(loadDistribution[fid].toFixed(1));
      });

      setDistributionOverrides(uiDistribution);
      setShowSaveModal(true);
  };

  const handleFinish = async () => {
      // Sum user overrides for total
      const userTotalLoads = Object.values(distributionOverrides).reduce((a, b) => a + b, 0);
      
      // Generic Area calc (Total distance)
      let spreadDist = 0;
      const fieldDistMap: Record<string, number> = {}; 
      const fieldIds = new Set<string>();
      detectedFieldsList.forEach(f => fieldIds.add(f.id));

      for (let i = 1; i < trackPoints.length; i++) {
          const p1 = trackPoints[i-1];
          const p2 = trackPoints[i];
          if (p2.isSpreading) {
              const dist = getDistance(p1, p2);
              spreadDist += dist;
              const f = fields.find(field => isPointInPolygon(p2, field.boundary));
              if (f) fieldDistMap[f.id] = (fieldDistMap[f.id] || 0) + dist;
          }
      }

      const width = activityType === ActivityType.FERTILIZATION 
          ? (subType === 'Mist' ? settings.manureSpreadWidth : settings.slurrySpreadWidth) 
          : 6; 
      
      const calculatedAreaHa = (spreadDist * (width || 12)) / 10000;
      
      let totalAmount = 0;
      const storageDistribution: Record<string, number> = {};
      
      if (activityType === ActivityType.FERTILIZATION) {
          const loadSize = subType === 'Mist' ? settings.manureLoadSize : settings.slurryLoadSize;
          if (userTotalLoads > 0) {
              totalAmount = userTotalLoads * loadSize;
              // Distribute storage usage proportionally to total recorded loads
              const recordedTotalLoads = Object.values(loadCounts).reduce((a, b) => a + b, 0);
              Object.entries(loadCounts).forEach(([storageId, count]) => {
                  let share = 0;
                  if (recordedTotalLoads > 0) share = count / recordedTotalLoads;
                  else share = 1 / Object.keys(loadCounts).length;
                  if (!isFinite(share)) share = 1;
                  storageDistribution[storageId] = parseFloat((share * totalAmount).toFixed(2));
              });
          } else { totalAmount = 0; }
      } else if (activityType === ActivityType.TILLAGE) {
          totalAmount = parseFloat(calculatedAreaHa.toFixed(2));
      }

      const finalFieldDistribution: Record<string, number> = {};
      const finalDetailedSources: Record<string, Record<string, number>> = {};

      // NEW: Per-Load Calculation Logic for precise field splits
      // This runs alongside the distance-based logic to handle discrete load distribution
      if (activityType === ActivityType.FERTILIZATION) {
          const loadSize = subType === 'Mist' ? settings.manureLoadSize : settings.slurryLoadSize;
          
          // 1. Group points by loadIndex
          const pointsByLoad: Record<number, TrackPoint[]> = {};
          const uniqueLoads = new Set<number>();
          
          trackPoints.forEach(p => {
              const idx = p.loadIndex || 1; // Default to 1 if legacy
              if (!pointsByLoad[idx]) pointsByLoad[idx] = [];
              pointsByLoad[idx].push(p);
              uniqueLoads.add(idx);
          });

          // 2. Iterate each load separately
          uniqueLoads.forEach(loadIdx => {
              const points = pointsByLoad[loadIdx];
              
              // FIND SOURCE FOR THIS LOAD
              // We check points in this load. If any point has a storageID, we assume the whole load came from there.
              // Logic: The first point with a storage ID wins.
              const loadStorageId = points.find(p => p.storageId)?.storageId || 'unknown';

              let distInLoad = 0;
              const distPerFieldInLoad: Record<string, number> = {};
              
              // Calculate distances for THIS load
              for (let i = 1; i < points.length; i++) {
                  if (points[i].isSpreading) {
                      const d = getDistance(points[i-1], points[i]);
                      distInLoad += d;
                      const f = fields.find(field => isPointInPolygon(points[i], field.boundary));
                      if (f) distPerFieldInLoad[f.id] = (distPerFieldInLoad[f.id] || 0) + d;
                  }
              }

              // Distribute 1 Load (or partial load logic if needed) based on distance share in THIS trip
              if (distInLoad > 0) {
                  Object.keys(distPerFieldInLoad).forEach(fId => {
                      const share = distPerFieldInLoad[fId] / distInLoad; // 0.0 to 1.0 of the load
                      
                      // Calculate concrete volume for this part of the load
                      const volumePart = parseFloat((share * loadSize).toFixed(2));
                      
                      // Add to total field distribution
                      finalFieldDistribution[fId] = (finalFieldDistribution[fId] || 0) + volumePart;

                      // Add to detailed source tracking
                      if (!finalDetailedSources[fId]) finalDetailedSources[fId] = {};
                      finalDetailedSources[fId][loadStorageId] = (finalDetailedSources[fId][loadStorageId] || 0) + volumePart;
                  });
              }
          });

      } else {
          // Fallback for Tillage/Harvest (Area/Count based on Distance)
          if (totalAmount > 0 && spreadDist > 0) {
              Object.keys(fieldDistMap).forEach(fId => {
                  const ratio = fieldDistMap[fId] / spreadDist;
                  const allocatedAmount = parseFloat((totalAmount * ratio).toFixed(2));
                  if (allocatedAmount > 0) finalFieldDistribution[fId] = allocatedAmount;
              });
          }
      }

      const durationMin = Math.round((startTime ? Date.now() - startTime : 0) / 60000);

      const record: ActivityRecord = {
          id: generateId(),
          date: new Date(startTime || Date.now()).toISOString(),
          type: activityType,
          fertilizerType: activityType === ActivityType.FERTILIZATION ? (subType === 'Mist' ? FertilizerType.MANURE : FertilizerType.SLURRY) : undefined,
          tillageType: activityType === ActivityType.TILLAGE ? (subType as TillageType) : undefined,
          fieldIds: Array.from(fieldIds),
          amount: parseFloat(totalAmount.toFixed(2)), 
          unit: activityType === ActivityType.HARVEST ? 'Stk' : (activityType === ActivityType.TILLAGE ? 'ha' : 'm³'),
          trackPoints: trackPoints,
          loadCount: userTotalLoads, 
          storageDistribution: activityType === ActivityType.FERTILIZATION ? storageDistribution : undefined,
          notes: saveNotes + `\nAutomatisch erfasst. Dauer: ${durationMin} min`,
          year: new Date().getFullYear(),
          fieldDistribution: finalFieldDistribution,
          detailedFieldSources: finalDetailedSources
      };
      
      await dbService.saveActivity(record);
      if (activityType === ActivityType.FERTILIZATION && Object.keys(storageDistribution).length > 0) {
          await dbService.updateStorageLevels(storageDistribution);
      }
      dbService.syncActivities();
      setSummaryRecord(record); 
      setShowSaveModal(false);
  };

  const handleCloseSummary = () => {
      setSummaryRecord(null);
      onNavigate('DASHBOARD');
  };

  const handleDiscard = () => {
      if(confirm("Aufzeichnung wirklich verwerfen? Alle Daten gehen verloren.")) {
          stopGPS();
          setTrackingState('IDLE');
          setTrackPoints([]);
          setLoadCounts({});
          setActiveSourceId(null);
          setShowSaveModal(false);
          setDetectionCountdown(null);
          setStorageWarning(null);
          pendingStorageIdRef.current = null;
      }
  };

  const handleManualSave = async (record: ActivityRecord) => {
      await dbService.saveActivity(record);
      
      // NEW: Update Storage Levels if manual entry has distribution
      if (record.type === ActivityType.FERTILIZATION && record.storageDistribution) {
          await dbService.updateStorageLevels(record.storageDistribution);
      }

      dbService.syncActivities(); // Background
      
      // Instead of alert, show Summary Overlay
      setSummaryRecord(record); 
      setManualMode(null);
  }

  const cycleHistoryMode = () => {
      setHistoryMode(prev => {
          if (prev === 'OFF') return 'RECENT';
          if (prev === 'RECENT') return 'YEAR';
          if (prev === 'YEAR') return 'ALL_12M';
          return 'OFF';
      });
  };

  // Toggle vehicle icon
  const toggleVehicleIcon = () => {
      setVehicleIconType(prev => {
          if (prev === 'tractor') return 'arrow';
          if (prev === 'arrow') return 'dot';
          return 'tractor';
      });
  };

  // --- HISTORY FILTER ---
  const visibleHistoryTracks = useMemo(() => {
      if (historyMode === 'OFF') return [];
      
      if (historyMode === 'RECENT') return allHistoryTracks.slice(0, 5); // Last 5 trips
      
      if (historyMode === 'YEAR') {
          const currentYear = new Date().getFullYear();
          // Filter safety cap at 100 to avoid crash
          return allHistoryTracks.filter(a => new Date(a.date).getFullYear() === currentYear).slice(0, 100);
      }
      
      if (historyMode === 'ALL_12M') {
          const oneYearAgo = new Date();
          oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
          // Filter safety cap at 150
          return allHistoryTracks.filter(a => new Date(a.date) >= oneYearAgo).slice(0, 150);
      }
      
      return [];
  }, [historyMode, allHistoryTracks]);

  // --- RENDER HELPERS ---
  const pendingStorageName = useMemo(() => {
      if (!pendingStorageIdRef.current) return '';
      return storages.find(s => s.id === pendingStorageIdRef.current)?.name || 'Lager';
  }, [storages, detectionCountdown]);

  const detectedStorageName = activeLoadingStorageRef.current?.name || 'Lager';

  const totalLoadsDisplay = Object.values(loadCounts).reduce((a, b) => a + b, 0);

  // --- FIELD COLOR LOGIC (Match MapPage) ---
  const getFieldColor = (field: Field) => {
      if (field.color) return field.color;
      const colors = mapStyle === 'satellite' ? MAP_COLORS.satellite : MAP_COLORS.standard;
      return field.type === 'Acker' ? colors.acker : colors.grunland;
  };

  // NEW: Calculate active spread width for visualization based on settings
  const currentSpreadWidth = useMemo(() => {
      if (activityType === ActivityType.FERTILIZATION) {
          // Check Subtype (Gülle vs Mist)
          if (subType === 'Mist') {
              return settings.manureSpreadWidth || 10;
          } else {
              return settings.slurrySpreadWidth || 12;
          }
      }
      // Fallback for Tillage/Harvest (generic spreadWidth)
      return settings.spreadWidth || 12;
  }, [activityType, subType, settings]);

  // --- MAP SEGMENTS FOR COLORING ---
  const trackSegments = useMemo(() => {
      if (trackPoints.length < 2) return [];
      
      const segments: { points: [number, number][], color: string, isSpreading: boolean }[] = [];
      let currentPoints: [number, number][] = [[trackPoints[0].lat, trackPoints[0].lng]];
      // PASS STORAGES TO COLOR HELPER
      let currentColor = getStorageColor(trackPoints[0].storageId, storages);
      let currentSpreadState = trackPoints[0].isSpreading;

      for (let i = 1; i < trackPoints.length; i++) {
          const p = trackPoints[i];
          const prev = trackPoints[i-1];
          const color = getStorageColor(p.storageId, storages);
          
          // Start new segment if color OR spreading state changes
          if (color !== currentColor || p.isSpreading !== currentSpreadState) {
              segments.push({ 
                  points: currentPoints, 
                  color: currentColor,
                  isSpreading: currentSpreadState 
              });
              // Start new segment overlapping previous point
              currentPoints = [[prev.lat, prev.lng], [p.lat, p.lng]];
              currentColor = color;
              currentSpreadState = p.isSpreading;
          } else {
              currentPoints.push([p.lat, p.lng]);
          }
      }
      // Push final
      segments.push({ points: currentPoints, color: currentColor, isSpreading: currentSpreadState });
      return segments;
  }, [trackPoints, storages]); // Recalc when points change OR storages change

  // Determine initial center: 1. Current GPS, 2. Farm Location, 3. Austria Default
  const currentLat = currentLocation?.coords.latitude || profile?.addressGeo?.lat || 47.5;
  const currentLng = currentLocation?.coords.longitude || profile?.addressGeo?.lng || 14.5;

  // --- 1. RENDER PRIORITY: SUMMARY OVERLAY ---
  // Fix: This must be checked BEFORE the IDLE check, otherwise IDLE screen shadows it.
  if (summaryRecord) {
      return (
          <div className="h-full relative bg-slate-900 overflow-hidden">
              {/* Blurred Map Background */}
              <div className="absolute inset-0 opacity-50 blur-sm pointer-events-none">
                  <MapContainer center={[currentLat, currentLng]} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                      {summaryRecord.trackPoints && <Polyline positions={summaryRecord.trackPoints.map(p => [p.lat, p.lng])} color="blue" />}
                  </MapContainer>
              </div>

              {/* Summary Card */}
              <div className="absolute inset-0 flex flex-col items-center justify-center p-4 z-[60]">
                  <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
                      
                      {/* Success Header (Fixed) */}
                      <div className="bg-green-600 p-8 text-center text-white relative overflow-hidden shrink-0">
                          <div className="absolute inset-0 bg-gradient-to-br from-green-500 to-green-700 opacity-90"></div>
                          <div className="relative z-10 flex flex-col items-center">
                              <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mb-4 shadow-inner backdrop-blur-sm">
                                  <CheckCircle size={48} className="text-white drop-shadow-md" />
                              </div>
                              <h2 className="text-3xl font-bold mb-1">Gespeichert!</h2>
                              <div className="text-green-100 font-medium text-sm bg-white/10 px-3 py-1 rounded-full">{summaryRecord.type}</div>
                          </div>
                      </div>

                      {/* Stats Grid (Scrollable) */}
                      <div className="p-6 overflow-y-auto">
                          <div className="grid grid-cols-2 gap-4 mb-6">
                              {/* Duration */}
                              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                  <div className="flex items-center text-slate-400 text-xs font-bold uppercase mb-1">
                                      <Clock size={12} className="mr-1"/> Dauer
                                  </div>
                                  <div className="text-xl font-bold text-slate-800">
                                      {summaryRecord.notes?.match(/Dauer: (\d+) min/)?.[1] || 0} <span className="text-sm text-slate-500">min</span>
                                  </div>
                              </div>

                              {/* Amount */}
                              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                  <div className="flex items-center text-slate-400 text-xs font-bold uppercase mb-1">
                                      <Database size={12} className="mr-1"/> Gesamt
                                  </div>
                                  <div className="text-xl font-bold text-slate-800">
                                      {summaryRecord.amount} <span className="text-sm text-slate-500">{summaryRecord.unit}</span>
                                  </div>
                              </div>

                              {/* Loads (If available) */}
                              {summaryRecord.loadCount !== undefined && summaryRecord.loadCount > 0 && (
                                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                      <div className="flex items-center text-slate-400 text-xs font-bold uppercase mb-1">
                                          <Truck size={12} className="mr-1"/> Fuhren
                                      </div>
                                      <div className="text-xl font-bold text-slate-800">
                                          {summaryRecord.loadCount}
                                      </div>
                                  </div>
                              )}

                              {/* Fields Count */}
                              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                  <div className="flex items-center text-slate-400 text-xs font-bold uppercase mb-1">
                                      <Square size={12} className="mr-1"/> Felder
                                  </div>
                                  <div className="text-xl font-bold text-slate-800">
                                      {summaryRecord.fieldIds.length}
                                  </div>
                              </div>
                          </div>

                          {/* Involved Fields List (Preview) */}
                          <div className="mb-6">
                              <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Bearbeitete Felder</h3>
                              <div className="flex flex-wrap gap-2">
                                  {summaryRecord.fieldIds.length === 0 ? (
                                      <span className="text-xs text-slate-400 italic">Keine Felder zugeordnet.</span>
                                  ) : (
                                      summaryRecord.fieldIds.slice(0, 5).map(fid => {
                                          const f = fields.find(field => field.id === fid);
                                          const amount = summaryRecord.fieldDistribution?.[fid];
                                          return f ? (
                                              <span key={fid} className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold border border-slate-200">
                                                  {f.name} {amount ? `(${amount} ${summaryRecord.unit})` : ''}
                                              </span>
                                          ) : null;
                                      })
                                  )}
                                  {summaryRecord.fieldIds.length > 5 && (
                                      <span className="text-xs text-slate-400 py-1">+ {summaryRecord.fieldIds.length - 5} weitere</span>
                                  )}
                              </div>
                          </div>

                          <button 
                              onClick={handleCloseSummary}
                              className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-slate-800 flex items-center justify-center transition-transform active:scale-95"
                          >
                              <Home size={20} className="mr-2"/> Zurück zur Übersicht
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      );
  }

  // --- 2. MANUAL MODE RENDER ---
  if (manualMode) {
      if (manualMode === ActivityType.FERTILIZATION) return <ManualFertilizationForm fields={fields} storages={storages} settings={settings} onCancel={() => setManualMode(null)} onSave={handleManualSave} onNavigate={onNavigate} />;
      if (manualMode === ActivityType.HARVEST) return <HarvestForm fields={fields} settings={settings} onCancel={() => setManualMode(null)} onSave={handleManualSave} onNavigate={onNavigate} />;
      if (manualMode === ActivityType.TILLAGE) return <TillageForm fields={fields} settings={settings} onCancel={() => setManualMode(null)} onSave={handleManualSave} onNavigate={onNavigate} />;
  }

  // --- 3. SELECTION SCREEN (IDLE) ---
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
                              <div className="grid grid-cols-2 gap-2">
                                  <button onClick={() => { setActivityType(ActivityType.FERTILIZATION); setSubType('Gülle'); }} className={`py-3 rounded-lg border-2 text-base font-bold transition-all ${activityType === ActivityType.FERTILIZATION ? 'border-green-600 bg-white text-green-700 shadow' : 'border-transparent bg-green-100/50 text-green-800/50'}`}>
                                      Düngung
                                  </button>
                                  <button onClick={() => { setActivityType(ActivityType.TILLAGE); setSubType('Wiesenegge'); }} className={`py-3 rounded-lg border-2 text-base font-bold transition-all ${activityType === ActivityType.TILLAGE ? 'border-green-600 bg-white text-green-700 shadow' : 'border-transparent bg-green-100/50 text-green-800/50'}`}>
                                      Bodenbearbeitung
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
                            disabled={gpsLoading}
                            className="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold shadow-lg shadow-green-900/20 flex items-center justify-center text-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-wait"
                          >
                              {gpsLoading ? <Loader2 className="animate-spin mr-2"/> : <Play size={24} className="mr-2 fill-white"/>} 
                              {gpsLoading ? 'Suche GPS...' : 'Start'}
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

  // --- 4. ACTIVE TRACKING RENDER ---
  return (
    <div className="h-full relative bg-slate-900 flex flex-col">
        {/* CSS for Filling Animation */}
        <style>{`
            @keyframes fillUp {
                0% { height: 0%; opacity: 0.8; }
                50% { height: 60%; opacity: 1; }
                100% { height: 100%; opacity: 0.8; }
            }
            .animate-fill {
                animation: fillUp 2s infinite ease-in-out;
            }
        `}</style>

        {/* MAP */}
        <div className="flex-1 relative z-0">
            <MapContainer center={[currentLat, currentLng]} zoom={currentZoom} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                <TileLayer 
                    attribution='&copy; OpenStreetMap'
                    url={mapStyle === 'standard' 
                        ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    }
                />
                
                <MapController center={[currentLat, currentLng]} zoom={currentZoom} follow={followUser} onZoomChange={setCurrentZoom} />
                
                {/* Fields Overlay - Now using synchronized colors */}
                {fields.map(f => (
                    <Polygon 
                        key={f.id} 
                        positions={f.boundary.map(p => [p.lat, p.lng])}
                        pathOptions={{ 
                            color: getFieldColor(f), // Uses same logic as MapPage
                            fillOpacity: 0.3, 
                            weight: 1 
                        }}
                    />
                ))}

                {/* Farm Location (Hofstelle) */}
                {profile?.addressGeo && (
                    <Marker 
                        position={[profile.addressGeo.lat, profile.addressGeo.lng]} 
                        icon={farmIcon}
                    />
                )}

                {/* GHOST TRACKS (History) */}
                {historyMode !== 'OFF' && visibleHistoryTracks.map((act, i) => (
                    act.trackPoints && act.trackPoints.length > 1 && (
                        <Polyline 
                            key={`hist-${i}`}
                            positions={act.trackPoints.map(p => [p.lat, p.lng])}
                            pathOptions={{
                                color: historyMode === 'ALL_12M' ? '#a855f7' : historyMode === 'YEAR' ? '#16a34a' : '#3b82f6', 
                                weight: 2,
                                opacity: 0.4,
                                dashArray: '4, 4'
                            }}
                        />
                    )
                ))}

                {/* Live Track - DYNAMIC SEGMENTS */}
                {trackSegments.map((segment, index) => {
                    // USE CALCULATED WIDTH BASED ON SETTINGS (1m = 2px)
                    const weight = segment.isSpreading ? (currentSpreadWidth * 2) : 4;
                    const opacity = segment.isSpreading ? 0.9 : 0.6;
                    
                    return (
                        <React.Fragment key={`seg-${index}`}>
                            {/* Main Colored Line */}
                            <Polyline 
                                positions={segment.points}
                                pathOptions={{ 
                                    color: segment.color, 
                                    weight: weight,
                                    opacity: opacity,
                                    lineCap: 'butt'
                                }}
                            />
                            {/* Dash overlay for spreading */}
                            {segment.isSpreading && (
                                <Polyline 
                                    positions={segment.points}
                                    pathOptions={{ 
                                        color: 'white', 
                                        weight: 2, 
                                        opacity: 0.5,
                                        dashArray: '5, 10'
                                    }}
                                />
                            )}
                        </React.Fragment>
                    );
                })}

                {/* Current Location Marker (TRACTOR / ARROW / DOT) */}
                {currentLocation && (
                    <Marker 
                        position={[currentLat, currentLng]}
                        icon={getCursorIcon(currentLocation.coords.heading, vehicleIconType)}
                        zIndexOffset={1000} // Always on top
                        eventHandlers={{
                            click: toggleVehicleIcon // Click to cycle through icons
                        }}
                    />
                )}

                {/* Storages - COLORED CIRCLES BASED ON TYPE */}
                {activityType === ActivityType.FERTILIZATION && storages.map(s => {
                     const color = getStorageColor(s.id, storages);
                     return (
                         <React.Fragment key={s.id}>
                             <Circle 
                                center={[s.geo.lat, s.geo.lng]}
                                radius={settings.storageRadius || 20}
                                pathOptions={{ 
                                    color: color, 
                                    fillColor: color, 
                                    fillOpacity: 0.3,
                                    dashArray: '5, 5'
                                }}
                             />
                             <Marker 
                                position={[s.geo.lat, s.geo.lng]}
                                icon={s.type === FertilizerType.SLURRY ? slurryIcon : manureIcon}
                             />
                         </React.Fragment>
                     );
                })}
            </MapContainer>
            
            {/* Map Controls */}
            <div className="absolute top-4 right-4 flex flex-col space-y-2 z-[400] items-end pointer-events-auto">
                 <button onClick={() => setMapStyle(prev => prev === 'standard' ? 'satellite' : 'standard')} className="bg-white/90 p-3 rounded-xl shadow-lg border border-slate-200"><Layers size={24} className="text-slate-700"/></button>
                 <button onClick={() => setFollowUser(!followUser)} className={`p-3 rounded-xl shadow-lg border border-slate-200 ${followUser ? 'bg-blue-600 text-white' : 'bg-white/90 text-slate-700'}`}><LocateFixed size={24}/></button>
                 
                 {/* Ghost Tracks Toggle with Mode Indicator */}
                 <div className="flex items-center space-x-2">
                     {historyMode !== 'OFF' && (
                         <span className="bg-white/90 backdrop-blur text-[10px] font-bold px-2 py-1 rounded shadow-sm text-slate-600 animate-in slide-in-from-right-4">
                             {historyMode === 'RECENT' ? 'Letzte 5' : historyMode === 'YEAR' ? `Jahr ${new Date().getFullYear()}` : '12 Monate'}
                         </span>
                     )}
                     <button 
                        onClick={cycleHistoryMode} 
                        className={`p-3 rounded-xl shadow-lg border border-slate-200 transition-colors ${
                            historyMode === 'RECENT' ? 'bg-blue-600 text-white border-blue-500' :
                            historyMode === 'YEAR' ? 'bg-green-600 text-white border-green-500' :
                            historyMode === 'ALL_12M' ? 'bg-purple-600 text-white border-purple-500' :
                            'bg-white/90 text-slate-700'
                        }`}
                        title="Alte Spuren anzeigen"
                     >
                        <History size={24}/>
                     </button>
                 </div>
            </div>

            {/* STORAGE LEGEND (Top Left) */}
            {activityType === ActivityType.FERTILIZATION && storages.length > 0 && (
                <div className="absolute top-4 left-4 bg-white/90 backdrop-blur p-2 rounded-lg shadow-lg border border-slate-200 z-[400] max-w-[150px] pointer-events-none">
                    <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Lager</div>
                    {storages.filter(s => s.type === subType).map(s => {
                        const color = getStorageColor(s.id, storages);
                        return (
                            <div key={s.id} className="flex items-center text-[10px] text-slate-700 mb-0.5 last:mb-0">
                                <span className="w-2.5 h-2.5 rounded-full mr-1.5 shrink-0" style={{backgroundColor: color, border: '1px solid white'}}></span>
                                <span className="truncate">{s.name}</span>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Minimize Button */}
            <button 
                onClick={onMinimize}
                className="absolute top-20 left-4 z-[400] bg-white/90 p-2 rounded-lg shadow-lg border border-slate-200 text-slate-600 pointer-events-auto"
            >
                <Minimize2 size={24} />
            </button>

            {/* 3. STATUS PILL (FLOATING & ENHANCED) */}
            <div className="absolute top-24 left-1/2 transform -translate-x-1/2 z-[400] w-full max-w-[90%] flex flex-col items-center pointer-events-none space-y-2">
                
                {/* WARNING BANNER FOR MISMATCHED TYPE */}
                {storageWarning && (
                    <div className="bg-orange-500/95 backdrop-blur text-white px-4 py-2 rounded-xl shadow-xl flex items-center space-x-2 animate-in slide-in-from-top-4 w-full justify-center">
                        <Ban size={20} className="shrink-0 animate-pulse"/>
                        <span className="font-bold text-xs">{storageWarning}</span>
                    </div>
                )}

                <div className="bg-white/95 backdrop-blur shadow-xl border border-slate-300 rounded-full px-5 py-3 flex items-center space-x-3 pointer-events-auto transition-all w-fit max-w-full">
                    {/* Visual Indicator */}
                    {(() => {
                        if (detectionCountdown !== null) {
                            return (
                                <div className="p-2 rounded-full text-white shadow-sm bg-amber-500 animate-pulse">
                                    <Clock size={20} />
                                </div>
                            );
                        } 
                        
                        if (trackingState === 'LOADING') {
                            const targetId = activeLoadingStorageRef.current?.id || pendingStorageIdRef.current;
                            const color = getStorageColor(targetId, storages);
                            
                            return (
                                <div className="relative w-10 h-10 rounded-full border-2 border-white shadow-sm overflow-hidden bg-slate-200">
                                    {/* FILL ANIMATION */}
                                    <div 
                                        className="absolute bottom-0 left-0 w-full animate-fill"
                                        style={{ backgroundColor: color }}
                                    ></div>
                                    {/* ICON */}
                                    <div className="absolute inset-0 flex items-center justify-center text-white drop-shadow-sm z-10">
                                        <Database size={18} />
                                    </div>
                                </div>
                            );
                        } 
                        
                        if (trackingState === 'SPREADING') {
                            const sourceId = activeSourceId;
                            const color = getStorageColor(sourceId, storages);
                            return (
                                <div className="w-10 h-10 flex items-center justify-center rounded-full text-white shadow-sm animate-pulse border-2 border-white" style={{backgroundColor: color}}>
                                    <Droplets size={20} />
                                </div>
                            );
                        } 
                        
                        if (trackingState === 'TRANSIT') {
                            return (
                                <div className="w-10 h-10 flex items-center justify-center rounded-full text-white shadow-sm bg-blue-500 border-2 border-white">
                                    <Truck size={20} />
                                </div>
                            );
                        }

                        // Default IDLE
                        return (
                            <div className="p-2 rounded-full text-white shadow-sm bg-slate-400">
                                <Navigation size={20} />
                            </div>
                        );
                    })()}
                    
                    {/* Text Status */}
                    <div className="flex flex-col overflow-hidden">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-0.5">Status</span>
                        <span className="font-bold text-slate-800 text-sm whitespace-nowrap truncate">
                            {detectionCountdown 
                                ? `Timer läuft: ${pendingStorageName} (${detectionCountdown}s)` 
                                : trackingState === 'LOADING' 
                                    ? `LADEN: ${detectedStorageName}` 
                                    : trackingState === 'SPREADING' 
                                        ? 'Am Feld (Ausbringung)'
                                        : trackingState === 'TRANSIT' 
                                            ? 'Transportfahrt' 
                                            : 'Bereit (Warte auf GPS)'
                            }
                        </span>
                    </div>
                </div>
            </div>
        </div>

        {/* BOTTOM CONTROLS */}
        <div className="bg-white border-t border-slate-200 p-4 pb-safe z-10 shrink-0">
             {showSaveModal ? (
                 <div className="space-y-4 animate-in slide-in-from-bottom-10">
                     <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                         <h3 className="font-bold text-lg text-slate-800">Aufzeichnung beenden</h3>
                         <button 
                            onClick={handleDiscard}
                            className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg border border-red-100 font-bold flex items-center hover:bg-red-100"
                         >
                             <Trash2 size={14} className="mr-1"/> Verwerfen
                         </button>
                     </div>
                     
                     {/* LOAD DISTRIBUTION EDITOR (Dynamic per-load logic) */}
                     {activityType === ActivityType.FERTILIZATION && detectedFieldsList.length > 0 && (
                         <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                             <h4 className="text-xs font-bold text-blue-800 uppercase mb-2">Verteilung anpassen (Fuhren)</h4>
                             <div className="space-y-2">
                                 {detectedFieldsList.map(f => {
                                     const currentLoad = distributionOverrides[f.id] || 0;
                                     return (
                                         <div key={f.id} className="flex justify-between items-center bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                                             <div className="flex flex-col truncate mr-2"><span className="text-sm font-bold text-slate-700 truncate">{f.name}</span><span className="text-[10px] text-slate-400">{f.areaHa.toFixed(2)} ha</span></div>
                                             <div className="flex items-center space-x-2 shrink-0">
                                                 <button onClick={() => setDistributionOverrides(prev => ({ ...prev, [f.id]: Math.max(0, (prev[f.id] || 0) - 0.5) }))} className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-full font-bold text-slate-600 hover:bg-slate-200 active:scale-95"><Minus size={16}/></button>
                                                 <div className="w-12 text-center font-mono font-bold text-lg">{currentLoad.toFixed(1)}</div>
                                                 <button onClick={() => setDistributionOverrides(prev => ({ ...prev, [f.id]: (prev[f.id] || 0) + 0.5 }))} className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-full font-bold text-slate-600 hover:bg-slate-200 active:scale-95"><Plus size={16}/></button>
                                             </div>
                                         </div>
                                     );
                                 })}
                             </div>
                             <div className="mt-2 text-right text-xs font-bold text-blue-700">Gesamt: {Object.values(distributionOverrides).reduce((a,b) => a+b, 0).toFixed(1)} Fuhren</div>
                         </div>
                     )}

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
                         <div className="flex items-end space-x-6">
                             {/* Timer */}
                             <div>
                                 <span className="text-2xl font-mono font-bold text-slate-800">
                                     {startTime ? ((Date.now() - startTime) / 60000).toFixed(0) : 0}
                                 </span>
                                 <span className="text-xs text-slate-400 ml-1">min</span>
                             </div>
                             
                             {/* Load Counter (Enhanced) */}
                             {activityType === ActivityType.FERTILIZATION && (
                                 <div className="flex flex-col">
                                     {totalLoadsDisplay === 0 ? (
                                         <div className="text-slate-400 text-sm font-bold mt-1">0 Fuhren</div>
                                     ) : (
                                         <div className="flex flex-wrap gap-2 max-w-[150px]">
                                             {Object.entries(loadCounts).map(([sId, count]) => {
                                                 const st = storages.find(s => s.id === sId);
                                                 const color = getStorageColor(sId, storages);
                                                 return (
                                                     <div key={sId} className="flex items-center bg-slate-100 px-2 py-0.5 rounded text-xs font-bold text-slate-700 border border-slate-200">
                                                         <span className="w-2 h-2 rounded-full mr-1.5" style={{backgroundColor: color}}></span>
                                                         {count} {st ? st.name.substring(0, 5) : 'Unk'}
                                                     </div>
                                                 );
                                             })}
                                         </div>
                                     )}
                                 </div>
                             )}
                             
                             {/* Speed */}
                             <div>
                                 <span className="text-2xl font-mono font-bold text-slate-800">
                                     {((currentLocation?.coords.speed || 0) * 3.6).toFixed(1)}
                                 </span>
                                 <span className="text-xs text-slate-400 ml-1">km/h</span>
                             </div>
                         </div>
                     </div>

                     {/* Action Button */}
                     <button 
                        onClick={stopTrackingAndCalculate}
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
