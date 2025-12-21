
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

  // Refs for background safety
  const settingsRef = useRef(settings);
  const fieldsRef = useRef(fields);
  const storagesRef = useRef(storages);
  const activityTypeRef = useRef(activityType);
  const subTypeRef = useRef(subType);
  const trackingStateRef = useRef<TrackingState>('IDLE');
  const activeSourceIdRef = useRef<string | null>(null);
  const currentLoadIndexRef = useRef<number>(1);
  const watchIdRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<any>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const activeLoadingStorageRef = useRef<StorageLocation | null>(null);
  const pendingStorageIdRef = useRef<string | null>(null);

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { fieldsRef.current = fields; }, [fields]);
  useEffect(() => { storagesRef.current = storages; }, [storages]);
  useEffect(() => { activityTypeRef.current = activityType; }, [activityType]);
  useEffect(() => { subTypeRef.current = subType; }, [subType]);
  useEffect(() => { trackingStateRef.current = trackingState; trackingStateRef.current = trackingState; }, [trackingState]);
  useEffect(() => { activeSourceIdRef.current = activeSourceId; }, [activeSourceId]);

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
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
      } else if (speedKmh >= 3.0) {
        cancelDetection();
      }
    } else {
      cancelDetection();
      setStorageWarning(null);
    }
  }, [cancelDetection, startDetectionCountdown]);

  const handleNewPosition = useCallback((pos: GeolocationPosition) => {
    setCurrentLocation(pos);
    if (isPaused) return;

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

    setTrackPoints(prev => [...prev, point]);
  }, [isPaused, checkStorageProximity]);

  const startGPS = async () => {
    if (!navigator.geolocation) { alert("GPS wird nicht unterstützt."); return; }
    setGpsLoading(true);
    try {
      await new Promise((res, rej) => {
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
      currentLoadIndexRef.current = 1;
      watchIdRef.current = navigator.geolocation.watchPosition(handleNewPosition, (err) => console.error(err), { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 });
    } catch (e: any) { alert("GPS Fehler: " + e.message); }
    finally { setGpsLoading(false); }
  };

  const stopGPS = useCallback(() => {
    if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
    if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
    releaseWakeLock();
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

    // Stats Calculation Logic (Copied from old TrackingPage)
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
    } else if (finalActivity === ActivityType.TILLAGE) {
      totalAmount = parseFloat(calculatedAreaHa.toFixed(2));
    }

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
    trackingState,
    currentLocation,
    trackPoints,
    startTime,
    loadCounts,
    activeSourceId,
    detectionCountdown,
    storageWarning,
    gpsLoading,
    startGPS,
    stopGPS,
    handleFinishLogic,
    handleDiscard
  };
};

