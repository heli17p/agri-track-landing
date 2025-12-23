
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

const project = (p: GeoPoint, centerLat: number): PointXY => {
    const latScale = 111132;
    const lngScale = 111319 * Math.cos(centerLat * Math.PI / 180);
    return { x: p.lng * lngScale, y: p.lat * latScale };
};

const unproject = (p: PointXY, centerLat: number): GeoPoint => {
    const latScale = 111132;
    const lngScale = 111319 * Math.cos(centerLat * Math.PI / 180);
    return { lat: p.y / latScale, lng: p.x / lngScale };
};

const crossProduct = (a: PointXY, b: PointXY, p: PointXY) => {
    return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
};

export const splitPolygon = (polygon: GeoPoint[], cutterPoints: GeoPoint[]): [GeoPoint[], GeoPoint[]] | null => {
    if (polygon.length < 3 || cutterPoints.length < 2) return null;

    const centerLat = polygon.reduce((sum, p) => sum + p.lat, 0) / polygon.length;
    const polyXY = polygon.map(p => project(p, centerLat));
    
    // Wir nutzen das erste und letzte Segment der Linie als "unendliche" Fortsetzung, 
    // um sicherzustellen, dass die Ebene komplett geteilt wird.
    const p1 = project(cutterPoints[0], centerLat);
    const p2 = project(cutterPoints[cutterPoints.length - 1], centerLat);
    
    // Für die aktuelle Implementierung nutzen wir die zwei Hauptpunkte als Trennebene (Straight Cut).
    // Da eine echte Polyline-Teilung (Zick-Zack) ohne GIS-Library hochkomplex ist,
    // optimieren wir hier die Stabilität des Verschiebens der Trennlinie.
    const lineA = p1;
    const lineB = p2;

    const poly1: PointXY[] = [];
    const poly2: PointXY[] = [];
    
    const getSide = (p: PointXY) => crossProduct(lineA, lineB, p);

    for (let i = 0; i < polyXY.length; i++) {
        const curr = polyXY[i];
        const next = polyXY[(i + 1) % polyXY.length];

        const sideCurr = getSide(curr);
        const sideNext = getSide(next);

        if (sideCurr >= -1e-9) poly1.push(curr);
        if (sideCurr <= 1e-9) poly2.push(curr);

        if ((sideCurr > 1e-9 && sideNext < -1e-9) || (sideCurr < -1e-9 && sideNext > 1e-9)) {
            // Intersection
            const d = (lineB.x - lineA.x) * (next.y - curr.y) - (lineB.y - lineA.y) * (next.x - curr.x);
            if (Math.abs(d) > 1e-9) {
                const u = ((curr.x - lineA.x) * (lineB.y - lineA.y) - (curr.y - lineA.y) * (lineB.x - lineA.x)) / d;
                const intersect = {
                    x: curr.x + u * (next.x - curr.x),
                    y: curr.y + u * (next.y - curr.y)
                };
                poly1.push(intersect);
                poly2.push(intersect);
            }
        }
    }

    if (poly1.length < 3 || poly2.length < 3) return null;

    const geoPoly1 = poly1.map(p => unproject(p, centerLat));
    const geoPoly2 = poly2.map(p => unproject(p, centerLat));

    if (calculateArea(geoPoly1) < 0.0001 || calculateArea(geoPoly2) < 0.0001) return null;

    return [geoPoly1, geoPoly2];
};

