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

  useEffect(() => { settingsRef.current = settings; fieldsRef.current = fields; storagesRef.current = storages; activityTypeRef.current = activityType; subTypeRef.current = subType; isTestModeRef.current = isTestMode; }, [settings, fields, storages, activityType, subType, isTestMode]);

  const checkStorageProximity = (lat: number, lng: number, speedKmh: number) => {
    if (activityTypeRef.current !== ActivityType.FERTILIZATION) return;
    const rad = settingsRef.current.storageRadius || 20;

    let nearest: StorageLocation | null = null;
    let minDist = Infinity;
    storagesRef.current.forEach(s => {
      const dist = getDistance({ lat, lng }, s.geo);
      if (dist < minDist) { minDist = dist; nearest = s; }
    });

    if (nearest && minDist <= rad) {
        if (nearest.type !== (subTypeRef.current === 'Gülle' ? FertilizerType.SLURRY : FertilizerType.MANURE)) {
            setStorageWarning(`${nearest.name} erkannt, aber falscher Typ!`);
            return;
        }
        setStorageWarning(null);
        if (speedKmh < 2.0 && activeSourceIdRef.current !== nearest.id) {
            activeSourceIdRef.current = nearest.id;
            setActiveSourceId(nearest.id);
            setLoadCounts(prev => ({ ...prev, [nearest!.id]: (prev[nearest!.id] || 0) + 1 }));
            currentLoadIndexRef.current++;
            setTrackingState('LOADING');
        }
    } else {
        setStorageWarning(null);
        if (speedKmh > 3.0 && trackingState === 'LOADING') setTrackingState('TRANSIT');
    }
  };

  const handleNewPosition = useCallback((pos: GeolocationPosition) => {
    setCurrentLocation(pos);
    if (isPaused) return;

    const { latitude, longitude, speed, accuracy } = pos.coords;
    if (accuracy > 50 && !isTestModeRef.current) return; 

    const speedKmh = (speed || 0) * 3.6;
    checkStorageProximity(latitude, longitude, speedKmh);

    const inField = fieldsRef.current.some(f => isPointInPolygon({ lat: latitude, lng: longitude }, f.boundary));
    let isSpreading = false;
    if (inField && speedKmh >= (settingsRef.current.minSpeed || 2.0)) isSpreading = true;

    const newState = isSpreading ? 'SPREADING' : (trackingState === 'LOADING' ? 'LOADING' : 'TRANSIT');
    if (newState !== trackingState) setTrackingState(newState);

    const point: TrackPoint = {
      lat: latitude, lng: longitude, timestamp: pos.timestamp, speed: speedKmh,
      isSpreading, storageId: activeSourceIdRef.current || undefined, loadIndex: currentLoadIndexRef.current
    };

    setTrackPoints(prev => {
        if (prev.length > 0) {
            const last = prev[prev.length - 1];
            const dist = getDistance(last, point);
            const minMove = isTestModeRef.current ? 0.2 : 0.5; // Feinere Erkennung in Simulation
            if (dist < minMove) return prev;
        }
        return [...prev, point];
    });
  }, [isPaused, trackingState]);

  const simulateMovement = useCallback((lat: number, lng: number) => {
    const now = Date.now();
    
    if (now - lastSimTimeRef.current < 80) return; // Leicht erhöhtes Update-Intervall für Feedback

    let speedMs = 0;
    let heading = 0;

    if (lastSimPosRef.current) {
      const dist = getDistance({ lat, lng }, lastSimPosRef.current);
      const timeSec = (now - lastSimTimeRef.current) / 1000;
      if (timeSec > 0) speedMs = dist / timeSec;
      const dy = lat - lastSimPosRef.current.lat;
      const dx = lng - lastSimPosRef.current.lng;
      heading = (Math.atan2(dx, dy) * 180) / Math.PI;
    } else {
        // Falls kein lastSimPos existiert, nehmen wir die aktuelle Position als Start
        if (currentLocation) {
            lastSimPosRef.current = { lat: currentLocation.coords.latitude, lng: currentLocation.coords.longitude };
        }
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
      lastSimPosRef.current = startCoord;
      lastSimTimeRef.current = Date.now();
      setCurrentLocation(initPos);

      watchIdRef.current = navigator.geolocation.watchPosition((pos) => { if (!isTestModeRef.current) handleNewPosition(pos); }, undefined, { enableHighAccuracy: true });
    } finally { setGpsLoading(false); }
  };

  /* FIXED: Implemented handleFinishLogic to process and save tracking results */
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

    if (activityTypeRef.current === ActivityType.FERTILIZATION) {
      unit = 'm³';
      const loadSize = subTypeRef.current === 'Gülle' ? settingsRef.current.slurryLoadSize : settingsRef.current.manureLoadSize;
      loadCnt = Object.values(loadCounts).reduce((a, b) => a + b, 0);
      totalAmt = loadCnt * loadSize;
    } else {
      const involvedFields = fieldsRef.current.filter(f => fIds.includes(f.id));
      totalAmt = involvedFields.reduce((sum, f) => sum + f.areaHa, 0);
      totalAmt = Math.round(totalAmt * 100) / 100;
    }

    const fieldDist: Record<string, number> = {};
    if (fIds.length > 0) {
      const spreadingPoints = trackPoints.filter(p => p.isSpreading);
      if (spreadingPoints.length > 0) {
        fIds.forEach(id => {
          const field = fieldsRef.current.find(f => f.id === id);
          if (field) {
            const pInF = spreadingPoints.filter(p => isPointInPolygon(p, field.boundary)).length;
            const share = (pInF / spreadingPoints.length) * totalAmt;
            fieldDist[id] = Math.round(share * 10) / 10;
          }
        });
      }
    }

    const storageDist: Record<string, number> = {};
    if (activityTypeRef.current === ActivityType.FERTILIZATION) {
      const loadSize = subTypeRef.current === 'Gülle' ? settingsRef.current.slurryLoadSize : settingsRef.current.manureLoadSize;
      Object.entries(loadCounts).forEach(([sId, count]) => {
        storageDist[sId] = count * loadSize;
      });
    }

    const record: ActivityRecord = {
      id: generateId(),
      date: new Date().toISOString(),
      type: activityTypeRef.current,
      year: new Date().getFullYear(),
      fieldIds: fIds,
      amount: totalAmt,
      unit,
      loadCount: loadCnt > 0 ? loadCnt : undefined,
      notes: `${notes}\n(Dauer: ${durationMin} min)`,
      trackPoints: [...trackPoints],
      fieldDistribution: fieldDist,
      storageDistribution: Object.keys(storageDist).length > 0 ? storageDist : undefined,
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
    return record;
  }, [trackPoints, startTime, loadCounts]);

  return {
    trackingState, currentLocation, trackPoints, startTime, loadCounts,
    activeSourceId, detectionCountdown, storageWarning, gpsLoading,
    isTestMode, setIsTestMode: (v: boolean) => { setIsTestMode(v); isTestModeRef.current = v; if (v && currentLocation) lastSimPosRef.current = { lat: currentLocation.coords.latitude, lng: currentLocation.coords.longitude }; }, simulateMovement, startGPS, stopGPS: useCallback(() => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); setIsTestMode(false); lastSimPosRef.current = null; }, []),
    handleFinishLogic, handleDiscard: () => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); setTrackingState('IDLE'); setTrackPoints([]); }
  };
};

