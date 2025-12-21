
import { useState, useEffect, useRef, useCallback } from 'react';
import { dbService, generateId } from '../services/db';
import { Field, StorageLocation, TrackPoint, ActivityType, FertilizerType, AppSettings, ActivityRecord, GeoPoint, FarmProfile } from '../types';
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
  
  const trackingStateRef = useRef<TrackingState>('IDLE');
  const activeSourceIdRef = useRef<string | null>(null);
  const currentLoadIndexRef = useRef<number>(1);
  const watchIdRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<any>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const activeLoadingStorageRef = useRef<StorageLocation | null>(null);
  const pendingStorageIdRef = useRef<string | null>(null);
  
  const lastSimPosRef = useRef<GeoPoint | null>(null);
  const lastSimTimeRef = useRef<number>(0);
  const speedBufferRef = useRef<number[]>([]);

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { fieldsRef.current = fields; }, [fields]);
  useEffect(() => { storagesRef.current = storages; }, [storages]);
  useEffect(() => { activityTypeRef.current = activityType; }, [activityType]);
  useEffect(() => { subTypeRef.current = subType; }, [subType]);
  useEffect(() => { trackingStateRef.current = trackingState; }, [trackingState]);
  useEffect(() => { activeSourceIdRef.current = activeSourceId; }, [activeSourceId]);
  useEffect(() => { isTestModeRef.current = isTestMode; }, [isTestMode]);

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) wakeLockRef.current = await navigator.wakeLock.request('screen');
    } catch (err) { console.error('Wake Lock Error:', err); }
  };

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      } catch (e) { console.error(e); }
    }
  }, []);

  const cancelDetection = useCallback(() => {
    pendingStorageIdRef.current = null;
    setDetectionCountdown(null);
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  const startDetectionCountdown = useCallback((storage: StorageLocation) => {
    if (countdownIntervalRef.current) return;
    setDetectionCountdown(60);
    countdownIntervalRef.current = setInterval(() => {
      setDetectionCountdown(prev => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
          setTrackingState('LOADING');
          activeLoadingStorageRef.current = storage;
          setLoadCounts(prevCounts => ({ ...prevCounts, [storage.id]: (prevCounts[storage.id] || 0) + 1 }));
          currentLoadIndexRef.current += 1;
          setActiveSourceId(storage.id);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const checkStorageProximity = useCallback((point: TrackPoint, speedKmh: number) => {
    if (activityTypeRef.current !== ActivityType.FERTILIZATION) return;
    const rad = settingsRef.current.storageRadius || 20;

    if (trackingStateRef.current === 'LOADING' && activeLoadingStorageRef.current) {
      const dist = getDistance(point, activeLoadingStorageRef.current.geo);
      if (dist > rad && speedKmh > 2.0) {
        setTrackingState('TRANSIT');
        activeLoadingStorageRef.current = null;
        cancelDetection();
        setStorageWarning(null);
      }
      return;
    }

    let nearest: StorageLocation | null = null;
    let minDist = Infinity;
    storagesRef.current.forEach(s => {
      const dist = getDistance(point, s.geo);
      if (dist < minDist) { minDist = dist; nearest = s; }
    });

    if (nearest && minDist <= rad) {
      if (nearest.type !== subTypeRef.current) {
        setStorageWarning(`${nearest.name} erkannt, aber falscher Typ (${nearest.type})!`);
        cancelDetection();
        return;
      }
      setStorageWarning(null);
      if (speedKmh < 3.0 && pendingStorageIdRef.current !== nearest.id) {
        pendingStorageIdRef.current = nearest.id;
        startDetectionCountdown(nearest);
      } else if (speedKmh >= 3.0) cancelDetection();
    } else {
      cancelDetection();
      setStorageWarning(null);
    }
  }, [cancelDetection, startDetectionCountdown]);

  const handleNewPosition = useCallback((pos: GeolocationPosition) => {
    setCurrentLocation(pos);
    if (isPaused) return;

    const { latitude, longitude, speed, accuracy, heading } = pos.coords;
    if (accuracy > 50 && !isTestModeRef.current) return; 

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

    if (activityTypeRef.current === ActivityType.FERTILIZATION) {
      checkStorageProximity(point, speedKmh);
    }

    if (trackingStateRef.current !== 'LOADING') {
      const inField = fieldsRef.current.some(f => isPointInPolygon(point, f.boundary));
      let isSpreading = false;
      if (activityTypeRef.current === ActivityType.FERTILIZATION || activityTypeRef.current === ActivityType.TILLAGE) {
        const minS = settingsRef.current.minSpeed || 2.0;
        const maxS = settingsRef.current.maxSpeed || 15.0;
        if (inField && speedKmh >= minS && speedKmh <= maxS) isSpreading = true;
      }
      const newState = isSpreading ? 'SPREADING' : 'TRANSIT';
      if (newState !== trackingStateRef.current) setTrackingState(newState);
      point.isSpreading = isSpreading;
    } else {
      point.isSpreading = false;
      if (activeLoadingStorageRef.current) point.storageId = activeLoadingStorageRef.current.id;
    }

    setTrackPoints(prev => {
        if (prev.length > 0) {
            const last = prev[prev.length - 1];
            const dist = getDistance(last, point);
            // In der Simulation erlauben wir sehr kleine Abstände für flüssige Pfade (0.1m)
            const minMove = isTestModeRef.current ? 0.1 : 0.5;
            if (dist < minMove) return prev;
        }
        return [...prev, point];
    });
  }, [isPaused, checkStorageProximity]);

  const simulateMovement = useCallback((lat: number, lng: number) => {
    const now = Date.now();
    
    // REDUZIERTE DROSSELUNG: 30ms für ultra-flüssiges Zeichnen
    if (lastSimTimeRef.current > 0 && (now - lastSimTimeRef.current) < 30) return;

    let speedMs = 0;
    let heading = 0;

    if (lastSimPosRef.current && lastSimTimeRef.current > 0) {
      const dist = getDistance({ lat, lng }, lastSimPosRef.current);
      const timeSec = (now - lastSimTimeRef.current) / 1000;
      
      if (timeSec > 0.005) {
        const instantSpeed = dist / timeSec;
        speedBufferRef.current.push(instantSpeed);
        if (speedBufferRef.current.length > 3) speedBufferRef.current.shift();
        speedMs = speedBufferRef.current.reduce((a, b) => a + b, 0) / speedBufferRef.current.length;
        if (speedMs > 12.5) speedMs = 12.5; 
      }

      const dy = lat - lastSimPosRef.current.lat;
      const dx = lng - lastSimPosRef.current.lng;
      heading = (Math.atan2(dx, dy) * 180) / Math.PI;
    }

    const fakePos: any = {
      coords: {
        latitude: lat,
        longitude: lng,
        accuracy: 5,
        speed: speedMs,
        heading: heading
      },
      timestamp: now
    };

    lastSimPosRef.current = { lat, lng };
    lastSimTimeRef.current = now;
    handleNewPosition(fakePos);
  }, [handleNewPosition]);

  const toggleTestMode = async (enabled: boolean) => {
      if (enabled && !currentLocation) {
          const profiles = await dbService.getFarmProfile();
          if (profiles.length > 0 && profiles[0].addressGeo) {
              const p = profiles[0].addressGeo;
              const initPos: any = {
                  coords: { latitude: p.lat, longitude: p.lng, accuracy: 5, speed: 0, heading: 0 },
                  timestamp: Date.now()
              };
              lastSimPosRef.current = { lat: p.lat, lng: p.lng };
              lastSimTimeRef.current = Date.now();
              handleNewPosition(initPos);
          }
      }
      setIsTestMode(enabled);
  };

  const startGPS = async () => {
    if (!navigator.geolocation) { alert("GPS wird nicht unterstützt."); return; }
    setGpsLoading(true);
    try {
      const initPos: any = await new Promise((res, rej) => {
        navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 });
      });
      await requestWakeLock();
      setStartTime(Date.now());
      setTrackingState('TRANSIT');
      setTrackPoints([]);
      setLoadCounts({});
      setActiveSourceId(null);
      setIsPaused(false);
      setStorageWarning(null);
      setIsTestMode(false);
      currentLoadIndexRef.current = 1;
      speedBufferRef.current = [];
      
      lastSimPosRef.current = { lat: initPos.coords.latitude, lng: initPos.coords.longitude };
      lastSimTimeRef.current = Date.now();

      watchIdRef.current = navigator.geolocation.watchPosition((pos) => {
        if (!isTestModeRef.current) handleNewPosition(pos);
      }, (err) => console.error(err), { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 });
    } catch (e: any) { alert("GPS Fehler: " + e.message); }
    finally { setGpsLoading(false); }
  };

  const stopGPS = useCallback(() => {
    if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
    if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
    releaseWakeLock();
    setIsTestMode(false);
    lastSimPosRef.current = null;
    lastSimTimeRef.current = 0;
    speedBufferRef.current = [];
  }, [releaseWakeLock]);

  const handleFinishLogic = async (notes: string) => {
    const finalPoints = [...trackPoints];
    const finalActivity = activityTypeRef.current;
    const finalSub = subTypeRef.current;
    const finalSettings = settingsRef.current;
    const finalFields = fieldsRef.current;
    const finalLoadCounts = { ...loadCounts };

    stopGPS();
    setTrackingState('IDLE');

    let spreadDist = 0;
    const fieldDistMap: Record<string, number> = {};
    const fieldIds = new Set<string>();
    
    for (let i = 1; i < finalPoints.length; i++) {
      const p1 = finalPoints[i - 1];
      const p2 = finalPoints[i];
      if (p2.isSpreading) {
        const d = getDistance(p1, p2);
        spreadDist += d;
        const f = finalFields.find(field => isPointInPolygon(p2, field.boundary));
        if (f) {
          fieldIds.add(f.id);
          fieldDistMap[f.id] = (fieldDistMap[f.id] || 0) + d;
        }
      }
    }

    const width = finalActivity === ActivityType.FERTILIZATION ? (finalSub === 'Mist' ? finalSettings.manureSpreadWidth : finalSettings.slurrySpreadWidth) : 6;
    const calculatedAreaHa = (spreadDist * (width || 12)) / 10000;
    let totalLoadCount = 0;
    const storageDistribution: Record<string, number> = {};
    let totalAmount = 0;

    if (finalActivity === ActivityType.FERTILIZATION) {
      const loadSize = finalSub === 'Mist' ? finalSettings.manureLoadSize : finalSettings.slurryLoadSize;
      Object.entries(finalLoadCounts).forEach(([sId, count]) => {
        totalLoadCount += count;
        const vol = count * loadSize;
        storageDistribution[sId] = vol;
        totalAmount += vol;
      });
    } else if (finalActivity === ActivityType.TILLAGE) totalAmount = parseFloat(calculatedAreaHa.toFixed(2));

    const finalFieldDist: Record<string, number> = {};
    if (spreadDist > 0 && totalAmount > 0) {
      Object.keys(fieldDistMap).forEach(fId => {
        const ratio = fieldDistMap[fId] / spreadDist;
        finalFieldDist[fId] = parseFloat((totalAmount * ratio).toFixed(2));
      });
    }

    const durationMin = startTime ? Math.round((Date.now() - startTime) / 60000) : 0;
    const record: ActivityRecord = {
      id: generateId(),
      date: new Date(startTime || Date.now()).toISOString(),
      type: finalActivity,
      fertilizerType: finalActivity === ActivityType.FERTILIZATION ? (finalSub === 'Mist' ? FertilizerType.MANURE : FertilizerType.SLURRY) : undefined,
      tillageType: finalActivity === ActivityType.TILLAGE ? (finalSub as any) : undefined,
      fieldIds: Array.from(fieldIds),
      amount: totalAmount,
      unit: finalActivity === ActivityType.HARVEST ? 'Stk' : (finalActivity === ActivityType.TILLAGE ? 'ha' : 'm³'),
      trackPoints: finalPoints,
      loadCount: totalLoadCount,
      storageDistribution: finalActivity === ActivityType.FERTILIZATION ? storageDistribution : undefined,
      notes: notes + `\nAutomatisch erfasst. Dauer: ${durationMin} min`,
      year: new Date().getFullYear(),
      fieldDistribution: finalFieldDist
    };

    await dbService.saveActivity(record);
    if (finalActivity === ActivityType.FERTILIZATION && Object.keys(storageDistribution).length > 0) {
      await dbService.updateStorageLevels(storageDistribution);
    }
    dbService.syncActivities();
    return record;
  };

  const handleDiscard = useCallback(() => {
    stopGPS();
    setTrackingState('IDLE');
    setTrackPoints([]);
    setLoadCounts({});
    setActiveSourceId(null);
    setDetectionCountdown(null);
    setStorageWarning(null);
  }, [stopGPS]);

  return {
    trackingState, currentLocation, trackPoints, startTime, loadCounts,
    activeSourceId, detectionCountdown, storageWarning, gpsLoading,
    isTestMode, setIsTestMode: toggleTestMode, simulateMovement, startGPS, stopGPS,
    handleFinishLogic, handleDiscard
  };
};

