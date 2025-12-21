
import React, { useEffect, useMemo, useRef, useState, memo } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, Circle, Polyline, useMap, useMapEvents, Popup } from 'react-leaflet';
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

// --- FARBPALETTEN ---
const SLURRY_PALETTE = ['#451a03', '#78350f', '#92400e', '#b45309', '#854d0e'];
const MANURE_PALETTE = ['#d97706', '#ea580c', '#f59e0b', '#c2410c', '#fb923c'];

const getStorageColor = (storageId: string | undefined, allStorages: StorageLocation[]) => {
  if (!storageId) return '#3b82f6';
  const storage = allStorages.find(s => s.id === storageId);
  if (!storage) return '#64748b';
  const sameType = allStorages.filter(s => s.type === storage.type).sort((a, b) => a.id.localeCompare(b.id));
  const idx = sameType.findIndex(s => s.id === storageId);
  return storage.type === FertilizerType.SLURRY ? SLURRY_PALETTE[Math.max(0, idx) % SLURRY_PALETTE.length] : MANURE_PALETTE[Math.max(0, idx) % MANURE_PALETTE.length];
};

const VehicleMarker = memo(({ 
    initialPos, 
    heading, 
    type, 
    isTestMode, 
    onDrag,
    externalPos 
}: { 
    initialPos: [number, number], 
    externalPos: [number, number],
    heading: number | null, 
    type: 'tractor' | 'arrow' | 'dot', 
    isTestMode: boolean,
    onDrag?: (lat: number, lng: number) => void
}) => {
    const markerRef = useRef<L.Marker>(null);
    const isDragging = useRef(false);

    // Wenn nicht im Testmodus: Marker dem echten GPS folgen lassen
    useEffect(() => {
        if (markerRef.current && !isTestMode && !isDragging.current) {
            markerRef.current.setLatLng(externalPos);
        }
    }, [externalPos, isTestMode]);

    // Wenn Testmodus aktiviert wird: Marker sofort auf die initialPos setzen
    useEffect(() => {
        if (markerRef.current && isTestMode) {
            markerRef.current.setLatLng(initialPos);
        }
    }, [isTestMode, initialPos]);

    const eventHandlers = useMemo(() => ({
        dragstart() { isDragging.current = true; },
        drag(e: any) {
            if (isTestMode && onDrag) {
                const { lat, lng } = e.target.getLatLng();
                onDrag(lat, lng);
            }
        },
        dragend() { 
            setTimeout(() => { isDragging.current = false; }, 100); 
        }
    }), [isTestMode, onDrag]);

    const icon = useMemo(() => {
        const rotation = heading || 0;
        const color = isTestMode ? '#3b82f6' : '#16a34a';
        const content = `<svg viewBox="0 0 50 50"><rect x="5" y="30" width="12" height="18" rx="2" fill="#1e293b"/><rect x="33" y="30" width="12" height="18" rx="2" fill="#1e293b"/><rect x="8" y="5" width="8" height="10" rx="2" fill="#1e293b"/><rect x="34" y="5" width="8" height="10" rx="2" fill="#1e293b"/><path d="M20 4 L30 4 L30 20 L34 22 L34 40 L16 40 L16 22 L20 20 Z" fill="${color}"/><rect x="14" y="24" width="22" height="14" rx="1" fill="#fff" fill-opacity="0.9" stroke="#94a3b8" stroke-width="2"/></svg>`;
        
        return L.divIcon({ 
            className: 'vehicle-cursor', 
            html: `<div style="transform:rotate(${rotation}deg);width:100%;height:100%;display:flex;align-items:center;justify-content:center;transition: transform 0.1s linear;${isTestMode ? 'filter: drop-shadow(0 0 8px rgba(59,130,246,0.8)); scale: 1.1;' : ''}">${content}</div>`, 
            iconSize: [36, 36], 
            iconAnchor: [18, 18] 
        });
    }, [heading, isTestMode]);

    return (
        <Marker 
            key={isTestMode ? "sim-marker" : "live-marker"}
            position={isTestMode ? initialPos : externalPos} 
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
  useEffect(() => { 
    if (center && !isTestMode && follow) {
      map.setView(center, zoom, { animate: true }); 
    }
  }, [center, zoom, follow, map, isTestMode]);
  
  useMapEvents({ zoomend: () => onZoomChange(map.getZoom()) });
  return null;
};

const createStorageIcon = (color: string, type: FertilizerType) => {
    const path = type === FertilizerType.SLURRY 
        ? '<path d="M12 22a7 7 0 0 0 7-7c0-2-2-3-2-3l-5-8-5 8s-2 1-2 3a7 7 0 0 0 7 7z"/>'
        : '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>';
    
    return L.divIcon({ 
        className: 'storage-icon', 
        html: `<div style="background-color: ${color}; width: 32px; height: 32px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${path}</svg></div>`, 
        iconSize: [32, 32], 
        iconAnchor: [16, 16] 
    });
};

export const TrackingMap: React.FC<Props> = ({ points, fields, storages, currentLocation, mapStyle, followUser, historyTracks, historyMode, vehicleIconType, onZoomChange, zoom, storageRadius, isTestMode, onSimulateClick }) => {
  const center: [number, number] = currentLocation ? [currentLocation.coords.latitude, currentLocation.coords.longitude] : [47.5, 14.5];
  
  // Dynamische Startposition für die Simulation
  const [simStartPos, setSimStartPos] = useState<[number, number]>(center);

  // Wenn der Testmodus aktiviert wird, nehmen wir die AKTUELLEN Koordinaten als Anker
  useEffect(() => {
    if (isTestMode && currentLocation) {
        setSimStartPos([currentLocation.coords.latitude, currentLocation.coords.longitude]);
    }
  }, [isTestMode]);

  const trackSegments = useMemo(() => {
    if (points.length < 2) return [];
    const segments = [];
    let current = [[points[0].lat, points[0].lng]];
    let color = getStorageColor(points[0].storageId, storages);
    let spread = points[0].isSpreading;
    
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      const c = getStorageColor(p.storageId, storages);
      if (p.isSpreading !== spread || c !== color) {
        segments.push({ points: current, spread, color });
        current = [[points[i - 1].lat, points[i - 1].lng], [p.lat, p.lng]];
        spread = p.isSpreading;
        color = c;
      } else { current.push([p.lat, p.lng]); }
    }
    segments.push({ points: current, spread, color });
    return segments;
  }, [points, storages]);

  return (
    <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }} zoomControl={false} preferCanvas={true}>
      <TileLayer url={mapStyle === 'standard' ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"} />
      <MapController center={center} zoom={zoom} follow={followUser} onZoomChange={onZoomChange} isTestMode={isTestMode} />
      
      {fields.map(f => <Polygon key={f.id} positions={f.boundary.map(p => [p.lat, p.lng])} pathOptions={{ color: f.color || (f.type === 'Acker' ? '#92400E' : '#15803D'), fillOpacity: 0.2, weight: 1 }} />)}
      
      {historyMode !== 'OFF' && historyTracks.map((act, i) => act.trackPoints && <Polyline key={i} positions={act.trackPoints.map((p: any) => [p.lat, p.lng])} pathOptions={{ color: '#666', weight: 2, opacity: 0.3, dashArray: '5,5' }} />)}
      
      {trackSegments.map((s, i) => (
          <Polyline 
            key={i} 
            positions={s.points as any} 
            pathOptions={{ color: s.color, weight: s.spread ? 15 : 3, opacity: 0.7 }} 
          />
      ))}
      
      {storages.map(s => {
          const color = getStorageColor(s.id, storages);
          return (
            <React.Fragment key={s.id}>
                <Circle 
                    center={[s.geo.lat, s.geo.lng]} 
                    radius={storageRadius} 
                    pathOptions={{ color: color, fillOpacity: 0.1, weight: 1, dashArray: '5, 5' }} 
                />
                <Marker position={[s.geo.lat, s.geo.lng]} icon={createStorageIcon(color, s.type)}>
                    <Popup><div className="font-bold">{s.name}</div></Popup>
                </Marker>
            </React.Fragment>
          );
      })}
      
      {currentLocation && (
        <VehicleMarker 
            initialPos={simStartPos}
            externalPos={[currentLocation.coords.latitude, currentLocation.coords.longitude]}
            heading={currentLocation.coords.heading}
            type={vehicleIconType}
            isTestMode={isTestMode}
            onDrag={onSimulateClick}
        />
      )}
    </MapContainer>
  );
};

