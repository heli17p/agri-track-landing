
import React, { useEffect, useMemo, useRef, memo } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, Circle, Polyline, useMap, useMapEvents, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Field, StorageLocation, TrackPoint, FertilizerType, ActivityType } from '../../types';

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
  activityType: ActivityType | string;
}

const SLURRY_PALETTE = ['#451a03', '#78350f', '#92400e', '#b45309', '#854d0e'];
const MANURE_PALETTE = ['#d97706', '#ea580c', '#f59e0b', '#c2410c', '#fb923c'];

const getStorageColor = (storageId: string | undefined, allStorages: StorageLocation[]) => {
  if (!storageId) return '#3b82f6';
  const storage = allStorages.find(s => s.id === storageId);
  if (!storage) return '#64748b';
  
  const sameType = allStorages.filter(s => s.type === storage.type).sort((a, b) => a.id.localeCompare(b.id));
  const idx = sameType.findIndex(s => s.id === storageId);
  const safeIdx = Math.max(0, idx);
  
  return storage.type === FertilizerType.SLURRY 
    ? SLURRY_PALETTE[safeIdx % SLURRY_PALETTE.length] 
    : MANURE_PALETTE[safeIdx % MANURE_PALETTE.length];
};

const createStorageIcon = (color: string, type: FertilizerType) => {
    const path = type === FertilizerType.SLURRY 
        ? '<path d="M12 22a7 7 0 0 0 7-7c0-2-2-3-2-3l-5-8-5 8s-2 1-2 3a7 7 0 0 0 7 7z" stroke="white" stroke-width="2"/>'
        : '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" stroke-width="2"/>';
    
    const pinSvg = `
      <svg width="36" height="46" viewBox="0 0 24 30" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 3px 4px rgba(0,0,0,0.4));">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 18 12 18s12-9 12-18c0-6.63-5.37-12-12-12z" fill="${color}" stroke="white" stroke-width="1.5"/>
        <g transform="translate(5, 5) scale(0.6)">
          ${path}
        </g>
      </svg>
    `;

    return L.divIcon({ 
        className: 'storage-pin-icon', 
        html: `<div style="width: 36px; height: 46px; display: flex; align-items: center; justify-content: center;">${pinSvg}</div>`, 
        iconSize: [36, 46], 
        iconAnchor: [18, 46],
        popupAnchor: [0, -40]
    });
};

const VehicleMarker = memo(({ initialPos, externalPos, heading, isTestMode, onDrag }: any) => {
    const markerRef = useRef<L.Marker>(null);
    useEffect(() => {
        if (markerRef.current) markerRef.current.setLatLng(isTestMode ? initialPos : externalPos);
    }, [externalPos, initialPos, isTestMode]);

    const icon = useMemo(() => {
        const rotation = heading || 0;
        const color = isTestMode ? '#3b82f6' : '#16a34a';
        const content = `<svg viewBox="0 0 50 50"><rect x="5" y="30" width="12" height="18" rx="2" fill="#1e293b"/><rect x="33" y="30" width="12" height="18" rx="2" fill="#1e293b"/><rect x="8" y="5" width="8" height="10" rx="2" fill="#1e293b"/><rect x="34" y="5" width="8" height="10" rx="2" fill="#1e293b"/><path d="M20 4 L30 4 L30 20 L34 22 L34 40 L16 40 L16 22 L20 20 Z" fill="${color}"/><rect x="14" y="24" width="22" height="14" rx="1" fill="#fff" fill-opacity="0.9" stroke="#94a3b8" stroke-width="2"/></svg>`;
        return L.divIcon({ className: 'vehicle-cursor', html: `<div style="transform:rotate(${rotation}deg);width:100%;height:100%;">${content}</div>`, iconSize: [36, 36], iconAnchor: [18, 18] });
    }, [heading, isTestMode]);

    return <Marker position={isTestMode ? initialPos : externalPos} ref={markerRef} draggable={isTestMode} eventHandlers={{ drag: (e) => isTestMode && onDrag(e.target.getLatLng().lat, e.target.getLatLng().lng) }} icon={icon} zIndexOffset={1000} />;
});

const MapController = ({ center, zoom, follow, onZoomChange, isTestMode }: any) => {
  const map = useMap();
  useEffect(() => { if (center && !isTestMode && follow) map.setView(center, zoom, { animate: true }); }, [center, zoom, follow, map, isTestMode]);
  useMapEvents({ zoomend: () => onZoomChange(map.getZoom()) });
  return null;
};

export const TrackingMap: React.FC<Props> = ({ points, fields, storages, currentLocation, mapStyle, followUser, historyTracks, historyMode, onZoomChange, zoom, storageRadius, isTestMode, onSimulateClick, activityType, subType }) => {
  const center: [number, number] = currentLocation ? [currentLocation.coords.latitude, currentLocation.coords.longitude] : [47.5, 14.5];
  
  const trackSegments = useMemo(() => {
    if (points.length < 2) return [];
    const segments = [];
    let current = [[points[0].lat, points[0].lng]];
    let spread = points[0].isSpreading;
    let sId = points[0].storageId;
    
    // Basis-Farbe für Bodenbearbeitung (Blau-Töne)
    const tillageColor = activityType === ActivityType.TILLAGE ? '#2563eb' : undefined;

    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      if (p.isSpreading !== spread || p.storageId !== sId) {
        segments.push({ points: current, spread, color: tillageColor || getStorageColor(sId, storages) });
        current = [[points[i - 1].lat, points[i - 1].lng], [p.lat, p.lng]];
        spread = p.isSpreading;
        sId = p.storageId;
      } else { current.push([p.lat, p.lng]); }
    }
    segments.push({ points: current, spread, color: tillageColor || getStorageColor(sId, storages) });
    return segments;
  }, [points, storages, activityType]);

  return (
    <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }} zoomControl={false} preferCanvas={true}>
      <TileLayer url={mapStyle === 'standard' ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"} />
      <MapController center={center} zoom={zoom} follow={followUser} onZoomChange={onZoomChange} isTestMode={isTestMode} />
      {fields.map(f => <Polygon key={f.id} positions={f.boundary.map(p => [p.lat, p.lng])} pathOptions={{ color: f.color || (f.type === 'Acker' ? '#92400E' : '#15803D'), fillOpacity: 0.2, weight: 1 }} />)}
      
      {/* VERBESSERTE HISTORIE: Farblich abgesetzt je nach Typ */}
      {historyMode !== 'OFF' && historyTracks.map((act, i) => {
          if (!act.trackPoints) return null;
          const isSameType = act.type === activityType;
          return (
              <Polyline 
                key={i} 
                positions={act.trackPoints.map((p: any) => [p.lat, p.lng])} 
                pathOptions={{ 
                    color: isSameType ? (activityType === ActivityType.TILLAGE ? '#3b82f6' : '#666') : '#999', 
                    weight: isSameType ? 3 : 1.5, 
                    opacity: isSameType ? 0.4 : 0.2, 
                    dashArray: isSameType ? '8, 8' : '2, 4' 
                }} 
              />
          );
      })}
      
      {trackSegments.map((s, i) => (
        <React.Fragment key={i}>
          <Polyline positions={s.points as any} pathOptions={{ color: s.color, weight: s.spread ? 14 : 3, opacity: s.spread ? 0.8 : 0.6, lineCap: 'round' }} />
          {s.spread && <Polyline positions={s.points as any} pathOptions={{ color: 'white', weight: 2, dashArray: '10, 15', opacity: 0.9 }} />}
        </React.Fragment>
      ))}
      
      {storages.map(s => {
          const color = getStorageColor(s.id, storages);
          return (
              <React.Fragment key={s.id}>
                <Circle center={[s.geo.lat, s.geo.lng]} radius={storageRadius} pathOptions={{ color: color, fillOpacity: 0.1, weight: 1, dashArray: '5, 5' }} />
                <Marker position={[s.geo.lat, s.geo.lng]} icon={createStorageIcon(color, s.type)}>
                    <Popup><div className="font-bold">{s.name}</div><div className="text-xs">{s.currentLevel.toFixed(0)} / {s.capacity} m³</div></Popup>
                </Marker>
              </React.Fragment>
          );
      })}
      
      {currentLocation && <VehicleMarker initialPos={center} externalPos={center} heading={currentLocation.coords.heading} isTestMode={isTestMode} onDrag={onSimulateClick} />}
    </MapContainer>
  );
};

