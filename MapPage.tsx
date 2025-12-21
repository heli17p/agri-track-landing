import React, { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, Popup, useMap, useMapEvents, Polyline } from 'react-leaflet';
import { Layers, Building2, Save, X, Move, MousePointerClick, Undo2, Trash2, Scissors, Check, LocateFixed } from 'lucide-react';
import { dbService, generateId } from '../services/db';
import { Field, StorageLocation, FarmProfile, FertilizerType, GeoPoint } from '../types';
import { FieldDetailView } from '../components/FieldDetailView';
import { StorageDetailView } from '../components/StorageDetailView';
import { calculateArea, splitPolygon } from '../utils/geo';
import L from 'leaflet';

import 'leaflet/dist/leaflet.css';

// --- CENTRAL COLOR CONFIGURATION (DEFAULTS) ---
const MAP_COLORS = {
    standard: {
        acker: '#92400E',    // Amber-900 (Brown)
        weide: '#65a30d',    // Lime-600 (Distinct lighter green)
        grunland: '#15803D', // Green-700 (Dark Green)
        div: '#EAB308',      // Yellow-500 (Light Yellow)
        hof: '#2563eb'       // Blue-600
    },
    satellite: {
        acker: '#F59E0B',    // Amber-500 (Orange/Yellow)
        weide: '#BEF264',    // Lime-200 (Very Light Green/Yellowish)
        grunland: '#84CC16', // Lime-500 (Standard Green)
        div: '#FEF08A',      // Yellow-200 (Very Light Yellow/Cream)
        hof: '#3b82f6'       // Blue-500
    }
};

// ... (Custom Icons Code - Same as before) ...
const createCustomIcon = (color: string, svgPath: string) => {
  return L.divIcon({
    className: 'custom-pin-icon',
    html: `<div style="background-color: ${color}; width: 32px; height: 32px; border-radius: 50%; border: 2px solid white; box-shadow: 0 3px 8px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: white; position: relative;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg><div style="width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid ${color}; position: absolute; bottom: -7px; left: 50%; transform: translateX(-50%);"></div></div>`,
    iconSize: [32, 40],
    iconAnchor: [16, 40], 
    popupAnchor: [0, -42]
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

const MapClickHandler = ({ isEditing, splitMode, onMapClick }: { isEditing: boolean, splitMode: boolean, onMapClick: (lat: number, lng: number) => void }) => {
    useMapEvents({
        click(e) {
            if (isEditing) {
                onMapClick(e.latlng.lat, e.latlng.lng);
            }
        }
    });
    return null;
};

// FIX: Improved Map Bounds with ResizeObserver
const MapBounds = ({ fields, profile, focusField }: { fields: Field[], profile: FarmProfile | null, focusField?: Field | null }) => {
    const map = useMap();

    // Use ResizeObserver to detect container changes
    useEffect(() => {
        const container = map.getContainer();
        const observer = new ResizeObserver(() => {
            map.invalidateSize();
        });
        observer.observe(container);
        
        // Initial force
        map.invalidateSize();

        return () => observer.disconnect();
    }, [map]);

    useEffect(() => {
        if (focusField && focusField.boundary.length > 0) {
             const polygon = L.polygon(focusField.boundary.map(p => [p.lat, p.lng]));
             try {
                map.fitBounds(polygon.getBounds(), { padding: [50, 50], maxZoom: 18 });
             } catch(e) {}
             return;
        }

        const layers = [];
        if (fields.length > 0) {
            fields.forEach(f => {
                if(f.boundary.length > 0) {
                     layers.push(L.polygon(f.boundary.map(p => [p.lat, p.lng])));
                }
            });
        }
        
        if (profile?.addressGeo) {
             layers.push(L.marker([profile.addressGeo.lat, profile.addressGeo.lng]));
        }

        if (layers.length > 0) {
            const group = new L.FeatureGroup(layers);
            try {
                map.fitBounds(group.getBounds(), { padding: [50, 50] });
            } catch(e) {}
        } else {
            map.setView([47.5, 14.5], 7);
        }
    }, [fields, map, profile, focusField]);
    return null;
};

// Helper for Legend Items to match Map Polygon visual style
const LegendPoly = ({ color, label }: { color: string, label: string }) => (
    <div className="flex items-center mb-1">
        <div className="relative w-4 h-4 mr-2 shadow-sm rounded-sm overflow-hidden">
            {/* Fill matching map fillOpacity=0.5 */}
            <div className="absolute inset-0" style={{ backgroundColor: color, opacity: 0.5 }}></div>
            {/* Stroke matching map weight */}
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

  // Editing State
  const [isEditing, setIsEditing] = useState(false);
  const [editingField, setEditingField] = useState<Field | null>(null);
  const [isSplitting, setIsSplitting] = useState(false);
  const [splitPoints, setSplitPoints] = useState<GeoPoint[]>([]);
  
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const f = await dbService.getFields();
    setFields(f);
    setStorages(await dbService.getStorageLocations());
    const p = await dbService.getFarmProfile();
    if (p.length > 0) setProfile(p[0]);

    if (initialEditFieldId) {
        const target = f.find(field => field.id === initialEditFieldId);
        if (target) {
            setEditingField({ ...target });
            setIsEditing(true);
        }
        if (clearInitialEdit) clearInitialEdit();
    }
  };

  const getFieldColor = (field: Field) => {
    if (field.color) return field.color;
    
    const usage = field.usage?.toUpperCase() || '';
    const name = field.name.toUpperCase();
    const colors = mapStyle === 'satellite' ? MAP_COLORS.satellite : MAP_COLORS.standard;

    // Check for DIV / Miscellaneous
    if (usage.includes('DIV') || name.includes('DIV')) {
        return colors.div;
    }
    
    // Check if it is pasture (Weide)
    const isWeide = usage.includes('WEIDE') || name.includes('WEIDE');

    if (field.type === 'Acker') return colors.acker;
    if (isWeide) return colors.weide;
    return colors.grunland; // Default Grunland
  };

  const handleStartEditGeometry = (field: Field) => {
      setSelectedField(null);
      setEditingField({ ...field });
      setIsEditing(true);
      setIsSplitting(false);
      setSplitPoints([]);
  };

  const handleVertexDragEnd = (index: number, lat: number, lng: number) => {
      if (!editingField || isSplitting) return;
      const newBoundary = [...editingField.boundary];
      newBoundary[index] = { lat, lng };
      const newArea = calculateArea(newBoundary);
      setEditingField({ ...editingField, boundary: newBoundary, areaHa: newArea });
  };

  const handleVertexDelete = (index: number) => {
      if (!editingField || isSplitting) return;
      const newBoundary = editingField.boundary.filter((_, i) => i !== index);
      const newArea = calculateArea(newBoundary);
      setEditingField({ ...editingField, boundary: newBoundary, areaHa: newArea });
  };

  const handleMapClickAddPoint = (lat: number, lng: number) => {
      if (!editingField) return;
      if (isSplitting) {
          if (splitPoints.length < 2) setSplitPoints(prev => [...prev, { lat, lng }]);
      } else {
          const newBoundary = [...editingField.boundary, { lat, lng }];
          const newArea = calculateArea(newBoundary);
          setEditingField({ ...editingField, boundary: newBoundary, areaHa: newArea });
      }
  };

  const saveGeometry = async () => {
      if (!editingField) return;
      await dbService.saveField(editingField);
      setIsEditing(false);
      setEditingField(null);
      loadData();
  };

  const handleDeleteField = async (id: string) => {
      setSelectedField(null);
      await dbService.deleteField(id);
      loadData();
  };

  const cancelEdit = () => {
      setIsEditing(false);
      setEditingField(null);
      setIsSplitting(false);
      setSplitPoints([]);
  };
  
  // --- DYNAMIC LEGEND LOGIC ---
  const legendData = useMemo(() => {
      const colors = mapStyle === 'satellite' ? MAP_COLORS.satellite : MAP_COLORS.standard;
      const data = {
          grunland: { label: 'Grünland (Mähwiese)', color: colors.grunland, present: false },
          weide: { label: 'Dauerweide', color: colors.weide, present: false },
          acker: { label: 'Acker', color: colors.acker, present: false },
          div: { label: 'Div. Flächen (DIVNFZ)', color: colors.div, present: false }
      };

      fields.forEach(f => {
          const usage = f.usage?.toUpperCase() || '';
          const name = f.name.toUpperCase();
          const displayColor = getFieldColor(f); // This includes custom colors!

          // Detect type and assign the ACTUAL color used (overwriting default if custom is set)
          if (usage.includes('DIV') || name.includes('DIV')) {
              data.div.present = true;
              data.div.color = displayColor;
          } else if (f.type === 'Grünland' && (usage.includes('WEIDE') || name.includes('WEIDE'))) {
              data.weide.present = true;
              data.weide.color = displayColor;
          } else if (f.type === 'Acker') {
              data.acker.present = true;
              data.acker.color = displayColor;
          } else if (f.type === 'Grünland') {
              data.grunland.present = true;
              data.grunland.color = displayColor;
          }
      });

      return data;
  }, [fields, mapStyle]); // Re-calculate when fields or style changes

  const hasSlurry = useMemo(() => storages.some(s => s.type === FertilizerType.SLURRY), [storages]);
  const hasManure = useMemo(() => storages.some(s => s.type === FertilizerType.MANURE), [storages]);

  return (
    // FIX: Using full height relative container and min-height fallback
    <div className="h-full w-full relative bg-slate-900 min-h-[600px]">
         
         {/* FIX: Absolute Map Container to force fill */}
         <div className="absolute inset-0 z-0">
             {/* KEY forces remount on tab switch if needed */}
             <MapContainer key="map-page-main" center={[47.5, 14.5]} zoom={7} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                <TileLayer 
                    attribution='&copy; OpenStreetMap'
                    url={mapStyle === 'standard' 
                        ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    }
                />
                
                <MapBounds fields={fields} profile={profile} focusField={editingField} />
                <MapClickHandler isEditing={isEditing} splitMode={isSplitting} onMapClick={handleMapClickAddPoint} />

                {profile?.addressGeo && !isEditing && (
                    <Marker 
                        position={[profile.addressGeo.lat, profile.addressGeo.lng]} 
                        icon={farmIcon}
                        {...{ eventHandlers: {} } as any}
                    >
                        <Popup>
                            <div className="flex items-center space-x-2">
                                <Building2 size={16} className="text-blue-600"/>
                                <div><strong>Hof / Betrieb</strong><br/>{profile.operatorName}</div>
                            </div>
                        </Popup>
                    </Marker>
                )}

                {fields.map(f => {
                    if (isEditing && editingField?.id === f.id) return null; 
                    return (
                        <Polygon 
                            key={`${f.id}-${f.color || 'default'}-${mapStyle}`} 
                            positions={f.boundary.map(p => [p.lat, p.lng])} 
                            color={getFieldColor(f)}
                            weight={2}
                            fillOpacity={0.5}
                            {...{ eventHandlers: {
                                click: (e: any) => {
                                    if (isEditing) return;
                                    L.DomEvent.stopPropagation(e);
                                    setSelectedField(f);
                                }
                            }} as any}
                        >
                          <Popup>
                            <div className="font-bold">{f.name}</div>
                            <div className="text-xs">{f.areaHa.toFixed(2)} ha | {f.usage || f.type}</div>
                          </Popup>
                        </Polygon>
                    );
                })}

                {isEditing && editingField && (
                    <>
                        <Polygon 
                            positions={editingField.boundary.map(p => [p.lat, p.lng])}
                            {...{ pathOptions: { color: '#2563eb', dashArray: '5, 10', weight: 3, fillOpacity: 0.2 } } as any}
                        />
                        {!isSplitting && editingField.boundary.map((p, i) => (
                            <VertexMarker 
                                key={`vertex-${i}`} 
                                index={i} 
                                position={p} 
                                onDragEnd={handleVertexDragEnd}
                                onDelete={handleVertexDelete}
                            />
                        ))}
                    </>
                )}

                {!isEditing && storages.map(s => (
                    <Marker 
                        key={s.id} 
                        position={[s.geo.lat, s.geo.lng]}
                        icon={s.type === FertilizerType.SLURRY ? slurryIcon : manureIcon}
                        {...{ eventHandlers: {
                            click: (e: any) => {
                                L.DomEvent.stopPropagation(e);
                                setSelectedStorage(s);
                            }
                        }} as any}
                    />
                ))}
             </MapContainer>
         </div>

         {/* Map Controls */}
         <div className="absolute top-4 right-4 flex flex-col space-y-2 z-[400] pointer-events-auto">
            <button 
                onClick={() => setMapStyle(prev => prev === 'standard' ? 'satellite' : 'standard')}
                className="bg-white p-3 rounded-xl shadow-lg border border-slate-200 text-slate-700 hover:text-green-600"
                title="Karte / Satellit wechseln"
            >
                <Layers size={24} />
            </button>
            <button 
                onClick={() => {
                    navigator.geolocation.getCurrentPosition(pos => {
                        alert(`Position: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
                    });
                }}
                className="bg-white p-3 rounded-xl shadow-lg border border-slate-200 text-slate-700 hover:text-blue-600"
                title="Mein Standort"
            >
                <LocateFixed size={24} />
            </button>
         </div>

         {/* EDIT UI OVERLAY */}
         {isEditing && editingField && (
             <div className="absolute top-4 left-4 right-16 z-[500] bg-white/95 backdrop-blur p-4 rounded-xl shadow-xl border-2 border-blue-500">
                 <div className="flex justify-between items-center mb-2">
                     <h3 className="font-bold text-blue-800 flex items-center">
                         <Move size={18} className="mr-2"/> Geometrie bearbeiten
                     </h3>
                     <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-bold">
                         {editingField.areaHa.toFixed(4)} ha
                     </span>
                 </div>
                 
                 <p className="text-xs text-slate-600 mb-4">
                     Punkte ziehen zum Verschieben. Klick auf Karte für neue Punkte. Klick auf Punkt zum Löschen.
                 </p>

                 <div className="flex space-x-2">
                     <button onClick={cancelEdit} className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-lg font-bold flex items-center justify-center hover:bg-slate-200">
                         <X size={18} className="mr-1"/> Abbrechen
                     </button>
                     <button onClick={saveGeometry} className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-bold flex items-center justify-center hover:bg-blue-700 shadow-lg">
                         <Save size={18} className="mr-1"/> Speichern
                     </button>
                 </div>
             </div>
         )}

         {/* LEGEND - Moved to Top Left to avoid bottom nav overlap */}
         {!isEditing && (
             <div className="absolute top-4 left-4 bg-white/90 p-3 rounded-lg shadow-lg z-[400] text-xs backdrop-blur-sm border border-slate-200 pointer-events-none max-w-[200px]">
                 <div className="font-bold mb-2 text-slate-700">Legende</div>
                 
                 {/* Farm House */}
                 {profile?.addressGeo && (
                     <div className="flex items-center mb-1">
                         <div className="w-4 h-4 rounded-full mr-2 bg-[#2563eb] border-2 border-white shadow-sm flex items-center justify-center">
                             <div className="w-1 h-1 bg-white rounded-full opacity-50"></div>
                         </div>
                         <span>Hofstelle</span>
                     </div>
                 )}

                 {/* Dynamic Field Categories */}
                 {legendData.grunland.present && <LegendPoly color={legendData.grunland.color} label={legendData.grunland.label} />}
                 {legendData.weide.present && <LegendPoly color={legendData.weide.color} label={legendData.weide.label} />}
                 {legendData.acker.present && <LegendPoly color={legendData.acker.color} label={legendData.acker.label} />}
                 {legendData.div.present && <LegendPoly color={legendData.div.color} label={legendData.div.label} />}

                 {/* Separator if both exist */}
                 {(legendData.grunland.present || legendData.acker.present || legendData.weide.present || legendData.div.present) && (hasSlurry || hasManure) && <div className="h-px bg-slate-200 my-2"></div>}

                 {/* Storage Types - Distinct Colors */}
                 {hasSlurry && (
                     <div className="flex items-center mb-1">
                         <div className="w-4 h-4 rounded-full mr-2 bg-[#78350f] border-2 border-white shadow-sm flex items-center justify-center">
                             <div className="w-1 h-1 bg-white rounded-full opacity-50"></div>
                         </div>
                         <span>Gülle Lager</span>
                     </div>
                 )}
                 {hasManure && (
                     <div className="flex items-center mb-1">
                         <div className="w-4 h-4 rounded-full mr-2 bg-[#d97706] border-2 border-white shadow-sm flex items-center justify-center">
                             <div className="w-1 h-1 bg-white rounded-full opacity-50"></div>
                         </div>
                         <span>Mist Lager</span>
                     </div>
                 )}
             </div>
         )}

         {selectedField && (
            <FieldDetailView 
                field={selectedField} 
                onClose={() => setSelectedField(null)}
                onEditGeometry={handleStartEditGeometry} 
                onDelete={handleDeleteField}
                onUpdate={loadData}
            />
         )}

         {selectedStorage && (
             <StorageDetailView
                storage={selectedStorage}
                onClose={() => setSelectedStorage(null)}
             />
         )}
    </div>
  );
};

