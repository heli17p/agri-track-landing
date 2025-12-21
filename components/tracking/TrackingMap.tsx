
import React, { useEffect, useMemo, useRef, useState, memo } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, Circle, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Field, StorageLocation, TrackPoint, FertilizerType } from '../../types';

interface Props {
  points: TrackPoint[];
  fields: Field[];
  storages: StorageLocation[];
  currentLocation: GeolocationPosition | null;
  mapStyle: 'standard' | 'satellite';
  followUser: boolean;
  historyTracks: any[];
  historyMode: string;
  vehicleIconType: 'tractor' | 'arrow' | 'dot';
  onZoomChange: (z: number) => void;
  zoom: number;
  storageRadius: number;
  activeSourceId: string | null;
  subType: string;
  isTestMode: boolean;
  onSimulateClick?: (lat: number, lng: number) => void;
}

// Sub-Komponente für das Fahrzeug, um Re-Renders zu minimieren
const VehicleMarker = memo(({ 
    pos, 
    heading, 
    type, 
    isTestMode, 
    onDrag 
}: { 
    pos: [number, number], 
    heading: number | null, 
    type: 'tractor' | 'arrow' | 'dot', 
    isTestMode: boolean,
    onDrag?: (lat: number, lng: number) => void
}) => {
    const markerRef = useRef<L.Marker>(null);
    const isDraggingInternal = useRef(false);
    
    // Wir speichern die allererste Position, die wir erhalten haben
    const [initialPos] = useState<[number, number]>(pos);

    // Synchronisation bei externen (echten GPS) Positionsänderungen
    useEffect(() => {
        if (markerRef.current && !isDraggingInternal.current) {
            markerRef.current.setLatLng(pos);
        }
    }, [pos]);

    const eventHandlers = useMemo(() => ({
        dragstart() {
            isDraggingInternal.current = true;
        },
        drag(e: any) {
            if (isTestMode && onDrag) {
                const { lat, lng } = e.target.getLatLng();
                onDrag(lat, lng);
            }
        },
        dragend() {
            // Kurze Sperre nach dem Loslassen, um GPS-Sprünge zu vermeiden
            setTimeout(() => {
                isDraggingInternal.current = false;
            }, 100);
        }
    }), [isTestMode, onDrag]);

    const icon = useMemo(() => {
        const rotation = heading || 0;
        let content = '';
        let size = [32, 32];
        const color = isTestMode ? '#3b82f6' : '#16a34a';

        if (type === 'tractor') {
            content = `<svg viewBox="0 0 50 50"><rect x="5" y="30" width="12" height="18" rx="2" fill="#1e293b"/><rect x="33" y="30" width="12" height="18" rx="2" fill="#1e293b"/><rect x="8" y="5" width="8" height="10" rx="2" fill="#1e293b"/><rect x="34" y="5" width="8" height="10" rx="2" fill="#1e293b"/><path d="M20 4 L30 4 L30 20 L34 22 L34 40 L16 40 L16 22 L20 20 Z" fill="${color}"/><rect x="14" y="24" width="22" height="14" rx="1" fill="#fff" fill-opacity="0.9" stroke="#94a3b8" stroke-width="2"/></svg>`;
            size = [36, 36];
        } else if (type === 'arrow') {
            content = `<svg viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="2"><path d="M12 2 L22 22 L12 18 L2 22 Z"/></svg>`;
            size = [28, 28];
        } else {
            content = `<div style="width:100%;height:100%;background:${color};border:2px solid #fff;border-radius:50%;"></div>`;
            size = [16, 16];
        }
        return L.divIcon({ 
            className: 'vehicle-cursor', 
            html: `<div style="transform:rotate(${rotation}deg);width:100%;height:100%;display:flex;align-items:center;justify-content:center;transition: transform 0.1s linear;${isTestMode ? 'filter: drop-shadow(0 0 8px rgba(59,130,246,0.6)); scale: 1.1;' : ''}">${content}</div>`, 
            iconSize: [size[0], size[1]], 
            iconAnchor: [size[0] / 2, size[1] / 2] 
        });
    }, [heading, type, isTestMode]);

    return (
        <Marker 
            /* 
               DER TRICK: Wir geben im Testmodus eine STATISCHE Position an React. 
               React "denkt", der Marker bewegt sich nicht und lässt das DOM-Element in Ruhe.
               Leaflet verschiebt das Element aber nativ über das 'draggable' Attribut.
            */
            position={isTestMode ? initialPos : pos} 
            ref={markerRef}
            draggable={isTestMode}
            eventHandlers={eventHandlers}
            icon={icon} 
            zIndexOffset={1000}
        />
    );
});

const MapController = ({ center, zoom, follow, onZoomChange, isTestMode }: { center: [number, number], zoom: number, follow: boolean, onZoomChange: (z: number) => void, isTestMode: boolean }) => {
  const map = useMap();
  const lastTestMode = useRef(isTestMode);
  
  useEffect(() => { 
    if (center && !isTestMode) {
      map.setView(center, zoom, { animate: follow }); 
    }
    if (isTestMode && !lastTestMode.current && center) {
        map.setView(center, map.getZoom());
    }
    lastTestMode.current = isTestMode;
  }, [center, zoom, follow, map, isTestMode]);

  useEffect(() => { 
    const t = setTimeout(() => map.invalidateSize(), 200); 
    return () => clearTimeout(t); 
  }, [map]);
  
  useMapEvents({ 
    zoomend: () => onZoomChange(map.getZoom())
  });
  
  return null;
};

const createCustomIcon = (color: string, svgPath: string) => L.divIcon({ className: 'custom-pin-icon', html: `<div style="background-color: ${color}; width: 32px; height: 32px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; color: white; position: relative;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${svgPath}</svg></div>`, iconSize: [32, 32], iconAnchor: [16, 32] });

export const TrackingMap: React.FC<Props> = ({ points, fields, storages, currentLocation, mapStyle, followUser, historyTracks, historyMode, vehicleIconType, onZoomChange, zoom, storageRadius, subType, isTestMode, onSimulateClick }) => {
  const center: [number, number] = currentLocation ? [currentLocation.coords.latitude, currentLocation.coords.longitude] : [47.5, 14.5];

  const trackSegments = useMemo(() => {
    if (points.length < 2) return [];
    const segments = [];
    let current = [[points[0].lat, points[0].lng]];
    let color = '#3b82f6';
    let spread = points[0].isSpreading;
    
    // In der Map brauchen wir keine komplexe Farb-Logik für Performance, wir zeigen einfach den Pfad
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      if (p.isSpreading !== spread) {
        segments.push({ points: current, spread });
        current = [[points[i - 1].lat, points[i - 1].lng], [p.lat, p.lng]];
        spread = p.isSpreading;
      } else { current.push([p.lat, p.lng]); }
    }
    segments.push({ points: current, spread });
    return segments;
  }, [points]);

  return (
    <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }} zoomControl={false} preferCanvas={true}>
      <TileLayer url={mapStyle === 'standard' ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"} />
      <MapController center={center} zoom={zoom} follow={followUser} onZoomChange={onZoomChange} isTestMode={isTestMode} />
      {fields.map(f => <Polygon key={f.id} positions={f.boundary.map(p => [p.lat, p.lng])} pathOptions={{ color: f.color || (f.type === 'Acker' ? '#92400E' : '#15803D'), fillOpacity: 0.3, weight: 1 }} />)}
      {historyMode !== 'OFF' && historyTracks.map((act, i) => act.trackPoints && <Polyline key={i} positions={act.trackPoints.map((p: any) => [p.lat, p.lng])} pathOptions={{ color: '#666', weight: 2, opacity: 0.3, dashArray: '5,5' }} />)}
      
      {trackSegments.map((s, i) => (
          <Polyline 
            key={i} 
            positions={s.points as any} 
            pathOptions={{ 
                color: s.spread ? '#16a34a' : '#3b82f6', 
                weight: s.spread ? 12 : 3, 
                opacity: 0.7 
            }} 
          />
      ))}
      
      {currentLocation && (
        <VehicleMarker 
            pos={[currentLocation.coords.latitude, currentLocation.coords.longitude]}
            heading={currentLocation.coords.heading}
            type={vehicleIconType}
            isTestMode={isTestMode}
            onDrag={onSimulateClick}
        />
      )}

      {storages.map(s => <Marker key={s.id} position={[s.geo.lat, s.geo.lng]} icon={createCustomIcon('#64748b', '<path d="M12 22a7 7 0 0 0 7-7c0-2-2-3-2-3l-5-8-5 8s-2 1-2 3a7 7 0 0 0 7 7z"/>')} />)}
    </MapContainer>
  );
};

