
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

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { fieldsRef.current = fields; }, [fields]);
  useEffect(() => { storagesRef.current = storages; }, [storages]);
  useEffect(() => { activityTypeRef.current = activityType; }, [activityType]);
  useEffect(() => { subTypeRef.current = subType; }, [subType]);
  useEffect(() => { trackingStateRef.current = trackingState; }, [trackingState]);
  useEffect(() => { activeSourceIdRef.current = activeSourceId; }, [activeSourceId]);
  useEffect(() => { isTestModeRef.current = isTestMode; }, [isTestMode]);

  const handleNewPosition = useCallback((pos: GeolocationPosition) => {
    setCurrentLocation(pos);
    if (isPaused) return;

    const { latitude, longitude, speed, accuracy } = pos.coords;
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

    if (trackingStateRef.current !== 'LOADING') {
      const inField = fieldsRef.current.some(f => isPointInPolygon(point, f.boundary));
      let isSpreading = false;
      if (activityTypeRef.current === ActivityType.FERTILIZATION || activityTypeRef.current === ActivityType.TILLAGE) {
        const minS = settingsRef.current.minSpeed || 2.0;
        if (inField && speedKmh >= minS) isSpreading = true;
      }
      const newState = isSpreading ? 'SPREADING' : 'TRANSIT';
      if (newState !== trackingStateRef.current) setTrackingState(newState);
      point.isSpreading = isSpreading;
    }

    setTrackPoints(prev => {
        if (prev.length > 0) {
            const last = prev[prev.length - 1];
            const dist = getDistance(last, point);
            const minMove = isTestModeRef.current ? 0.05 : 0.5; // Extrem feine Auflösung für Simulation
            if (dist < minMove) return prev;
        }
        return [...prev, point];
    });
  }, [isPaused]);

  const simulateMovement = useCallback((lat: number, lng: number) => {
    const now = Date.now();
    let speedMs = 0;
    let heading = 0;

    if (lastSimPosRef.current && lastSimTimeRef.current > 0) {
      const dist = getDistance({ lat, lng }, lastSimPosRef.current);
      const timeSec = (now - lastSimTimeRef.current) / 1000;
      if (timeSec > 0) speedMs = dist / timeSec;
      
      const dy = lat - lastSimPosRef.current.lat;
      const dx = lng - lastSimPosRef.current.lng;
      heading = (Math.atan2(dx, dy) * 180) / Math.PI;
    }

    const fakePos: any = {
      coords: {
        latitude: lat,
        longitude: lng,
        accuracy: 5,
        speed: speedMs > 12 ? 12 : speedMs, // Cap speed at ~43km/h for logic
        heading: heading
      },
      timestamp: now
    };

    lastSimPosRef.current = { lat, lng };
    lastSimTimeRef.current = now;
    handleNewPosition(fakePos);
  }, [handleNewPosition]);

  const toggleTestMode = async (enabled: boolean) => {
      setIsTestMode(enabled);
  };

  const startGPS = async () => {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    try {
      const initPos: any = await new Promise((res, rej) => {
        navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true });
      });
      setStartTime(Date.now());
      setTrackingState('TRANSIT');
      setTrackPoints([]);
      setLoadCounts({});
      setActiveSourceId(null);
      setIsPaused(false);
      setIsTestMode(false);
      currentLoadIndexRef.current = 1;
      
      lastSimPosRef.current = { lat: initPos.coords.latitude, lng: initPos.coords.longitude };
      lastSimTimeRef.current = Date.now();

      watchIdRef.current = navigator.geolocation.watchPosition((pos) => {
        if (!isTestModeRef.current) handleNewPosition(pos);
      }, undefined, { enableHighAccuracy: true });
    } finally { setGpsLoading(false); }
  };

  const stopGPS = useCallback(() => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    setIsTestMode(false);
    lastSimPosRef.current = null;
  }, []);

  const handleFinishLogic = async (notes: string) => {
    const finalPoints = [...trackPoints];
    stopGPS();
    setTrackingState('IDLE');
    const record: ActivityRecord = {
      id: generateId(),
      date: new Date().toISOString(),
      type: activityTypeRef.current,
      fieldIds: [],
      amount: 0,
      unit: 'm³',
      trackPoints: finalPoints,
      year: new Date().getFullYear(),
      notes: notes
    };
    await dbService.saveActivity(record);
    return record;
  };

  const handleDiscard = useCallback(() => {
    stopGPS();
    setTrackingState('IDLE');
    setTrackPoints([]);
  }, [stopGPS]);

  return {
    trackingState, currentLocation, trackPoints, startTime, loadCounts,
    activeSourceId, detectionCountdown, storageWarning, gpsLoading,
    isTestMode, setIsTestMode: toggleTestMode, simulateMovement, startGPS, stopGPS,
    handleFinishLogic, handleDiscard
  };
};

