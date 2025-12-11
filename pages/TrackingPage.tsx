import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Square, Truck, CheckCircle, AlertTriangle, History, PenTool, Wheat, Hammer, ChevronLeft, Droplets, Layers, Minimize2, ShoppingBag, Trash2, X, Clock, Calendar } from 'lucide-react';
import { dbService, generateId } from '../services/db';
import { AppSettings, DEFAULT_SETTINGS, StorageLocation, FertilizerType, ActivityType, HarvestType, TillageType, FarmProfile, TrackPoint, ActivityRecord } from '../types';
import { getDistance, isPointInPolygon } from '../utils/geo';
import { MapContainer, TileLayer, Polygon, Polyline, Marker, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import { FieldDetailView } from '../components/FieldDetailView';
import { StorageDetailView } from '../components/StorageDetailView';
import { ActivityDetailView } from '../components/ActivityDetailView';
import { ManualFertilizationForm, HarvestForm, TillageForm } from '../components/ManualActivityForms';

// ... (Custom Icons Setup remains same) ...
const createCustomIcon = (color: string, svgPath: string) => {
  return L.divIcon({
    className: 'custom-pin-icon',
    html: `
      <div style="
        background-color: ${color};
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 2px solid white;
        box-shadow: 0 3px 8px rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        position: relative;
      ">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          ${svgPath}
        </svg>
        <div style="
          width: 0; 
          height: 0; 
          border-left: 6px solid transparent; 
          border-right: 6px solid transparent; 
          border-top: 8px solid ${color}; 
          position: absolute; 
          bottom: -7px; 
          left: 50%; 
          transform: translateX(-50%);
        "></div>
      </div>
    `,
    iconSize: [32, 40],
    iconAnchor: [16, 40], // Point of the pin
    popupAnchor: [0, -42]
  });
};

const iconPaths = {
  house: '<path d="M3 21h18M5 21V7l8-5 8 5v14"/>',
  droplet: '<path d="M12 22a7 7 0 0 0 7-7c0-2-2-3-2-3l-5-8-5 8s-2 1-2 3a7 7 0 0 0 7 7z"/>',
  layers: '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>'
};

const farmIcon = createCustomIcon('#2563eb', iconPaths.house); // Blue
const slurryIcon = createCustomIcon('#78350f', iconPaths.droplet); // Dark Brown
const manureIcon = createCustomIcon('#d97706', iconPaths.layers); // Orange/Brown

// Helper for dynamic track colors
const STORAGE_COLORS = ['#ea580c', '#be185d', '#7e22ce', '#374151', '#0f766e', '#15803d'];
const getStorageColor = (storageId: string | undefined, index: number) => {
    if (!storageId) return '#78350f'; // Default Brown
    const sum = storageId.split('').reduce((a,c) => a + c.charCodeAt(0), 0);
    return STORAGE_COLORS[sum % STORAGE_COLORS.length];
};

// Helper component to control map view
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
        // FIX: Force resize aggressively
        const resize = () => {
             map.invalidateSize();
        };
        
        // Immediate and delayed resize to handle layout transitions
        resize();
        const t1 = setTimeout(resize, 100);
        const t2 = setTimeout(resize, 500);

        if (isTracking) {
            if (lastPosition) {
                map.panTo([lastPosition.lat, lastPosition.lng], { animate: true });
            } else if (profile?.addressGeo) {
                map.setView([profile.addressGeo.lat, profile.addressGeo.lng], 18, { animate: true });
            }
            return () => { clearTimeout(t1); clearTimeout(t2); };
        }

        if (!hasCenteredRef.current && !isTracking && (storages.length > 0 || profile?.addressGeo)) {
             const points: L.LatLng[] = [];
             if (profile?.addressGeo) points.push(L.latLng(profile.addressGeo.lat, profile.addressGeo.lng));
             storages.forEach(s => points.push(L.latLng(s.geo.lat, s.geo.lng)));

             if (points.length > 0) {
                 const bounds = L.latLngBounds(points);
                 map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
                 hasCenteredRef.current = true;
             }
        }
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, [map, storages, profile, isTracking, lastPosition]);

    return null;
};

interface Props {
    onTrackingStateChange?: (isTracking: boolean) => void;
    onMinimize?: () => void;
    onNavigate?: (view: string) => void;
}

export const TrackingPage: React.FC<Props> = ({ onTrackingStateChange, onMinimize, onNavigate }) => {
  const [mode, setMode] = useState<'selection' | 'tracking' | 'harvest' | 'tillage' | 'manual_fertilization'>('selection');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [storages, setStorages] = useState<StorageLocation[]>([]);
  const [profile, setProfile] = useState<FarmProfile | null>(null);
  const [recentActivities, setRecentActivities] = useState<ActivityRecord[]>([]);
  
  // Map State
  const [mapStyle, setMapStyle] = useState<'standard' | 'satellite'>('standard');
  const [showGhostTracks, setShowGhostTracks] = useState(true);
  const [ghostTrackRange, setGhostTrackRange] = useState<'year' | '12m'>('year');
  const [ghostTracks, setGhostTracks] = useState<{points: GeoPoint[], type: FertilizerType, date: string}[]>([]);
  
  // Tracking State
  const [isTracking, setIsTracking] = useState(false);
  const [showStartModal, setShowStartModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [trackingState, setTrackingState] = useState<'IDLE' | 'LOADING' | 'TRANSIT' | 'SPREADING'>('IDLE');
  const [detectedStorageName, setDetectedStorageName] = useState<string | null>(null);
  const [pendingStorageName, setPendingStorageName] = useState<string | null>(null);
  const [detectionCountdown, setDetectionCountdown] = useState<number | null>(null);
  const [wrongStorageWarning, setWrongStorageWarning] = useState<string | null>(null);
  
  const [loads, setLoads] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [totalDistance, setTotalDistance] = useState(0);
  const [currentField, setCurrentField] = useState<Field | null>(null);
  const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([]);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  
  const [selectedFertilizer, setSelectedFertilizer] = useState<FertilizerType>(FertilizerType.SLURRY);

  // Detail View State
  const [selectedMapField, setSelectedMapField] = useState<Field | null>(null);
  const [selectedStorage, setSelectedStorage] = useState<StorageLocation | null>(null);
  const [viewingActivity, setViewingActivity] = useState<ActivityRecord | null>(null);
  
  // SUCCESS MODAL STATE
  const [successModal, setSuccessModal] = useState<{
      title: string;
      details: string[];
      onConfirm: () => void;
  } | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const lastPositionRef = useRef<TrackPoint | null>(null);
  const currentStateRef = useRef<'IDLE' | 'LOADING' | 'TRANSIT' | 'SPREADING'>('IDLE');
  
  // CRITICAL: Ref to store selected fertilizer to avoid stale closures in GPS callback
  const selectedFertilizerRef = useRef<FertilizerType>(FertilizerType.SLURRY);
  
  // Wake Lock Refs
  const wakeLockRef = useRef<any>(null);
  
  // Refs for Storage Tracking
  const activeLoadingStorageRef = useRef<StorageLocation | null>(null);
  const lastSourceStorageIdRef = useRef<string | null>(null); 
  const storageDeductionsRef = useRef<Map<string, number>>(new Map());
  const loadingStartTimeRef = useRef<number | null>(null);
  const pendingStorageIdRef = useRef<string | null>(null);
  
  // LOGIC for Proportional Distribution
  const currentLoadDistancesRef = useRef<Map<string, number>>(new Map()); 
  const accumulatedFieldLoadsRef = useRef<Map<string, number>>(new Map()); 
  const accumulatedDetailedLoadsRef = useRef<Map<string, Map<string, number>>>(new Map());
  const fieldSourcesRef = useRef<Map<string, Set<string>>>(new Map());

  // REF PATTERN FOR PROCESS POSITION
  const processPositionRef = useRef<(pos: GeolocationPosition) => void>(() => {});
  
  // Fix for ReferenceError: detectedFieldId needs to be a state derived variable in render scope
  const detectedFieldId = currentField?.id || null; // Derived from state

  const loadData = async () => {
    const s = await dbService.getSettings();
    const f = await dbService.getFields();
    const st = await dbService.getStorageLocations();
    const p = await dbService.getFarmProfile();
    const acts = await dbService.getActivities();
    
    setSettings(s);
    setFields(f);
    setStorages(st);
    if (p.length > 0) setProfile(p[0]);
    
    const currentYear = new Date().getFullYear();
    const relevantActivities = acts
        .filter(a => a.year === currentYear)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    setRecentActivities(relevantActivities);
  };

  useEffect(() => {
    loadData();
    return () => {
        stopGps();
        releaseWakeLock();
    };
  }, []);

  useEffect(() => {
      selectedFertilizerRef.current = selectedFertilizer;
  }, [selectedFertilizer]);

  const requestWakeLock = async () => {
      let active = false;
      if ('wakeLock' in navigator) {
        try {
          if (!wakeLockRef.current || wakeLockRef.current.released) {
              wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
          }
          active = true;
        } catch (err: any) { console.warn('Native Wake Lock error:', err.message); }
      }
      setWakeLockActive(active);
  };

  const releaseWakeLock = async () => {
      if (wakeLockRef.current && !wakeLockRef.current.released) {
          try {
            await wakeLockRef.current.release();
            wakeLockRef.current = null;
          } catch(e) {}
      }
      setWakeLockActive(false);
  };

  useEffect(() => {
      let interval: any = null;
      if (isTracking) {
          requestWakeLock();
          interval = setInterval(() => {
              if (document.visibilityState === 'visible') requestWakeLock();
          }, 10000);
      } else {
          releaseWakeLock();
      }
      return () => { if (interval) clearInterval(interval); };
  }, [isTracking]);

  useEffect(() => {
    currentStateRef.current = trackingState;
  }, [trackingState]);

  useEffect(() => {
      const loadHistory = async () => {
          if (!currentField) { setGhostTracks([]); return; }
          const acts = await dbService.getActivitiesForField(currentField.id);
          
          const currentYear = new Date().getFullYear();
          const oneYearAgo = new Date();
          oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

          const relevantTracks = acts
            .filter(a => {
                if (a.type !== ActivityType.FERTILIZATION) return false;
                if (!a.trackPoints || a.trackPoints.length === 0) return false;
                
                // Filter Logic: Current Year OR Last 12 Months
                if (ghostTrackRange === 'year') {
                    return a.year === currentYear;
                } else {
                    return new Date(a.date) > oneYearAgo;
                }
            })
            .map(a => ({
                points: a.trackPoints!.filter(p => p.isSpreading).map(p => ({lat: p.lat, lng: p.lng})),
                type: a.fertilizerType || FertilizerType.SLURRY,
                date: a.date
            }));
          setGhostTracks(relevantTracks);
      };
      if (isTracking && currentField) loadHistory();
  }, [currentField, isTracking, ghostTrackRange]);

  // Calculate dynamic storage breakdown for HUD
  const storageBreakdown = useMemo(() => {
      if (!storageDeductionsRef.current) return { breakdown: [], totalPlusActive: 0 };
      
      const counts = new Map(storageDeductionsRef.current);
      let totalPlusActive = loads;
      
      if (isTracking && lastSourceStorageIdRef.current && trackingState !== 'LOADING') {
          const currentCount = counts.get(lastSourceStorageIdRef.current) || 0;
          counts.set(lastSourceStorageIdRef.current, currentCount + 1);
          totalPlusActive += 1;
      }

      const breakdown = Array.from(counts.entries()).map(([id, count]) => {
          const s = storages.find(store => store.id === id);
          return { 
              id,
              name: s ? s.name : 'Unbekannt', 
              count 
          };
      });
      
      return { breakdown, totalPlusActive };
  }, [loads, storages, isTracking, trackingState]);

  const trackSegments = useMemo(() => {
      if (trackPoints.length < 2) return [];
      
      const segments: { points: [number, number][], isSpreading: boolean, storageId?: string }[] = [];
      
      let currentPoints: [number, number][] = [[trackPoints[0].lat, trackPoints[0].lng]];
      let currentSpreadState = trackPoints[0].isSpreading;
      let currentStorageId = trackPoints[0].storageId;

      for (let i = 1; i < trackPoints.length; i++) {
          const p = trackPoints[i];
          const prevP = trackPoints[i-1];
          
          const stateChanged = p.isSpreading !== currentSpreadState;
          const storageChanged = p.storageId !== currentStorageId;

          if (stateChanged || storageChanged) {
              segments.push({ points: currentPoints, isSpreading: currentSpreadState, storageId: currentStorageId });
              
              currentPoints = [[prevP.lat, prevP.lng], [p.lat, p.lng]];
              currentSpreadState = p.isSpreading;
              currentStorageId = p.storageId;
          } else {
              currentPoints.push([p.lat, p.lng]);
          }
      }
      segments.push({ points: currentPoints, isSpreading: currentSpreadState, storageId: currentStorageId });
      return segments;
  }, [trackPoints]);

  const startGps = (type: FertilizerType) => {
    if (!navigator.geolocation) {
      setGpsError('GPS nicht verfügbar auf diesem Gerät.');
      return;
    }
    requestWakeLock();
    
    selectedFertilizerRef.current = type;
    setSelectedFertilizer(type);
    
    setShowStartModal(false);
    setIsTracking(true);
    if (onTrackingStateChange) onTrackingStateChange(true);

    setTrackingState('IDLE');
    setDetectedStorageName(null);
    setPendingStorageName(null);
    setDetectionCountdown(null);
    setWrongStorageWarning(null);
    setTrackPoints([]);
    setLoads(0);
    setTotalDistance(0);
    setGpsError(null);
    
    lastPositionRef.current = null;
    storageDeductionsRef.current = new Map();
    activeLoadingStorageRef.current = null;
    lastSourceStorageIdRef.current = null;
    loadingStartTimeRef.current = null;
    pendingStorageIdRef.current = null;
    
    currentLoadDistancesRef.current = new Map();
    accumulatedFieldLoadsRef.current = new Map();
    accumulatedDetailedLoadsRef.current = new Map();
    fieldSourcesRef.current = new Map();

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
          if (processPositionRef.current) processPositionRef.current(pos);
      },
      (err) => {
          let msg = 'GPS Fehler';
          switch(err.code) {
              case 1: msg = 'Standortzugriff verweigert. Bitte in Browser-Einstellungen aktivieren.'; break;
              case 2: msg = 'Kein GPS Signal verfügbar. Sind Sie in einem Gebäude?'; break;
              case 3: msg = 'Zeitüberschreitung bei GPS-Suche.'; break;
              default: msg = `GPS Fehler: ${err.message}`;
          }
          setGpsError(msg);
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
    );
  };

  const stopGps = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
    if (onTrackingStateChange) onTrackingStateChange(false);
    releaseWakeLock();
  };
  
  const handleConfirmCancel = () => {
      setShowCancelModal(false);
      stopGps();
      setTrackPoints([]);
      setMode('selection');
      storageDeductionsRef.current = new Map();
      accumulatedFieldLoadsRef.current = new Map();
  };

  const finalizeCurrentLoad = () => {
      let totalDist = 0;
      currentLoadDistancesRef.current.forEach(d => totalDist += d);

      if (totalDist > 10) { 
          currentLoadDistancesRef.current.forEach((dist, fieldId) => {
              const fraction = dist / totalDist;
              const current = accumulatedFieldLoadsRef.current.get(fieldId) || 0;
              accumulatedFieldLoadsRef.current.set(fieldId, current + fraction);

              if (lastSourceStorageIdRef.current) {
                  const sId = lastSourceStorageIdRef.current;
                  if (!accumulatedDetailedLoadsRef.current.has(fieldId)) {
                      accumulatedDetailedLoadsRef.current.set(fieldId, new Map());
                  }
                  const fieldMap = accumulatedDetailedLoadsRef.current.get(fieldId)!;
                  const currentStorageFraction = fieldMap.get(sId) || 0;
                  fieldMap.set(sId, currentStorageFraction + fraction);
              }
          });

          if (lastSourceStorageIdRef.current) {
              const sId = lastSourceStorageIdRef.current;
              const currentS = storageDeductionsRef.current.get(sId) || 0;
              storageDeductionsRef.current.set(sId, currentS + 1);
          }

          setLoads(prev => prev + 1);
      }
      currentLoadDistancesRef.current.clear();
  };

  const processPosition = (pos: GeolocationPosition) => {
    if (gpsError) setGpsError(null);
    if (!settings) return;

    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const accuracy = pos.coords.accuracy;
    const speedKmh = (pos.coords.speed || 0) * 3.6; 
    setCurrentSpeed(speedKmh);

    if (accuracy > 30) return;

    const currentGeo = { lat, lng };
    let nearestStorage: StorageLocation | null = null;
    let minDist = settings.storageRadius; 

    storages.forEach(s => {
        const d = getDistance(currentGeo, s.geo);
        if (d < minDist) {
            minDist = d;
            nearestStorage = s;
        }
    });

    let dist = 0;
    if (lastPositionRef.current) {
        dist = getDistance({lat: lastPositionRef.current.lat, lng: lastPositionRef.current.lng}, currentGeo);
        if (speedKmh < 0.5 && dist < 5) {
            if (!nearestStorage && currentStateRef.current !== 'LOADING') return;
        }
    }

    const timestamp = pos.timestamp;
    const point: TrackPoint = { lat, lng, timestamp, speed: speedKmh, isSpreading: false };
    
    if (lastPositionRef.current) {
        if (dist > 100) {
            setTrackPoints(prev => prev.length < 5 ? [point] : prev);
            if (trackPoints.length < 5) {
                lastPositionRef.current = point;
                setTotalDistance(0);
            }
            return;
        }
        setTotalDistance(prev => prev + dist);
    }

    const foundField = fields.find(f => isPointInPolygon(currentGeo, f.boundary));
    setCurrentField(foundField || null);

    let nextState = currentStateRef.current;
    
    const STOP_SPEED_THRESHOLD = 2.0; 
    const MIN_LOADING_TIME_MS = 60000; 

    if (nearestStorage) {
        const currentSelectedType = selectedFertilizerRef.current;
        const isStopped = speedKmh < STOP_SPEED_THRESHOLD;
        
        if (nearestStorage.type !== currentSelectedType) {
            if (isStopped) {
                const msg = `ACHTUNG: Falsches Lager! Sie stehen am ${nearestStorage.type}-Lager "${nearestStorage.name}", haben aber ${currentSelectedType} gewählt!`;
                setWrongStorageWarning(msg);
            } else {
                 setWrongStorageWarning(null);
            }
            
            setPendingStorageName(null);
            setDetectionCountdown(null);
            pendingStorageIdRef.current = null;
            loadingStartTimeRef.current = null;
            
            if (nextState === 'LOADING') nextState = 'IDLE'; 
            
        } else {
            setWrongStorageWarning(null);

            if (isStopped) {
                if (nextState !== 'LOADING') {
                    nextState = 'IDLE';
                }

                if (pendingStorageIdRef.current === nearestStorage.id) {
                    const elapsed = Date.now() - (loadingStartTimeRef.current || 0);
                    
                    if (elapsed > MIN_LOADING_TIME_MS) {
                         if (nextState !== 'LOADING') {
                             finalizeCurrentLoad(); 
                         }
                         
                         nextState = 'LOADING';
                         setDetectedStorageName(nearestStorage.name);
                         setPendingStorageName(null);
                         setDetectionCountdown(null);
                         activeLoadingStorageRef.current = nearestStorage; 
                         lastSourceStorageIdRef.current = nearestStorage.id;
                    } else {
                         setPendingStorageName(nearestStorage.name);
                         setDetectionCountdown(Math.ceil((MIN_LOADING_TIME_MS - elapsed) / 1000));
                    }
                } else {
                    pendingStorageIdRef.current = nearestStorage.id;
                    loadingStartTimeRef.current = Date.now();
                    setPendingStorageName(nearestStorage.name);
                    setDetectionCountdown(60);
                }
            } else {
                 pendingStorageIdRef.current = null;
                 loadingStartTimeRef.current = null;
                 setPendingStorageName(null);
                 setDetectionCountdown(null);
            }
        }
    } else {
        setDetectedStorageName(null);
        setPendingStorageName(null);
        setDetectionCountdown(null);
        setWrongStorageWarning(null);
        pendingStorageIdRef.current = null;
        loadingStartTimeRef.current = null;

        if (currentStateRef.current === 'LOADING') {
             nextState = 'TRANSIT';
        } else if (foundField) {
             const isSpeedOk = speedKmh >= settings!.minSpeed && speedKmh <= settings!.maxSpeed;
             if (isSpeedOk) {
                 nextState = 'SPREADING';
                 point.isSpreading = true; 
                 
                 if (lastSourceStorageIdRef.current) {
                     point.storageId = lastSourceStorageIdRef.current;
                 }

                 const currentDist = currentLoadDistancesRef.current.get(foundField.id) || 0;
                 currentLoadDistancesRef.current.set(foundField.id, currentDist + dist);

                 if (lastSourceStorageIdRef.current) {
                     if (!fieldSourcesRef.current.has(foundField.id)) {
                         fieldSourcesRef.current.set(foundField.id, new Set());
                     }
                     fieldSourcesRef.current.get(foundField.id)!.add(lastSourceStorageIdRef.current);
                 }

             } else {
                 nextState = 'TRANSIT';
             }
        } else {
             nextState = 'TRANSIT';
        }
    }

    setTrackingState(nextState);
    const stateChanged = nextState !== currentStateRef.current;
    if (dist > 5 || point.isSpreading || stateChanged) {
        setTrackPoints(prev => [...prev, point]);
        lastPositionRef.current = point;
    }
  };

  useEffect(() => {
    processPositionRef.current = processPosition;
  });

  const saveSession = async () => {
    stopGps();
    if (trackPoints.length === 0) return;

    finalizeCurrentLoad();

    const affectedFieldIds = new Set<string>();
    trackPoints.forEach(p => {
        if(p.isSpreading) {
             const f = fields.find(field => isPointInPolygon({lat: p.lat, lng: p.lng}, field.boundary));
             if(f) affectedFieldIds.add(f.id);
        }
    });
    for (const fid of accumulatedFieldLoadsRef.current.keys()) affectedFieldIds.add(fid);

    const loadSize = settings 
        ? (selectedFertilizerRef.current === FertilizerType.SLURRY ? settings.slurryLoadSize : settings.manureLoadSize) 
        : 0;

    const fieldDist: Record<string, number> = {};
    const detailedFieldSources: Record<string, Record<string, number>> = {};
    
    let distributionSumVolume = 0;

    accumulatedFieldLoadsRef.current.forEach((fractionalLoads, fieldId) => {
        const vol = Math.round(fractionalLoads * loadSize * 100) / 100;
        fieldDist[fieldId] = vol;
        distributionSumVolume += vol;
    });

    accumulatedDetailedLoadsRef.current.forEach((storageMap, fieldId) => {
        const fieldDetails: Record<string, number> = {};
        storageMap.forEach((fraction, storageId) => {
            fieldDetails[storageId] = Math.round(fraction * loadSize * 100) / 100;
        });
        detailedFieldSources[fieldId] = fieldDetails;
    });

    const details: string[] = [];
    accumulatedFieldLoadsRef.current.forEach((fractionalLoads, fieldId) => {
        const field = fields.find(f => f.id === fieldId);
        if (field) {
             const vol = (fractionalLoads * loadSize).toFixed(1);
             const loads = fractionalLoads.toFixed(1);
             details.push(`${field.name}: ${loads} Fuhren (${vol} m³)`);
        }
    });

    await dbService.processStorageGrowth();

    const storageDist: Record<string, number> = {};
    const storageDetails: string[] = [];
    const freshStorages = await dbService.getStorageLocations();
    
    for (const [sId, count] of storageDeductionsRef.current.entries()) {
        const storage = freshStorages.find(s => s.id === sId);
        if (storage) {
            const amount = count * loadSize;
            storageDist[sId] = amount;
            storage.currentLevel = Math.max(0, storage.currentLevel - amount);
            await dbService.saveStorageLocation(storage);
            storageDetails.push(`${storage.name}: -${count} Fuhren (-${amount} m³)`);
        }
    }
    
    const finalFieldSources: Record<string, string[]> = {};
    fieldSourcesRef.current.forEach((sourceSet, fieldId) => {
        finalFieldSources[fieldId] = Array.from(sourceSet);
    });

    let finalTotalVolume = distributionSumVolume;
    
    if (finalTotalVolume === 0 && loads > 0) {
        finalTotalVolume = loads * loadSize;
    }

    const finalLoads = loadSize > 0 ? (finalTotalVolume / loadSize) : 0;

    const record: ActivityRecord = {
        id: Math.random().toString(36).substr(2, 9),
        date: new Date().toISOString(),
        type: ActivityType.FERTILIZATION,
        fertilizerType: selectedFertilizerRef.current,
        fieldIds: Array.from(affectedFieldIds),
        amount: parseFloat(finalTotalVolume.toFixed(2)),
        unit: 'm³',
        loadCount: parseFloat(finalLoads.toFixed(1)),
        fieldDistribution: fieldDist,
        storageDistribution: storageDist,
        fieldSources: finalFieldSources,
        detailedFieldSources: detailedFieldSources,
        trackPoints: trackPoints,
        notes: `Automatisch erfasst via GPS.`,
        year: new Date().getFullYear()
    };

    await dbService.saveActivity(record);
    
    setSuccessModal({
        title: 'Fahrt gespeichert',
        details: [
            `Gesamt: ${finalLoads.toFixed(1)} Fuhren (${finalTotalVolume.toFixed(1)} m³)`,
            ...details,
            ...storageDetails
        ],
        onConfirm: () => {
             setSuccessModal(null);
             setIsTracking(false);
             if (onTrackingStateChange) onTrackingStateChange(false);
             setTrackPoints([]);
             setMode('selection');
             loadData();
        }
    });
  };

  // --- MANUAL SAVE HANDLER ---
  const handleManualActivitySave = async (record: ActivityRecord, summary: string[]) => {
      await dbService.saveActivity(record);
      setSuccessModal({
          title: record.type === ActivityType.FERTILIZATION ? 'Düngung gespeichert' : record.type === ActivityType.HARVEST ? 'Ernte gespeichert' : 'Gespeichert',
          details: summary,
          onConfirm: () => {
              setSuccessModal(null);
              setMode('selection');
              loadData();
          }
      });
  };

  const getActivityStyle = (act: ActivityRecord) => {
      let colorClass = 'border-slate-500';
      let bgClass = 'bg-slate-50';
      let label = act.type === ActivityType.HARVEST ? 'Ernte' : act.type === ActivityType.TILLAGE ? 'Bodenbearbeitung' : 'Düngung'; 
      
      if (act.type === ActivityType.HARVEST) {
          const notes = act.notes || '';
          if (notes.includes(HarvestType.HAY)) {
              label = 'Ernte (Heu)';
              colorClass = 'border-yellow-400';
              bgClass = 'bg-yellow-50';
          } else if (notes.includes(HarvestType.STRAW)) {
              label = 'Ernte (Stroh)';
              colorClass = 'border-yellow-600';
              bgClass = 'bg-yellow-50';
          } else {
              label = 'Ernte (Silage)';
              colorClass = 'border-lime-500';
              bgClass = 'bg-lime-50';
          }
      } else if (act.type === ActivityType.FERTILIZATION) {
          if (act.fertilizerType === FertilizerType.MANURE) {
              label = 'Mist Ausbringung';
              colorClass = 'border-orange-500';
              bgClass = 'bg-orange-50';
          } else {
              label = 'Gülle Ausbringung';
              colorClass = 'border-amber-900';
              bgClass = 'bg-amber-50';
          }
      } else if (act.type === ActivityType.TILLAGE) {
          label = act.tillageType || 'Bodenbearbeitung';
          colorClass = 'border-blue-500';
          bgClass = 'bg-blue-50';
          
          if (act.tillageType === TillageType.MULCH) { colorClass = 'border-indigo-500'; bgClass = 'bg-indigo-50'; }
          else if (act.tillageType === TillageType.WEEDER) { colorClass = 'border-sky-400'; bgClass = 'bg-sky-50'; }
          else if (act.tillageType === TillageType.RESEEDING) { colorClass = 'border-teal-500'; bgClass = 'bg-teal-50'; }
      }
      return { colorClass, bgClass, label };
  };

  const getFieldColor = (field: Field) => {
    if (currentField?.id === field.id) return '#22c55e'; // Bright Green Highlight
    if (field.color) return field.color;
    if (mapStyle === 'satellite') {
      return field.type === 'Acker' ? '#F59E0B' : '#84CC16'; // Lighter colors for satellite
    }
    return field.type === 'Acker' ? '#92400E' : '#15803D'; // Darker/Standard
  };

  const getTrackWeight = () => {
      if (!isSpreading) return 4;
      if (activityType === ActivityType.FERTILIZATION) {
          if (fertilizerType === FertilizerType.SLURRY) return (settings?.slurrySpreadWidth || 12);
          if (fertilizerType === FertilizerType.MANURE) return (settings?.manureSpreadWidth || 10);
      }
      return settings?.spreadWidth || 12;
  };

  const getSmartDateHeader = (dateStr: string) => {
      const date = new Date(dateStr);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      if (date.toDateString() === today.toDateString()) return 'Heute';
      if (date.toDateString() === yesterday.toDateString()) return 'Gestern';
      
      return date.toLocaleDateString('de-AT', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  if (successModal) {
      return (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-scale">
              <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-green-600">
                      <CheckCircle size={32} />
                  </div>
                  <h3 className="text-xl font-bold text-center text-slate-800 mb-2">{successModal.title}</h3>
                  <div className="bg-slate-50 rounded-lg p-3 mb-6 space-y-1 text-sm text-slate-600 border border-slate-100">
                      {successModal.details.map((line, i) => (
                          <p key={i} className="flex items-start"><span className="mr-2">•</span>{line}</p>
                      ))}
                  </div>
                  <button onClick={successModal.onConfirm} className="w-full bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-900 transition">
                      OK, Schließen
                  </button>
              </div>
          </div>
      );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50 relative">
      {/* Removed Video Tag to fix console errors and use modern WakeLock API instead */}
      
      {/* GPS Warning Overlay */}
      {isTracking && wrongStorageWarning && (
          <div className="absolute top-16 left-4 right-4 z-[1000] bg-red-600 text-white p-4 rounded-xl shadow-2xl animate-pulse flex items-start">
              <AlertTriangle className="shrink-0 mr-3" size={24} />
              <div>
                  <h3 className="font-bold text-lg">Warnung</h3>
                  <p className="text-sm font-medium">{wrongStorageWarning}</p>
              </div>
          </div>
      )}

      {/* Mode Selection */}
      {mode === 'selection' && !isTracking && (
        <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 text-center">
            <h2 className="text-xl font-bold text-slate-800 mb-4">Neue Tätigkeit</h2>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => { setSelectedFertilizer(FertilizerType.SLURRY); setMode('tracking'); }} className="p-4 bg-green-50 border-2 border-green-100 rounded-xl hover:border-green-500 hover:bg-green-100 transition flex flex-col items-center">
                <Truck size={32} className="text-green-600 mb-2" />
                <span className="font-bold text-slate-700">GPS Tracking</span>
                <span className="text-xs text-slate-500">Automatisch erfassen</span>
              </button>
              <button onClick={() => setMode('manual_fertilization')} className="p-4 bg-amber-50 border-2 border-amber-100 rounded-xl hover:border-amber-500 hover:bg-amber-100 transition flex flex-col items-center">
                <PenTool size={32} className="text-amber-700 mb-2" />
                <span className="font-bold text-slate-700">Manuell</span>
                <span className="text-xs text-slate-500">Düngung nachtragen</span>
              </button>
              <button onClick={() => setMode('harvest')} className="p-4 bg-yellow-50 border-2 border-yellow-100 rounded-xl hover:border-yellow-500 hover:bg-yellow-100 transition flex flex-col items-center">
                <Wheat size={32} className="text-yellow-600 mb-2" />
                <span className="font-bold text-slate-700">Ernte</span>
              </button>
              <button onClick={() => setMode('tillage')} className="p-4 bg-blue-50 border-2 border-blue-100 rounded-xl hover:border-blue-500 hover:bg-blue-100 transition flex flex-col items-center">
                <Hammer size={32} className="text-blue-600 mb-2" />
                <span className="font-bold text-slate-700">Boden</span>
              </button>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
             <h3 className="font-bold text-slate-700 mb-3 flex items-center"><History className="mr-2" size={18}/> Aktivitäten ({new Date().getFullYear()})</h3>
             {recentActivities.length === 0 ? (
                 <p className="text-sm text-slate-400 italic">Keine Einträge vorhanden.</p>
             ) : (
                 <div className="space-y-3">
                     {recentActivities.map((act, index) => {
                         const style = getActivityStyle(act);
                         const involvedFields = fields.filter(f => act.fieldIds.includes(f.id)).map(f => f.name).join(', ');

                         const currentDateStr = new Date(act.date).toDateString();
                         const prevDateStr = index > 0 ? new Date(recentActivities[index - 1].date).toDateString() : null;
                         const showHeader = currentDateStr !== prevDateStr;

                         return (
                             <React.Fragment key={act.id}>
                                {showHeader && (
                                    <div className="relative flex items-center justify-center mt-6 mb-3">
                                        <div className="absolute inset-0 flex items-center">
                                            <div className="w-full border-t border-slate-300/50"></div>
                                        </div>
                                        <span className="relative bg-slate-200 text-slate-700 px-3 py-1 rounded-full text-xs font-bold border border-slate-300 shadow-sm uppercase tracking-wide z-10">
                                            {getSmartDateHeader(act.date)}
                                        </span>
                                    </div>
                                )}
                                <div 
                                    onClick={() => setViewingActivity(act)} 
                                    className={`p-3 rounded-lg border-l-4 cursor-pointer hover:bg-white transition-all ${style.colorClass} ${style.bgClass}`}
                                >
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="font-bold text-sm text-slate-700">{style.label}</div>
                                            <div className="text-xs text-slate-500 mt-0.5">
                                                {new Date(act.date).toLocaleTimeString('de-AT', {hour: '2-digit', minute:'2-digit'})}
                                                {involvedFields && <span className="mx-1">•</span>}
                                                <span className="italic">{involvedFields}</span>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0 ml-2">
                                            <div className="font-bold text-slate-800">{act.amount} {act.unit}</div>
                                            {act.loadCount && <div className="text-[10px] text-slate-500">({act.loadCount} Fuhren)</div>}
                                        </div>
                                    </div>
                                </div>
                             </React.Fragment>
                         );
                     })}
                 </div>
             )}
          </div>
        </div>
      )}

      {/* GPS Tracking Mode Setup */}
      {mode === 'tracking' && !isTracking && (
        <div className="flex-1 flex flex-col p-6 bg-white overflow-y-auto pb-24">
           <button onClick={() => setMode('selection')} className="mb-6 flex items-center text-slate-500"><ChevronLeft className="mr-1"/> Zurück</button>
           <h2 className="text-2xl font-bold text-slate-800 mb-6">Tracking Starten</h2>
           
           <div className="space-y-4 mb-8">
               <label className="block text-sm font-bold text-slate-500 uppercase">Dünger Art wählen</label>
               <div className="grid grid-cols-2 gap-4">
                   <button 
                    onClick={() => setSelectedFertilizer(FertilizerType.SLURRY)}
                    className={`p-6 rounded-xl border-2 flex flex-col items-center transition-all ${selectedFertilizer === FertilizerType.SLURRY ? 'border-amber-900 bg-amber-50 shadow-md transform scale-105' : 'border-slate-200 text-slate-400'}`}
                   >
                       <Droplets size={32} className={selectedFertilizer === FertilizerType.SLURRY ? 'text-amber-900' : 'text-slate-300'} />
                       <span className={`mt-2 font-bold ${selectedFertilizer === FertilizerType.SLURRY ? 'text-amber-900' : 'text-slate-400'}`}>Gülle</span>
                   </button>
                   <button 
                    onClick={() => setSelectedFertilizer(FertilizerType.MANURE)}
                    className={`p-6 rounded-xl border-2 flex flex-col items-center transition-all ${selectedFertilizer === FertilizerType.MANURE ? 'border-orange-600 bg-orange-50 shadow-md transform scale-105' : 'border-slate-200 text-slate-400'}`}
                   >
                       <Layers size={32} className={selectedFertilizer === FertilizerType.MANURE ? 'text-orange-600' : 'text-slate-300'} />
                       <span className={`mt-2 font-bold ${selectedFertilizer === FertilizerType.MANURE ? 'text-orange-600' : 'text-slate-400'}`}>Mist</span>
                   </button>
               </div>
           </div>

           <div className="mt-auto">
               <button 
                onClick={() => setShowStartModal(true)}
                className="w-full bg-green-600 text-white py-4 rounded-2xl font-bold text-lg shadow-lg hover:bg-green-700 flex items-center justify-center"
               >
                   <Play className="mr-2" fill="currentColor" /> START
               </button>
           </div>
        </div>
      )}

      {/* Security Modal for Start */}
      {showStartModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-scale">
              <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
                  <h3 className="text-xl font-bold text-slate-800 mb-2">Tracking starten?</h3>
                  <p className="text-slate-600 mb-6">
                      Haben Sie <strong>{selectedFertilizer}</strong> korrekt ausgewählt?
                  </p>
                  <div className="flex space-x-3">
                      <button onClick={() => setShowStartModal(false)} className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold">Abbrechen</button>
                      <button onClick={() => startGps(selectedFertilizer)} className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold shadow-lg">Bestätigen</button>
                  </div>
              </div>
          </div>
      )}

      {/* Security Modal for Cancel */}
      {showCancelModal && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-scale">
              <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
                      <AlertTriangle size={32} />
                  </div>
                  <h3 className="text-xl font-bold text-center text-slate-800 mb-2">Tracking abbrechen?</h3>
                  <p className="text-center text-slate-600 mb-6 text-sm">
                      Möchten Sie die laufende Aufzeichnung wirklich verwerfen? Alle bisher gesammelten Daten dieser Fahrt gehen verloren.
                  </p>
                  <div className="space-y-3">
                      <button 
                        onClick={handleConfirmCancel} 
                        className="w-full bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition"
                      >
                          Ja, Aufzeichnung verwerfen
                      </button>
                      <button 
                        onClick={() => setShowCancelModal(false)} 
                        className="w-full bg-slate-100 text-slate-700 py-3 rounded-xl font-bold hover:bg-slate-200 transition"
                      >
                          Nein, weiterfahren
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Active Tracking View */}
      {isTracking && (
        <div className="h-full relative flex flex-col">
            <div className="flex-1 relative bg-slate-200 overflow-hidden">
                {/* FIXED: Map Container z-index and positioning */}
                <div className="absolute inset-0 z-0 bg-slate-200">
                    <MapContainer center={[47.5, 14.5]} zoom={15} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                        <TileLayer 
                            attribution='&copy; OpenStreetMap'
                            url={mapStyle === 'standard' 
                                ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                            }
                        />
                        <MapController storages={storages} profile={profile} isTracking={isTracking} lastPosition={lastPositionRef.current} />
                        
                        {showGhostTracks && ghostTracks.map((track, i) => (
                            <Polyline 
                                key={`ghost-${i}`} 
                                positions={track.points.map(p => [p.lat, p.lng])} 
                                pathOptions={{ color: track.type === FertilizerType.SLURRY ? '#78350f' : '#d97706', weight: 3, opacity: 0.3, dashArray: '5, 10' }} 
                            />
                        ))}

                        {/* LIVE TRACK */}
                        {trackSegments.map((segment, index) => {
                             const isSpreading = segment.isSpreading;
                             const storageColor = getStorageColor(segment.storageId, index);
                             
                             if (isSpreading) {
                                 return (
                                     <React.Fragment key={`live-seg-${index}`}>
                                         <Polyline positions={segment.points} pathOptions={{ color: storageColor, weight: getTrackWeight(), opacity: 0.8 }} />
                                         <Polyline positions={segment.points} pathOptions={{ color: 'white', weight: 2, opacity: 0.9, dashArray: '5, 5' }} />
                                     </React.Fragment>
                                 );
                             } else {
                                 return (
                                     <Polyline key={`live-seg-${index}`} positions={segment.points} pathOptions={{ color: '#3b82f6', weight: 4, opacity: 0.8 }} />
                                 );
                             }
                        })}

                        {lastPositionRef.current && (
                            <Marker position={[lastPositionRef.current.lat, lastPositionRef.current.lng]} icon={createCustomIcon('#22c55e', '<circle cx="12" cy="12" r="6" fill="white"/>')} />
                        )}

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
                        
                        {storages.map(s => (
                            <React.Fragment key={s.id}>
                                <Circle 
                                    center={[s.geo.lat, s.geo.lng]} 
                                    radius={settings?.storageRadius || 15}
                                    pathOptions={{ color: '#94a3b8', fillColor: '#94a3b8', fillOpacity: 0.1, weight: 1, dashArray: '4, 4' }} 
                                />
                                <Marker 
                                    position={[s.geo.lat, s.geo.lng]} 
                                    icon={s.type === FertilizerType.SLURRY ? slurryIcon : manureIcon}
                                />
                            </React.Fragment>
                        ))}
                    </MapContainer>
                </div>
                
                {/* HUD Overlay */}
                <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none z-[400]">
                     {onMinimize && (
                         <button 
                            onClick={onMinimize}
                            className="pointer-events-auto bg-white/90 backdrop-blur p-3 rounded-xl shadow-lg border border-slate-200 text-slate-700 flex items-center justify-center hover:bg-slate-100 active:scale-95 transition"
                            title="Zurück zur Übersicht (Tracking läuft weiter)"
                         >
                            <Minimize2 size={24} />
                         </button>
                     )}
                    <div className="bg-white/90 backdrop-blur p-3 rounded-xl shadow-lg border border-slate-200">
                        <div className="text-[10px] uppercase font-bold text-slate-400">Tempo</div>
                        <div className="text-2xl font-bold text-slate-800 tabular-nums">{currentSpeed.toFixed(1)} <span className="text-sm text-slate-500">km/h</span></div>
                    </div>
                    
                    <div className="bg-white/90 backdrop-blur p-3 rounded-xl shadow-lg border border-slate-200 min-w-[100px]">
                        <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Fuhren</div>
                        {storageBreakdown.breakdown.length > 1 && (
                            <div className="flex flex-col space-y-1 mb-1 border-b border-slate-200/50 pb-1">
                                {storageBreakdown.breakdown.map((item, idx) => (
                                    <div key={idx} className="flex justify-between items-center text-[10px] text-white px-2 py-0.5 rounded" style={{backgroundColor: getStorageColor(item.id, idx)}}>
                                        <span className="truncate max-w-[80px] mr-2 font-medium shadow-sm">{item.name}:</span>
                                        <span className="font-bold shadow-sm">{item.count}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className={`text-right font-bold text-slate-800 tabular-nums ${storageBreakdown.breakdown.length > 1 ? 'text-xl' : 'text-2xl'}`}>
                            {storageBreakdown.totalPlusActive} {storageBreakdown.breakdown.length > 1 && <span className="text-[10px] font-normal text-slate-500">Akt.</span>}
                        </div>
                    </div>
                </div>

                <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-lg border border-slate-200 flex items-center space-x-2 z-[400]">
                    {trackingState === 'IDLE' && <div className="w-3 h-3 bg-slate-400 rounded-full animate-pulse"></div>}
                    {trackingState === 'LOADING' && <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce"></div>}
                    {trackingState === 'TRANSIT' && <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>}
                    {trackingState === 'SPREADING' && <div className="w-3 h-3 bg-green-600 rounded-full animate-pulse"></div>}
                    <span className="font-bold text-sm text-slate-700">
                        {detectionCountdown 
                            ? `Erkenne ${pendingStorageName}: ${detectionCountdown}s...` 
                            : (
                                <>
                                {trackingState === 'IDLE' && 'Bereit / Warten'}
                                {trackingState === 'LOADING' && `LADEN (${detectedStorageName})`}
                                {trackingState === 'TRANSIT' && 'Transferfahrt'}
                                {trackingState === 'SPREADING' && 'Ausbringung'}
                                </>
                            )
                        }
                    </span>
                </div>

                <div className="absolute top-32 right-4 pointer-events-auto flex flex-col space-y-2 z-[400]">
                    <div className="flex bg-white rounded-lg shadow-lg overflow-hidden border border-slate-200">
                        <button 
                            onClick={() => setShowGhostTracks(!showGhostTracks)} 
                            className={`p-2 text-xs font-bold transition-colors ${showGhostTracks ? 'bg-blue-100 text-blue-700' : 'bg-white text-slate-500'}`}
                        >
                            Spur
                        </button>
                        {showGhostTracks && (
                            <button 
                                onClick={() => setGhostTrackRange(prev => prev === 'year' ? '12m' : 'year')}
                                className="p-2 border-l border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 hover:bg-slate-100 w-[42px]"
                                title="Zeitraum wechseln"
                            >
                                {ghostTrackRange === 'year' ? new Date().getFullYear() : '12M'}
                            </button>
                        )}
                    </div>
                    <button onClick={() => setMapStyle(prev => prev === 'standard' ? 'satellite' : 'standard')} className="p-2 bg-white rounded-lg shadow-lg text-xs font-bold text-slate-700 w-full">{mapStyle === 'standard' ? 'Sat' : 'Karte'}</button>
                </div>
            </div>
            
            <div className="bg-white p-4 border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-[1000] pb-20">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <div className="text-xs font-bold text-slate-400 uppercase">Aktuelles Feld</div>
                        <div className="font-bold text-lg text-slate-800 truncate max-w-[200px]">
                            {currentField ? currentField.name : 'Unbekannt / Unterwegs'}
                        </div>
                    </div>
                    {gpsError && <div className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-xs font-bold animate-pulse">{gpsError}</div>}
                </div>

                <div className="flex space-x-3">
                    <button 
                        onClick={() => setShowCancelModal(true)}
                        className="bg-red-100 text-red-600 p-4 rounded-xl font-bold shadow-sm hover:bg-red-200 transition-colors"
                        title="Abbrechen"
                    >
                        <Trash2 size={24} />
                    </button>
                    <button 
                        onClick={saveSession} 
                        className="flex-1 bg-slate-800 text-white py-4 rounded-xl font-bold text-lg shadow-lg flex items-center justify-center hover:bg-slate-900 active:scale-[0.98] transition-all"
                    >
                        <Square className="mr-2 fill-current" /> STOP & SPEICHERN
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Extracted Manual Forms */}
      {!isTracking && mode === 'manual_fertilization' && (
          <ManualFertilizationForm 
            fields={fields} 
            settings={settings} 
            onCancel={() => setMode('selection')} 
            onSave={handleManualActivitySave} 
            onNavigate={onNavigate}
          />
      )}
      {!isTracking && mode === 'harvest' && (
          <HarvestForm 
            fields={fields} 
            settings={settings}
            onCancel={() => setMode('selection')} 
            onSave={handleManualActivitySave} 
            onNavigate={onNavigate}
          />
      )}
      {!isTracking && mode === 'tillage' && (
          <TillageForm 
            fields={fields} 
            settings={settings}
            onCancel={() => setMode('selection')} 
            onSave={handleManualActivitySave} 
            onNavigate={onNavigate}
          />
      )}

      {viewingActivity && (
           <ActivityDetailView activity={viewingActivity} onClose={() => setViewingActivity(null)} onUpdate={loadData} />
      )}
      {selectedMapField && (
           <FieldDetailView field={selectedMapField} onClose={() => setSelectedMapField(null)} />
      )}
      {selectedStorage && (
           <StorageDetailView storage={selectedStorage} onClose={() => setSelectedStorage(null)} />
      )}
    </div>
  );
};
