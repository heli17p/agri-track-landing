
import React, { useState, useEffect, useRef } from 'react';
import { Plus, FileUp, Trash2, ChevronLeft, Save, Search, Filter, AlertTriangle, Map as MapIcon, Layers, Edit2, Tag } from 'lucide-react';
import { dbService, generateId } from '../services/db';
import { Field } from '../types';
import { ImportPage } from './ImportPage';
import { FieldDetailView } from '../components/FieldDetailView';
import { MapContainer, TileLayer, Polygon, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// Helper to auto-zoom map to fit fields with offset for sidebar
const MapBounds = ({ fields, selectedField }: { fields: Field[], selectedField: Field | null }) => {
    const map = useMap();
    
    // Fix map rendering issues (Gray tiles)
    useEffect(() => {
        const t = setTimeout(() => {
            map.invalidateSize();
        }, 250);
        return () => clearTimeout(t);
    }, [map]);

    useEffect(() => {
        // 1. Priority: Zoom to selected field
        if (selectedField && selectedField.boundary.length > 0) {
            const polygon = L.polygon(selectedField.boundary.map(p => [p.lat, p.lng]));
            
            // Berechne Padding (Abstand zum Rand)
            // Wenn Desktop/Tablet (>640px), ist die Sidebar rechts ca. 450px breit.
            const sidebarOffset = window.innerWidth > 640 ? 450 : 0;

            map.fitBounds(polygon.getBounds(), { 
                paddingTopLeft: [50, 50], 
                paddingBottomRight: [50 + sidebarOffset, 50], 
                maxZoom: 15, 
                animate: true,
                duration: 1.0
            });
            return;
        }

        // 2. Zoom to all filtered fields
        const validFields = fields.filter(f => f.boundary.length > 0);
        if (validFields.length > 0) {
            const group = new L.FeatureGroup(
                validFields.map(f => L.polygon(f.boundary.map(p => [p.lat, p.lng])))
            );
            map.fitBounds(group.getBounds(), { 
                padding: [30, 30], 
                maxZoom: 16, 
                animate: true 
            });
        }
    }, [fields, selectedField, map]);

    return null;
};

interface Props {
    onNavigateToMap?: (fieldId: string) => void;
}

export const FieldsPage: React.FC<Props> = ({ onNavigateToMap }) => {
  const [view, setView] = useState<'list' | 'form' | 'import'>('list');
  const [fields, setFields] = useState<Field[]>([]);
  const [editingField, setEditingField] = useState<Partial<Field>>({});
  const [selectedField, setSelectedField] = useState<Field | null>(null);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'All' | 'Grünland' | 'Acker'>('All');
  
  // Map State
  const [mapStyle, setMapStyle] = useState<'standard' | 'satellite'>('standard');

  // 2-Step Delete State for List Item
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadFields();
  }, []);

  const loadFields = async () => {
    const f = await dbService.getFields();
    setFields(f);
  };

  const handleDelete = async (id: string) => {
    if (!id) return;

    if (confirmDeleteId === id) {
        // Second click: Execute Delete
        setFields(prev => prev.filter(f => f.id !== id));
        if (selectedField?.id === id) setSelectedField(null);
        setConfirmDeleteId(null);

        try {
            await dbService.deleteField(id);
            loadFields();
        } catch (e) {
            console.error(e);
            alert("Fehler beim Löschen.");
            loadFields(); 
        }
    } else {
        setConfirmDeleteId(id);
        setTimeout(() => {
             setConfirmDeleteId(prev => prev === id ? null : prev);
        }, 3000);
    }
  };

  const handleEdit = (field: Field) => {
    setEditingField(field);
    setView('form');
  };

  const handleCreate = () => {
    setEditingField({
      id: generateId(),
      name: '',
      areaHa: 0,
      type: 'Grünland',
      usage: '',
      codes: '',
      boundary: []
    });
    setView('form');
  };

  const handleSave = async () => {
    if (!editingField.name || !editingField.id) return;
    await dbService.saveField(editingField as Field);
    setView('list');
    loadFields();
  };

  const handleSaveAndDraw = async () => {
      if (!editingField.name) {
          alert("Bitte zuerst einen Feldnamen eingeben.");
          return;
      }
      
      const fieldToSave = editingField as Field;
      if (!fieldToSave.id) fieldToSave.id = generateId();

      await dbService.saveField(fieldToSave);
      
      if (onNavigateToMap) {
          onNavigateToMap(fieldToSave.id);
      }
  };

  const filteredFields = fields.filter(field => {
    const matchesSearch = 
        field.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        field.usage.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (field.codes && field.codes.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesType = filterType === 'All' || field.type === filterType;
    
    return matchesSearch && matchesType;
  });

  const totalCount = filteredFields.length;
  const totalArea = filteredFields.reduce((sum, f) => sum + (f.areaHa || 0), 0);

  const getFieldColor = (field: Field) => {
      if (selectedField?.id === field.id) return '#3b82f6'; 

      if (field.color) return field.color;
      if (mapStyle === 'satellite') {
        return field.type === 'Acker' ? '#F59E0B' : '#84CC16'; 
      }
      return field.type === 'Acker' ? '#92400E' : '#15803D'; 
  };

  if (view === 'import') {
    return <ImportPage onBack={() => { setView('list'); loadFields(); }} />;
  }

  if (view === 'form') {
    return (
      <div className="flex flex-col h-full bg-white">
        <div className="flex items-center p-4 border-b bg-slate-50">
          <button onClick={() => setView('list')} className="mr-4 text-slate-600">
            <ChevronLeft />
          </button>
          <h2 className="text-xl font-bold">{editingField.name ? 'Feld bearbeiten' : 'Neues Feld'}</h2>
        </div>
        
        <div className="p-4 space-y-4 flex-1 overflow-y-auto pb-20">
          <div>
            <label className="block text-sm font-medium text-slate-700">Feldname <span className="text-red-500">*</span></label>
            <input 
              type="text" 
              value={editingField.name || ''} 
              onChange={e => setEditingField({...editingField, name: e.target.value})}
              className="mt-1 block w-full rounded-md border-slate-300 shadow-sm border p-2"
              placeholder="z.B. Wiese beim Haus"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div>
                <label className="block text-sm font-medium text-slate-700">Fläche (ha)</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={editingField.areaHa || 0} 
                  onChange={e => setEditingField({...editingField, areaHa: parseFloat(e.target.value)})}
                  className="mt-1 block w-full rounded-md border-slate-300 shadow-sm border p-2 bg-slate-50"
                  readOnly
                  title="Wird automatisch berechnet"
                />
             </div>
             <div>
                <label className="block text-sm font-medium text-slate-700">Art</label>
                <select 
                  value={editingField.type || 'Grünland'} 
                  onChange={e => setEditingField({...editingField, type: e.target.value as any})}
                  className="mt-1 block w-full rounded-md border-slate-300 shadow-sm border p-2"
                >
                  <option value="Grünland">Grünland</option>
                  <option value="Acker">Acker</option>
                </select>
             </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Nutzung (SNAR)</label>
              <input 
                type="text" 
                value={editingField.usage || ''} 
                onChange={e => setEditingField({...editingField, usage: e.target.value})}
                className="mt-1 block w-full rounded-md border-slate-300 shadow-sm border p-2"
                placeholder="z.B. Mähwiese"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Codes (eAMA ID)</label>
              <input 
                type="text" 
                value={editingField.codes || ''} 
                onChange={e => setEditingField({...editingField, codes: e.target.value})}
                className="mt-1 block w-full rounded-md border-slate-300 shadow-sm border p-2"
                placeholder="z.B. 12345"
              />
            </div>
          </div>
          
           <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Geometrie</label>
            
            <button 
                onClick={handleSaveAndDraw}
                className="w-full py-3 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg font-bold flex items-center justify-center hover:bg-blue-100 mb-2"
            >
                <MapIcon size={18} className="mr-2" /> 
                {editingField.boundary && editingField.boundary.length > 0 ? 'Geometrie bearbeiten' : 'Speichern & Auf Karte zeichnen'}
            </button>

            <div className="text-xs text-slate-500 text-center">
                {editingField.boundary && editingField.boundary.length > 2 
                    ? `${editingField.boundary.length} Punkte definiert` 
                    : 'Noch keine Geometrie definiert.'}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 mt-4">
            <button onClick={handleSave} className="w-full flex items-center justify-center bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700">
               <Save className="mr-2" size={20}/> Speichern & Schließen
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-50 flex flex-col relative overflow-hidden">
      <div className="h-[40vh] w-full relative bg-slate-200 border-b border-slate-300 shrink-0">
          <MapContainer center={[47.5, 14.5]} zoom={10} style={{ height: '100%', width: '100%' }}>
            <TileLayer 
                attribution='&copy; OpenStreetMap'
                url={mapStyle === 'standard' 
                    ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                }
            />
            <MapBounds fields={filteredFields} selectedField={selectedField} />
            
            {filteredFields.map(f => (
                <Polygon 
                    key={`${f.id}-${f.color || 'default'}-${selectedField?.id === f.id ? 'sel' : ''}`}
                    positions={f.boundary.map(p => [p.lat, p.lng])} 
                    color={getFieldColor(f)}
                    weight={selectedField?.id === f.id ? 3 : 1}
                    fillOpacity={selectedField?.id === f.id ? 0.6 : 0.4}
                    {...{ eventHandlers: {
                        click: () => setSelectedField(f)
                    }} as any}
                >
                    <Popup>{f.name}</Popup>
                </Polygon>
            ))}
          </MapContainer>

          <button 
            onClick={() => setMapStyle(prev => prev === 'standard' ? 'satellite' : 'standard')}
            className="absolute top-2 right-2 z-[400] bg-white/90 p-2 rounded shadow text-slate-700 hover:text-green-600"
         >
            <Layers size={18} />
         </button>
      </div>

      <div className="p-4 bg-white shadow-sm z-10 space-y-3 shrink-0">
        <div className="flex justify-between items-center">
            <div>
                <h1 className="text-xl font-bold text-slate-800 leading-none">Felder</h1>
                <p className="text-xs text-slate-500 font-medium mt-1">
                    {totalCount} Stk. • {totalArea.toFixed(2)} ha
                </p>
            </div>
            <div className="flex space-x-2">
                <button onClick={() => setView('import')} className="p-2 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100">
                    <FileUp size={20} />
                </button>
                <button onClick={handleCreate} className="p-2 bg-green-50 text-green-600 rounded-full hover:bg-green-100">
                    <Plus size={20} />
                </button>
            </div>
        </div>

        <div className="flex space-x-2">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                    type="text" 
                    placeholder="Suchen (Name, Nutzung, Code)..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
            </div>
            <div className="relative">
                 <select 
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value as any)}
                    className="pl-3 pr-8 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 appearance-none focus:outline-none focus:ring-2 focus:ring-green-500"
                 >
                    <option value="All">Alle</option>
                    <option value="Grünland">Grünland</option>
                    <option value="Acker">Acker</option>
                 </select>
                 <Filter className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
            </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-24 bg-slate-50">
        {filteredFields.length === 0 ? (
            <div className="text-center py-10 text-slate-500">
                {fields.length === 0 
                  ? <span>Keine Felder vorhanden.<br/>Importiere Daten oder erstelle ein neues Feld.</span>
                  : <span>Keine Felder gefunden.</span>
                }
            </div>
        ) : (
            filteredFields.map(field => (
                <div 
                  key={field.id} 
                  className={`p-2 rounded-xl shadow-sm flex items-center border transition-all ${
                      selectedField?.id === field.id 
                      ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-200' 
                      : 'bg-white border-transparent hover:border-green-100'
                  }`}
                >
                    <div 
                        onClick={() => setSelectedField(field)}
                        className="flex-1 p-2 cursor-pointer"
                    >
                        <div className="font-bold text-lg truncate flex items-center">
                            {field.name}
                            {field.codes && (
                                <span className="ml-2 px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-mono rounded border border-slate-200 flex items-center shrink-0">
                                    <Tag size={8} className="mr-1"/> {field.codes}
                                </span>
                            )}
                            {selectedField?.id === field.id && <span className="ml-2 w-2 h-2 bg-blue-500 rounded-full animate-pulse shrink-0"></span>}
                        </div>
                        <div className="text-sm text-slate-500 flex items-center space-x-2">
                            <span 
                                className="inline-block w-2.5 h-2.5 rounded-full shadow-sm"
                                style={{ backgroundColor: getFieldColor(field) }}
                            ></span>
                            <span>{field.areaHa.toFixed(2)} ha</span>
                            <span className="text-slate-300">|</span>
                            <span className="truncate">{field.usage}</span>
                        </div>
                    </div>

                    <button 
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleEdit(field);
                        }}
                        className="p-3 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Bearbeiten"
                    >
                        <Edit2 size={20} />
                    </button>

                    <button 
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDelete(field.id);
                        }}
                        className={`p-3 rounded-lg transition-all z-20 relative select-none active:scale-95 ml-2 ${
                            confirmDeleteId === field.id 
                            ? 'bg-red-600 text-white shadow-lg' 
                            : 'text-slate-300 hover:text-red-500 hover:bg-red-50'
                        }`}
                        title="Feld löschen"
                    >
                        {confirmDeleteId === field.id ? <AlertTriangle size={20} /> : <Trash2 size={20} />}
                    </button>
                </div>
            ))
        )}
      </div>

      {selectedField && (
        <FieldDetailView 
            field={selectedField} 
            onClose={() => setSelectedField(null)} 
            onDelete={async (id) => {
                 setSelectedField(null);
                 setFields(prev => prev.filter(f => f.id !== id));
                 await dbService.deleteField(id);
                 await loadFields();
            }}
            onUpdate={async () => {
                await loadFields();
            }}
            onEditGeometry={(field) => {
                 setSelectedField(null);
                 if (onNavigateToMap) onNavigateToMap(field.id);
            }}
        />
      )}
    </div>
  );
};

