
import { useState, useEffect, useRef, useCallback } from 'react';
import { dbService, generateId } from '../services/db';
import { Field, StorageLocation, TrackPoint, ActivityType, FertilizerType, AppSettings, ActivityRecord, GeoPoint } from '../types';
import { getDistance, isPointInPolygon } from '../utils/geo';

type TrackingState = 'IDLE' | 'LOADING' | 'TRANSIT' | 'SPREADING';

export const useTracking = (
  settings: AppSettings,
  fields: Field[],
  storages: StorageLocation[],
  activityType: ActivityType,
  subType: string
) => {
  const [trackingState, setTrackingState] = useState<TrackingState>('IDLE');
  const [currentLocation, setCurrentLocation] = useState<GeolocationPosition | null>(null);
  const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([]);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [loadCounts, setLoadCounts] = useState<Record<string, number>>({});
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [detectionCountdown, setDetectionCountdown] = useState<number | null>(null);
  const [pendingStorageId, setPendingStorageId] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [isTestMode, setIsTestMode] = useState(false);

  const settingsRef = useRef(settings);
  const fieldsRef = useRef(fields);
  const storagesRef = useRef(storages);
  const activityTypeRef = useRef(activityType);
  const subTypeRef = useRef(subType);
  const isTestModeRef = useRef(false);
  
  const activeSourceIdRef = useRef<string | null>(null);
  const currentLoadIndexRef = useRef<number>(1);
  const watchIdRef = useRef<number | null>(null);
  const lastSimPosRef = useRef<GeoPoint | null>(null);
  const lastSimTimeRef = useRef<number>(0);
  
  // Refs für Countdown-Logik (30 Sekunden)
  const proximityStartTimeRef = useRef<number | null>(null);
  const pendingStorageIdRef = useRef<string | null>(null);
  const lastKnownSpeedRef = useRef<number>(0);
  const lastKnownPosRef = useRef<GeoPoint | null>(null);
  const DETECTION_DELAY_MS = 30000;

  useEffect(() => { 
    settingsRef.current = settings; 
    fieldsRef.current = fields; 
    storagesRef.current = storages; 
    activityTypeRef.current = activityType; 
    subTypeRef.current = subType; 
    isTestModeRef.current = isTestMode; 
  }, [settings, fields, storages, activityType, subType, isTestMode]);

  // Zeitbasierter Timer-Tick
  useEffect(() => {
    const timer = setInterval(() => {
      if (activityTypeRef.current !== ActivityType.FERTILIZATION) return;
      if (!lastKnownPosRef.current) return;

      const lat = lastKnownPosRef.current.lat;
      const lng = lastKnownPosRef.current.lng;
      const speedKmh = lastKnownSpeedRef.current;
      const rad = settingsRef.current.storageRadius || 20;

      let nearest: StorageLocation | null = null;
      let minDist = Infinity;
      storagesRef.current.forEach(s => {
        const dist = getDistance({ lat, lng }, s.geo);
        if (dist < minDist) { minDist = dist; nearest = s; }
      });

      if (nearest && minDist <= rad && speedKmh < 2.5) {
          const isCorrectType = nearest.type === (subTypeRef.current === 'Gülle' ? FertilizerType.SLURRY : FertilizerType.MANURE);
          
          if (!isCorrectType) {
              setStorageWarning(`${nearest.name} erkannt, aber falscher Typ!`);
              proximityStartTimeRef.current = null;
              setDetectionCountdown(null);
              setPendingStorageId(null);
              pendingStorageIdRef.current = null;
              return;
          }

          setStorageWarning(null);

          // Wenn wir bereits an diesem Lager als "aktiv geladen" markiert sind, nichts tun
          if (activeSourceIdRef.current === nearest.id && trackingState === 'LOADING') {
              proximityStartTimeRef.current = null;
              setDetectionCountdown(null);
              setPendingStorageId(null);
              pendingStorageIdRef.current = null;
              return;
          }

          if (pendingStorageIdRef.current !== nearest.id) {
              pendingStorageIdRef.current = nearest.id;
              setPendingStorageId(nearest.id);
              proximityStartTimeRef.current = Date.now();
          }

          const elapsed = Date.now() - (proximityStartTimeRef.current || Date.now());
          const remaining = Math.max(0, Math.ceil((DETECTION_DELAY_MS - elapsed) / 1000));

          if (remaining > 0) {
              setDetectionCountdown(remaining);
          } else {
              activeSourceIdRef.current = nearest.id;
              setActiveSourceId(nearest.id);
              setLoadCounts(prev => ({ ...prev, [nearest!.id]: (prev[nearest!.id] || 0) + 1 }));
              currentLoadIndexRef.current++;
              setTrackingState('LOADING');
              setDetectionCountdown(null);
              setPendingStorageId(null);
              proximityStartTimeRef.current = null;
              pendingStorageIdRef.current = null;
          }
      } else {
          setStorageWarning(null);
          proximityStartTimeRef.current = null;
          pendingStorageIdRef.current = null;
          setPendingStorageId(null);
          setDetectionCountdown(null);

          // Statuswechsel von LADEN zu TRANSPORT wenn man wegfährt
          // WICHTIG: activeSourceIdRef wird hier NICHT mehr genullt, damit die Spurfarbe bleibt!
          if (speedKmh > 3.5 && trackingState === 'LOADING') {
              setTrackingState('TRANSIT');
          }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [trackingState]);

  const handleNewPosition = useCallback((pos: GeolocationPosition) => {
    setCurrentLocation(pos);
    if (isPaused) return;

    const { latitude, longitude, speed, accuracy } = pos.coords;
    if (accuracy > 50 && !isTestModeRef.current) return; 

    const speedKmh = (speed || 0) * 3.6;
    lastKnownSpeedRef.current = speedKmh;
    lastKnownPosRef.current = { lat: latitude, lng: longitude };

    const inField = fieldsRef.current.some(f => isPointInPolygon({ lat: latitude, lng: longitude }, f.boundary));
    let isSpreading = false;
    if (inField && speedKmh >= (settingsRef.current.minSpeed || 2.0)) isSpreading = true;

    if (trackingState !== 'LOADING' || speedKmh > 3.0) {
        const newState = isSpreading ? 'SPREADING' : (trackingState === 'LOADING' ? 'LOADING' : 'TRANSIT');
        if (newState !== trackingState) setTrackingState(newState);
        
        // Auch hier: Kein automatisches Nullstellen der activeSourceId mehr!
        // Die ID bleibt "sticky" für die aktuelle Fuhre.
    }

    const point: TrackPoint = {
      lat: latitude, lng: longitude, timestamp: pos.timestamp, speed: speedKmh,
      isSpreading, storageId: activeSourceIdRef.current || undefined, loadIndex: currentLoadIndexRef.current
    };

    setTrackPoints(prev => {
        if (prev.length > 0) {
            const last = prev[prev.length - 1];
            const dist = getDistance(last, point);
            const minMove = isTestModeRef.current ? 0.2 : 0.5;
            if (dist < minMove) return prev;
        }
        return [...prev, point];
    });
  }, [isPaused, trackingState]);

  const simulateMovement = useCallback((lat: number, lng: number) => {
    const now = Date.now();
    if (now - lastSimTimeRef.current < 80) return;
    let speedMs = 0;
    let heading = 0;
    if (lastSimPosRef.current) {
      const dist = getDistance({ lat, lng }, lastSimPosRef.current);
      const timeSec = (now - lastSimTimeRef.current) / 1000;
      if (timeSec > 0) speedMs = dist / timeSec;
      const dy = lat - lastSimPosRef.current.lat;
      const dx = lng - lastSimPosRef.current.lng;
      heading = (Math.atan2(dx, dy) * 180) / Math.PI;
    } else if (currentLocation) {
        lastSimPosRef.current = { lat: currentLocation.coords.latitude, lng: currentLocation.coords.longitude };
    }
    const fakePos: any = {
      coords: { latitude: lat, longitude: lng, accuracy: 5, speed: speedMs, heading: heading },
      timestamp: now
    };
    lastSimPosRef.current = { lat, lng };
    lastSimTimeRef.current = now;
    handleNewPosition(fakePos);
  }, [handleNewPosition, currentLocation]);

  const startGPS = async () => {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    try {
      const initPos: any = await new Promise((res, rej) => { navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true }); });
      setStartTime(Date.now()); setTrackingState('TRANSIT'); setTrackPoints([]); setLoadCounts({});
      activeSourceIdRef.current = null; setActiveSourceId(null); setIsPaused(false); setIsTestMode(false); currentLoadIndexRef.current = 1;
      const startCoord = { lat: initPos.coords.latitude, lng: initPos.coords.longitude };
      lastKnownPosRef.current = startCoord;
      lastKnownSpeedRef.current = 0;
      lastSimPosRef.current = startCoord; 
      lastSimTimeRef.current = Date.now();
      setCurrentLocation(initPos);
      watchIdRef.current = navigator.geolocation.watchPosition((pos) => { if (!isTestModeRef.current) handleNewPosition(pos); }, undefined, { enableHighAccuracy: true });
    } finally { setGpsLoading(false); }
  };

  const handleFinishLogic = useCallback(async (notes: string) => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    const durationMin = startTime ? Math.round((Date.now() - startTime) / 60000) : 0;
    const involvedFieldIds = new Set<string>();
    trackPoints.forEach(p => {
      if (p.isSpreading) {
        const field = fieldsRef.current.find(f => isPointInPolygon(p, f.boundary));
        if (field) involvedFieldIds.add(field.id);
      }
    });
    const fIds = Array.from(involvedFieldIds);
    let totalAmt = 0;
    let unit = 'ha';
    let loadCnt = 0;
    const loadSize = subTypeRef.current === 'Gülle' ? settingsRef.current.slurryLoadSize : settingsRef.current.manureLoadSize;
    if (activityTypeRef.current === ActivityType.FERTILIZATION) {
      unit = 'm³';
      loadCnt = Object.values(loadCounts).reduce((a, b) => a + b, 0);
      totalAmt = loadCnt * loadSize;
    } else {
      const involvedFields = fieldsRef.current.filter(f => fIds.includes(f.id));
      totalAmt = involvedFields.reduce((sum, f) => sum + f.areaHa, 0);
      totalAmt = Math.round(totalAmt * 100) / 100;
    }
    const detailedFieldSources: Record<string, Record<string, number>> = {};
    const fieldDist: Record<string, number> = {};
    if (activityTypeRef.current === ActivityType.FERTILIZATION && trackPoints.filter(p => p.isSpreading).length > 0) {
        const spreadingPoints = trackPoints.filter(p => p.isSpreading);
        const amountPerPoint = totalAmt / spreadingPoints.length;
        spreadingPoints.forEach(p => {
            const field = fieldsRef.current.find(f => isPointInPolygon(p, f.boundary));
            if (field && p.storageId) {
                if (!detailedFieldSources[field.id]) detailedFieldSources[field.id] = {};
                if (!detailedFieldSources[field.id][p.storageId]) detailedFieldSources[field.id][p.storageId] = 0;
                detailedFieldSources[field.id][p.storageId] += amountPerPoint;
                if (!fieldDist[field.id]) fieldDist[field.id] = 0;
                fieldDist[field.id] += amountPerPoint;
            }
        });
        Object.keys(fieldDist).forEach(fid => fieldDist[fid] = Math.round(fieldDist[fid] * 10) / 10);
        Object.keys(detailedFieldSources).forEach(fid => {
            Object.keys(detailedFieldSources[fid]).forEach(sid => {
                detailedFieldSources[fid][sid] = Math.round(detailedFieldSources[fid][sid] * 10) / 10;
            });
        });
    }
    const storageDist: Record<string, number> = {};
    if (activityTypeRef.current === ActivityType.FERTILIZATION) {
      Object.entries(loadCounts).forEach(([sId, count]) => {
        storageDist[sId] = count * loadSize;
      });
    }
    const record: ActivityRecord = {
      id: generateId(), date: new Date().toISOString(), type: activityTypeRef.current, year: new Date().getFullYear(),
      fieldIds: fIds, amount: totalAmt, unit, loadCount: loadCnt > 0 ? loadCnt : undefined, notes: `${notes}\n(Automatisch zugeordnet)\nDauer: ${durationMin} min`,
      trackPoints: [...trackPoints], fieldDistribution: fieldDist, storageDistribution: Object.keys(storageDist).length > 0 ? storageDist : undefined,
      detailedFieldSources: Object.keys(detailedFieldSources).length > 0 ? detailedFieldSources : undefined,
      fertilizerType: activityTypeRef.current === ActivityType.FERTILIZATION ? (subTypeRef.current === 'Gülle' ? FertilizerType.SLURRY : FertilizerType.MANURE) : undefined,
      tillageType: activityTypeRef.current === ActivityType.TILLAGE ? subTypeRef.current as any : undefined
    };
    await dbService.saveActivity(record);
    if (record.type === ActivityType.FERTILIZATION && record.storageDistribution) {
      await dbService.updateStorageLevels(record.storageDistribution);
    }
    dbService.syncActivities();
    setTrackingState('IDLE');
    setTrackPoints([]);
    lastKnownPosRef.current = null;
    return record;
  }, [trackPoints, startTime, loadCounts]);

  return {
    trackingState, currentLocation, trackPoints, startTime, loadCounts,
    activeSourceId, detectionCountdown, pendingStorageId, storageWarning, gpsLoading,
    isTestMode, setIsTestMode: (v: boolean) => { setIsTestMode(v); isTestModeRef.current = v; if (v && currentLocation) lastSimPosRef.current = { lat: currentLocation.coords.latitude, lng: currentLocation.coords.longitude }; }, simulateMovement, startGPS, stopGPS: useCallback(() => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); setIsTestMode(false); lastSimPosRef.current = null; }, []),
    handleFinishLogic, handleDiscard: () => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); setTrackingState('IDLE'); setTrackPoints([]); lastKnownPosRef.current = null; }
  };
};

