
import { GeoPoint } from '../types';

// Haversine distance in meters
export const getDistance = (p1: GeoPoint, p2: GeoPoint): number => {
  const R = 6371e3; // metres
  const φ1 = (p1.lat * Math.PI) / 180;
  const φ2 = (p2.lat * Math.PI) / 180;
  const Δφ = ((p2.lat - p1.lat) * Math.PI) / 180;
  const Δλ = ((p2.lng - p1.lng) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

// Ray-casting algorithm for Point in Polygon
export const isPointInPolygon = (point: GeoPoint, polygon: GeoPoint[]): boolean => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng;
    const xj = polygon[j].lat, yj = polygon[j].lng;

    const intersect = ((yi > point.lng) !== (yj > point.lng)) &&
      (point.lat < (xj - xi) * (point.lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

// Precise Area Calculation (Projected Shoelace Formula)
// Returns hectares
export const calculateArea = (points: GeoPoint[]): number => {
  if (points.length < 3) return 0;

  // 1. Determine center latitude to adjust longitude scale
  const centerLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  
  // 2. Meters per degree at this latitude
  const latScale = 111132;
  const lngScale = 111319 * Math.cos(centerLat * Math.PI / 180);

  // 3. Shoelace formula using projected meter coordinates
  let doubleArea = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    
    // Project to relative meters
    const x1 = points[i].lng * lngScale;
    const y1 = points[i].lat * latScale;
    const x2 = points[j].lng * lngScale;
    const y2 = points[j].lat * latScale;

    doubleArea += (x1 * y2) - (x2 * y1);
  }

  const areaSqMeters = Math.abs(doubleArea) / 2;
  return areaSqMeters / 10000;
};

export const offsetGeo = (points: GeoPoint[], offsetN_m: number, offsetE_m: number): GeoPoint[] => {
    const latOffset = offsetN_m / 111111;
    const lngOffset = offsetE_m / (111111 * Math.cos(47 * Math.PI / 180)); // approx Austria
    
    return points.map(p => ({
        lat: p.lat + latOffset,
        lng: p.lng + lngOffset
    }));
}

export const geocodeAddress = async (address: string): Promise<GeoPoint | null> => {
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
        const response = await fetch(url, { headers: { 'User-Agent': 'AgriTrackAustria/1.0' } });
        const data = await response.json();
        if (data && data.length > 0) {
            return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        }
        return null;
    } catch (e) {
        console.error("Geocoding failed", e);
        return null;
    }
};

// --- ROBUST POLYGON SPLITTING LOGIC ---

interface PointXY { x: number, y: number }

// Project GeoPoint to local Cartesian (Meters)
const project = (p: GeoPoint, centerLat: number): PointXY => {
    const latScale = 111132;
    const lngScale = 111319 * Math.cos(centerLat * Math.PI / 180);
    return {
        x: p.lng * lngScale,
        y: p.lat * latScale
    };
};

// Unproject Cartesian back to GeoPoint
const unproject = (p: PointXY, centerLat: number): GeoPoint => {
    const latScale = 111132;
    const lngScale = 111319 * Math.cos(centerLat * Math.PI / 180);
    return {
        lat: p.y / latScale,
        lng: p.x / lngScale
    };
};

// Cross product (2D) to determine side of line
// Returns >0 if p is left of line ab, <0 if right, 0 if on line
const crossProduct = (a: PointXY, b: PointXY, p: PointXY) => {
    return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
};

// Get intersection of Line AB (infinite) and Segment PQ
const getIntersection = (a: PointXY, b: PointXY, p: PointXY, q: PointXY): PointXY | null => {
    const d = (b.x - a.x) * (q.y - p.y) - (b.y - a.y) * (q.x - p.x);
    if (Math.abs(d) < 1e-9) return null; // Parallel

    const t = ((p.x - a.x) * (q.y - p.y) - (p.y - a.y) * (q.x - p.x)) / d; // Parameter for line AB
    const u = ((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / d; // Parameter for segment PQ

    // We only care if the intersection is strictly within segment PQ (0 <= u <= 1)
    // t is unconstrained because AB is an infinite cutting line
    if (u >= 0 && u <= 1) {
         return {
             x: p.x + u * (q.x - p.x),
             y: p.y + u * (q.y - p.y)
         };
    }
    return null;
};

export const splitPolygon = (polygon: GeoPoint[], lineStart: GeoPoint, lineEnd: GeoPoint): [GeoPoint[], GeoPoint[]] | null => {
    if (polygon.length < 3) return null;

    // 1. Establish Projection Center
    const centerLat = polygon.reduce((sum, p) => sum + p.lat, 0) / polygon.length;

    // 2. Project everything to flat meters
    const polyXY = polygon.map(p => project(p, centerLat));
    const lineA = project(lineStart, centerLat);
    const lineB = project(lineEnd, centerLat);

    // 3. Sutherland-Hodgman like clipping (Half-plane intersection)
    
    const poly1: PointXY[] = [];
    const poly2: PointXY[] = [];
    
    // Helper to check which side a point is on
    const getSide = (p: PointXY) => crossProduct(lineA, lineB, p);

    for (let i = 0; i < polyXY.length; i++) {
        const curr = polyXY[i];
        const next = polyXY[(i + 1) % polyXY.length];

        const sideCurr = getSide(curr);
        const sideNext = getSide(next);

        // Add current point to appropriate lists
        // Using epsilon for floating point stability
        if (sideCurr >= -1e-9) poly1.push(curr);
        if (sideCurr <= 1e-9) poly2.push(curr);

        // Check for intersection
        // If signs differ significantly
        if ((sideCurr > 1e-9 && sideNext < -1e-9) || (sideCurr < -1e-9 && sideNext > 1e-9)) {
            const intersection = getIntersection(lineA, lineB, curr, next);
            if (intersection) {
                poly1.push(intersection);
                poly2.push(intersection);
            }
        }
    }

    // 4. Validate Results
    // A valid polygon needs at least 3 points
    if (poly1.length < 3 || poly2.length < 3) return null;

    // Convert back to GeoPoints
    const geoPoly1 = poly1.map(p => unproject(p, centerLat));
    const geoPoly2 = poly2.map(p => unproject(p, centerLat));

    // Area check (e.g., discard tiny slivers < 1 m²)
    // 0.0001 ha = 1 m²
    if (calculateArea(geoPoly1) < 0.0001 || calculateArea(geoPoly2) < 0.0001) {
        console.warn("Split aborted: Resulting area too small (< 1m²)");
        return null;
    }

    return [geoPoly1, geoPoly2];
};
