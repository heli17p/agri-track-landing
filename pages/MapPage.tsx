
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, Popup, useMap, useMapEvents, Polyline } from 'react-leaflet';
import { Layers, Building2, Save, X, Move, MousePointerClick, Undo2, Trash2, Scissors, Check } from 'lucide-react';
import { dbService, generateId } from '../services/db';
import { Field, StorageLocation, FarmProfile, FertilizerType, GeoPoint } from '../types';
import { FieldDetailView } from '../components/FieldDetailView';
import { StorageDetailView } from '../components/StorageDetailView';
import { calculateArea, splitPolygon } from '../utils/geo';
import L from 'leaflet';

// --- Custom Icons Setup ---
const createCustomIcon = (color: string, svgPath: string) => {
  return L.divIcon({
    className: 'custom-pin-icon',
    html: `
      <div style="
        background-color: ${color};
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 2px solid white;
        box-shadow: 0 3px 8px rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        position: relative;
      ">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          ${svgPath}
        </svg>
        <div style="
          width: 0; 
          height: 0; 
          border-left: 6px solid transparent; 
          border-right: 6px solid transparent; 
          border-top: 8px solid ${color}; 
          position: absolute; 
          bottom: -7px; 
          left: 50%; 
          transform: translateX(-50%);
        "></div>
      </div>
    `,
    iconSize: [32, 40],
    iconAnchor: [16, 40], // Point of the pin
    popupAnchor: [0, -42]
  });
};

const iconPaths = {
  house: '<path d="M3 21h18M5 21V7l8-5 8 5v14"/>',
  droplet: '<path d="M12 22a7 7 0 0 0 7-7c0-2-2-3-2-3l-5-8-5 8s-2 1-2 3a7 7 0 0 0 7 7z"/>',
  layers: '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>'
};

const farmIcon = createCustomIcon('#2563eb', iconPaths.house); // Blue
const slurryIcon = createCustomIcon('#78350f', iconPaths.droplet); // Dark Brown
const manureIcon = createCustomIcon('#d97706', iconPaths.layers); // Orange/Brown

// Simple draggable marker for vertices
const VertexMarker = ({ position, index, onDragEnd, onDelete }: { position: GeoPoint, index: number, onDragEnd: (i: number, lat: number, lng: number) => void, onDelete: (i: number) => void }) => {
    const markerRef = useRef<L.Marker>(null);
    const eventHandlers = useMemo(() => ({
        dragend(e: any) {
             const marker = e.target;
             const { lat, lng } = marker.getLatLng();
             onDragEnd(index, lat, lng);
        },
        click(e: any) {
            L.DomEvent.stopPropagation(e);
            setTimeout(() => onDelete(index), 10);
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
        >
            <Popup offset={[0, -5]} closeButton={false}>
                <div className="text-[10px] text-center font-bold text-red-500">Klicken zum Löschen</div>
            </Popup>
        </Marker>
    );
};

// Specialized Marker for Split Points (Red) that updates live during drag via Refs (Performant)
const SplitPointMarker = ({ 
    position, 
    index, 
    onDrag, 
    onDragEnd 
}: { 
    position: GeoPoint, 
    index: number, 
    onDrag: (i: number, lat: number, lng: number) => void,
    onDragEnd: (i: number, lat: number, lng: number) => void 
}) => {
    const markerRef = useRef<L.Marker>(null);
    
    const eventHandlers = useMemo(() => ({
        drag(e: any) {
             const marker = e.target;
             const { lat, lng } = marker.getLatLng();
             // Direct update for visual line only (no state change)
             onDrag(index, lat, lng);
        },
        dragend(e: any) {
             const marker = e.target;
             const { lat, lng } = marker.getLatLng();
             // Commit to state
             onDragEnd(index, lat, lng);
        }
    }), [index, onDrag, onDragEnd]);

    return (
        <Marker
            draggable={true}
            eventHandlers={eventHandlers}
            position={[position.lat, position.lng]}
            ref={markerRef}
            icon={L.divIcon({
                className: 'split-marker',
                html: `<div style="width: 16px; height: 16px; background: red; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 5px rgba(0,0,0,0.5); cursor: grab;"></div>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            })}
        />
    );
};

// Component to handle map clicks for adding points
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

// Helper to fit bounds
const MapBounds = ({ fields, profile, focusField }: { fields: Field[], profile: FarmProfile | null, focusField?: Field | null }) => {
    const map = useMap();

    // Critical: Force resize calculation when map mounts or tabs switch
    useEffect(() => {
        const t = setTimeout(() => {
            map.invalidateSize();
        }, 200);
        return () => clearTimeout(t);
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
        }
    }, [fields, map, profile, focusField]);
    return null;
};

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

  // Split State
  const [isSplitting, setIsSplitting] = useState(false);
  const [splitPoints, setSplitPoints] = useState<GeoPoint[]>([]);
  
  // Ref to the red dashed polyline to update it imperatively during drag
  const splitLineRef = useRef<L.Polyline>(null);

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
    if (mapStyle === 'satellite') {
      return field.type === 'Acker' ? '#F59E0B' : '#84CC16'; 
    }
    return field.type === 'Acker' ? '#92400E' : '#15803D'; 
  };

  const getStorageIcon = (type: FertilizerType) => {
      return type === FertilizerType.SLURRY ? slurryIcon : manureIcon;
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
      
      setEditingField({
          ...editingField,
          boundary: newBoundary,
          areaHa: newArea
      });
  };

  const handleVertexDelete = (index: number) => {
      if (!editingField || isSplitting) return;
      const newBoundary = editingField.boundary.filter((_, i) => i !== index);
      const newArea = calculateArea(newBoundary);
      setEditingField({
          ...editingField,
          boundary: newBoundary,
          areaHa: newArea
      });
  };

  const handleMapClickAddPoint = (lat: number, lng: number) => {
      if (!editingField) return;
      
      if (isSplitting) {
          if (splitPoints.length < 2) {
              setSplitPoints(prev => [...prev, { lat, lng }]);
          }
      } else {
          const newBoundary = [...editingField.boundary, { lat, lng }];
          const newArea = calculateArea(newBoundary);
          setEditingField({
              ...editingField,
              boundary: newBoundary,
              areaHa: newArea
          });
      }
  };

  // Called continuously during drag - NO STATE UPDATES here to keep 60fps
  const handleSplitPointVisualDrag = (index: number, lat: number, lng: number) => {
      if (splitLineRef.current && splitPoints.length > 0) {
           // Construct temporary array based on current state + dragged position
           const tempPoints = splitPoints.map(p => [p.lat, p.lng]);
           // Ensure the array has space (might be dragging the first point added)
           if (!tempPoints[index]) tempPoints[index] = [lat, lng]; 
           else tempPoints[index] = [lat, lng];

           // If we have 2 points (or are dragging to make the second), update line
           if (tempPoints.length === 2) {
               splitLineRef.current.setLatLngs(tempPoints as [number, number][]);
           }
      }
  };

  // Called on drag end - Commits to React State
  const handleSplitPointDragEnd = (index: number, lat: number, lng: number) => {
      setSplitPoints(prev => {
          const next = [...prev];
          next[index] = { lat, lng };
          return next;
      });
  };

  const handleExecuteSplit = async (e?: React.MouseEvent) => {
      if (e) {
          e.preventDefault();
          e.stopPropagation();
      }

      if (!editingField || splitPoints.length !== 2) return;
      
      try {
          const result = splitPolygon(editingField.boundary, splitPoints[0], splitPoints[1]);
          
          if (!result) {
              alert("Schnitt fehlgeschlagen.\nDie Linie muss das Feld komplett durchqueren (Start und Ende außerhalb).");
              return;
          }

          const [poly1, poly2] = result;
          
          const field1: Field = {
              ...editingField,
              id: generateId(),
              name: `${editingField.name} (Teil 1)`,
              boundary: poly1,
              areaHa: calculateArea(poly1)
          };

          const field2: Field = {
              ...editingField,
              id: generateId(),
              name: `${editingField.name} (Teil 2)`,
              boundary: poly2,
              areaHa: calculateArea(poly2)
          };

          await dbService.saveField(field1);
          await dbService.saveField(field2);
          await dbService.deleteField(editingField.id);

          setIsEditing(false);
          setEditingField(null);
          setSplitPoints([]);
          setIsSplitting(false);
          loadData();
          alert("Feld erfolgreich geteilt!");
      } catch (err) {
          console.error(err);
          alert("Ein Fehler ist aufgetreten.");
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

  const hasAcker = useMemo(() => fields.some(f => f.type === 'Acker'), [fields]);
  const hasGrunland = useMemo(() => fields.some(f => f.type === 'Grünland'), [fields]);
  const hasSlurry = useMemo(() => storages.some(s => s.type === FertilizerType.SLURRY), [storages]);
  const hasManure = useMemo(() => storages.some(s => s.type === FertilizerType.MANURE), [storages]);
  
  const customLegendItems = useMemo(() => {
      const items = new Map<string, {color: string, label: string}>();
      fields.forEach(f => {
          if (f.color) {
              let label = '';
              // Check for DIVNFZ code
              if (f.codes && f.codes.toUpperCase().includes('DIVNFZ')) {
                  label = 'DIVNFZ';
              } 
              // Check for Dauerweide usage
              else if (f.usage && f.usage.toUpperCase().includes('DAUERWEIDE')) {
                  label = 'Dauerweide';
              }
              
              if (label) {
                  const key = `${f.color}-${label}`;
                  items.set(key, { color: f.color, label });
              }
          }
      });
      return Array.from(items.values());
  }, [fields]);

  return (
    <div className="h-full w-full relative bg-slate-200">
         <MapContainer center={[47.5, 14.5]} zoom={7} style={{ height: '100%', width: '100%' }}>
            <TileLayer 
                attribution='&copy; OpenStreetMap'
                url={mapStyle === 'standard' 
                    ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                }
            />
            
            <MapBounds fields={fields} profile={profile} focusField={editingField} />
            <MapClickHandler isEditing={isEditing} splitMode={isSplitting} onMapClick={handleMapClickAddPoint} />

            {/* Farm Location */}
            {profile?.addressGeo && !isEditing && (
                <Marker position={[profile.addressGeo.lat, profile.addressGeo.lng]} icon={farmIcon}>
                    <Popup>
                        <div className="flex items-center space-x-2">
                             <Building2 size={16} className="text-blue-600"/>
                             <div><strong>Hof / Betrieb</strong><br/>{profile.operatorName}</div>
                        </div>
                    </Popup>
                </Marker>
            )}

            {/* Standard Fields */}
            {fields.map(f => {
                if (isEditing && editingField?.id === f.id) return null; 
                return (
                    <Polygon 
                        key={`${f.id}-${f.color || 'default'}-${mapStyle}`} 
                        positions={f.boundary.map(p => [p.lat, p.lng])} 
                        color={getFieldColor(f)}
                        weight={2}
                        fillOpacity={0.5}
                        eventHandlers={{
                            click: (e) => {
                                if (isEditing) return;
                                L.DomEvent.stopPropagation(e);
                                setSelectedField(f);
                            }
                        }}
                    >
                      <Popup>
                        <div className="font-bold">{f.name}</div>
                        <div className="text-xs">{f.areaHa.toFixed(2)} ha | {f.type}</div>
                      </Popup>
                    </Polygon>
                );
            })}

            {/* EDIT MODE */}
            {isEditing && editingField && (
                <>
                    <Polygon 
                         positions={editingField.boundary.map(p => [p.lat, p.lng])}
                         pathOptions={{ color: '#2563eb', dashArray: '5, 10', weight: 3, fillOpacity: 0.2 }}
                    />
                    
                    {/* Vertices */}
                    {!isSplitting && editingField.boundary.map((p, i) => (
                        <VertexMarker 
                            key={`vertex-${i}`} 
                            index={i} 
                            position={p} 
                            onDragEnd={handleVertexDragEnd}
                            onDelete={handleVertexDelete}
                        />
                    ))}

                    {/* Split Line */}
                    {isSplitting && splitPoints.length > 0 && (
                        <>
                           {splitPoints.map((p, i) => (
                               <SplitPointMarker 
                                key={`split-p-${i}`} 
                                index={i}
                                position={p} 
                                onDrag={handleSplitPointVisualDrag}
                                onDragEnd={handleSplitPointDragEnd}
                               />
                           ))}
                           {splitPoints.length === 2 && (
                               <Polyline 
                                   ref={splitLineRef}
                                   positions={splitPoints.map(p => [p.lat, p.lng])}
                                   pathOptions={{ color: 'red', dashArray: '5, 5', weight: 3 }}
                               />
                           )}
                        </>
                    )}
                </>
            )}

            {/* Storages */}
            {!isEditing && storages.map(s => (
                <Marker 
                    key={s.id} 
                    position={[s.geo.lat, s.geo.lng]}
                    icon={getStorageIcon(s.type)}
                    eventHandlers={{
                        click: (e) => {
                            L.DomEvent.stopPropagation(e);
                            setSelectedStorage(s);
                        }
                    }}
                />
            ))}
         </MapContainer>

         <div className="absolute top-4 right-4 flex flex-col space-y-2 z-[400]">
            <button 
                onClick={() => setMapStyle(prev => prev === 'standard' ? 'satellite' : 'standard')}
                className="bg-white p-3 rounded-xl shadow-lg border border-slate-200 text-slate-700 hover:text-green-600"
            >
                <Layers size={24} />
            </button>
         </div>

         {/* EDIT UI */}
         {isEditing && editingField && (
             <div className="absolute top-4 left-4 right-16 z-[500] bg-white/95 backdrop-blur p-4 rounded-xl shadow-xl border-2 border-blue-500 animate-in fade-in slide-in-from-top-4">
                 <div className="flex justify-between items-center mb-2">
                     <h3 className="font-bold text-blue-800 flex items-center">
                         {isSplitting ? <Scissors size={18} className="mr-2 text-red-600"/> : <Move size={18} className="mr-2"/>}
                         {isSplitting ? 'Feld teilen' : 'Geometrie bearbeiten'}
                     </h3>
                     <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-bold">
                         {editingField.areaHa.toFixed(4)} ha
                     </span>
                 </div>
                 
                 <p className="text-xs text-slate-600 mb-4 flex flex-col space-y-1">
                     {!isSplitting ? (
                        <>
                             <span className="flex items-center"><MousePointerClick size={14} className="mr-1"/> Karte klicken für neuen Punkt.</span>
                             <span className="flex items-center"><Trash2 size={14} className="mr-1"/> Punkt anklicken zum Löschen.</span>
                             <span className="flex items-center"><Move size={14} className="mr-1"/> Punkte ziehen.</span>
                        </>
                     ) : (
                        <>
                             <span className="flex items-center text-red-600 font-bold"><MousePointerClick size={14} className="mr-1"/> 2 Punkte setzen für Schnittlinie.</span>
                             <span className="flex items-center text-red-600 font-bold"><Move size={14} className="mr-1"/> Rote Punkte verschiebbar.</span>
                        </>
                     )}
                 </p>

                 {isSplitting && splitPoints.length === 2 && (
                     <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
                         <span className="text-xs font-bold text-red-700">Bereit zum Teilen?</span>
                         <button 
                            type="button"
                            onClick={handleExecuteSplit}
                            className="px-3 py-1 bg-red-600 text-white text-xs font-bold rounded flex items-center hover:bg-red-700 shadow cursor-pointer z-[600]"
                         >
                             <Check size={12} className="mr-1"/> Schnitt ausführen
                         </button>
                     </div>
                 )}

                 <div className="flex space-x-2">
                     {!isSplitting ? (
                         <button 
                            onClick={() => { setIsSplitting(true); setSplitPoints([]); }}
                            className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg font-bold flex items-center justify-center hover:bg-red-50 hover:text-red-600 border border-transparent hover:border-red-200"
                            title="Feld teilen"
                         >
                            <Scissors size={18} />
                         </button>
                     ) : (
                         <button 
                            onClick={() => { setIsSplitting(false); setSplitPoints([]); }}
                            className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg font-bold flex items-center justify-center hover:bg-slate-200"
                            title="Zurück zum Bearbeiten"
                         >
                            <Undo2 size={18} />
                         </button>
                     )}

                     <button onClick={cancelEdit} className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-lg font-bold flex items-center justify-center hover:bg-slate-200">
                         <X size={18} className="mr-1"/> Abbrechen
                     </button>
                     
                     {!isSplitting && (
                         <button onClick={saveGeometry} className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-bold flex items-center justify-center hover:bg-blue-700 shadow-lg shadow-blue-200">
                             <Save size={18} className="mr-1"/> Speichern
                         </button>
                     )}
                 </div>
             </div>
         )}

         {!isEditing && (
             <div className="absolute bottom-20 left-4 bg-white/90 p-3 rounded-lg shadow-lg z-[400] text-xs backdrop-blur-sm border border-slate-200">
                 <div className="font-bold mb-2 text-slate-700">Legende</div>
                 {hasGrunland && <div className="flex items-center mb-1"><span className="w-3 h-3 rounded-sm mr-2" style={{background: mapStyle === 'satellite' ? '#84CC16' : '#15803D'}}></span><span>Grünland</span></div>}
                 {hasAcker && <div className="flex items-center mb-1"><span className="w-3 h-3 rounded-sm mr-2" style={{background: mapStyle === 'satellite' ? '#F59E0B' : '#92400E'}}></span><span>Acker</span></div>}
                 
                 {customLegendItems.map((item) => (
                     <div key={`${item.color}-${item.label}`} className="flex items-center mb-1">
                         <span className="w-3 h-3 rounded-sm mr-2 border border-slate-300" style={{background: item.color}}></span>
                         <span>{item.label}</span>
                     </div>
                 ))}

                 {hasSlurry && (
                    <div className="flex items-center mb-1">
                        <span className="w-3 h-3 rounded-full mr-2 bg-[#78350f] border border-white"></span>
                        <span>Gülle Lager</span>
                    </div>
                 )}
                 {hasManure && (
                    <div className="flex items-center mb-1">
                        <span className="w-3 h-3 rounded-full mr-2 bg-[#d97706] border border-white"></span>
                        <span>Mist Lager</span>
                    </div>
                 )}

                 {profile?.addressGeo && <div className="flex items-center mb-1"><span className="w-3 h-3 rounded-full mr-2 bg-blue-600 border border-white"></span><span>Hof</span></div>}
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
