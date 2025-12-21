
import React, { useEffect, useMemo, useRef, useState } from 'react';
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

const MapController = ({ center, zoom, follow, onZoomChange, isTestMode }: { center: [number, number], zoom: number, follow: boolean, onZoomChange: (z: number) => void, isTestMode: boolean }) => {
  const map = useMap();
  // Fix: Use ref to track previous state for one-time events
  const lastTestMode = useRef(isTestMode);
  
  useEffect(() => { 
    // Im Testmodus folgen wir dem Traktor nicht automatisch per SetView, 
    // da das Ziehen sonst die Karte verschiebt und die Geste abbricht.
    if (center && !isTestMode) {
      map.setView(center, zoom, { animate: follow }); 
    }

    // Fix: Move centering logic here to avoid accessing protected _map property.
    // Zentrieren beim Start der Simulation (Wechsel von false auf true)
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

const getCursorIcon = (heading: number | null, type: 'tractor' | 'arrow' | 'dot', isDragging: boolean) => {
  const rotation = heading || 0;
  let content = '';
  let size = [32, 32];
  const color = isDragging ? '#3b82f6' : '#16a34a';

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
    html: `<div style="transform:rotate(${rotation}deg);width:100%;height:100%;display:flex;align-items:center;justify-content:center;${isDragging ? 'filter: drop-shadow(0 0 12px rgba(59,130,246,0.8)); scale: 1.2;' : ''}">${content}</div>`, 
    iconSize: [size[0], size[1]], 
    iconAnchor: [size[0] / 2, size[1] / 2] 
  });
};

const createCustomIcon = (color: string, svgPath: string) => L.divIcon({ className: 'custom-pin-icon', html: `<div style="background-color: ${color}; width: 32px; height: 32px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; color: white; position: relative;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${svgPath}</svg></div>`, iconSize: [32, 32], iconAnchor: [16, 32] });

export const TrackingMap: React.FC<Props> = ({ points, fields, storages, currentLocation, mapStyle, followUser, historyTracks, historyMode, vehicleIconType, onZoomChange, zoom, storageRadius, subType, isTestMode, onSimulateClick }) => {
  const center: [number, number] = currentLocation ? [currentLocation.coords.latitude, currentLocation.coords.longitude] : [47.5, 14.5];
  const markerRef = useRef<L.Marker>(null);
  const isDraggingInternal = useRef(false);

  // WICHTIG: Wir frieren die Position ein, sobald isTestMode aktiviert wird.
  // Das verhindert das "Millimeter-Kleben", weil React den Marker-Zustand während der Geste nicht mehr ändert.
  const [frozenPos, setFrozenPos] = useState<[number, number]>(center);

  // Fix: Removed direct _map access on markerRef. Centering is now handled in MapController via useMap hook.
  useEffect(() => {
    if (isTestMode) {
      setFrozenPos(center);
    }
  }, [isTestMode]);

  const eventHandlers = useMemo(() => ({
    dragstart() {
      isDraggingInternal.current = true;
    },
    drag(e: any) {
      if (isTestMode && onSimulateClick) {
        const { lat, lng } = e.target.getLatLng();
        onSimulateClick(lat, lng);
      }
    },
    dragend() {
      setTimeout(() => {
        isDraggingInternal.current = false;
      }, 150);
    }
  }), [isTestMode, onSimulateClick]);

  // Manuelle Synchronisation des Markers (nur wenn nicht gezogen wird)
  useEffect(() => {
    if (markerRef.current && currentLocation && !isDraggingInternal.current) {
      markerRef.current.setLatLng([currentLocation.coords.latitude, currentLocation.coords.longitude]);
    }
  }, [currentLocation]);

  const trackSegments = useMemo(() => {
    if (points.length < 2) return [];
    const segments = [];
    let current = [[points[0].lat, points[0].lng]];
    let color = getStorageColor(points[0].storageId, storages);
    let spread = points[0].isSpreading;
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      const c = getStorageColor(p.storageId, storages);
      if (c !== color || p.isSpreading !== spread) {
        segments.push({ points: current, color, spread });
        current = [[points[i - 1].lat, points[i - 1].lng], [p.lat, p.lng]];
        color = c; spread = p.isSpreading;
      } else { current.push([p.lat, p.lng]); }
    }
    segments.push({ points: current, color, spread });
    return segments;
  }, [points, storages]);

  return (
    <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }} zoomControl={false}>
      <TileLayer url={mapStyle === 'standard' ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"} />
      <MapController center={center} zoom={zoom} follow={followUser} onZoomChange={onZoomChange} isTestMode={isTestMode} />
      {fields.map(f => <Polygon key={f.id} positions={f.boundary.map(p => [p.lat, p.lng])} pathOptions={{ color: f.color || (f.type === 'Acker' ? '#92400E' : '#15803D'), fillOpacity: 0.3, weight: 1 }} />)}
      {historyMode !== 'OFF' && historyTracks.map((act, i) => act.trackPoints && <Polyline key={i} positions={act.trackPoints.map((p: any) => [p.lat, p.lng])} pathOptions={{ color: '#666', weight: 2, opacity: 0.3, dashArray: '5,5' }} />)}
      {trackSegments.map((s, i) => <Polyline key={i} positions={s.points as any} pathOptions={{ color: s.color, weight: s.spread ? 20 : 4, opacity: 0.8 }} />)}
      
      {currentLocation && (
        <Marker 
            /* Im Testmodus nutzen wir frozenPos, damit React nicht ständig setLatLng aufruft */
            position={isTestMode ? frozenPos : center} 
            ref={markerRef}
            draggable={isTestMode}
            eventHandlers={eventHandlers}
            icon={getCursorIcon(currentLocation.coords.heading, vehicleIconType, isTestMode)} 
            zIndexOffset={1000}
        />
      )}

      {storages.map(s => <React.Fragment key={s.id}><Circle center={[s.geo.lat, s.geo.lng]} radius={storageRadius} pathOptions={{ color: getStorageColor(s.id, storages), fillOpacity: 0.2 }} /><Marker position={[s.geo.lat, s.geo.lng]} icon={createCustomIcon(getStorageColor(s.id, storages), s.type === 'Gülle' ? '<path d="M12 22a7 7 0 0 0 7-7c0-2-2-3-2-3l-5-8-5 8s-2 1-2 3a7 7 0 0 0 7 7z"/>' : '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>')} /></React.Fragment>)}
    </MapContainer>
  );
};

