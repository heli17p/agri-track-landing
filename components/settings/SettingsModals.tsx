
import React, { useState, useEffect } from 'react';
/* Added Droplets to imports */
import { X, Terminal, User, Search, Trash2, AlertTriangle, Database, Layers, TrendingUp, MapPin, Droplets } from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { StorageLocation, FertilizerType, FarmProfile } from '../../types';

// Icons für den Map-Picker innerhalb des Modals
const createCustomIcon = (color: string, path: string) => L.divIcon({ 
    className: 'custom-pin', 
    html: `<div style="background-color: ${color}; width: 32px; height: 32px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 2px 5px rgba(0,0,0,0.2);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${path}</svg></div>`, 
    iconSize: [32, 32], 
    iconAnchor: [16, 16] 
});
const slurryIcon = createCustomIcon('#78350f', '<path d="M12 22a7 7 0 0 0 7-7c0-2-2-3-2-3l-5-8-5 8s-2 1-2 3a7 7 0 0 0 7 7z"/>');
const manureIcon = createCustomIcon('#d97706', '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>');

const LocationPickerMap = ({ position, onPick, icon, mapStyle }: any) => {
    const map = useMap();
    useEffect(() => { 
        setTimeout(() => map.invalidateSize(), 200); 
        if (position) map.setView(position, map.getZoom() || 15); 
    }, [map, position]);
    
    useMapEvents({ click(e) { onPick(e.latlng.lat, e.latlng.lng); } });
    
    return (
        <>
            <TileLayer 
                url={mapStyle === 'standard' 
                    ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                } 
            />
            {position && <Marker draggable={true} eventHandlers={{ dragend(e) { onPick(e.target.getLatLng().lat, e.target.getLatLng().lng); } }} position={position} icon={icon} />}
        </>
    );
};

interface StorageEditProps {
    storage: StorageLocation;
    setStorage: (s: StorageLocation) => void;
    onSave: () => void;
    onDelete: (id: string) => void;
    onClose: () => void;
}

export const StorageEditModal: React.FC<StorageEditProps> = ({ storage, setStorage, onSave, onDelete, onClose }) => {
    const [mapStyle, setMapStyle] = useState<'standard' | 'satellite'>('standard');

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                <div className="p-5 bg-slate-800 text-white flex justify-between items-center shrink-0">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-white/10 rounded-lg">
                            <Database size={20} className="text-amber-400" />
                        </div>
                        <h3 className="font-bold">Lager konfigurieren</h3>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition-colors"><X size={24}/></button>
                </div>

                <div className="p-6 overflow-y-auto space-y-5">
                    {/* Name & Typ */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Bezeichnung</label>
                            <input 
                                type="text" 
                                value={storage.name} 
                                onChange={e => setStorage({...storage, name: e.target.value})} 
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-green-500 transition-all" 
                                placeholder="z.B. Hauptgrube Hof" 
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Lager-Inhalt (Typ)</label>
                            <div className="flex space-x-2">
                                <button 
                                    onClick={() => setStorage({...storage, type: FertilizerType.SLURRY})}
                                    className={`flex-1 py-3 rounded-2xl border-2 font-bold flex items-center justify-center transition-all ${storage.type === FertilizerType.SLURRY ? 'bg-amber-50 border-amber-600 text-amber-900 shadow-sm' : 'bg-white border-slate-100 text-slate-400 grayscale'}`}
                                >
                                    <Droplets size={18} className="mr-2"/> Gülle
                                </button>
                                <button 
                                    onClick={() => setStorage({...storage, type: FertilizerType.MANURE})}
                                    className={`flex-1 py-3 rounded-2xl border-2 font-bold flex items-center justify-center transition-all ${storage.type === FertilizerType.MANURE ? 'bg-orange-50 border-orange-600 text-orange-900 shadow-sm' : 'bg-white border-slate-100 text-slate-400 grayscale'}`}
                                >
                                    <Layers size={18} className="mr-2"/> Mist
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Kapazität & Stand */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Max. Kapazität (m³)</label>
                            <input 
                                type="number" 
                                value={storage.capacity} 
                                onChange={e => setStorage({...storage, capacity: parseFloat(e.target.value) || 0})} 
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg outline-none" 
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Aktueller Stand (m³)</label>
                            <input 
                                type="number" 
                                value={storage.currentLevel} 
                                onChange={e => setStorage({...storage, currentLevel: parseFloat(e.target.value) || 0})} 
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg text-green-700 outline-none" 
                            />
                        </div>
                    </div>

                    {/* Zuwachs */}
                    <div className="bg-green-50/50 p-4 rounded-2xl border border-green-100">
                        <label className="flex items-center text-[10px] font-black text-green-700 uppercase tracking-widest mb-2 ml-1">
                            <TrendingUp size={12} className="mr-1.5"/> Täglicher Zuwachs (m³)
                        </label>
                        <input 
                            type="number" 
                            step="0.1"
                            value={storage.dailyGrowth} 
                            onChange={e => setStorage({...storage, dailyGrowth: parseFloat(e.target.value) || 0})} 
                            className="w-full p-3 bg-white border border-green-200 rounded-xl font-bold text-green-800 outline-none focus:ring-2 focus:ring-green-500" 
                        />
                        <p className="text-[9px] text-green-600 mt-2 font-medium italic">Die App berechnet automatisch den Stand basierend auf diesem Wert.</p>
                    </div>

                    {/* Map Picker */}
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Standort (für Fuhren-Automatik)</label>
                        <div className="h-40 rounded-2xl overflow-hidden border-2 border-slate-100 relative shadow-inner">
                            <MapContainer center={storage.geo} zoom={15} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                                <LocationPickerMap 
                                    position={storage.geo} 
                                    mapStyle={mapStyle}
                                    onPick={(lat: any, lng: any) => setStorage({...storage, geo: { lat, lng }})} 
                                    icon={storage.type === FertilizerType.SLURRY ? slurryIcon : manureIcon}
                                />
                            </MapContainer>
                            
                            {/* Satellite Toggle Button */}
                            <button 
                                onClick={(e) => { e.preventDefault(); setMapStyle(prev => prev === 'standard' ? 'satellite' : 'standard'); }}
                                className="absolute top-2 right-2 z-[400] bg-white/90 p-2 rounded-lg shadow-sm border border-slate-200 text-slate-700 hover:text-green-600 transition-colors"
                                title="Ansicht umschalten"
                            >
                                <Layers size={14} />
                            </button>

                            <div className="absolute bottom-2 right-2 z-[400] bg-white/90 px-2 py-1 rounded-lg text-[10px] font-bold text-slate-500 shadow-sm border border-slate-200 flex items-center">
                                <MapPin size={10} className="mr-1"/> Marker ziehen
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col space-y-3">
                    <button 
                        onClick={onSave} 
                        className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black shadow-lg shadow-slate-200 active:scale-95 transition-all flex items-center justify-center"
                    >
                        Speichern
                    </button>
                    <button 
                        onClick={() => onDelete(storage.id)}
                        className="w-full py-2 text-red-500 font-bold text-xs uppercase tracking-widest hover:bg-red-50 rounded-xl transition-colors"
                    >
                        Lager löschen
                    </button>
                </div>
            </div>
        </div>
    );
};

interface DiagnoseProps {
    show: boolean;
    onClose: () => void;
    activeDiagTab: string;
    setActiveDiagTab: (tab: string) => void;
    userInfo: any;
    cloudStats: any;
    logs: string[];
    inspectorData: any;
    inspectorLoading: boolean;
    runInspector: () => void;
    conflicts: any[];
    conflictsLoading: boolean;
    conflictSearchId: string;
    setConflictSearchId: (id: string) => void;
    loadConflicts: () => void;
    deleteConflict: (id: string) => void;
    handleForceDeleteFarm: () => void;
    handlePingTest: () => void;
    handleHardReset: () => void;
    isUploading: boolean;
    uploadProgress: { status: string, percent: number };
}

export const DiagnosticModal: React.FC<DiagnoseProps> = (props) => {
  if (!props.show) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg h-[80vh] flex flex-col overflow-hidden">
            <div className="p-4 bg-slate-800 text-white flex justify-between items-center shrink-0">
                <h3 className="font-bold flex items-center"><Terminal size={18} className="mr-2"/> System Diagnose</h3>
                <button onClick={props.onClose}><X size={20}/></button>
            </div>
            
            <div className="flex border-b border-slate-200 bg-slate-50 overflow-x-auto hide-scrollbar">
                {['status', 'logs', 'inspector', 'conflicts'].map(tab => (
                    <button 
                        key={tab}
                        onClick={() => {
                            props.setActiveDiagTab(tab);
                            if (tab === 'inspector') props.runInspector();
                            if (tab === 'conflicts') props.loadConflicts();
                        }}
                        className={`flex-1 min-w-[70px] py-3 text-xs font-bold capitalize ${props.activeDiagTab === tab ? 'bg-white border-b-2 border-blue-500 text-blue-600' : 'text-slate-500 hover:bg-slate-100'}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-slate-50 font-mono text-xs">
                {props.activeDiagTab === 'status' && (
                    <div className="space-y-4">
                        <div className="bg-white p-4 rounded border border-slate-200 shadow-sm">
                            <h4 className="font-bold text-slate-800 mb-3 text-sm flex items-center"><User size={14} className="mr-2"/> Benutzer</h4>
                            <div className="space-y-2">
                                <div className="flex justify-between border-b border-slate-100 pb-1"><span>Status:</span><span className={props.userInfo?.status === 'Eingeloggt' ? 'text-green-600' : 'text-red-500'}>{props.userInfo?.status}</span></div>
                                <div className="flex justify-between border-b border-slate-100 pb-1"><span>E-Mail:</span><span className="font-bold">{props.userInfo?.email || '-'}</span></div>
                                <div className="bg-slate-100 p-2 rounded text-[10px] break-all border border-slate-200 font-bold">{props.userInfo?.uid || '-'}</div>
                            </div>
                        </div>
                        <button onClick={props.handlePingTest} disabled={props.isUploading} className="w-full py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded font-bold">Verbindungstest (Ping)</button>
                    </div>
                )}

                {props.activeDiagTab === 'logs' && (
                    <div className="bg-black text-green-400 p-3 rounded h-full overflow-y-auto whitespace-pre-wrap">
                        {props.logs.length === 0 ? "Keine Logs." : props.logs.join('\n')}
                    </div>
                )}

                {props.activeDiagTab === 'conflicts' && (
                    <div className="space-y-4">
                        <div className="bg-white p-3 rounded border flex items-center space-x-2">
                            <input type="text" value={props.conflictSearchId} onChange={(e) => props.setConflictSearchId(e.target.value)} placeholder="Farm ID..." className="flex-1 p-2 border rounded font-bold"/>
                            <button onClick={() => props.loadConflicts()} className="p-2 bg-blue-50 text-blue-600 rounded border border-blue-200"><Search size={16}/></button>
                        </div>
                        {props.conflicts.map((c, i) => (
                            <div key={i} className="bg-white p-3 rounded border border-slate-200 shadow-sm flex justify-between">
                                <div><div className="font-bold">{c.email}</div><div className="text-[10px]">{c.updatedAt}</div></div>
                                <button onClick={() => props.deleteConflict(c.docId)} className="text-red-600"><Trash2 size={16}/></button>
                            </div>
                        ))}
                        {props.conflictSearchId && props.conflicts.length === 0 && !props.conflictsLoading && (
                            <button onClick={props.handleForceDeleteFarm} className="w-full bg-red-600 text-white py-2 rounded text-xs font-bold">Blind-Löschung ID '{props.conflictSearchId}'</button>
                        )}
                    </div>
                )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-white shrink-0">
                <button onClick={props.handleHardReset} className="w-full py-3 bg-red-50 text-red-600 border border-red-200 rounded-lg font-bold flex items-center justify-center"><Trash2 size={16} className="mr-2"/> Komplett-Reset</button>
            </div>
        </div>
    </div>
  );
};

export const RulesHelpModal: React.FC<{ show: boolean, onClose: () => void }> = ({ show, onClose }) => {
    if (!show) return null;
    return (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
                <div className="bg-amber-100 p-4 border-b border-amber-200 flex items-start">
                    <AlertTriangle className="text-amber-600 shrink-0 mr-3" size={24}/>
                    <h3 className="font-bold text-amber-800">Datenbank ist gesperrt!</h3>
                </div>
                <div className="p-6 space-y-4 text-sm">
                    <p>Firebase Sicherheitsregeln müssen angepasst werden:</p>
                    <div className="bg-slate-900 text-slate-300 p-4 rounded-lg font-mono text-[10px]">
                        <pre>{`allow read, write: if request.auth != null;`}</pre>
                    </div>
                    <button onClick={onClose} className="w-full bg-slate-800 text-white py-3 rounded-lg font-bold">Verstanden</button>
                </div>
            </div>
        </div>
    );
};

