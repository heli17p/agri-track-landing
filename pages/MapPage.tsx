
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, Popup, useMap, useMapEvents, Polyline } from 'react-leaflet';
import { Layers, Building2, Save, X, Move, MousePointerClick, Undo2, Trash2, Scissors, Check, LocateFixed, AlertTriangle } from 'lucide-react';
import { dbService, generateId } from '../services/db';
import { Field, StorageLocation, FarmProfile, FertilizerType, GeoPoint } from '../types';
import { FieldDetailView } from '../components/FieldDetailView';
import { StorageDetailView } from '../components/StorageDetailView';
import { calculateArea, splitPolygon } from '../utils/geo';
import L from 'leaflet';

import 'leaflet/dist/leaflet.css';

const MAP_COLORS = {
    standard: { acker: '#92400E', weide: '#65a30d', grunland: '#15803D', div: '#EAB308', hof: '#2563eb' },
    satellite: { acker: '#F59E0B', weide: '#BEF264', grunland: '#84CC16', div: '#FEF08A', hof: '#3b82f6' }
};

const createCustomIcon = (color: string, svgPath: string) => {
  return L.divIcon({
    className: 'custom-pin-icon',
    html: `<div style="background-color: ${color}; width: 32px; height: 32px; border-radius: 50%; border: 2px solid white; box-shadow: 0 3px 8px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: white; position: relative;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16], 
  });
};

const iconPaths = {
  house: '<path d="M3 21h18M5 21V7l8-5 8 5v14"/>',
  droplet: '<path d="M12 22a7 7 0 0 0 7-7c0-2-2-3-2-3l-5-8-5 8s-2 1-2 3a7 7 0 0 0 7 7z"/>',
  layers: '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>'
};

const farmIcon = createCustomIcon('#2563eb', iconPaths.house); 
const slurryIcon = createCustomIcon('#78350f', iconPaths.droplet); 
const manureIcon = createCustomIcon('#d97706', iconPaths.layers); 

const VertexMarker = ({ position, index, onDragEnd, onDelete }: { position: GeoPoint, index: number, onDragEnd: (i: number, lat: number, lng: number) => void, onDelete: (i: number) => void }) => {
    const markerRef = useRef<L.Marker>(null);
    const eventHandlers = useMemo(() => ({
        dragend() {
            const marker = markerRef.current;
            if (marker != null) {
                const { lat, lng } = marker.getLatLng();
                onDragEnd(index, lat, lng);
            }
        },
        click(e: any) {
            L.DomEvent.stopPropagation(e);
            onDelete(index);
        }
    }), [index, onDragEnd, onDelete]);

    return (
        <Marker
            draggable={true}
            eventHandlers={eventHandlers}
            position={[position.lat, position.lng]}
            ref={markerRef}
            icon={L.divIcon({
                className: 'vertex-marker',
                html: '<div style="width: 14px; height: 14px; background: white; border: 3px solid #2563eb; border-radius: 50%; box-shadow: 0 0 3px rgba(0,0,0,0.5); cursor: pointer;"></div>',
                iconSize: [14, 14],
                iconAnchor: [7, 7]
            })}
        />
    );
};

// Spezial-Marker für Schnittpunkte mit Live-Update
const SplitPointMarker = ({ position, index, onDrag, onDelete }: { position: GeoPoint, index: number, onDrag: (i: number, lat: number, lng: number) => void, onDelete: (i: number) => void }) => {
    const markerRef = useRef<L.Marker>(null);
    const eventHandlers = useMemo(() => ({
        drag(e: any) {
            const { lat, lng } = e.target.getLatLng();
            onDrag(index, lat, lng);
        },
        click(e: any) {
            L.DomEvent.stopPropagation(e);
            onDelete(index);
        }
    }), [index, onDrag, onDelete]);

    return (
        <Marker
            draggable={true}
            eventHandlers={eventHandlers}
            position={[position.lat, position.lng]}
            ref={markerRef}
            icon={L.divIcon({
                className: 'split-point-marker',
                html: '<div style="width: 24px; height: 24px; background: white; border: 5px solid #ef4444; border-radius: 50%; box-shadow: 0 0 15px rgba(239,68,68,0.6); cursor: move;"></div>',
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            })}
        />
    );
};

const MapClickHandler = ({ isEditing, onMapClick }: { isEditing: boolean, onMapClick: (lat: number, lng: number) => void }) => {
    useMapEvents({
        click(e) {
            if (isEditing) {
                onMapClick(e.latlng.lat, e.latlng.lng);
            }
        }
    });
    return null;
};

const MapBounds = ({ fields, profile, focusField, isEditing }: { fields: Field[], profile: FarmProfile | null, focusField?: Field | null, isEditing: boolean }) => {
    const map = useMap();
    useEffect(() => {
        const container = map.getContainer();
        const observer = new ResizeObserver(() => { map.invalidateSize(); });
        observer.observe(container);
        return () => observer.disconnect();
    }, [map]);

    useEffect(() => {
        if (isEditing) return;

        if (focusField && focusField.boundary.length > 0) {
             const polygon = L.polygon(focusField.boundary.map(p => [p.lat, p.lng]));
             try { map.fitBounds(polygon.getBounds(), { padding: [50, 50], maxZoom: 18 }); } catch(e) {}
             return;
        }
        const layers = [];
        fields.forEach(f => { if(f.boundary.length > 0) layers.push(L.polygon(f.boundary.map(p => [p.lat, p.lng]))); });
        if (profile?.addressGeo) layers.push(L.marker([profile.addressGeo.lat, profile.addressGeo.lng]));
        if (layers.length > 0) {
            const group = new L.FeatureGroup(layers);
            try { map.fitBounds(group.getBounds(), { padding: [50, 50] }); } catch(e) {}
        }
    }, [fields, map, profile, focusField, isEditing]);
    return null;
};

const LegendPoly = ({ color, label }: { color: string, label: string }) => (
    <div className="flex items-center mb-1">
        <div className="relative w-4 h-4 mr-2 shadow-sm rounded-sm overflow-hidden">
            <div className="absolute inset-0" style={{ backgroundColor: color, opacity: 0.5 }}></div>
            <div className="absolute inset-0 border-2" style={{ borderColor: color }}></div>
        </div>
        <span className="text-slate-700">{label}</span>
    </div>
);

interface Props {
    initialEditFieldId?: string | null;
    clearInitialEdit?: () => void;
}

export const MapPage: React.FC<Props> = ({ initialEditFieldId, clearInitialEdit }) => {
  const [fields, setFields] = useState<Field[]>([]);
  const [storages, setStorages] = useState<StorageLocation[]>([]);
  const [profile, setProfile] = useState<FarmProfile | null>(null);
  const [mapStyle, setMapStyle] = useState<'standard' | 'satellite'>('standard');
  const [selectedField, setSelectedField] = useState<Field | null>(null);
  const [selectedStorage, setSelectedStorage] = useState<StorageLocation | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editingField, setEditingField] = useState<Field | null>(null);
  const [isSplitting, setIsSplitting] = useState(false);
  const [splitPoints, setSplitPoints] = useState<GeoPoint[]>([]);
  
  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const f = await dbService.getFields();
    setFields(f);
    setStorages(await dbService.getStorageLocations());
    const p = await dbService.getFarmProfile();
    if (p.length > 0) setProfile(p[0]);

    if (initialEditFieldId) {
        const target = f.find(field => field.id === initialEditFieldId);
        if (target) { setEditingField({ ...target }); setIsEditing(true); }
        if (clearInitialEdit) clearInitialEdit();
    }
  };

  const handleStartEditGeometry = (field: Field) => {
    setSelectedField(null);
    setEditingField({ ...field });
    setIsEditing(true);
  };

  const handleDeleteField = async (id: string) => {
    await dbService.deleteField(id);
    setSelectedField(null);
    loadData();
  };

  const getFieldColor = (field: Field) => {
    if (field.color) return field.color;
    const usage = field.usage?.toUpperCase() || '';
    const name = field.name.toUpperCase();
    const colors = mapStyle === 'satellite' ? MAP_COLORS.satellite : MAP_COLORS.standard;
    if (usage.includes('DIV') || name.includes('DIV')) return colors.div;
    if (field.type === 'Acker') return colors.acker;
    return (usage.includes('WEIDE') || name.includes('WEIDE')) ? colors.weide : colors.grunland;
  };

  const handleVertexDragEnd = (index: number, lat: number, lng: number) => {
      if (!editingField || isSplitting) return;
      const newBoundary = [...editingField.boundary];
      newBoundary[index] = { lat, lng };
      setEditingField({ ...editingField, boundary: newBoundary, areaHa: calculateArea(newBoundary) });
  };

  const handleVertexDelete = (index: number) => {
      if (!editingField || isSplitting) return;
      const newBoundary = editingField.boundary.filter((_, i) => i !== index);
      setEditingField({ ...editingField, boundary: newBoundary, areaHa: calculateArea(newBoundary) });
  };

  // Live-Update für Schnittpunkte
  const handleSplitPointDrag = useCallback((index: number, lat: number, lng: number) => {
      setSplitPoints(prev => {
          const next = [...prev];
          next[index] = { lat, lng };
          return next;
      });
  }, []);

  const handleSplitPointDelete = (index: number) => {
      if (splitPoints.length <= 1) {
          setSplitPoints([]);
          return;
      }
      setSplitPoints(prev => prev.filter((_, i) => i !== index));
  };

  const handleMapClick = (lat: number, lng: number) => {
      if (!editingField) return;
      if (isSplitting) {
          // Unbegrenzte Punkte hinzufügen
          setSplitPoints(prev => [...prev, { lat, lng }]);
      } else {
          const newBoundary = [...editingField.boundary, { lat, lng }];
          setEditingField({ ...editingField, boundary: newBoundary, areaHa: calculateArea(newBoundary) });
      }
  };

  const executeSplit = async () => {
    if (!editingField || splitPoints.length < 2) return;
    
    const result = splitPolygon(editingField.boundary, splitPoints);
    if (result) {
        const [polyA, polyB] = result;
        const fieldA: Field = { ...editingField, boundary: polyA, areaHa: calculateArea(polyA) };
        const fieldB: Field = {
            ...editingField,
            id: generateId(),
            name: `${editingField.name} (Teil 2)`,
            boundary: polyB,
            areaHa: calculateArea(polyB)
        };
        await dbService.saveField(fieldA);
        await dbService.saveField(fieldB);
        cancelEdit();
        loadData();
    } else {
        alert("Schnitt konnte nicht durchgeführt werden. Die Linie muss das Feld komplett durchqueren.");
    }
  };

  const saveGeometry = async () => {
      if (!editingField) return;
      await dbService.saveField(editingField);
      setIsEditing(false);
      setEditingField(null);
      loadData();
  };

  const cancelEdit = () => {
      setIsEditing(false);
      setEditingField(null);
      setIsSplitting(false);
      setSplitPoints([]);
  };
  
  const legendData = useMemo(() => {
      const colors = mapStyle === 'satellite' ? MAP_COLORS.satellite : MAP_COLORS.standard;
      const data = {
          grunland: { label: 'Grünland', color: colors.grunland, present: false },
          weide: { label: 'Dauerweide', color: colors.weide, present: false },
          acker: { label: 'Acker', color: colors.acker, present: false },
          div: { label: 'Div. Flächen', color: colors.div, present: false }
      };
      fields.forEach(f => {
          const usage = f.usage?.toUpperCase() || '';
          const name = f.name.toUpperCase();
          if (usage.includes('DIV') || name.includes('DIV')) data.div.present = true;
          else if (f.type === 'Grünland' && (usage.includes('WEIDE') || name.includes('WEIDE'))) data.weide.present = true;
          else if (f.type === 'Acker') data.acker.present = true;
          else data.grunland.present = true;
      });
      return data;
  }, [fields, mapStyle]);

  return (
    <div className="h-full w-full relative bg-slate-900 min-h-[600px]">
         <div className="absolute inset-0 z-0">
             <MapContainer key="map-page-main" center={[47.5, 14.5]} zoom={7} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                <TileLayer url={mapStyle === 'standard' ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"} />
                <MapBounds fields={fields} profile={profile} focusField={editingField} isEditing={isEditing} />
                <MapClickHandler isEditing={isEditing} onMapClick={handleMapClick} />

                {profile?.addressGeo && !isEditing && (
                    <Marker position={[profile.addressGeo.lat, profile.addressGeo.lng]} icon={farmIcon}>
                        <Popup><strong>Hof / Betrieb</strong><br/>{profile.operatorName}</Popup>
                    </Marker>
                )}

                {fields.map(f => (
                    (isEditing && editingField?.id === f.id) ? null : (
                        <Polygon key={f.id} positions={f.boundary.map(p => [p.lat, p.lng])} color={getFieldColor(f)} weight={2} fillOpacity={0.5} {...{ eventHandlers: { click: (e: any) => { if (isEditing) return; L.DomEvent.stopPropagation(e); setSelectedField(f); } } } as any} />
                    )
                ))}

                {isEditing && editingField && (
                    <>
                        <Polygon positions={editingField.boundary.map(p => [p.lat, p.lng])} {...{ pathOptions: { color: isSplitting ? '#94a3b8' : '#2563eb', dashArray: isSplitting ? '5,5' : '0', weight: 3, fillOpacity: 0.2 } } as any} />
                        {!isSplitting && editingField.boundary.map((p, i) => (
                            <VertexMarker key={`vertex-${i}`} index={i} position={p} onDragEnd={handleVertexDragEnd} onDelete={handleVertexDelete} />
                        ))}
                        {isSplitting && splitPoints.length > 0 && (
                            <>
                                {splitPoints.map((p, i) => (
                                    <SplitPointMarker key={`split-${i}`} index={i} position={p} onDrag={handleSplitPointDrag} onDelete={handleSplitPointDelete} />
                                ))}
                                {splitPoints.length >= 2 && <Polyline positions={splitPoints.map(p => [p.lat, p.lng])} pathOptions={{ color: '#ef4444', weight: 5, dashArray: '10, 15', lineCap: 'round' }} />}
                            </>
                        )}
                    </>
                )}

                {!isEditing && storages.map(s => (
                    <Marker key={s.id} position={[s.geo.lat, s.geo.lng]} icon={s.type === FertilizerType.SLURRY ? slurryIcon : manureIcon} {...{ eventHandlers: { click: (e: any) => { L.DomEvent.stopPropagation(e); setSelectedStorage(s); } } } as any} />
                ))}
             </MapContainer>
         </div>

         <div className="absolute top-4 right-4 flex flex-col space-y-2 z-[400]">
            <button onClick={() => setMapStyle(prev => prev === 'standard' ? 'satellite' : 'standard')} className="bg-white p-3 rounded-xl shadow-lg border border-slate-200 text-slate-700 hover:text-green-600"><Layers size={24} /></button>
            <button onClick={() => navigator.geolocation.getCurrentPosition(pos => {})} className="bg-white p-3 rounded-xl shadow-lg border border-slate-200 text-slate-700 hover:text-blue-600"><LocateFixed size={24} /></button>
         </div>

         {isEditing && editingField && (
             <div className="absolute top-4 left-4 right-16 z-[500] bg-white/95 backdrop-blur p-4 rounded-2xl shadow-2xl border-2 border-blue-500 space-y-4">
                 <div className="flex justify-between items-center">
                     <h3 className="font-black text-blue-800 flex items-center">
                         {isSplitting ? <Scissors size={18} className="mr-2"/> : <Move size={18} className="mr-2"/>}
                         {isSplitting ? 'Feldstück teilen' : 'Grenzen bearbeiten'}
                     </h3>
                     <span className="text-[10px] font-black bg-blue-100 text-blue-800 px-2 py-1 rounded-full uppercase">
                         {editingField.areaHa.toFixed(3)} ha
                     </span>
                 </div>
                 
                 {isSplitting ? (
                     <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 text-[11px] text-blue-700 font-bold leading-tight">
                         {splitPoints.length === 0 && "Klicke den Startpunkt auf der Karte an."}
                         {splitPoints.length >= 1 && "Klicke für weitere Kurvenpunkte oder verschiebe die Punkte frei."}
                         {splitPoints.length >= 2 && <div className="mt-1 text-[10px] text-green-600 font-black">Linie wird jetzt LIVE mitverschoben!</div>}
                     </div>
                 ) : (
                     <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Ziehe Punkte zum Verschieben • Klicke Karte für neue Punkte</p>
                 )}

                 <div className="flex space-x-2">
                     {isSplitting ? (
                         <>
                            <button onClick={() => { setIsSplitting(false); setSplitPoints([]); }} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm">Abbrechen</button>
                            <button onClick={executeSplit} disabled={splitPoints.length < 2} className="flex-[2] py-3 bg-red-600 text-white rounded-xl font-black text-sm shadow-lg disabled:opacity-50">SCHNITT BESTÄTIGEN</button>
                         </>
                     ) : (
                         <>
                            <button onClick={() => setIsSplitting(true)} className="p-3 bg-amber-50 text-amber-700 rounded-xl font-bold border border-amber-200" title="Feld teilen"><Scissors size={20}/></button>
                            <button onClick={cancelEdit} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm">Abbruch</button>
                            <button onClick={saveGeometry} className="flex-[2] py-3 bg-blue-600 text-white rounded-xl font-black text-sm shadow-lg">SPEICHERN</button>
                         </>
                     )}
                 </div>
             </div>
         )}

         {!isEditing && (
             <div className="absolute top-4 left-4 bg-white/90 p-3 rounded-lg shadow-lg z-[400] text-xs backdrop-blur-sm border border-slate-200 pointer-events-none max-w-[200px]">
                 <div className="font-bold mb-2 text-slate-700">Legende</div>
                 {profile?.addressGeo && <div className="flex items-center mb-1"><div className="w-4 h-4 rounded-full mr-2 bg-[#2563eb] border-2 border-white shadow-sm"></div><span>Hofstelle</span></div>}
                 {legendData.grunland.present && <LegendPoly color={legendData.grunland.color} label={legendData.grunland.label} />}
                 {legendData.weide.present && <LegendPoly color={legendData.weide.color} label={legendData.weide.label} />}
                 {legendData.acker.present && <LegendPoly color={legendData.acker.color} label={legendData.acker.label} />}
                 {legendData.div.present && <LegendPoly color={legendData.div.color} label={legendData.div.label} />}
             </div>
         )}

         {selectedField && (
            <FieldDetailView field={selectedField} onClose={() => setSelectedField(null)} onEditGeometry={handleStartEditGeometry} onDelete={handleDeleteField} onUpdate={loadData} />
         )}

         {selectedStorage && (
             <StorageDetailView storage={selectedStorage} onClose={() => setSelectedStorage(null)} />
         )}
    </div>
  );
};

