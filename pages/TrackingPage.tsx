
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Circle, Polyline, Polygon, useMap, Popup, useMapEvents } from 'react-leaflet';
import { Play, Pause, Square, Navigation, RotateCcw, Save, LocateFixed, ChevronDown, Minimize2, Settings, Layers, AlertTriangle, Truck, Wheat, Hammer, FileText, Trash2, Droplets, Database, Clock, ArrowRight, Ban, History, Calendar, CheckCircle, Home, Share2, Loader2, ZoomIn, ZoomOut, Plus, Minus, MousePointer2 } from 'lucide-react';
import { dbService, generateId } from '../services/db';
import { Field, StorageLocation, ActivityRecord, TrackPoint, ActivityType, FertilizerType, AppSettings, DEFAULT_SETTINGS, TillageType, HarvestType, FarmProfile } from '../types';
import { getDistance, isPointInPolygon } from '../utils/geo';
import { ManualFertilizationForm, HarvestForm, TillageForm } from '../components/ManualActivityForms';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// --- FARBKONSTANTEN FÜR DIE KARTE ---
const MAP_COLORS = {
    standard: {
        acker: '#92400E',    // Amber-900 (Braun)
        grunland: '#15803D', // Green-700 (Dunkelgrün)
        default: '#3b82f6'
    },
    satellite: {
        acker: '#F59E0B',    // Amber-500 (Orange/Gelb)
        grunland: '#84CC16', // Lime-500 (Hellgrün)
        default: '#60a5fa'
    }
};

// Paletten für verschiedene Lagerstandorte (wird beim Zeichnen der Spur verwendet)
const SLURRY_PALETTE = ['#451a03', '#78350f', '#92400e', '#b45309', '#854d0e'];
const MANURE_PALETTE = ['#d97706', '#ea580c', '#f59e0b', '#c2410c', '#fb923c'];

const getStorageColor = (storageId: string | undefined, allStorages: StorageLocation[]) => {
    if (!storageId) return '#3b82f6'; // Standard Blau für Transit ohne Lagerzuordnung
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

// --- ICON-ERSTELLUNG ---
const createCustomIcon = (color: string, svgPath: string) => {
  return L.divIcon({
    className: 'custom-pin-icon',
    html: `<div style="background-color: ${color}; width: 32px; height: 32px; border-radius: 50%; border: 2px solid white; box-shadow: 0 3px 8px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: white; position: relative;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg><div style="width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid ${color}; position: absolute; bottom: -7px; left: 50%; transform: translateX(-50%);"></div></div>`,
    iconSize: [32, 40],
    iconAnchor: [16, 40], 
    popupAnchor: [0, -42]
  });
};

const getCursorIcon = (heading: number | null, type: 'tractor' | 'arrow' | 'dot', isTestMode: boolean) => {
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
                <path d="M20 4 L30 4 L30 20 L34 22 L34 40 L16 40 L16 22 L20 20 Z" fill="${isTestMode ? '#f59e0b' : '#16a34a'}" stroke="#14532d" stroke-width="1"/>
                <rect x="14" y="24" width="22" height="14" rx="1" fill="#ffffff" fill-opacity="0.9" stroke="#94a3b8" stroke-width="2"/>
            </svg>
        `;
        size = [36, 36]; anchor = [18, 18];
    } else if (type === 'arrow') {
        content = `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="${isTestMode ? '#f59e0b' : '#2563eb'}" stroke="white" stroke-width="2" style="filter: drop-shadow(0px 2px 3px rgba(0,0,0,0.4));"><path d="M12 2 L22 22 L12 18 L2 22 Z" /></svg>`;
        size = [28, 28]; anchor = [14, 14];
    } else {
        content = `<div style="width: 100%; height: 100%; background-color: ${isTestMode ? '#f59e0b' : '#2563eb'}; border: 2px solid white; border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.5);"></div>`;
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

const farmIcon = createCustomIcon('#2563eb', iconPaths.house);
const slurryIcon = createCustomIcon('#78350f', iconPaths.droplet); 
const manureIcon = createCustomIcon('#d97706', iconPaths.layers); 

// --- MAP CONTROLLER MIT TESTMODUS KAMPATIBILITÄT ---
const MapController = ({ center, zoom, follow, onZoomChange, onMapClick, isTestMode }: { 
    center: [number, number] | null, 
    zoom: number, 
    follow: boolean, 
    onZoomChange: (z: number) => void,
    onMapClick: (lat: number, lng: number) => void,
    isTestMode: boolean
}) => {
    const map = useMap();
    
    useEffect(() => { 
        if (center && follow && !isTestMode) {
            map.setView(center, zoom, { animate: true }); 
        }
    }, [center, zoom, follow, map, isTestMode]);

    useEffect(() => { 
        const t = setTimeout(() => map.invalidateSize(), 200); 
        return () => clearTimeout(t); 
    }, [map]);

    useMapEvents({ 
        zoomend: () => onZoomChange(map.getZoom()),
        click: (e) => {
            if (isTestMode) {
                onMapClick(e.latlng.lat, e.latlng.lng);
            }
        }
    });

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
  // --- STATE ---
  const [fields, setFields] = useState<Field[]>([]);
  const [storages, setStorages] = useState<StorageLocation[]>([]);
  const [profile, setProfile] = useState<FarmProfile | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // Simulation & Testmodus
  const [isTestMode, setIsTestMode] = useState(false);
  const isTestModeRef = useRef(false);

  // Refs für Live Tracking (wichtig für Callbacks ohne Stale-State)
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
  
  // Fuhren-Logik & Quell-Zuordnung
  const [loadCounts, setLoadCounts] = useState<Record<string, number>>({}); 
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const currentLoadIndexRef = useRef<number>(1);
  const activeSourceIdRef = useRef<string | null>(null);

  // Aktivitäts-Konfiguration
  const [activityType, setActivityType] = useState<ActivityType>(ActivityType.FERTILIZATION);
  const [subType, setSubType] = useState<string>('Gülle');
  
  // Lagererkennung & Timer
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
  
  // Ergebnis-Bearbeitung
  const [distributionOverrides, setDistributionOverrides] = useState<Record<string, number>>({});
  const [detectedFieldsList, setDetectedFieldsList] = useState<Field[]>([]);
  
  // Visuelle Optionen
  const [vehicleIconType, setVehicleIconType] = useState<VehicleIconType>('tractor');
  const [historyMode, setHistoryMode] = useState<HistoryMode>('OFF');
  const [allHistoryTracks, setAllHistoryTracks] = useState<ActivityRecord[]>([]);

  // Fix: Added useMemo for visibleHistoryTracks
  const visibleHistoryTracks = useMemo(() => {
    if (historyMode === 'OFF') return [];
    const currentYear = new Date().getFullYear();
    const twelveMonthsAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);

    return allHistoryTracks.filter((act, idx) => {
        if (historyMode === 'RECENT') return idx < 5;
        if (historyMode === 'YEAR') return act.year === currentYear;
        if (historyMode === 'ALL_12M') return new Date(act.date).getTime() > twelveMonthsAgo;
        return false;
    });
  }, [allHistoryTracks, historyMode]);
  
  // Manuelle Formulare
  const [manualMode, setManualMode] = useState<ActivityType | null>(null);

  // System-Referenzen
  const watchIdRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<any>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Synchronisation der Referenzen (für Callbacks)
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { fieldsRef.current = fields; }, [fields]);
  useEffect(() => { storagesRef.current = storages; }, [storages]);
  useEffect(() => { activityTypeRef.current = activityType; }, [activityType]);
  useEffect(() => { subTypeRef.current = subType; }, [subType]);
  useEffect(() => { trackingStateRef.current = trackingState; }, [trackingState]);
  useEffect(() => { activeSourceIdRef.current = activeSourceId; }, [activeSourceId]);
  useEffect(() => { isTestModeRef.current = isTestMode; }, [isTestMode]);

  // --- INITIALISIERUNG ---
  useEffect(() => {
    const init = async () => {
        const loadedFields = await dbService.getFields();
        const loadedStorages = await dbService.getStorageLocations();
        const loadedSettings = await dbService.getSettings();
        const loadedProfile = await dbService.getFarmProfile();
        
        setFields(loadedFields);
        setStorages(loadedStorages);
        setSettings(loadedSettings);
        if (loadedProfile.length > 0) setProfile(loadedProfile[0]);

        const allActs = await dbService.getActivities();
        const pastTracks = allActs
            .filter(a => a.type === ActivityType.FERTILIZATION && a.trackPoints && a.trackPoints.length > 0)
            .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setAllHistoryTracks(pastTracks);
    };
    init();
    const unsub = dbService.onSyncComplete(init);
    const unsubDb = dbService.onDatabaseChange(init);
    return () => { stopGPS(); releaseWakeLock(); unsub(); unsubDb(); };
  }, []);

  useEffect(() => { onTrackingStateChange(trackingState !== 'IDLE'); }, [trackingState, onTrackingStateChange]);

  // --- GPS STEUERUNG ---
  const startGPS = async () => {
      if (!isTestMode && !navigator.geolocation) { alert("GPS wird nicht unterstützt."); return; }
      setGpsLoading(true);
      
      if (!isTestMode) {
          try {
              await new Promise((resolve, reject) => {
                  navigator.geolocation.getCurrentPosition(resolve, (err) => reject(err), { 
                      enableHighAccuracy: true, timeout: 10000, maximumAge: 0 
                  });
              });
          } catch (error: any) {
              setGpsLoading(false);
              alert("GPS Fehler: " + (error.message || "Kein Signal"));
              return;
          }
          await requestWakeLock();
      }

      setStartTime(Date.now());
      setTrackingState('TRANSIT');
      setTrackPoints([]);
      setLoadCounts({});
      setActiveSourceId(null);
      currentLoadIndexRef.current = 1;
      setIsPaused(false);
      setStorageWarning(null);
      setSummaryRecord(null);
      setGpsLoading(false);

      // Start watcher regardless, handleNewPosition will filter based on isTestModeRef
      watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => handleNewPosition(pos, false),
          (err) => console.error("GPS Error", err),
          { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
      );
  };

  const stopGPS = () => {
      if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
      if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
      releaseWakeLock();
  };

  const requestWakeLock = async () => {
    try { if ('wakeLock' in navigator) wakeLockRef.current = await navigator.wakeLock.request('screen'); } catch (err) { console.error(err); }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) { try { await wakeLockRef.current.release(); wakeLockRef.current = null; } catch(e) { console.error(e); } }
  };

  // --- SIMULATIONS-LOGIK (TESTMODUS) ---
  const handleSimulatedClick = (lat: number, lng: number) => {
      if (!isTestMode || trackingState === 'IDLE') return;

      // Berechne Winkel vom letzten Punkt zum neuen Klick
      let heading = 0;
      if (currentLocation) {
          const lat1 = currentLocation.coords.latitude * Math.PI / 180;
          const lng1 = currentLocation.coords.longitude * Math.PI / 180;
          const lat2 = lat * Math.PI / 180;
          const lng2 = lng * Math.PI / 180;
          const y = Math.sin(lng2 - lng1) * Math.cos(lat2);
          const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1);
          heading = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
      }

      // ERKENNUNG: Ist der Klick in der Nähe eines Lagers?
      const radius = settingsRef.current.storageRadius || 20;
      const isNearStorage = storagesRef.current.some(s => getDistance({ lat, lng }, s.geo) < radius);

      // Falls nahe am Lager: Geschwindigkeit auf fast 0 setzen (simulierter Stillstand)
      // Sonst: normale Reisegeschwindigkeit von ~8 km/h
      const simSpeedMs = isNearStorage ? 0.2 : 2.22;

      // Erzeuge ein gefälschtes Geolocation-Objekt
      const mockPos = {
          coords: {
              latitude: lat,
              longitude: lng,
              accuracy: 5,
              speed: simSpeedMs, 
              heading: heading,
              altitude: null,
              altitudeAccuracy: null
          },
          timestamp: Date.now()
      } as GeolocationPosition;

      handleNewPosition(mockPos, true);
  };

  // --- POSITION VERARBEITUNG ---
  const handleNewPosition = (pos: GeolocationPosition, isMock: boolean = false) => {
      // CRITICAL: Ignore real GPS signals if we are currently in test mode
      if (!isMock && isTestModeRef.current) return;

      setCurrentLocation(pos);
      if (isPaused || trackingStateRef.current === 'IDLE') return;

      const { latitude, longitude, speed, accuracy } = pos.coords;
      if (accuracy > 35 && !isMock) return; // Signal-Qualitätscheck

      const speedKmh = (speed || 0) * 3.6;
      
      const point: TrackPoint = {
          lat: latitude,
          lng: longitude,
          timestamp: pos.timestamp,
          speed: speedKmh,
          isSpreading: false,
          storageId: activeSourceIdRef.current || undefined,
          loadIndex: currentLoadIndexRef.current 
      };

      // 1. Lager-Check (nur bei Düngung)
      if (activityTypeRef.current === ActivityType.FERTILIZATION) {
          checkStorageProximity(point, speedKmh);
      }

      // 2. Tätigkeits-Check (Befindet man sich im Feld?)
      if (trackingStateRef.current !== 'LOADING') {
          const inField = fieldsRef.current.some(f => isPointInPolygon(point, f.boundary));
          let isSpreading = false;
          
          if (inField) {
             const minSpeed = settingsRef.current.minSpeed || 2.0;
             const maxSpeed = settingsRef.current.maxSpeed || 15.0;
             if (speedKmh >= minSpeed && speedKmh <= maxSpeed) {
                 isSpreading = true;
             }
          }

          const newState = isSpreading ? 'SPREADING' : 'TRANSIT';
          if (newState !== trackingStateRef.current) setTrackingState(newState);
          point.isSpreading = isSpreading;
      } else {
          // Im Lademodus zeichnen wir keine Arbeitsspur
          point.isSpreading = false;
          if (activeLoadingStorageRef.current) {
              point.storageId = activeLoadingStorageRef.current.id;
          }
      }

      setTrackPoints(prev => [...prev, point]);
  };

  const checkStorageProximity = (point: TrackPoint, speedKmh: number) => {
      const radius = settingsRef.current.storageRadius || 20;
      const currentState = trackingStateRef.current;
      const currentSubType = subTypeRef.current;

      // Wenn wir bereits laden, prüfen ob wir uns entfernen
      if (currentState === 'LOADING' && activeLoadingStorageRef.current) {
          const dist = getDistance(point, activeLoadingStorageRef.current.geo);
          if (dist > radius && speedKmh > 2.0) {
              setTrackingState('TRANSIT');
              activeLoadingStorageRef.current = null;
              cancelDetection();
              setStorageWarning(null);
          }
          return; 
      }

      // Suche nahestes Lager
      let nearest: StorageLocation | null = null;
      let minDist = Infinity;
      storagesRef.current.forEach(s => {
          const dist = getDistance(point, s.geo);
          if (dist < minDist) { minDist = dist; nearest = s; }
      });

      if (nearest && minDist <= radius) {
          const nearestLoc = nearest as StorageLocation;
          
          // Warnung wenn falscher Typ (Gülle vs Mist)
          if (nearestLoc.type !== currentSubType) {
              setStorageWarning(`${nearestLoc.name} ist ${nearestLoc.type}!`);
              cancelDetection(); 
              return; 
          }
          
          setStorageWarning(null);

          // Lade-Erkennung bei Stillstand (hier greift simSpeedMs 0.2 im Testmodus)
          if (speedKmh < 3.0) {
              if (pendingStorageIdRef.current !== nearestLoc.id) {
                  pendingStorageIdRef.current = nearestLoc.id;
                  startDetectionCountdown(nearestLoc);
              }
          } else { 
              cancelDetection(); 
          }
      } else { 
          cancelDetection(); 
          setStorageWarning(null); 
      }
  };

  const startDetectionCountdown = (storage: StorageLocation) => {
      if (countdownIntervalRef.current) return; 
      setDetectionCountdown(60); // 60 Sekunden Timer
      
      countdownIntervalRef.current = setInterval(() => {
          setDetectionCountdown(prev => {
              if (prev === null) return null;
              if (prev <= 1) {
                  clearInterval(countdownIntervalRef.current);
                  countdownIntervalRef.current = null;

                  setTrackingState('LOADING');
                  activeLoadingStorageRef.current = storage;
                  
                  // Erhöhe Fuhrenanzahl für dieses Lager
                  setLoadCounts(prev => ({ ...prev, [storage.id]: (prev[storage.id] || 0) + 1 }));
                  
                  // Starte neuen Index für die nächste Fuhre (wichtig für die Verteilung)
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

  // --- AUSWERTUNG ---
  const stopTrackingAndCalculate = () => {
      stopGPS();
      setTrackingState('IDLE');

      // 1. Gruppiere Punkte nach Fuhren-Index
      const pointsByLoad: Record<number, TrackPoint[]> = {};
      const loads = new Set<number>();
      trackPoints.forEach(p => {
          const idx = p.loadIndex || 1;
          if (!pointsByLoad[idx]) pointsByLoad[idx] = [];
          pointsByLoad[idx].push(p);
          loads.add(idx);
      });

      const loadDistribution: Record<string, number> = {}; 
      const fieldIds = new Set<string>();

      // 2. Berechne Verteilung pro Fuhre
      loads.forEach(loadIdx => {
          const points = pointsByLoad[loadIdx];
          let loadTotalDist = 0;
          const loadFieldDist: Record<string, number> = {};
          
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

          if (loadTotalDist > 0) {
              Object.keys(loadFieldDist).forEach(fid => {
                  const ratio = loadFieldDist[fid] / loadTotalDist;
                  loadDistribution[fid] = (loadDistribution[fid] || 0) + ratio;
              });
          }
      });

      setDetectedFieldsList(fields.filter(f => fieldIds.has(f.id)));
      
      const uiDist: Record<string, number> = {};
      Object.keys(loadDistribution).forEach(fid => uiDist[fid] = parseFloat(loadDistribution[fid].toFixed(1)));
      setDistributionOverrides(uiDist);
      
      setShowSaveModal(true);
  };

  const handleFinish = async () => {
      const userTotalLoads = Object.values(distributionOverrides).reduce((a, b) => a + b, 0);
      let spreadDist = 0;
      const fieldDistMap: Record<string, number> = {}; 
      const fieldIds = new Set<string>();
      detectedFieldsList.forEach(f => fieldIds.add(f.id));

      for (let i = 1; i < trackPoints.length; i++) {
          if (trackPoints[i].isSpreading) {
              const dist = getDistance(trackPoints[i-1], trackPoints[i]);
              spreadDist += dist;
              const f = fields.find(field => isPointInPolygon(trackPoints[i], field.boundary));
              if (f) fieldDistMap[f.id] = (fieldDistMap[f.id] || 0) + dist;
          }
      }

      const width = activityType === ActivityType.FERTILIZATION 
          ? (subType === 'Mist' ? settings.manureSpreadWidth : settings.slurrySpreadWidth) 
          : 6; 
      
      const areaHa = (spreadDist * (width || 12)) / 10000;
      
      let totalAmount = 0;
      const storageDistribution: Record<string, number> = {};
      
      if (activityType === ActivityType.FERTILIZATION) {
          const loadSize = subType === 'Mist' ? settings.manureLoadSize : settings.slurryLoadSize;
          totalAmount = userTotalLoads * loadSize;
          const recTotal = Object.values(loadCounts).reduce((a, b) => a + b, 0);
          Object.entries(loadCounts).forEach(([sId, count]) => {
              const share = recTotal > 0 ? count / recTotal : 1;
              storageDistribution[sId] = parseFloat((share * totalAmount).toFixed(2));
          });
      } else {
          totalAmount = parseFloat(areaHa.toFixed(2));
      }

      // Erzeuge detaillierte Quellen-Mapping pro Feld
      const finalFieldDist: Record<string, number> = {};
      const finalDetailedSources: Record<string, Record<string, number>> = {};

      if (activityType === ActivityType.FERTILIZATION) {
          const loadSize = subType === 'Mist' ? settings.manureLoadSize : settings.slurryLoadSize;
          const pByLoad: Record<number, TrackPoint[]> = {};
          const uLoads = new Set<number>();
          trackPoints.forEach(p => {
              const idx = p.loadIndex || 1;
              if (!pByLoad[idx]) pByLoad[idx] = [];
              pByLoad[idx].push(p);
              uLoads.add(idx);
          });

          uLoads.forEach(lIdx => {
              const pts = pByLoad[lIdx];
              const sId = pts.find(p => p.storageId)?.storageId || 'unknown';
              let dLoad = 0;
              const dfLoad: Record<string, number> = {};
              for (let i = 1; i < pts.length; i++) {
                  if (pts[i].isSpreading) {
                      const d = getDistance(pts[i-1], pts[i]);
                      dLoad += d;
                      const f = fields.find(fi => isPointInPolygon(pts[i], fi.boundary));
                      if (f) dfLoad[f.id] = (dfLoad[f.id] || 0) + d;
                  }
              }
              if (dLoad > 0) {
                  Object.keys(dfLoad).forEach(fId => {
                      const vol = parseFloat(((dfLoad[fId] / dLoad) * loadSize).toFixed(2));
                      finalFieldDist[fId] = (finalFieldDist[fId] || 0) + vol;
                      if (!finalDetailedSources[fId]) finalDetailedSources[fId] = {};
                      finalDetailedSources[fId][sId] = (finalDetailedSources[fId][sId] || 0) + vol;
                  });
              }
          });
      }

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
          notes: saveNotes + `\nDauer: ${Math.round((startTime ? Date.now() - startTime : 0) / 60000)} min`,
          year: new Date().getFullYear(),
          fieldDistribution: finalFieldDist,
          detailedFieldSources: finalDetailedSources
      };
      
      await dbService.saveActivity(record);
      if (activityType === ActivityType.FERTILIZATION) await dbService.updateStorageLevels(storageDistribution);
      dbService.syncActivities();
      setSummaryRecord(record); 
      setShowSaveModal(false);
  };

  const handleDiscard = () => {
      if(confirm("Wirklich verwerfen?")) {
          stopGPS(); setTrackingState('IDLE'); setTrackPoints([]); setLoadCounts({}); setActiveSourceId(null);
          setShowSaveModal(false); cancelDetection(); pendingStorageIdRef.current = null;
      }
  };

  // --- RENDERING HELPER ---
  const currentLat = currentLocation?.coords.latitude || profile?.addressGeo?.lat || 47.5;
  const currentLng = currentLocation?.coords.longitude || profile?.addressGeo?.lng || 14.5;

  const currentSpreadWidth = useMemo(() => {
      let w = settings.spreadWidth || 12;
      if (activityType === ActivityType.FERTILIZATION) {
          w = subType === 'Mist' ? (settings.manureSpreadWidth || 10) : (settings.slurrySpreadWidth || 12);
      }
      return w;
  }, [activityType, subType, settings]);

  const trackSegments = useMemo(() => {
      if (trackPoints.length < 2) return [];
      const segments: { points: [number, number][], color: string, isSpreading: boolean }[] = [];
      let currentPoints: [number, number][] = [[trackPoints[0].lat, trackPoints[0].lng]];
      let currentColor = getStorageColor(trackPoints[0].storageId, storages);
      let currentSpreadState = trackPoints[0].isSpreading;

      for (let i = 1; i < trackPoints.length; i++) {
          const p = trackPoints[i];
          const color = getStorageColor(p.storageId, storages);
          if (color !== currentColor || p.isSpreading !== currentSpreadState) {
              segments.push({ points: currentPoints, color: currentColor, isSpreading: currentSpreadState });
              currentPoints = [[trackPoints[i-1].lat, trackPoints[i-1].lng], [p.lat, p.lng]];
              currentColor = color;
              currentSpreadState = p.isSpreading;
          } else {
              currentPoints.push([p.lat, p.lng]);
          }
      }
      segments.push({ points: currentPoints, color: currentColor, isSpreading: currentSpreadState });
      return segments;
  }, [trackPoints, storages]);

  // --- RENDER ---
  if (summaryRecord) {
      return (
          <div className="h-full relative bg-slate-900 overflow-hidden">
              <div className="absolute inset-0 opacity-50 blur-sm pointer-events-none">
                  <MapContainer center={[currentLat, currentLng]} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                      {summaryRecord.trackPoints && <Polyline positions={summaryRecord.trackPoints.map(p => [p.lat, p.lng])} color="blue" />}
                  </MapContainer>
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center p-4 z-[60]">
                  <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">
                      <div className="bg-green-600 p-8 text-center text-white shrink-0">
                          <div className="relative z-10 flex flex-col items-center">
                              <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mb-4"><CheckCircle size={48} /></div>
                              <h2 className="text-3xl font-bold">Gespeichert!</h2>
                              <div className="text-green-100 font-medium text-sm">{summaryRecord.type}</div>
                          </div>
                      </div>
                      <div className="p-6 overflow-y-auto">
                          <div className="grid grid-cols-2 gap-4 mb-6">
                              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                  <div className="text-xs font-bold text-slate-400 mb-1">Dauer</div>
                                  <div className="text-xl font-bold text-slate-800">{summaryRecord.notes?.match(/Dauer: (\d+) min/)?.[1] || 0} min</div>
                              </div>
                              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                  <div className="text-xs font-bold text-slate-400 mb-1">Gesamt</div>
                                  <div className="text-xl font-bold text-slate-800">{summaryRecord.amount} {summaryRecord.unit}</div>
                              </div>
                          </div>
                          <button onClick={() => { setSummaryRecord(null); onNavigate('DASHBOARD'); }} className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold shadow-lg flex items-center justify-center">
                              <Home size={20} className="mr-2"/> Fertig
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      );
  }

  if (manualMode) {
      const handleManualSave = async (rec: ActivityRecord) => { 
          await dbService.saveActivity(rec); 
          if (rec.storageDistribution) await dbService.updateStorageLevels(rec.storageDistribution); 
          setSummaryRecord(rec); setManualMode(null); 
      };
      if (manualMode === ActivityType.FERTILIZATION) return <ManualFertilizationForm fields={fields} storages={storages} settings={settings} onCancel={() => setManualMode(null)} onSave={handleManualSave} onNavigate={onNavigate} />;
      if (manualMode === ActivityType.HARVEST) return <HarvestForm fields={fields} settings={settings} onCancel={() => setManualMode(null)} onSave={handleManualSave} onNavigate={onNavigate} />;
      return <TillageForm fields={fields} settings={settings} onCancel={() => setManualMode(null)} onSave={handleManualSave} onNavigate={onNavigate} />;
  }

  if (trackingState === 'IDLE') {
      return (
          <div className="h-full bg-white flex flex-col overflow-y-auto">
              <div className="bg-slate-900 text-white p-6 shrink-0"><h1 className="text-2xl font-bold mb-2">Neue Tätigkeit</h1><p className="text-slate-400 text-sm">Wähle eine Methode um zu starten.</p></div>
              <div className="p-6 space-y-6 flex-1">
                  <div className="bg-green-50 border border-green-200 rounded-2xl p-5 shadow-sm">
                      <h2 className="text-lg font-bold text-green-900 mb-4 flex items-center"><Navigation className="mr-2 fill-green-600 text-green-600"/> GPS Aufzeichnung</h2>
                      <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-2">
                              <button onClick={() => { setActivityType(ActivityType.FERTILIZATION); setSubType('Gülle'); }} className={`py-3 rounded-lg border-2 font-bold ${activityType === ActivityType.FERTILIZATION ? 'border-green-600 bg-white text-green-700' : 'bg-green-100/50 text-green-800/50'}`}>Düngung</button>
                              <button onClick={() => { setActivityType(ActivityType.TILLAGE); setSubType('Wiesenegge'); }} className={`py-3 rounded-lg border-2 font-bold ${activityType === ActivityType.TILLAGE ? 'border-green-600 bg-white text-green-700' : 'bg-green-100/50 text-green-800/50'}`}>Boden</button>
                          </div>
                          <select value={subType} onChange={(e) => setSubType(e.target.value)} className="w-full p-3 rounded-xl border border-green-200 font-bold text-slate-700 focus:ring-2 focus:ring-green-500">
                              {activityType === ActivityType.FERTILIZATION ? (<><option value="Gülle">Gülle</option><option value="Mist">Mist</option></>) : (<><option value="Wiesenegge">Wiesenegge</option><option value="Schlegeln">Schlegeln</option><option value="Striegel">Striegel</option><option value="Nachsaat">Nachsaat</option></>)}
                          </select>
                          <button onClick={startGPS} disabled={gpsLoading} className="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold shadow-lg shadow-green-900/20 flex items-center justify-center text-lg active:scale-95 transition-all">
                              {gpsLoading ? <Loader2 className="animate-spin mr-2"/> : <Play size={24} className="mr-2 fill-white"/>} 
                              {gpsLoading ? 'Suche GPS...' : 'Start'}
                          </button>
                      </div>
                  </div>
                  <div className="space-y-3">
                      <h3 className="font-bold text-slate-700">Manuell nachfragen</h3>
                      <button onClick={() => setManualMode(ActivityType.FERTILIZATION)} className="w-full flex items-center p-4 bg-white border border-slate-200 rounded-xl font-bold text-slate-600 shadow-sm hover:bg-slate-50 transition-colors"><Truck size={20} className="mr-3 text-amber-600"/> Düngung nachtragen</button>
                      <button onClick={() => setManualMode(ActivityType.HARVEST)} className="w-full flex items-center p-4 bg-white border border-slate-200 rounded-xl font-bold text-slate-600 shadow-sm hover:bg-slate-50 transition-colors"><Wheat size={20} className="mr-3 text-lime-600"/> Ernte nachtragen</button>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="h-full relative bg-slate-900 flex flex-col">
        <style>{`
            @keyframes fillUp { 0% { height: 0%; opacity: 0.8; } 50% { height: 60%; opacity: 1; } 100% { height: 100%; opacity: 0.8; } }
            .animate-fill { animation: fillUp 2s infinite ease-in-out; }
        `}</style>

        <div className="flex-1 relative z-0">
            <MapContainer center={[currentLat, currentLng]} zoom={currentZoom} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                <TileLayer attribution='&copy; OSM' url={mapStyle === 'standard' ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"} />
                <MapController center={[currentLat, currentLng]} zoom={currentZoom} follow={followUser} onZoomChange={setCurrentZoom} onMapClick={handleSimulatedClick} isTestMode={isTestMode} />
                
                {fields.map(f => (<Polygon key={f.id} positions={f.boundary.map(p => [p.lat, p.lng])} pathOptions={{ color: f.color || (f.type === 'Acker' ? '#92400E' : '#15803D'), fillOpacity: 0.3, weight: 1 }} />))}
                {profile?.addressGeo && (<Marker position={[profile.addressGeo.lat, profile.addressGeo.lng]} icon={farmIcon} />)}
                
                {historyMode !== 'OFF' && visibleHistoryTracks.map((act, i) => act.trackPoints && (<Polyline key={i} positions={act.trackPoints.map(p => [p.lat, p.lng])} pathOptions={{ color: '#3b82f6', weight: 2, opacity: 0.4, dashArray: '4,4' }} />))}
                
                {trackSegments.map((s, i) => (<React.Fragment key={i}>
                    <Polyline positions={s.points} pathOptions={{ color: s.color, weight: s.isSpreading ? currentSpreadWidth*2 : 4, opacity: 0.8, lineCap: 'butt' }} />
                    {s.isSpreading && <Polyline positions={s.points} pathOptions={{ color: 'white', weight: 2, opacity: 0.5, dashArray: '5,10' }} />}
                </React.Fragment>))}
                
                {currentLocation && (<Marker position={[currentLat, currentLng]} icon={getCursorIcon(currentLocation.coords.heading, vehicleIconType, isTestMode)} zIndexOffset={1000} eventHandlers={{ click: () => setVehicleIconType(p => p === 'tractor' ? 'arrow' : p === 'arrow' ? 'dot' : 'tractor') }} />)}
                
                {activityType === ActivityType.FERTILIZATION && storages.map(s => (<React.Fragment key={s.id}>
                    <Circle center={[s.geo.lat, s.geo.lng]} radius={settings.storageRadius || 20} pathOptions={{ color: getStorageColor(s.id, storages), fillOpacity: 0.3, dashArray: '5,5' }} />
                    <Marker position={[s.geo.lat, s.geo.lng]} icon={s.type === FertilizerType.SLURRY ? slurryIcon : manureIcon} />
                </React.Fragment>))}
            </MapContainer>
            
            <div className="absolute top-4 right-4 flex flex-col space-y-2 z-[400] items-end pointer-events-auto">
                 <button onClick={() => setMapStyle(prev => prev === 'standard' ? 'satellite' : 'standard')} className="bg-white/90 p-3 rounded-xl shadow-lg border border-slate-200 text-slate-700"><Layers size={24}/></button>
                 
                 <div className="flex flex-col space-y-1">
                    <button 
                        onClick={() => {
                            if (followUser && !isTestMode) { setFollowUser(false); setIsTestMode(true); }
                            else if (isTestMode) { setIsTestMode(false); setFollowUser(true); }
                            else { setFollowUser(true); }
                        }} 
                        className={`p-3 rounded-xl shadow-lg border border-slate-200 transition-all ${isTestMode ? 'bg-orange-500 text-white border-orange-600' : followUser ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-slate-700'}`}
                    >
                        <LocateFixed size={24}/>
                    </button>
                    {isTestMode && <span className="bg-orange-500 text-white text-[8px] font-bold px-1 rounded-sm text-center shadow-sm">TEST</span>}
                 </div>
                 
                 <button onClick={() => setHistoryMode(prev => prev === 'OFF' ? 'RECENT' : prev === 'RECENT' ? 'YEAR' : prev === 'YEAR' ? 'ALL_12M' : 'OFF')} className={`p-3 rounded-xl shadow-lg border ${historyMode !== 'OFF' ? 'bg-purple-600 text-white border-purple-700' : 'bg-white text-slate-700'}`}><History size={24}/></button>
            </div>

            <button onClick={onMinimize} className="absolute top-20 left-4 z-[400] bg-white/90 p-2 rounded-lg shadow-lg border border-slate-200 text-slate-600 pointer-events-auto"><Minimize2 size={24} /></button>

            <div className="absolute top-24 left-1/2 transform -translate-x-1/2 z-[400] w-full max-w-[90%] flex flex-col items-center pointer-events-none space-y-2">
                {storageWarning && (<div className="bg-orange-500 text-white px-4 py-2 rounded-xl shadow-xl flex items-center space-x-2 animate-bounce border-2 border-orange-600"><Ban size={20}/><span className="font-bold text-xs">{storageWarning}</span></div>)}
                <div className="bg-white/95 backdrop-blur shadow-xl border border-slate-200 rounded-full px-5 py-3 flex items-center space-x-3 pointer-events-auto">
                    {detectionCountdown !== null ? (
                        <div className="p-2 rounded-full bg-amber-500 animate-pulse text-white shadow-sm"><Clock size={20}/></div>
                    ) : (
                        <div className={`w-10 h-10 flex items-center justify-center rounded-full text-white shadow-sm ${trackingState === 'SPREADING' ? 'animate-pulse' : ''}`} style={{backgroundColor: trackingState === 'SPREADING' ? getStorageColor(activeSourceId, storages) : (trackingState === 'LOADING' ? '#1e293b' : '#3b82f6')}}>
                            {trackingState === 'LOADING' ? <Database size={18}/> : trackingState === 'SPREADING' ? <Droplets size={20}/> : <Truck size={20}/>}
                        </div>
                    )}
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400 uppercase leading-tight">Status {isTestMode && '(TEST)'}</span>
                        <span className="font-bold text-slate-800 text-sm whitespace-nowrap">
                            {detectionCountdown ? `Timer: ${detectionCountdown}s` : (trackingState === 'LOADING' ? 'LADEN...' : (trackingState === 'SPREADING' ? 'AM FELD' : 'TRANSIT'))}
                        </span>
                    </div>
                </div>
                {isTestMode && <div className="bg-white/80 backdrop-blur px-3 py-1 rounded-full text-[10px] font-bold text-orange-600 border border-orange-200 shadow-sm flex items-center"><MousePointer2 size={10} className="mr-1"/> Map-Klick für Bewegung</div>}
            </div>
        </div>

        <div className="bg-white border-t border-slate-200 p-4 pb-safe z-10 shrink-0">
             {showSaveModal ? (
                 <div className="space-y-4 animate-in slide-in-from-bottom-5">
                     <div className="flex justify-between items-center border-b border-slate-100 pb-3"><h3 className="font-bold text-slate-800">Beenden</h3><button onClick={handleDiscard} className="text-xs text-red-600 font-bold hover:underline"><Trash2 size={14} className="inline mr-1"/> Verwerfen</button></div>
                     {activityType === ActivityType.FERTILIZATION && detectedFieldsList.length > 0 && (
                        <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl space-y-2">
                            <h4 className="text-[10px] font-bold text-blue-600 uppercase mb-1">Fuhren pro Feld anpassen</h4>
                            {detectedFieldsList.map(f => (
                                <div key={f.id} className="flex justify-between items-center bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                                    <span className="text-sm font-bold text-slate-700 truncate mr-2">{f.name}</span>
                                    <div className="flex items-center space-x-2 shrink-0">
                                        <button onClick={() => setDistributionOverrides(p => ({ ...p, [f.id]: Math.max(0, (p[f.id] || 0) - 0.5) }))} className="w-8 h-8 bg-slate-100 rounded-full font-bold text-slate-600">-</button>
                                        <div className="w-10 text-center font-mono font-bold">{distributionOverrides[f.id] || 0}</div>
                                        <button onClick={() => setDistributionOverrides(p => ({ ...p, [f.id]: (p[f.id] || 0) + 0.5 }))} className="w-8 h-8 bg-slate-100 rounded-full font-bold text-slate-600">+</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                     )}
                     <div className="flex space-x-3">
                         <button onClick={() => setShowSaveModal(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl active:scale-95 transition-all">Zurück</button>
                         <button onClick={handleFinish} className="flex-1 py-3 bg-green-600 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-all">Speichern</button>
                     </div>
                 </div>
             ) : (
                 <div className="flex items-center justify-between space-x-4">
                     <div className="flex-1">
                         <div className="text-xs font-bold text-slate-500 uppercase mb-1">{activityType} • {subType}</div>
                         <div className="flex items-end space-x-6">
                             <div><span className="text-2xl font-mono font-bold text-slate-800">{startTime ? ((Date.now() - startTime) / 60000).toFixed(0) : 0}</span><span className="text-xs text-slate-400 ml-1">min</span></div>
                             <div><span className="text-2xl font-mono font-bold text-slate-800">{((currentLocation?.coords.speed || 0) * 3.6).toFixed(1)}</span><span className="text-xs text-slate-400 ml-1">km/h</span></div>
                             {activityType === ActivityType.FERTILIZATION && (
                                 <div className="border-l border-slate-200 pl-4">
                                     <div className="text-[10px] text-slate-400 font-bold uppercase">Fuhren</div>
                                     <div className="text-lg font-bold text-slate-700">{Object.values(loadCounts).reduce((a,b) => a+b, 0)}</div>
                                 </div>
                             )}
                         </div>
                     </div>
                     <button onClick={stopTrackingAndCalculate} className="w-16 h-16 bg-red-600 text-white rounded-2xl flex items-center justify-center shadow-lg hover:bg-red-700 active:scale-90 transition-all">
                         <Square size={28} fill="currentColor" />
                     </button>
                 </div>
             )}
        </div>
    </div>
  );
};

