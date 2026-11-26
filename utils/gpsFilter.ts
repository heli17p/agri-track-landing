import { GeoPoint } from '../types';
import { getBearing, getDistance } from './geo';

export interface GpsFilterState {
  filteredLat: number | null;
  filteredLng: number | null;
  filteredSpeedKmh: number;
  filteredHeadingDeg: number | null;
  lastRawPos: GeoPoint | null;
  lastRawTs: number;
  lastUiEmitTs: number;
  stationaryLocked: boolean;
  stationaryAnchor: GeoPoint | null;
  stationaryAnchorTs: number;
}

export interface FilteredGpsSample {
  accepted: boolean;
  reason?: string;
  position: GeolocationPosition;
  lat: number;
  lng: number;
  speedKmh: number;
  headingDeg: number | null;
  accuracy: number;
  isStationary: boolean;
  shouldUpdateUi: boolean;
}

export const createInitialGpsFilterState = (): GpsFilterState => ({
  filteredLat: null,
  filteredLng: null,
  filteredSpeedKmh: 0,
  filteredHeadingDeg: null,
  lastRawPos: null,
  lastRawTs: 0,
  lastUiEmitTs: 0,
  stationaryLocked: false,
  stationaryAnchor: null,
  stationaryAnchorTs: 0
});

const wrapDeg = (deg: number): number => ((deg % 360) + 360) % 360;

const smoothCircularAngle = (prevDeg: number | null, nextDeg: number, alpha: number): number => {
  if (prevDeg === null || Number.isNaN(prevDeg)) return wrapDeg(nextDeg);
  const prevRad = (prevDeg * Math.PI) / 180;
  const nextRad = (nextDeg * Math.PI) / 180;
  const x = (1 - alpha) * Math.cos(prevRad) + alpha * Math.cos(nextRad);
  const y = (1 - alpha) * Math.sin(prevRad) + alpha * Math.sin(nextRad);
  if (Math.hypot(x, y) < 1e-6) return wrapDeg(nextDeg);
  return wrapDeg((Math.atan2(y, x) * 180) / Math.PI);
};

const cloneWithFilteredCoords = (
  raw: GeolocationPosition,
  lat: number,
  lng: number,
  speedMs: number,
  headingDeg: number | null,
  accuracy: number,
  timestamp: number
): GeolocationPosition => {
  return {
    coords: {
      latitude: lat,
      longitude: lng,
      altitude: raw.coords?.altitude ?? null,
      accuracy,
      altitudeAccuracy: raw.coords?.altitudeAccuracy ?? null,
      heading: headingDeg,
      speed: speedMs,
      toJSON() {
        return {
          latitude: lat,
          longitude: lng,
          altitude: raw.coords?.altitude ?? null,
          accuracy,
          altitudeAccuracy: raw.coords?.altitudeAccuracy ?? null,
          heading: headingDeg,
          speed: speedMs
        };
      }
    } as GeolocationCoordinates,
    timestamp,
    toJSON() {
      return {
        coords: this.coords.toJSON(),
        timestamp
      };
    }
  } as GeolocationPosition;
};

/**
 * Multi-stage GPS signal conditioning for both 1 Hz smartphone GPS and 10 Hz external USB-GPS:
 * 1. Accuracy spike gate (> 35 m internal / > 25 m external rejected)
 * 2. Teleportation outlier check (> 140 km/h implied jump rejected)
 * 3. Stationary deadband (prevents map pin jitter & false speed > 0 while parked)
 * 4. Adaptive EMA smoothing for coordinates, speed, and circular heading
 * 5. UI update throttling (~4 Hz max) to prevent Leaflet pan/zoom thrashing
 */
export const processGpsSample = (
  pos: GeolocationPosition,
  state: GpsFilterState,
  options: { isExternal: boolean; isTestMode: boolean }
): FilteredGpsSample => {
  const { latitude, longitude, speed, heading, accuracy } = pos.coords;
  const ts = pos.timestamp || Date.now();
  const safeAccuracy = typeof accuracy === 'number' && !Number.isNaN(accuracy) ? accuracy : 25;

  // Test mode bypasses filtering so manual map drag-simulation stays instant
  if (options.isTestMode) {
    const speedKmh = typeof speed === 'number' && !Number.isNaN(speed) ? Math.max(0, speed * 3.6) : 0;
    const validHeading =
      typeof heading === 'number' && !Number.isNaN(heading)
        ? wrapDeg(heading)
        : state.filteredHeadingDeg;
    state.filteredLat = latitude;
    state.filteredLng = longitude;
    state.filteredSpeedKmh = speedKmh;
    state.filteredHeadingDeg = validHeading;
    state.lastRawPos = { lat: latitude, lng: longitude };
    state.lastRawTs = ts;
    state.lastUiEmitTs = ts;
    state.stationaryLocked = speedKmh < 0.5;
    return {
      accepted: true,
      position: cloneWithFilteredCoords(pos, latitude, longitude, speedKmh / 3.6, validHeading, safeAccuracy, ts),
      lat: latitude,
      lng: longitude,
      speedKmh,
      headingDeg: validHeading,
      accuracy: safeAccuracy,
      isStationary: speedKmh < 0.5,
      shouldUpdateUi: true
    };
  }

  // 1. Accuracy Gate
  const maxAllowedAccuracy = options.isExternal ? 25 : 35;
  if (safeAccuracy > maxAllowedAccuracy) {
    return {
      accepted: false,
      reason: `accuracy:${safeAccuracy.toFixed(1)}m`,
      position: pos,
      lat: state.filteredLat ?? latitude,
      lng: state.filteredLng ?? longitude,
      speedKmh: state.filteredSpeedKmh,
      headingDeg: state.filteredHeadingDeg,
      accuracy: safeAccuracy,
      isStationary: state.stationaryLocked,
      shouldUpdateUi: false
    };
  }

  const rawPos: GeoPoint = { lat: latitude, lng: longitude };
  const dtMs = state.lastRawTs > 0 ? Math.max(10, ts - state.lastRawTs) : 1000;
  const dtSec = dtMs / 1000;

  // 2. Teleportation / Outlier Spike Check
  let rawDistFromPrev = 0;
  if (state.lastRawPos && state.lastRawTs > 0) {
    rawDistFromPrev = getDistance(state.lastRawPos, rawPos);
    const impliedSpeedKmh = (rawDistFromPrev / dtSec) * 3.6;
    if ((impliedSpeedKmh > 140 && rawDistFromPrev > 12) || (dtSec < 0.3 && rawDistFromPrev > 15)) {
      return {
        accepted: false,
        reason: `outlier:${impliedSpeedKmh.toFixed(0)}kmh`,
        position: pos,
        lat: state.filteredLat ?? latitude,
        lng: state.filteredLng ?? longitude,
        speedKmh: state.filteredSpeedKmh,
        headingDeg: state.filteredHeadingDeg,
        accuracy: safeAccuracy,
        isStationary: state.stationaryLocked,
        shouldUpdateUi: false
      };
    }
  }

  // 3. Raw Speed Determination (Sensor speed with geometric fallback when null)
  let rawSpeedKmh = 0;
  if (typeof speed === 'number' && !Number.isNaN(speed) && speed >= 0) {
    rawSpeedKmh = speed * 3.6;
  } else if (state.lastRawPos && dtSec >= 0.4) {
    rawSpeedKmh = (rawDistFromPrev / dtSec) * 3.6;
  } else {
    rawSpeedKmh = state.filteredSpeedKmh;
  }

  // Clamp implausible single-sample speed spike (> 85 km/h on agricultural tractor)
  if (rawSpeedKmh > 85) {
    rawSpeedKmh = state.filteredSpeedKmh;
  }

  // Initialize filter state on very first accepted point
  if (state.filteredLat === null || state.filteredLng === null) {
    const initSpeed = rawSpeedKmh < 0.8 ? 0 : rawSpeedKmh;
    const initHeading =
      typeof heading === 'number' && !Number.isNaN(heading) && initSpeed >= 1.2
        ? wrapDeg(heading)
        : null;
    state.filteredLat = latitude;
    state.filteredLng = longitude;
    state.filteredSpeedKmh = initSpeed;
    state.filteredHeadingDeg = initHeading;
    state.lastRawPos = rawPos;
    state.lastRawTs = ts;
    state.lastUiEmitTs = ts;
    state.stationaryLocked = initSpeed < 0.8;
    state.stationaryAnchor = rawPos;
    state.stationaryAnchorTs = ts;
    return {
      accepted: true,
      position: cloneWithFilteredCoords(pos, latitude, longitude, initSpeed / 3.6, initHeading, safeAccuracy, ts),
      lat: latitude,
      lng: longitude,
      speedKmh: initSpeed,
      headingDeg: initHeading,
      accuracy: safeAccuracy,
      isStationary: state.stationaryLocked,
      shouldUpdateUi: true
    };
  }

  // 4. Adaptive Speed EMA
  const isHighRate = dtSec <= 0.25; // ~4–10 Hz
  const speedAlpha = isHighRate ? 0.24 : 0.42;
  let smoothedSpeedKmh = (1 - speedAlpha) * state.filteredSpeedKmh + speedAlpha * rawSpeedKmh;

  // 5. Stationary Deadband (eliminates jitter & phantom distance when parked)
  const deadbandRadiusM = options.isExternal
    ? (safeAccuracy <= 0.5 ? 0.45 : 0.9)
    : Math.min(3.0, Math.max(1.8, safeAccuracy * 0.18));

  if (!state.stationaryAnchor) {
    state.stationaryAnchor = { lat: state.filteredLat, lng: state.filteredLng };
    state.stationaryAnchorTs = ts;
  }
  const distFromAnchor = getDistance(state.stationaryAnchor, rawPos);
  const anchorElapsedSec = (ts - state.stationaryAnchorTs) / 1000;

  let isStationary = state.stationaryLocked;
  if (isStationary) {
    // Only unlock standstill when clear movement OR sustained speed above threshold
    const clearlyMoving = distFromAnchor > deadbandRadiusM * 1.25 && rawSpeedKmh >= 1.2;
    const fastBreakout = smoothedSpeedKmh >= 2.2 && distFromAnchor > 1.0;
    if (clearlyMoving || fastBreakout) {
      isStationary = false;
      state.stationaryAnchor = rawPos;
      state.stationaryAnchorTs = ts;
    }
  } else {
    // Enter standstill when slow and minimal displacement
    if (smoothedSpeedKmh < 0.85 && distFromAnchor < deadbandRadiusM) {
      isStationary = true;
      state.stationaryAnchor = { lat: state.filteredLat, lng: state.filteredLng };
      state.stationaryAnchorTs = ts;
    } else if (smoothedSpeedKmh < 1.6 && anchorElapsedSec >= 2.0 && distFromAnchor < deadbandRadiusM) {
      isStationary = true;
      state.stationaryAnchor = { lat: state.filteredLat, lng: state.filteredLng };
      state.stationaryAnchorTs = ts;
    } else if (distFromAnchor >= deadbandRadiusM) {
      // Advance anchor while rolling smoothly
      state.stationaryAnchor = rawPos;
      state.stationaryAnchorTs = ts;
    }
  }

  state.stationaryLocked = isStationary;

  let outLat = state.filteredLat;
  let outLng = state.filteredLng;
  let outHeading = state.filteredHeadingDeg;

  if (isStationary) {
    // Freeze cursor on anchor and decay speed cleanly to 0
    smoothedSpeedKmh = smoothedSpeedKmh < 0.5 ? 0 : smoothedSpeedKmh * 0.5;
    if (smoothedSpeedKmh < 0.35) smoothedSpeedKmh = 0;
    outLat = state.stationaryAnchor.lat;
    outLng = state.stationaryAnchor.lng;
  } else {
    // 6. Adaptive Coordinate EMA (stronger smoothing at low speed / 10 Hz)
    let posAlpha: number;
    if (isHighRate) {
      posAlpha = smoothedSpeedKmh < 5 ? 0.30 : 0.48;
    } else {
      posAlpha = smoothedSpeedKmh < 5 ? 0.48 : 0.70;
    }
    // Down-weight noisy internal fixes slightly
    if (!options.isExternal && safeAccuracy > 15) {
      posAlpha *= 0.72;
    }

    outLat = (1 - posAlpha) * state.filteredLat + posAlpha * latitude;
    outLng = (1 - posAlpha) * state.filteredLng + posAlpha * longitude;

    // 7. Circular Heading Smoothing (never snap to 0° when sensor heading is missing)
    const stepFromFiltered = getDistance({ lat: state.filteredLat, lng: state.filteredLng }, { lat: outLat, lng: outLng });
    const headingAlpha = isHighRate ? 0.25 : 0.42;
    if (typeof heading === 'number' && !Number.isNaN(heading) && smoothedSpeedKmh >= 1.5) {
      outHeading = smoothCircularAngle(state.filteredHeadingDeg, heading, headingAlpha);
    } else if (smoothedSpeedKmh >= 1.8 && stepFromFiltered >= 1.2) {
      const computedBearing = getBearing({ lat: state.filteredLat, lng: state.filteredLng }, { lat: outLat, lng: outLng });
      outHeading = smoothCircularAngle(state.filteredHeadingDeg, computedBearing, headingAlpha);
    }
  }

  state.filteredLat = outLat;
  state.filteredLng = outLng;
  state.filteredSpeedKmh = smoothedSpeedKmh;
  state.filteredHeadingDeg = outHeading;
  state.lastRawPos = rawPos;
  state.lastRawTs = ts;

  // Throttle React/Map UI updates to ~4 Hz (240 ms) so 10 Hz NMEA never floods Leaflet
  const shouldUpdateUi = ts - state.lastUiEmitTs >= 240;
  if (shouldUpdateUi) {
    state.lastUiEmitTs = ts;
  }

  const filteredPos = cloneWithFilteredCoords(
    pos,
    outLat,
    outLng,
    smoothedSpeedKmh / 3.6,
    outHeading,
    safeAccuracy,
    ts
  );

  return {
    accepted: true,
    position: filteredPos,
    lat: outLat,
    lng: outLng,
    speedKmh: smoothedSpeedKmh,
    headingDeg: outHeading,
    accuracy: safeAccuracy,
    isStationary,
    shouldUpdateUi
  };
};
