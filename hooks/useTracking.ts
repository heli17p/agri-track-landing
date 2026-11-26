
import { useState, useEffect, useRef, useCallback } from 'react';
import { dbService, generateId } from '../services/db';
import { Field, StorageLocation, TrackPoint, ActivityType, FertilizerType, AppSettings, ActivityRecord, GeoPoint, Equipment, RoundBale, ExternalGpsStatus } from '../types';
import { getAngleDiff, getBearing, getDistance, getDistanceToPolygonEdge, isPointInPolygon } from '../utils/geo';
import { createInitialGpsFilterState, GpsFilterState, processGpsSample } from '../utils/gpsFilter';
import { externalGpsService } from '../services/externalGps';

export type TrackingState = 'IDLE' | 'LOADING' | 'TRANSIT' | 'SPREADING';

export const useTracking = (
  settings: AppSettings,
  fields: Field[],
  storages: StorageLocation[],
  activityType: ActivityType,
  subType: string,
  selectedEquipment?: Equipment | null
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
  const [externalGpsStatus, setExternalGpsStatus] = useState<ExternalGpsStatus>(() => externalGpsService.getStatus());
  const [workedAreaHa, setWorkedAreaHa] = useState(0);

  // Heimfahrt (Return-to-farm) state
  const [isReturningHome, setIsReturningHome] = useState(false);
  const [homeDistanceMeters, setHomeDistanceMeters] = useState<number | null>(null);

  // --- RUNDBALLEN AUTOMATIK & LOGISTIK ---
  const [detectedBales, setDetectedBales] = useState<RoundBale[]>([]);
  const [currentBaleDistance, setCurrentBaleDistance] = useState<number>(0);
  const [baleDropCountdown, setBaleDropCountdown] = useState<number | null>(null);
  const [lastBaleNotice, setLastBaleNotice] = useState<string | null>(null);

  const settingsRef = useRef(settings);
  const fieldsRef = useRef(fields);
  const storagesRef = useRef(storages);
  const activityTypeRef = useRef(activityType);
  const subTypeRef = useRef(subType);
  const equipmentRef = useRef(selectedEquipment);
  const isTestModeRef = useRef(false);
  const isPausedRef = useRef(false);
  const trackingStateRef = useRef<TrackingState>('IDLE');
  const farmHomeGeoRef = useRef<GeoPoint | null>(null);

  const activeSourceIdRef = useRef<string | null>(null);
  const currentLoadIndexRef = useRef<number>(1);
  const watchIdRef = useRef<number | null>(null);
  const extUnsubRef = useRef<(() => void) | null>(null);
  const wakeLockRef = useRef<any>(null);
  const isFinishingRef = useRef<boolean>(false);
  const sessionIdRef = useRef<string | null>(null);

  const lastSimPosRef = useRef<GeoPoint | null>(null);
  const lastSimTimeRef = useRef<number>(0);

  // GPS Signal Conditioning & Hysteresis Refs
  const gpsFilterRef = useRef<GpsFilterState>(createInitialGpsFilterState());
  const confirmedSpreadingRef = useRef<boolean>(false);
  const pendingSpreadCandidateRef = useRef<boolean | null>(null);
  const pendingSpreadSinceRef = useRef<number>(0);
  const lastSpreadingFieldIdRef = useRef<string | null>(null);
  const hasWorkedFieldRef = useRef<boolean>(false);
  const lastKnownHeadingRef = useRef<number | null>(null);
  const homeDistHistoryRef = useRef<{ ts: number; dist: number }[]>([]);
  const isReturningHomeRef = useRef<boolean>(false);

  // Storage Loading Detection Refs (with wobble grace period)
  const proximityStartTimeRef = useRef<number | null>(null);
  const pendingStorageIdRef = useRef<string | null>(null);
  const graceLostSinceRef = useRef<number | null>(null);
  const loadingExitSinceRef = useRef<number | null>(null);
  const lastKnownSpeedRef = useRef<number>(0);
  const lastKnownPosRef = useRef<GeoPoint | null>(null);
  const DETECTION_DELAY_MS = 30000;
  const STORAGE_GRACE_MS = 3000;

  // Ballen Stopp-Erkennung Refs
  const baleStopStartTimeRef = useRef<number | null>(null);
  const baleStopPosRef = useRef<GeoPoint | null>(null);
  const currentBaleDistRef = useRef<number>(0);
  const detectedBalesRef = useRef<RoundBale[]>([]);
  const lastBaleDropTimeRef = useRef<number>(0);
  const lastActiveFieldRef = useRef<Field | null>(null);

  useEffect(() => {
    settingsRef.current = settings;
    fieldsRef.current = fields;
    storagesRef.current = storages;
    activityTypeRef.current = activityType;
    subTypeRef.current = subType;
    equipmentRef.current = selectedEquipment;
    isTestModeRef.current = isTestMode;
    isPausedRef.current = isPaused;
  }, [settings, fields, storages, activityType, subType, selectedEquipment, isTestMode, isPaused]);

  useEffect(() => {
    trackingStateRef.current = trackingState;
  }, [trackingState]);

  useEffect(() => {
    detectedBalesRef.current = detectedBales;
    if (detectedBales.length > 0) hasWorkedFieldRef.current = true;
  }, [detectedBales]);

  useEffect(() => {
    return externalGpsService.onStatusChange(setExternalGpsStatus);
  }, []);

  // Load Hofstelle (FarmProfile.addressGeo) for Heimfahrt detection
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const profiles = await dbService.getFarmProfile();
        farmHomeGeoRef.current = profiles[0]?.addressGeo || null;
      } catch {
        farmHomeGeoRef.current = null;
      }
    };
    loadProfile();
    return dbService.onDatabaseChange(loadProfile);
  }, []);

  const resetSessionFilters = useCallback(() => {
    gpsFilterRef.current = createInitialGpsFilterState();
    confirmedSpreadingRef.current = false;
    pendingSpreadCandidateRef.current = null;
    pendingSpreadSinceRef.current = 0;
    lastSpreadingFieldIdRef.current = null;
    hasWorkedFieldRef.current = false;
    lastKnownHeadingRef.current = null;
    homeDistHistoryRef.current = [];
    isReturningHomeRef.current = false;
    setIsReturningHome(false);
    setHomeDistanceMeters(null);
    proximityStartTimeRef.current = null;
    pendingStorageIdRef.current = null;
    graceLostSinceRef.current = null;
    loadingExitSinceRef.current = null;
    setPendingStorageId(null);
    setDetectionCountdown(null);
    setStorageWarning(null);
    lastKnownSpeedRef.current = 0;
    lastKnownPosRef.current = null;
    baleStopStartTimeRef.current = null;
    baleStopPosRef.current = null;
    lastBaleDropTimeRef.current = 0;
    lastActiveFieldRef.current = null;
  }, []);

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

  // 1-second timer: Storage Loading (with 3s wobble tolerance), Bale Stop detection & Heimfahrt evaluation
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const curState = trackingStateRef.current;
      if (curState === 'IDLE' || isPausedRef.current) return;

      // 1. DÜNGUNG: Hof- / Güllefass-Erkennung (mit 3s Karenzzeit gegen GPS-Wackler)
      if (activityTypeRef.current === ActivityType.FERTILIZATION && lastKnownPosRef.current) {
        const { lat, lng } = lastKnownPosRef.current;
        const speedKmh = lastKnownSpeedRef.current;
        const rad = settingsRef.current.storageRadius || 20;

        let nearest: StorageLocation | null = null;
        let minDist = Infinity;
        storagesRef.current.forEach(s => {
          const dist = getDistance({ lat, lng }, s.geo);
          if (dist < minDist) { minDist = dist; nearest = s; }
        });

        const strictlyInLoadingZone = Boolean(nearest && minDist <= rad && speedKmh < 2.5);
        const withinWobbleTolerance = Boolean(
          nearest &&
          pendingStorageIdRef.current === nearest.id &&
          minDist <= rad + 5 &&
          speedKmh < 4.2
        );

        if (strictlyInLoadingZone && nearest) {
          graceLostSinceRef.current = null;
          loadingExitSinceRef.current = null;
          const isCorrectType = nearest.type === (subTypeRef.current === 'Gülle' ? FertilizerType.SLURRY : FertilizerType.MANURE);
          if (!isCorrectType) {
            setStorageWarning(`${nearest.name} erkannt, aber falscher Typ!`);
          } else {
            setStorageWarning(null);
            if (!(activeSourceIdRef.current === nearest.id && curState === 'LOADING')) {
              if (pendingStorageIdRef.current !== nearest.id) {
                pendingStorageIdRef.current = nearest.id;
                setPendingStorageId(nearest.id);
                proximityStartTimeRef.current = now;
              }
              const elapsed = now - (proximityStartTimeRef.current || now);
              const remaining = Math.max(0, Math.ceil((DETECTION_DELAY_MS - elapsed) / 1000));
              if (remaining > 0) {
                setDetectionCountdown(remaining);
              } else {
                activeSourceIdRef.current = nearest.id;
                setActiveSourceId(nearest.id);
                setLoadCounts(prev => ({ ...prev, [nearest!.id]: (prev[nearest!.id] || 0) + 1 }));
                currentLoadIndexRef.current++;
                trackingStateRef.current = 'LOADING';
                setTrackingState('LOADING');
                setDetectionCountdown(null);
                setPendingStorageId(null);
                proximityStartTimeRef.current = null;
                pendingStorageIdRef.current = null;
                graceLostSinceRef.current = null;
              }
            }
          }
        } else if (withinWobbleTolerance && curState !== 'LOADING') {
          // Kurzer GPS-Wackler während 30s-Countdown: bis zu 3 Sekunden überbrücken
          if (!graceLostSinceRef.current) {
            graceLostSinceRef.current = now;
          }
          const lostMs = now - graceLostSinceRef.current;
          if (lostMs <= STORAGE_GRACE_MS && proximityStartTimeRef.current) {
            const elapsed = now - proximityStartTimeRef.current;
            const remaining = Math.max(0, Math.ceil((DETECTION_DELAY_MS - elapsed) / 1000));
            setDetectionCountdown(remaining > 0 ? remaining : 1);
          } else {
            setStorageWarning(null);
            proximityStartTimeRef.current = null;
            pendingStorageIdRef.current = null;
            graceLostSinceRef.current = null;
            setPendingStorageId(null);
            setDetectionCountdown(null);
          }
        } else {
          setStorageWarning(null);
          proximityStartTimeRef.current = null;
          pendingStorageIdRef.current = null;
          graceLostSinceRef.current = null;
          setPendingStorageId(null);
          setDetectionCountdown(null);

          // LOADING erst verlassen, wenn wirklich losgefahren wird (> 4.0 km/h über 1.5s oder deutlich außerhalb Radius)
          if (curState === 'LOADING') {
            const clearlyLeft = minDist > rad + 6 || speedKmh > 4.0;
            if (clearlyLeft) {
              if (!loadingExitSinceRef.current) loadingExitSinceRef.current = now;
              if (now - loadingExitSinceRef.current >= 1500 || minDist > rad + 8) {
                trackingStateRef.current = 'TRANSIT';
                setTrackingState('TRANSIT');
                loadingExitSinceRef.current = null;
              }
            } else {
              loadingExitSinceRef.current = null;
            }
          }
        }
      }

      // 2. ERNTE: Rundballen-Ablage Erkennung (Presse hält ca. 8-10 Sek. an)
      if (activityTypeRef.current === ActivityType.HARVEST && lastKnownPosRef.current) {
        const curPos = lastKnownPosRef.current;
        const speedKmh = lastKnownSpeedRef.current;
        const requiredStopSec = settingsRef.current.baleStopSeconds || 8;
        const minDistanceBetweenBales = settingsRef.current.baleMinDistanceMeters || 15;

        const currentField = fieldsRef.current.find(f => isPointInPolygon(curPos, f.boundary)) || null;
        if (currentField) lastActiveFieldRef.current = currentField;

        if (speedKmh < 1.5 && (currentField || lastActiveFieldRef.current)) {
          if (!baleStopStartTimeRef.current) {
            baleStopStartTimeRef.current = now;
            baleStopPosRef.current = curPos;
          }

          const elapsedSec = Math.floor((now - baleStopStartTimeRef.current) / 1000);
          const remainingSec = Math.max(0, requiredStopSec - elapsedSec);

          if (remainingSec > 0) {
            setBaleDropCountdown(remainingSec);
          } else {
            const timeSinceLastDrop = now - lastBaleDropTimeRef.current;
            const targetField = currentField || lastActiveFieldRef.current!;

            let tooClose = false;
            if (detectedBalesRef.current.length > 0) {
              const lastBale = detectedBalesRef.current[detectedBalesRef.current.length - 1];
              const dist = getDistance(curPos, lastBale.location);
              if (dist < minDistanceBetweenBales) tooClose = true;
            }

            if (timeSinceLastDrop > 25000 && !tooClose) {
              const baleNumber = detectedBalesRef.current.length + 1;
              const drivenDistance = Math.round(currentBaleDistRef.current || 0);

              const newBale: RoundBale = {
                id: generateId(),
                number: baleNumber,
                cropType: subTypeRef.current || 'Silage',
                fieldId: targetField.id,
                fieldName: targetField.name,
                location: { lat: curPos.lat, lng: curPos.lng },
                status: 'FIELD',
                droppedAt: now,
                distanceMeters: Math.max(10, drivenDistance),
                year: new Date().getFullYear()
              };

              setDetectedBales(prev => [...prev, newBale]);
              hasWorkedFieldRef.current = true;
              lastBaleDropTimeRef.current = now;
              currentBaleDistRef.current = 0;
              setCurrentBaleDistance(0);

              setLastBaleNotice(`🟢 Ballen #${baleNumber} auf "${targetField.name}" erfasst! (${drivenDistance > 0 ? drivenDistance + 'm gefahren' : 'Stopp-Erkennung'})`);
              setTimeout(() => setLastBaleNotice(null), 8000);
            }

            setBaleDropCountdown(null);
            baleStopStartTimeRef.current = null;
            baleStopPosRef.current = null;
          }
        } else {
          if (speedKmh > 2.5) {
            setBaleDropCountdown(null);
            baleStopStartTimeRef.current = null;
            baleStopPosRef.current = null;
          }
        }
      }

      // 3. HEIMFAHRT-ERKENNUNG (nach erfolgter Feldarbeit im Transit Richtung Hofstelle/Lager)
      if (lastKnownPosRef.current) {
        const curPos = lastKnownPosRef.current;
        const speedKmh = lastKnownSpeedRef.current;

        // Zielreferenz: Hofstelle (addressGeo) oder falls nicht gesetzt, nächstes Lager
        let homeTarget: GeoPoint | null = farmHomeGeoRef.current;
        if (!homeTarget && storagesRef.current.length > 0) {
          let bestDist = Infinity;
          storagesRef.current.forEach(s => {
            const d = getDistance(curPos, s.geo);
            if (d < bestDist) {
              bestDist = d;
              homeTarget = s.geo;
            }
          });
        }

        if (homeTarget && curState === 'TRANSIT' && hasWorkedFieldRef.current) {
          const distToHome = getDistance(curPos, homeTarget);
          setHomeDistanceMeters(Math.round(distToHome));

          homeDistHistoryRef.current.push({ ts: now, dist: distToHome });
          homeDistHistoryRef.current = homeDistHistoryRef.current.filter(e => now - e.ts <= 8000);

          const oldestSample = homeDistHistoryRef.current[0];
          const distDelta = oldestSample ? distToHome - oldestSample.dist : 0;
          const approachingByDist = homeDistHistoryRef.current.length >= 2 && distDelta <= -8;

          let headingTowardHome = false;
          if (lastKnownHeadingRef.current !== null && speedKmh >= 3.5) {
            const bearingToHome = getBearing(curPos, homeTarget);
            const angleTolerance = isReturningHomeRef.current ? 85 : 65;
            headingTowardHome = getAngleDiff(lastKnownHeadingRef.current, bearingToHome) <= angleTolerance;
          }

          const nearYardZone = distToHome <= (isReturningHomeRef.current ? 300 : 220);
          const inAnyField = fieldsRef.current.some(f => isPointInPolygon(curPos, f.boundary));

          const shouldReturn = !inAnyField && (nearYardZone || (speedKmh >= 3.5 && (headingTowardHome || approachingByDist)));
          if (shouldReturn !== isReturningHomeRef.current) {
            isReturningHomeRef.current = shouldReturn;
            setIsReturningHome(shouldReturn);
          }
        } else {
          homeDistHistoryRef.current = [];
          if (isReturningHomeRef.current) {
            isReturningHomeRef.current = false;
            setIsReturningHome(false);
          }
          if (curState !== 'TRANSIT') {
            setHomeDistanceMeters(null);
          }
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleNewPosition = useCallback((pos: GeolocationPosition) => {
    setGpsError(null);
    if (isPausedRef.current) return;

    const isExternal = settingsRef.current.gpsSource === 'external' || externalGpsService.isConnected();
    const filtered = processGpsSample(pos, gpsFilterRef.current, {
      isExternal,
      isTestMode: isTestModeRef.current
    });

    if (!filtered.accepted) {
      return;
    }

    if (filtered.shouldUpdateUi || isTestModeRef.current) {
      setCurrentLocation(filtered.position);
    }

    const { lat, lng, speedKmh, headingDeg, isStationary } = filtered;
    const now = filtered.position.timestamp || Date.now();
    lastKnownSpeedRef.current = speedKmh;
    lastKnownPosRef.current = { lat, lng };
    if (headingDeg !== null) {
      lastKnownHeadingRef.current = headingDeg;
    }

    // Feld- & Randpuffer-Prüfung (2 m Eintrittstoleranz, 4.5 m Pufferzone auf demselben Schlag)
    const curPos: GeoPoint = { lat, lng };
    let matchedField: Field | null = fieldsRef.current.find(f => isPointInPolygon(curPos, f.boundary)) || null;
    if (!matchedField) {
      let bestDist = Infinity;
      for (const f of fieldsRef.current) {
        const edgeDist = getDistanceToPolygonEdge(curPos, f.boundary);
        const allowedBuffer = lastSpreadingFieldIdRef.current === f.id ? 4.5 : 2.0;
        if (edgeDist <= allowedBuffer && edgeDist < bestDist) {
          bestDist = edgeDist;
          matchedField = f;
        }
      }
    }

    // Aktive Prüfung von Min. Speed & Max. Speed mit Hysterese
    const minSpeed = Math.max(0.5, settingsRef.current.minSpeed || 2.0);
    const configuredMax = settingsRef.current.maxSpeed || 15.0;
    const maxSpeed = configuredMax > minSpeed ? configuredMax : 18.0;

    const isCurrentlySpreading = confirmedSpreadingRef.current;
    const effectiveMin = isCurrentlySpreading ? Math.max(0.8, minSpeed - 0.5) : minSpeed;
    const effectiveMax = isCurrentlySpreading ? maxSpeed + 1.0 : maxSpeed;
    const speedInWindow = speedKmh >= effectiveMin && speedKmh <= effectiveMax;

    const rawWantSpreading = Boolean(matchedField && speedInWindow);
    const curState = trackingStateRef.current;

    // Zustandsmaschine mit 1.2s Entprellung gegen kurze GPS-Ausreißer
    if (curState !== 'LOADING' || speedKmh > 4.0) {
      if (isTestModeRef.current) {
        confirmedSpreadingRef.current = rawWantSpreading;
        pendingSpreadCandidateRef.current = null;
      } else if (rawWantSpreading === confirmedSpreadingRef.current) {
        pendingSpreadCandidateRef.current = null;
        pendingSpreadSinceRef.current = 0;
      } else {
        if (pendingSpreadCandidateRef.current !== rawWantSpreading) {
          pendingSpreadCandidateRef.current = rawWantSpreading;
          pendingSpreadSinceRef.current = now;
        } else if (now - pendingSpreadSinceRef.current >= 1200) {
          confirmedSpreadingRef.current = rawWantSpreading;
          pendingSpreadCandidateRef.current = null;
          pendingSpreadSinceRef.current = 0;
        }
      }

      const confirmedSpreading = confirmedSpreadingRef.current;
      if (confirmedSpreading && matchedField) {
        lastSpreadingFieldIdRef.current = matchedField.id;
        hasWorkedFieldRef.current = true;
      }

      const nextState: TrackingState = confirmedSpreading
        ? 'SPREADING'
        : (curState === 'LOADING' && speedKmh <= 4.0 ? 'LOADING' : 'TRANSIT');

      if (nextState !== trackingStateRef.current) {
        trackingStateRef.current = nextState;
        setTrackingState(nextState);
      }
    }

    // Im Stillstand keine Drift-Punkte oder Phantom-Meter zur Spur hinzufügen
    if (isStationary && !isTestModeRef.current) {
      return;
    }

    const isSpreading = confirmedSpreadingRef.current;
    const point: TrackPoint = {
      lat,
      lng,
      timestamp: now,
      speed: speedKmh,
      isSpreading,
      storageId: activeSourceIdRef.current || undefined,
      loadIndex: currentLoadIndexRef.current
    };

    const minPointSpacing = isTestModeRef.current ? 0.2 : (isExternal ? 0.9 : 1.2);

    setTrackPoints(prev => {
      if (prev.length > 0) {
        const last = prev[prev.length - 1];
        const dist = getDistance(last, point);
        if (dist < minPointSpacing) return prev;

        if (activityTypeRef.current === ActivityType.TILLAGE && isSpreading && last.isSpreading) {
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

        // Distanz für Rundballenpresse akkumulieren (nur bei bestätigtem Arbeitsfenster)
        if (activityTypeRef.current === ActivityType.HARVEST && isSpreading && speedKmh >= 1.5 && dist < 50) {
          currentBaleDistRef.current += dist;
          setCurrentBaleDistance(Math.round(currentBaleDistRef.current));
        }
      }
      return [...prev, point];
    });
  }, []);

  const handleNewPositionRef = useRef(handleNewPosition);
  useEffect(() => {
    handleNewPositionRef.current = handleNewPosition;
  }, [handleNewPosition]);

  const simulateMovement = useCallback((lat: number, lng: number) => {
    const now = Date.now();
    if (now - lastSimTimeRef.current < 80) return;
    let speedMs = 0; let heading = 0;
    if (lastSimPosRef.current) {
      speedMs = getDistance({ lat, lng }, lastSimPosRef.current) / ((now - lastSimTimeRef.current) / 1000);
      heading = getBearing(lastSimPosRef.current, { lat, lng });
    }
    const fakePos: any = { coords: { latitude: lat, longitude: lng, accuracy: 5, speed: speedMs, heading }, timestamp: now };
    lastSimPosRef.current = { lat, lng };
    lastSimTimeRef.current = now;
    handleNewPositionRef.current(fakePos);
  }, []);

  const startGPS = async () => {
    const useExternal = settingsRef.current.gpsSource === 'external' || externalGpsService.isConnected();

    if (useExternal) {
      setGpsLoading(true);
      setGpsError(null);
      try {
        if (!externalGpsService.isConnected()) {
          const ok = await externalGpsService.connectAuto(settingsRef.current.externalGpsBaudRate || 115200);
          if (!ok) {
            const err = externalGpsService.getStatus().lastError || 'Externes USB-GPS konnte nicht verbunden werden.';
            setGpsError(err);
            setGpsLoading(false);
            return;
          }
        }

        await requestWakeLock();
        resetSessionFilters();
        sessionIdRef.current = generateId();
        isFinishingRef.current = false;
        setStartTime(Date.now());
        trackingStateRef.current = 'TRANSIT';
        setTrackingState('TRANSIT');
        setTrackPoints([]);
        setLoadCounts({});
        setWorkedAreaHa(0);
        activeSourceIdRef.current = null;
        setActiveSourceId(null);
        setIsPaused(false);
        isPausedRef.current = false;
        setIsTestMode(false);
        isTestModeRef.current = false;
        currentLoadIndexRef.current = 1;

        const st = externalGpsService.getStatus();
        if (st.lastLat !== null && st.lastLng !== null) {
          const initialGeo = {
            coords: {
              latitude: st.lastLat,
              longitude: st.lastLng,
              accuracy: st.accuracyMeters,
              altitude: st.altitudeM,
              altitudeAccuracy: null,
              heading: st.headingDeg,
              speed: st.speedKmh / 3.6
            },
            timestamp: st.lastUpdateTs || Date.now()
          } as GeolocationPosition;
          setCurrentLocation(initialGeo);
          handleNewPositionRef.current(initialGeo);
        }

        if (extUnsubRef.current) extUnsubRef.current();
        extUnsubRef.current = externalGpsService.onPosition((pos) => {
          if (!isTestModeRef.current) handleNewPositionRef.current(pos);
        });
      } catch (err: any) {
        setGpsError(err?.message || 'USB-GPS Startfehler.');
      } finally {
        setGpsLoading(false);
      }
      return;
    }

    if (!navigator.geolocation) { setGpsError("Kein GPS."); return; }
    setGpsLoading(true); setGpsError(null);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      setGpsLoading(false);
      setGpsError("GPS zu schwach.");
    }, 10000);
    try {
      const initPos: any = await new Promise((res, rej) => {
        navigator.geolocation.getCurrentPosition(
          res,
          (err) => { clearTimeout(timeout); rej(err); },
          { enableHighAccuracy: true, timeout: 10000 }
        );
      });
      if (timedOut) return;
      clearTimeout(timeout);
      await requestWakeLock();
      resetSessionFilters();
      sessionIdRef.current = generateId();
      isFinishingRef.current = false;
      setStartTime(Date.now());
      trackingStateRef.current = 'TRANSIT';
      setTrackingState('TRANSIT');
      setTrackPoints([]);
      setLoadCounts({});
      setWorkedAreaHa(0);
      activeSourceIdRef.current = null;
      setActiveSourceId(null);
      setIsPaused(false);
      isPausedRef.current = false;
      setIsTestMode(false);
      isTestModeRef.current = false;
      currentLoadIndexRef.current = 1;
      setCurrentLocation(initPos);
      handleNewPositionRef.current(initPos);

      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => { if (!isTestModeRef.current) handleNewPositionRef.current(pos); },
        (err) => {
          if (err.code === 1) setGpsError("Verweigert.");
          else if (err.code === 2) setGpsError("Signal verloren.");
        },
        { enableHighAccuracy: true, maximumAge: 0 }
      );
    } catch {
      setGpsLoading(false);
      setGpsError("GPS Fehler.");
    } finally {
      setGpsLoading(false);
    }
  };

  const handleFinishLogic = useCallback(async (notes: string): Promise<ActivityRecord | null> => {
    if (isFinishingRef.current) return null;
    isFinishingRef.current = true;

    try {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (extUnsubRef.current) { extUnsubRef.current(); extUnsubRef.current = null; }
      releaseWakeLock();

      const durationMin = startTime ? Math.round((Date.now() - startTime) / 60000) : 0;
      const involvedFieldIds = new Set<string>();
      trackPoints.forEach(p => {
        if (p.isSpreading) {
          const field = fieldsRef.current.find(f => isPointInPolygon(p, f.boundary) || getDistanceToPolygonEdge(p, f.boundary) <= 4.5);
          if (field) involvedFieldIds.add(field.id);
        }
      });
      const fIds = Array.from(involvedFieldIds);
      let totalAmt = 0; let unit = 'ha';
      const s = settingsRef.current;
      const sub = subTypeRef.current;

      const fieldDist: Record<string, number> = {};
      const detailedFieldSources: Record<string, Record<string, number>> = {};

      if (activityTypeRef.current === ActivityType.FERTILIZATION) {
        unit = 'm³';
        const loadSize = (equipmentRef.current && equipmentRef.current.capacity)
          ? equipmentRef.current.capacity
          : (sub === 'Gülle' ? s.slurryLoadSize : s.manureLoadSize);

        const totalLoads = Object.values(loadCounts).reduce((a, b) => a + b, 0);
        totalAmt = Math.round(totalLoads * loadSize);

        const pointsByLoad: Record<number, TrackPoint[]> = {};
        trackPoints.forEach(p => { const lIdx = p.loadIndex || 1; if (!pointsByLoad[lIdx]) pointsByLoad[lIdx] = []; pointsByLoad[lIdx].push(p); });

        Object.entries(pointsByLoad).forEach(([, points]) => {
          const spreading = points.filter(p => p.isSpreading);
          if (spreading.length === 0) return;
          const storageId = spreading[0].storageId;
          if (!storageId) return;

          const loadFieldIds = new Set<string>();
          spreading.forEach(p => {
            const field = fieldsRef.current.find(f => isPointInPolygon(p, f.boundary) || getDistanceToPolygonEdge(p, f.boundary) <= 4.5);
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
              const field = fieldsRef.current.find(f => isPointInPolygon(p, f.boundary) || getDistanceToPolygonEdge(p, f.boundary) <= 4.5);
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
          const field = fieldsRef.current.find(f => isPointInPolygon(p, f.boundary) || getDistanceToPolygonEdge(p, f.boundary) <= 4.5);
          if (field) fieldPoints[field.id] = (fieldPoints[field.id] || 0) + 1;
        });
        const totalPoints = Object.values(fieldPoints).reduce((a, b) => a + b, 0);
        Object.entries(fieldPoints).forEach(([fId, count]) => {
          fieldDist[fId] = totalPoints > 0 ? Math.round((count / totalPoints) * totalAmt * 100) / 100 : 0;
        });
      } else if (activityTypeRef.current === ActivityType.HARVEST) {
        unit = 'Stk';
        const baleCount = detectedBales.length;
        totalAmt = baleCount;

        detectedBales.forEach(b => {
          fieldDist[b.fieldId] = (fieldDist[b.fieldId] || 0) + 1;
        });

        if (detectedBales.length > 0) {
          await dbService.saveBales(detectedBales);
        }
      } else {
        const involvedFields = fieldsRef.current.filter(f => fIds.includes(f.id));
        totalAmt = Math.round(involvedFields.reduce((sum, f) => sum + f.areaHa, 0) * 100) / 100;
        involvedFields.forEach(f => fieldDist[f.id] = f.areaHa);
      }

      const storageDist: Record<string, number> = {};
      if (activityTypeRef.current === ActivityType.FERTILIZATION) {
        const loadSize = (equipmentRef.current && equipmentRef.current.capacity)
          ? equipmentRef.current.capacity
          : (sub === 'Gülle' ? s.slurryLoadSize : s.manureLoadSize);
        Object.entries(loadCounts).forEach(([sId, count]) => storageDist[sId] = Math.round(count * loadSize));
      }

      const recordId = sessionIdRef.current || generateId();
      const record: ActivityRecord = {
        id: recordId,
        date: new Date().toISOString(),
        type: activityTypeRef.current,
        year: new Date().getFullYear(),
        fieldIds: fIds,
        amount: totalAmt,
        unit,
        loadCount: activityTypeRef.current === ActivityType.FERTILIZATION
          ? (Object.values(loadCounts).reduce((a, b) => a + b, 0) || undefined)
          : (activityTypeRef.current === ActivityType.HARVEST ? detectedBales.length : undefined),
        notes: `${notes}\nDauer: ${durationMin} min${detectedBales.length > 0 ? `\nErfasste Rundballen: ${detectedBales.length} Stk.` : ''}`,
        trackPoints: [...trackPoints],
        fieldDistribution: fieldDist,
        storageDistribution: Object.keys(storageDist).length > 0 ? storageDist : undefined,
        detailedFieldSources: Object.keys(detailedFieldSources).length > 0 ? detailedFieldSources : undefined,
        bales: detectedBales.length > 0 ? detectedBales : undefined,
        fertilizerType: activityTypeRef.current === ActivityType.FERTILIZATION ? (sub === 'Gülle' ? FertilizerType.SLURRY : FertilizerType.MANURE) : undefined,
        tillageType: (activityTypeRef.current === ActivityType.TILLAGE || activityTypeRef.current === ActivityType.HARVEST) ? sub as any : undefined,
        equipmentId: equipmentRef.current?.id,
        equipmentName: equipmentRef.current?.name
      };

      if (record.detailedFieldSources) {
        const fieldSavePromises = Object.entries(record.detailedFieldSources).map(async ([fId, sourceMap]) => {
          const field = fieldsRef.current.find(f => f.id === fId);
          if (field) {
            const cur = field.detailedSources || {};
            for (const [sId, amt] of Object.entries(sourceMap)) cur[sId] = (cur[sId] || 0) + amt;
            await dbService.saveField({ ...field, detailedSources: cur });
          }
        });
        await Promise.all(fieldSavePromises);
      }
      await dbService.saveActivity(record);
      if (record.type === ActivityType.FERTILIZATION && record.storageDistribution) await dbService.updateStorageLevels(record.storageDistribution);
      dbService.syncActivities();
      sessionIdRef.current = null;
      trackingStateRef.current = 'IDLE';
      setTrackingState('IDLE');
      setTrackPoints([]);
      setWorkedAreaHa(0);
      setDetectedBales([]);
      setCurrentBaleDistance(0);
      currentBaleDistRef.current = 0;
      resetSessionFilters();
      return record;
    } finally {
      isFinishingRef.current = false;
    }
  }, [trackPoints, startTime, loadCounts, workedAreaHa, detectedBales, resetSessionFilters]);

  const triggerManualBaleDrop = useCallback(() => {
    if (!lastKnownPosRef.current) return;
    const curPos = lastKnownPosRef.current;
    const targetField = fieldsRef.current.find(f => isPointInPolygon(curPos, f.boundary)) || lastActiveFieldRef.current || fieldsRef.current[0];
    if (!targetField) return;

    const baleNumber = detectedBales.length + 1;
    const drivenDistance = Math.round(currentBaleDistRef.current || 0);

    const newBale: RoundBale = {
      id: generateId(),
      number: baleNumber,
      cropType: subTypeRef.current || 'Silage',
      fieldId: targetField.id,
      fieldName: targetField.name,
      location: { lat: curPos.lat, lng: curPos.lng },
      status: 'FIELD',
      droppedAt: Date.now(),
      distanceMeters: Math.max(10, drivenDistance),
      year: new Date().getFullYear()
    };

    setDetectedBales(prev => [...prev, newBale]);
    hasWorkedFieldRef.current = true;
    lastBaleDropTimeRef.current = Date.now();
    currentBaleDistRef.current = 0;
    setCurrentBaleDistance(0);
    setLastBaleNotice(`🟢 Ballen #${baleNumber} manuell auf "${targetField.name}" abgelegt!`);
    setTimeout(() => setLastBaleNotice(null), 6000);
  }, [detectedBales]);

  return {
    trackingState,
    currentLocation,
    trackPoints,
    startTime,
    loadCounts,
    workedAreaHa,
    activeSourceId,
    detectionCountdown,
    pendingStorageId,
    storageWarning,
    gpsLoading,
    gpsError,
    wakeLockActive,
    isTestMode,
    isReturningHome,
    homeDistanceMeters,

    // Ballen-Tracking Exports
    detectedBales,
    currentBaleDistance,
    baleDropCountdown,
    lastBaleNotice,
    triggerManualBaleDrop,

    // Externes GPS
    externalGpsStatus,

    setIsTestMode: (v: boolean) => {
      setIsTestMode(v);
      isTestModeRef.current = v;
      if (v && currentLocation) lastSimPosRef.current = { lat: currentLocation.coords.latitude, lng: currentLocation.coords.longitude };
    },
    simulateMovement,
    startGPS,
    stopGPS: useCallback(() => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (extUnsubRef.current) { extUnsubRef.current(); extUnsubRef.current = null; }
      releaseWakeLock();
      setIsTestMode(false);
    }, []),
    handleFinishLogic,
    handleDiscard: () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (extUnsubRef.current) { extUnsubRef.current(); extUnsubRef.current = null; }
      releaseWakeLock();
      isFinishingRef.current = false;
      sessionIdRef.current = null;
      trackingStateRef.current = 'IDLE';
      setTrackingState('IDLE');
      setTrackPoints([]);
      setGpsError(null);
      setWorkedAreaHa(0);
      setDetectedBales([]);
      setCurrentBaleDistance(0);
      currentBaleDistRef.current = 0;
      resetSessionFilters();
    }
  };
};

