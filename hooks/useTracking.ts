
import { useState, useEffect, useRef, useCallback } from 'react';
import { dbService, generateId } from '../services/db';
import { Field, StorageLocation, TrackPoint, ActivityType, FertilizerType, AppSettings, ActivityRecord, GeoPoint, Equipment } from '../types';
import { getDistance, isPointInPolygon } from '../utils/geo';

type TrackingState = 'IDLE' | 'LOADING' | 'TRANSIT' | 'SPREADING';

export const useTracking = (
  settings: AppSettings,
  fields: Field[],
  storages: StorageLocation[],
  activityType: ActivityType,
  subType: string,
  selectedEquipment?: Equipment | null // NEU
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
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isTestMode, setIsTestMode] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  
  const [workedAreaHa, setWorkedAreaHa] = useState(0);

  const settingsRef = useRef(settings);
  const fieldsRef = useRef(fields);
  const storagesRef = useRef(storages);
  const activityTypeRef = useRef(activityType);
  const subTypeRef = useRef(subType);
  const equipmentRef = useRef(selectedEquipment);
  const isTestModeRef = useRef(false);
  
  const activeSourceIdRef = useRef<string | null>(null);
  const currentLoadIndexRef = useRef<number>(1);
  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);
  
  const lastSimPosRef = useRef<GeoPoint | null>(null);
  const lastSimTimeRef = useRef<number>(0);
  
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
    equipmentRef.current = selectedEquipment;
    isTestModeRef.current = isTestMode; 
  }, [settings, fields, storages, activityType, subType, selectedEquipment, isTestMode]);

  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        setWakeLockActive(true);
        wakeLockRef.current.addEventListener('release', () => setWakeLockActive(false));
      } catch (err: any) {
        console.warn(`[System] WakeLock Fehler: ${err.message}`);
      }
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  };

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (wakeLockRef.current !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

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
          if (!isCorrectType) { setStorageWarning(`${nearest.name} erkannt, aber falscher Typ!`); return; }
          setStorageWarning(null);
          if (activeSourceIdRef.current === nearest.id && trackingState === 'LOADING') return;
          if (pendingStorageIdRef.current !== nearest.id) {
              pendingStorageIdRef.current = nearest.id;
              setPendingStorageId(nearest.id);
              proximityStartTimeRef.current = Date.now();
          }
          const elapsed = Date.now() - (proximityStartTimeRef.current || Date.now());
          const remaining = Math.max(0, Math.ceil((DETECTION_DELAY_MS - elapsed) / 1000));
          if (remaining > 0) { setDetectionCountdown(remaining); } else {
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
          setStorageWarning(null); proximityStartTimeRef.current = null; pendingStorageIdRef.current = null; setPendingStorageId(null); setDetectionCountdown(null);
          if (speedKmh > 3.5 && trackingState === 'LOADING') setTrackingState('TRANSIT');
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [trackingState]);

  const handleNewPosition = useCallback((pos: GeolocationPosition) => {
    setCurrentLocation(pos);
    setGpsError(null);
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
    }

    const point: TrackPoint = { lat: latitude, lng: longitude, timestamp: pos.timestamp, speed: speedKmh, isSpreading, storageId: activeSourceIdRef.current || undefined, loadIndex: currentLoadIndexRef.current };
    
    setTrackPoints(prev => {
        if (prev.length > 0) {
            const last = prev[prev.length - 1];
            const dist = getDistance(last, point);
            if (dist < (isTestModeRef.current ? 0.2 : 0.5)) return prev;

            if (activityTypeRef.current === ActivityType.TILLAGE && isSpreading && last.isSpreading) {
                // NEU: Nutze bevorzugt das gewählte Gerät
                let workingWidth = 6.0; 
                if (equipmentRef.current) {
                  workingWidth = equipmentRef.current.width;
                } else {
                  const sub = subTypeRef.current;
                  const s = settingsRef.current;
                  if (sub === 'Wiesenegge') workingWidth = s.harrowWidth || 6;
                  else if (sub === 'Schlegeln') workingWidth = s.mulchWidth || 3;
                  else if (sub === 'Striegel') workingWidth = s.weederWidth || 6;
                  else if (sub === 'Nachsaat') workingWidth = s.reseedingWidth || 3;
                }

                if (dist < 50) { 
                    setWorkedAreaHa(old => old + (dist * workingWidth) / 10000);
                }
            }
        }
        return [...prev, point];
    });
  }, [isPaused, trackingState]);

  const simulateMovement = useCallback((lat: number, lng: number) => {
    const now = Date.now();
    if (now - lastSimTimeRef.current < 80) return;
    let speedMs = 0; let heading = 0;
    if (lastSimPosRef.current) {
      speedMs = getDistance({ lat, lng }, lastSimPosRef.current) / ((now - lastSimTimeRef.current) / 1000);
      heading = (Math.atan2(lng - lastSimPosRef.current.lng, lat - lastSimPosRef.current.lat) * 180) / Math.PI;
    }
    const fakePos: any = { coords: { latitude: lat, longitude: lng, accuracy: 5, speed: speedMs, heading: heading }, timestamp: now };
    lastSimPosRef.current = { lat, lng }; lastSimTimeRef.current = now;
    handleNewPosition(fakePos);
  }, [handleNewPosition]);

  const startGPS = async () => {
    if (!navigator.geolocation) { setGpsError("Kein GPS."); return; }
    setGpsLoading(true); setGpsError(null);
    const timeout = setTimeout(() => { if (gpsLoading) { setGpsLoading(false); setGpsError("GPS zu schwach."); } }, 10000);
    try {
      const initPos: any = await new Promise((res, rej) => { navigator.geolocation.getCurrentPosition(res, (err) => { clearTimeout(timeout); rej(err); }, { enableHighAccuracy: true, timeout: 10000 }); });
      clearTimeout(timeout); await requestWakeLock();
      setStartTime(Date.now()); setTrackingState('TRANSIT'); setTrackPoints([]); setLoadCounts({}); setWorkedAreaHa(0);
      activeSourceIdRef.current = null; setActiveSourceId(null); setIsPaused(false); setIsTestMode(false); currentLoadIndexRef.current = 1; setCurrentLocation(initPos);
      watchIdRef.current = navigator.geolocation.watchPosition((pos) => { if (!isTestModeRef.current) handleNewPosition(pos); }, (err) => { if (err.code === 1) setGpsError("Verweigert."); else if (err.code === 2) setGpsError("Signal verloren."); }, { enableHighAccuracy: true });
    } catch (err: any) { setGpsLoading(false); setGpsError("GPS Fehler."); } finally { setGpsLoading(false); }
  };

  const handleFinishLogic = useCallback(async (notes: string) => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    releaseWakeLock();
    const durationMin = startTime ? Math.round((Date.now() - startTime) / 60000) : 0;
    const involvedFieldIds = new Set<string>();
    trackPoints.forEach(p => { if (p.isSpreading) { const field = fieldsRef.current.find(f => isPointInPolygon(p, f.boundary)); if (field) involvedFieldIds.add(field.id); } });
    const fIds = Array.from(involvedFieldIds);
    let totalAmt = 0; let unit = 'ha';
    const s = settingsRef.current;
    const sub = subTypeRef.current;

    const fieldDist: Record<string, number> = {};
    const detailedFieldSources: Record<string, Record<string, number>> = {};

    if (activityTypeRef.current === ActivityType.FERTILIZATION) {
      unit = 'm³';
      const loadSize = sub === 'Gülle' ? s.slurryLoadSize : s.manureLoadSize;
      const totalLoads = Object.values(loadCounts).reduce((a, b) => a + b, 0);
      totalAmt = Math.round(totalLoads * loadSize); 
      
      const pointsByLoad: Record<number, TrackPoint[]> = {};
      trackPoints.forEach(p => { const lIdx = p.loadIndex || 1; if (!pointsByLoad[lIdx]) pointsByLoad[lIdx] = []; pointsByLoad[lIdx].push(p); });
      
      Object.entries(pointsByLoad).forEach(([lIdx, points]) => {
          const spreading = points.filter(p => p.isSpreading);
          if (spreading.length === 0) return;
          const storageId = spreading[0].storageId;
          if (!storageId) return;

          const loadFieldIds = new Set<string>();
          spreading.forEach(p => {
              const field = fieldsRef.current.find(f => isPointInPolygon(p, f.boundary));
              if (field) loadFieldIds.add(field.id);
          });

          if (loadFieldIds.size === 1) {
              const fId = Array.from(loadFieldIds)[0];
              fieldDist[fId] = Math.round((fieldDist[fId] || 0) + loadSize);
              if (!detailedFieldSources[fId]) detailedFieldSources[fId] = {};
              detailedFieldSources[fId][storageId] = Math.round((detailedFieldSources[fId][storageId] || 0) + loadSize);
          } else if (loadFieldIds.size > 1) {
              const volPerPoint = loadSize / spreading.length;
              spreading.forEach(p => {
                  const field = fieldsRef.current.find(f => isPointInPolygon(p, f.boundary));
                  if (field) {
                      fieldDist[field.id] = (fieldDist[field.id] || 0) + volPerPoint;
                      if (!detailedFieldSources[field.id]) detailedFieldSources[field.id] = {};
                      detailedFieldSources[field.id][storageId] = (detailedFieldSources[field.id][storageId] || 0) + volPerPoint;
                  }
              });
          }
      });

      Object.keys(fieldDist).forEach(fId => {
          fieldDist[fId] = Math.round(fieldDist[fId]);
          if (detailedFieldSources[fId]) {
              Object.keys(detailedFieldSources[fId]).forEach(sId => {
                  detailedFieldSources[fId][sId] = Math.round(detailedFieldSources[fId][sId]);
              });
          }
      });

    } else if (activityTypeRef.current === ActivityType.TILLAGE) {
      unit = 'ha';
      totalAmt = Math.round(workedAreaHa * 100) / 100;

      const fieldPoints: Record<string, number> = {};
      trackPoints.filter(p => p.isSpreading).forEach(p => {
          const field = fieldsRef.current.find(f => isPointInPolygon(p, f.boundary));
          if (field) fieldPoints[field.id] = (fieldPoints[field.id] || 0) + 1;
      });
      const totalPoints = Object.values(fieldPoints).reduce((a, b) => a + b, 0);
      Object.entries(fieldPoints).forEach(([fId, count]) => {
          fieldDist[fId] = totalPoints > 0 ? Math.round((count / totalPoints) * totalAmt * 100) / 100 : 0;
      });
    } else {
      const involvedFields = fieldsRef.current.filter(f => fIds.includes(f.id));
      totalAmt = Math.round(involvedFields.reduce((sum, f) => sum + f.areaHa, 0) * 100) / 100;
      involvedFields.forEach(f => fieldDist[f.id] = f.areaHa);
    }

    const storageDist: Record<string, number> = {};
    if (activityTypeRef.current === ActivityType.FERTILIZATION) {
      const loadSize = sub === 'Gülle' ? s.slurryLoadSize : s.manureLoadSize;
      Object.entries(loadCounts).forEach(([sId, count]) => storageDist[sId] = Math.round(count * loadSize));
    }

    const record: ActivityRecord = {
      id: generateId(), 
      date: new Date().toISOString(), 
      type: activityTypeRef.current, 
      year: new Date().getFullYear(), 
      fieldIds: fIds, 
      amount: totalAmt, 
      unit, 
      loadCount: activityTypeRef.current === ActivityType.FERTILIZATION ? (Object.values(loadCounts).reduce((a, b) => a + b, 0) || undefined) : undefined, 
      notes: `${notes}\nDauer: ${durationMin} min`, 
      trackPoints: [...trackPoints], 
      fieldDistribution: fieldDist, 
      storageDistribution: Object.keys(storageDist).length > 0 ? storageDist : undefined, 
      detailedFieldSources: Object.keys(detailedFieldSources).length > 0 ? detailedFieldSources : undefined, 
      fertilizerType: activityTypeRef.current === ActivityType.FERTILIZATION ? (sub === 'Gülle' ? FertilizerType.SLURRY : FertilizerType.MANURE) : undefined, 
      tillageType: activityTypeRef.current === ActivityType.TILLAGE ? sub as any : undefined,
      equipmentId: equipmentRef.current?.id, // NEU
      equipmentName: equipmentRef.current?.name // NEU
    };

    if (record.detailedFieldSources) {
        for (const [fId, sourceMap] of Object.entries(record.detailedFieldSources)) {
            const field = fieldsRef.current.find(f => f.id === fId);
            if (field) {
                const cur = field.detailedSources || {};
                for (const [sId, amt] of Object.entries(sourceMap)) cur[sId] = (cur[sId] || 0) + amt;
                await dbService.saveField({ ...field, detailedSources: cur });
            }
        }
    }
    await dbService.saveActivity(record);
    if (record.type === ActivityType.FERTILIZATION && record.storageDistribution) await dbService.updateStorageLevels(record.storageDistribution);
    dbService.syncActivities(); setTrackingState('IDLE'); setTrackPoints([]); lastKnownPosRef.current = null; setWorkedAreaHa(0);
    return record;
  }, [trackPoints, startTime, loadCounts, workedAreaHa, fields]);

  return { trackingState, currentLocation, trackPoints, startTime, loadCounts, workedAreaHa, activeSourceId, detectionCountdown, pendingStorageId, storageWarning, gpsLoading, gpsError, wakeLockActive, isTestMode, setIsTestMode: (v: boolean) => { setIsTestMode(v); isTestModeRef.current = v; if (v && currentLocation) lastSimPosRef.current = { lat: currentLocation.coords.latitude, lng: currentLocation.coords.longitude }; }, simulateMovement, startGPS, stopGPS: useCallback(() => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); releaseWakeLock(); setIsTestMode(false); }, []), handleFinishLogic, handleDiscard: () => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); releaseWakeLock(); setTrackingState('IDLE'); setTrackPoints([]); setGpsError(null); setWorkedAreaHa(0); } };
};

