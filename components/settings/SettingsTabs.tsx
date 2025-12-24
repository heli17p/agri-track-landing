
import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Plus, Database, Layers, Hammer, Terminal, Cloud, ShieldCheck, CloudOff, UserPlus, Eye, EyeOff, Search, Info, DownloadCloud, RefreshCw, Truck, Zap, Radar, User, CheckCircle2, LogOut, Wrench, Ruler, Trash2, Tag, ChevronRight, ChevronDown, Wheat, Sprout, Droplets, Server, Globe, Edit2, X, Share2, Key, Users, UserMinus, ShieldAlert, FileOutput, FileInput, Box, Sliders, Smartphone } from 'lucide-react';
import { FarmProfile, StorageLocation, FertilizerType, AppSettings, Equipment, EquipmentCategory, ActivityType } from '../../types';
import { getAppIcon, ICON_THEMES } from '../../utils/appIcons';
import { dbService, generateId } from '../../services/db';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';

const SharedBadge = () => <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded ml-1 inline-flex items-center"><Cloud size={10} className="mr-1"/> Sync</span>;

// Marker Icon für die Hofstelle in der Vorschau
const farmMarkerIcon = L.divIcon({ 
    className: 'custom-pin', 
    html: `
      <div style="width: 32px; height: 42px; display: flex; align-items: center; justify-content: center;">
        <svg width="32" height="42" viewBox="0 0 24 30" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.3));">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 18 12 18s12-9 12-18c0-6.63-5.37-12-12-12z" fill="#2563eb" stroke="white" stroke-width="1.5"/>
          <g transform="translate(6, 6) scale(0.5)">
            <path d="M3 21h18M5 21V7l8-5 8 5v14" stroke="white" stroke-width="2.5" fill="none"/>
          </g>
        </svg>
      </div>
    `, 
    iconSize: [32, 42], 
    iconAnchor: [16, 42] 
});

export const ProfileTab: React.FC<{ profile: FarmProfile, setProfile: (p: any) => void, onPickMap: () => void }> = ({ profile, setProfile, onPickMap }) => {
    const [mapStyle, setMapStyle] = useState<'standard' | 'satellite'>('standard');

    return (
        <div className="space-y-4 max-w-lg mx-auto">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="font-bold text-lg mb-4 text-slate-800">Betriebsdaten</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-500 mb-1">Betriebsname</label>
                        <input 
                            type="text" 
                            value={profile.operatorName} 
                            onChange={(e) => setProfile({...profile, operatorName: e.target.value})} 
                            className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" 
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-500 mb-1">Anschrift</label>
                        <textarea 
                            value={profile.address} 
                            onChange={(e) => setProfile({...profile, address: e.target.value})} 
                            rows={3} 
                            className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" 
                        />
                    </div>
                    
                    <div className="space-y-2">
                        <label className="block text-sm font-bold text-slate-500 mb-1">Hofstelle</label>
                        
                        {/* Kartenvorschau wenn Position existiert */}
                        {profile.addressGeo && (
                            <div className="h-48 w-full rounded-xl overflow-hidden border border-slate-200 relative mb-2 shadow-inner bg-slate-100">
                                <MapContainer 
                                    center={profile.addressGeo} 
                                    zoom={15} 
                                    style={{ height: '100%', width: '100%' }} 
                                    zoomControl={false}
                                    scrollWheelZoom={false}
                                    dragging={false}
                                    doubleClickZoom={false}
                                >
                                    <TileLayer 
                                        url={mapStyle === 'standard' 
                                            ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                            : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                                        } 
                                    />
                                    <Marker position={profile.addressGeo} icon={farmMarkerIcon} />
                                </MapContainer>
                                
                                {/* Satelliten-Toggle Overlay */}
                                <button 
                                    onClick={() => setMapStyle(prev => prev === 'standard' ? 'satellite' : 'standard')}
                                    className="absolute top-2 right-2 z-[400] bg-white/90 p-2 rounded-lg shadow-sm border border-slate-200 text-slate-700 hover:text-green-600 transition-colors"
                                    title="Kartenansicht umschalten"
                                >
                                    <Layers size={16} />
                                </button>
                                
                                <div className="absolute bottom-2 left-2 z-[400] bg-white/80 px-2 py-1 rounded text-[10px] font-bold text-slate-500 backdrop-blur-sm">
                                    {profile.addressGeo.lat.toFixed(5)}, {profile.addressGeo.lng.toFixed(5)}
                                </div>
                            </div>
                        )}

                        <button 
                            onClick={onPickMap} 
                            className={`w-full py-3 border-2 border-dashed rounded-lg font-bold flex items-center justify-center transition-all ${profile.addressGeo ? 'border-blue-200 text-blue-600 bg-blue-50/30 hover:bg-blue-50' : 'border-slate-300 text-slate-500 hover:bg-slate-50'}`}
                        >
                            <MapPin size={18} className="mr-2"/> 
                            {profile.addressGeo ? 'Position ändern' : 'Hofstelle auf Karte wählen'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Fix: Implementation of StorageTab exported to resolve error in SettingsPage.tsx
export const StorageTab: React.FC<{ storages: StorageLocation[], onEdit: (s: StorageLocation) => void, onCreate: () => void }> = ({ storages, onEdit, onCreate }) => {
    return (
        <div className="space-y-4 max-w-lg mx-auto pb-10">
            <div className="flex justify-between items-center mb-2 px-2">
                <h3 className="font-bold text-slate-800">Lagerstätten</h3>
                <button onClick={onCreate} className="p-2 bg-green-600 text-white rounded-full shadow-lg active:scale-90 transition-all">
                    <Plus size={20}/>
                </button>
            </div>

            {storages.length === 0 ? (
                <div className="bg-white p-10 rounded-2xl text-center border-2 border-dashed border-slate-200">
                    <Database size={40} className="mx-auto text-slate-300 mb-4"/>
                    <p className="text-slate-500 font-medium">Noch keine Lager angelegt.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {storages.map(s => (
                        <div key={s.id} onClick={() => onEdit(s)} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex justify-between items-center group cursor-pointer hover:border-green-500 transition-all">
                            <div className="flex items-center">
                                <div className={`p-3 rounded-xl mr-4 ${s.type === FertilizerType.SLURRY ? 'bg-amber-100 text-amber-700' : 'bg-orange-100 text-orange-700'}`}>
                                    {s.type === FertilizerType.SLURRY ? <Droplets size={20}/> : <Layers size={20}/>}
                                </div>
                                <div>
                                    <div className="font-bold text-slate-800">{s.name}</div>
                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        {s.currentLevel.toFixed(0)} / {s.capacity} m³ <span className="mx-1">•</span> {s.type}
                                    </div>
                                </div>
                            </div>
                            <ChevronRight size={18} className="text-slate-300 group-hover:text-green-500 transition-colors"/>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// Fix: Implementation of GeneralTab exported to resolve error in SettingsPage.tsx
export const GeneralTab: React.FC<{ settings: AppSettings, setSettings: (s: AppSettings) => void }> = ({ settings, setSettings }) => {
    return (
        <div className="space-y-6 max-w-lg mx-auto pb-10">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="font-bold text-lg mb-4 text-slate-800 flex items-center">
                    <Smartphone className="mr-2 text-agri-600" size={20}/> App Design
                </h3>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {ICON_THEMES.map(theme => (
                        <button
                            key={theme.id}
                            onClick={() => setSettings({ ...settings, appIcon: theme.id })}
                            className={`p-2 rounded-xl border-2 transition-all flex flex-col items-center ${settings.appIcon === theme.id ? 'border-agri-600 bg-agri-50 shadow-sm' : 'border-slate-100 hover:border-slate-200'}`}
                        >
                            <img src={getAppIcon(theme.id)} alt={theme.label} className="w-10 h-10 rounded-lg mb-2" />
                            <span className="text-[9px] font-bold text-slate-600 uppercase tracking-tighter text-center leading-none">{theme.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-5">
                <h3 className="font-bold text-lg text-slate-800 flex items-center">
                    <Sliders className="mr-2 text-blue-600" size={20}/> Standardwerte
                </h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Gülle Fass (m³)</label>
                        <input 
                            type="number" 
                            value={settings.slurryLoadSize} 
                            onChange={e => setSettings({ ...settings, slurryLoadSize: parseFloat(e.target.value) || 10 })} 
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:ring-2 focus:ring-amber-500 outline-none" 
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mist Streuer (m³)</label>
                        <input 
                            type="number" 
                            value={settings.manureLoadSize} 
                            onChange={e => setSettings({ ...settings, manureLoadSize: parseFloat(e.target.value) || 8 })} 
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:ring-2 focus:ring-orange-500 outline-none" 
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Min. Speed (km/h)</label>
                        <input 
                            type="number" 
                            step="0.1"
                            value={settings.minSpeed} 
                            onChange={e => setSettings({ ...settings, minSpeed: parseFloat(e.target.value) || 2.0 })} 
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:ring-2 focus:ring-green-500 outline-none" 
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Erkennungsradius (m)</label>
                        <input 
                            type="number" 
                            value={settings.storageRadius} 
                            onChange={e => setSettings({ ...settings, storageRadius: parseFloat(e.target.value) || 15 })} 
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none" 
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

// Fix: Implementation of SyncTab exported to resolve error in SettingsPage.tsx
export const SyncTab: React.FC<any> = (props) => {
    const { 
        authState, settings, cloudStats, localStats, 
        onForceUpload, onManualDownload, onShowDiagnose, onLogout 
    } = props;
    
    const isLive = !!authState;

    return (
        <div className="space-y-4 max-w-lg mx-auto pb-10">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center space-x-3">
                        <div className={`p-3 rounded-2xl ${isLive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}>
                            {isLive ? <ShieldCheck size={24}/> : <CloudOff size={24}/>}
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-slate-800 leading-tight">AgriCloud Status</h3>
                            <p className={`text-xs font-bold uppercase tracking-tighter ${isLive ? 'text-green-600' : 'text-slate-400'}`}>
                                {isLive ? 'Verbunden & Aktiv' : 'Offline / Gastmodus'}
                            </p>
                        </div>
                    </div>
                    {isLive && (
                        <button onClick={onLogout} className="p-2 text-slate-300 hover:text-red-500 transition-colors" title="Abmelden">
                            <LogOut size={20}/>
                        </button>
                    )}
                </div>

                {isLive && settings.farmId ? (
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 flex justify-between items-center">
                        <div>
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Betriebs-ID</div>
                            <div className="font-mono text-xl font-black text-slate-800 tracking-wider">{settings.farmId}</div>
                        </div>
                        <div className="bg-green-500 text-white p-1.5 rounded-full"><CheckCircle2 size={16}/></div>
                    </div>
                ) : isLive && (
                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 mb-6 flex items-start space-x-3">
                        <ShieldAlert className="text-amber-600 shrink-0 mt-0.5" size={18}/>
                        <div>
                            <p className="text-xs font-bold text-amber-800">Kein Betrieb zugeordnet</p>
                            <p className="text-[10px] text-amber-700 mt-1">Bitte in den Willkommens-Bildschirm zurückkehren um einen Betrieb zu wählen.</p>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className="p-3 bg-white border border-slate-100 rounded-xl shadow-sm">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Lokal</div>
                        <div className="text-lg font-black text-slate-800">{localStats.total} <span className="text-[10px] font-bold text-slate-400">Items</span></div>
                    </div>
                    <div className="p-3 bg-white border border-slate-100 rounded-xl shadow-sm">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cloud</div>
                        <div className="text-lg font-black text-blue-600">{cloudStats.total >= 0 ? cloudStats.total : '—'} <span className="text-[10px] font-bold text-slate-400">Items</span></div>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button 
                        onClick={onManualDownload} 
                        className="flex items-center justify-center p-3.5 bg-blue-600 text-white rounded-xl font-bold shadow-lg hover:bg-blue-700 active:scale-95 transition-all"
                    >
                        <DownloadCloud size={18} className="mr-2"/> Sync laden
                    </button>
                    <button 
                        onClick={onForceUpload} 
                        className="flex items-center justify-center p-3.5 bg-green-600 text-white rounded-xl font-bold shadow-lg hover:bg-green-700 active:scale-95 transition-all"
                    >
                        <RefreshCw size={18} className="mr-2"/> Cloud Backup
                    </button>
                </div>
            </div>

            <button 
                onClick={onShowDiagnose} 
                className="w-full py-4 bg-slate-800 text-white rounded-2xl font-bold flex items-center justify-center shadow-lg active:scale-95 transition-all hover:bg-slate-900"
            >
                <Terminal size={20} className="mr-2 text-agri-500"/> System-Diagnose & Logs
            </button>
        </div>
    );
};

export const EquipmentTab: React.FC<{ equipment: Equipment[], onUpdate: () => void }> = ({ equipment, onUpdate }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [showCatManager, setShowCatManager] = useState(false);
  const [categories, setCategories] = useState<EquipmentCategory[]>([]);
  const [newEquip, setNewEquip] = useState<Equipment>({ id: '', name: '', type: '', width: 6, capacity: undefined, capacityUnit: 'm³' });
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Kategorie Management
  const [newCatName, setNewCatName] = useState('');
  const [newCatParent, setNewCatParent] = useState<ActivityType>(ActivityType.TILLAGE);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);

  const loadCats = async () => {
    const c = await dbService.getEquipmentCategories();
    setCategories(c);
    if (!newEquip.type && c.length > 0) {
        setNewEquip(prev => ({ ...prev, type: c[0].name }));
    }
  };

  useEffect(() => { 
    loadCats();
    // Reagiere auf Änderungen (z.B. Sync oder Speichern)
    const unsub = dbService.onDatabaseChange(() => {
        loadCats();
    });
    return () => unsub();
  }, []);

  const handleSave = async () => {
    if (!newEquip.name || !newEquip.type) return;
    await dbService.saveEquipment({ ...newEquip, id: newEquip.id || generateId() });
    resetForm();
    onUpdate();
  };

  const resetForm = () => {
    setShowAdd(false);
    setEditingId(null);
    setNewEquip({ id: '', name: '', type: categories[0]?.name || '', width: 6, capacity: undefined, capacityUnit: 'm³' });
  };

  const handleEdit = (e: Equipment) => {
    setNewEquip({ ...e });
    setEditingId(e.id);
    setShowAdd(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    await dbService.saveEquipmentCategory({ 
        id: editingCatId || generateId(), 
        name: newCatName.trim(), 
        parentType: newCatParent 
    });
    setNewCatName('');
    setEditingCatId(null);
  };

  const handleEditCategory = (cat: EquipmentCategory) => {
      setNewCatName(cat.name);
      setNewCatParent(cat.parentType);
      setEditingCatId(cat.id);
  };

  const handleDeleteCategory = async (id: string) => {
    if (confirm("Kategorie wirklich löschen?")) {
      await dbService.deleteEquipmentCategory(id);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Gerät wirklich entfernen?")) {
      await dbService.deleteEquipment(id);
      onUpdate();
    }
  };

  const getParentIcon = (type: ActivityType) => {
      if (type === ActivityType.FERTILIZATION) return <Droplets size={10} className="mr-1"/>;
      if (type === ActivityType.HARVEST) return <Wheat size={10} className="mr-1"/>;
      return <Sprout size={10} className="mr-1"/>;
  };

  const selectedCategory = categories.find(c => c.name === newEquip.type);
  const isFertilizationType = selectedCategory?.parentType === ActivityType.FERTILIZATION;

  return (
    <div className="space-y-4 max-w-lg mx-auto pb-10">
        
        {/* KATEGORIEN MANAGER */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden transition-all">
            <button onClick={() => setShowCatManager(!showCatManager)} className="w-full p-5 flex justify-between items-center hover:bg-slate-50 transition-colors">
                <div className="flex items-center">
                    <div className="p-2 bg-purple-50 text-purple-600 rounded-lg mr-3"><Tag size={18}/></div>
                    <div className="text-left"><h3 className="font-bold text-slate-800 leading-none">Typen / Gruppen verwalten</h3><p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-tighter">Zuweisung für Düngung, Boden etc.</p></div>
                </div>
                {showCatManager ? <ChevronDown size={20} className="text-slate-400"/> : <ChevronRight size={20} className="text-slate-400"/>}
            </button>

            {showCatManager && (
                <div className="p-5 border-t border-slate-100 bg-slate-50/50 space-y-4 animate-in slide-in-from-top-2">
                    
                    {/* EINGABEBEREICH */}
                    <div className={`p-4 rounded-xl border-2 transition-all ${editingCatId ? 'bg-amber-50 border-amber-300 ring-4 ring-amber-100' : 'bg-white border-slate-100 shadow-sm'}`}>
                        <div className="flex justify-between items-center mb-2 px-1">
                            <label className={`text-[10px] font-black uppercase tracking-widest ${editingCatId ? 'text-amber-600' : 'text-slate-400'}`}>
                                {editingCatId ? 'Gruppe umbenennen' : 'Neue Gruppe anlegen'}
                            </label>
                            {editingCatId && (
                                <button onClick={() => { setEditingCatId(null); setNewCatName(''); }} className="text-amber-700 p-1 hover:bg-amber-100 rounded-full"><X size={14}/></button>
                            )}
                        </div>
                        <div className="flex space-x-2">
                            <input 
                                type="text" 
                                value={newCatName} 
                                onChange={e => setNewCatName(e.target.value)} 
                                className="flex-1 p-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 font-bold text-sm shadow-inner" 
                                placeholder="z.B. Walze..." 
                                autoFocus={!!editingCatId}
                            />
                            {!editingCatId && (
                                <select value={newCatParent} onChange={e => setNewCatParent(e.target.value as ActivityType)} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none">
                                    <option value={ActivityType.HARVEST}>Ernte</option>
                                    <option value={ActivityType.FERTILIZATION}>Düngung</option>
                                    <option value={ActivityType.TILLAGE}>Boden</option>
                                </select>
                            )}
                            <button 
                                onClick={handleAddCategory} 
                                className={`px-4 py-2.5 rounded-lg font-black text-xs shadow-md transition-all active:scale-95 ${editingCatId ? 'bg-amber-600 text-white' : 'bg-purple-600 text-white'}`}
                            >
                                {editingCatId ? 'SPEICHERN' : 'OK'}
                            </button>
                        </div>
                    </div>
                    
                    {/* GRUPPEN LISTE */}
                    <div className="space-y-4">
                        {[ActivityType.HARVEST, ActivityType.FERTILIZATION, ActivityType.TILLAGE].map(parent => {
                            const groupCats = categories.filter(c => c.parentType === parent);
                            if (groupCats.length === 0 && parent !== ActivityType.FERTILIZATION) return null;
                            
                            return (
                                <div key={parent}>
                                    <h4 className="text-[9px] font-black text-slate-400 uppercase mb-2 flex items-center tracking-widest">{getParentIcon(parent)} {parent}</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {groupCats.map(cat => {
                                            const isEditing = editingCatId === cat.id;
                                            return (
                                                <div 
                                                    key={cat.id} 
                                                    onClick={() => handleEditCategory(cat)}
                                                    className={`group pl-3 pr-1 py-1 rounded-full flex items-center shadow-sm border transition-all cursor-pointer ${isEditing ? 'bg-amber-100 border-amber-400 scale-105 shadow-amber-200' : 'bg-white border-slate-200 hover:border-purple-300'}`}
                                                >
                                                    <span className={`text-[10px] font-black uppercase tracking-tighter mr-2 ${isEditing ? 'text-amber-700' : 'text-slate-700'}`}>
                                                        {cat.name}
                                                    </span>
                                                    <div className="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <div className="p-1 text-slate-400"><Edit2 size={10}/></div>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id); }} 
                                                            className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                                                        >
                                                            <Trash2 size={10}/>
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>

        {/* MASCHINEN LISTE */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-lg text-slate-800 flex items-center"><Wrench className="mr-2 text-blue-600"/> Maschinenpark</h3>
                <button onClick={() => setShowAdd(true)} className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-xl font-bold text-xs flex items-center hover:bg-blue-100"><Plus size={14} className="mr-1"/> Neu</button>
            </div>

            {showAdd && (
                <div className="mb-8 p-5 bg-slate-50 rounded-2xl border-2 border-blue-100 animate-in slide-in-from-top-4">
                    <h4 className="font-black text-[10px] uppercase text-slate-400 tracking-widest mb-4">
                        {editingId ? 'Gerät bearbeiten' : 'Neues Gerät anlegen'}
                    </h4>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">Bezeichnung</label>
                            <input type="text" value={newEquip.name} onChange={e => setNewEquip({...newEquip, name: e.target.value})} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold" placeholder="z.B. Pöttinger Egge 600" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Typ / Gruppe</label>
                                <select value={newEquip.type} onChange={e => setNewEquip({...newEquip, type: e.target.value})} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm appearance-none">
                                    <option value="" disabled>Wählen...</option>
                                    {categories.map(c => <option key={c.id} value={c.name}>{c.name} ({c.parentType})</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Arbeitsbreite (m)</label>
                                <input type="number" step="0.1" value={newEquip.width} onChange={e => setNewEquip({...newEquip, width: parseFloat(e.target.value) || 0})} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold" />
                            </div>
                        </div>

                        {/* DYNAMISCHES VOLUMEN FELD FÜR DÜNGUNG */}
                        {isFertilizationType && (
                            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 animate-in slide-in-from-left-2">
                                <label className="flex items-center text-xs font-bold text-amber-800 mb-2">
                                    <Box size={14} className="mr-1.5"/> Ladekapazität (Volumen)
                                </label>
                                <div className="flex space-x-2">
                                    <input 
                                        type="number" 
                                        step="0.5" 
                                        value={newEquip.capacity || ''} 
                                        onChange={e => setNewEquip({...newEquip, capacity: parseFloat(e.target.value) || undefined})} 
                                        className="flex-1 p-2.5 bg-white border border-amber-200 rounded-lg font-bold text-amber-900 outline-none focus:ring-2 focus:ring-amber-500" 
                                        placeholder="z.B. 15.0"
                                    />
                                    <select 
                                        value={newEquip.capacityUnit} 
                                        onChange={e => setNewEquip({...newEquip, capacityUnit: e.target.value as any})}
                                        className="w-20 p-2.5 bg-white border border-amber-200 rounded-lg font-bold text-xs"
                                    >
                                        <option value="m³">m³</option>
                                        <option value="t">t</option>
                                    </select>
                                </div>
                                <p className="text-[9px] text-amber-600 mt-2 italic font-medium leading-tight">Falls leer, wird der Standardwert aus den Optionen genutzt.</p>
                            </div>
                        )}

                        <div className="flex space-x-3 pt-2">
                            <button onClick={resetForm} className="flex-1 py-3 text-slate-500 font-bold text-sm">Abbrechen</button>
                            <button onClick={handleSave} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-100">
                                {editingId ? 'Aktualisieren' : 'Speichern'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="space-y-3">
                {equipment.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 italic text-sm">Keine Geräte angelegt. Nutze oben "Neu".</div>
                ) : (
                    equipment.map(e => (
                        <div key={e.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center group hover:border-blue-300 transition-all cursor-pointer" onClick={() => handleEdit(e)}>
                            <div className="flex items-center">
                                <div className="p-2 bg-white rounded-lg border border-slate-200 mr-4 text-blue-600 shadow-sm"><Hammer size={18}/></div>
                                <div>
                                    <div className="font-black text-slate-700 text-sm">{e.name}</div>
                                    <div className="text-[10px] font-bold text-slate-400 uppercase flex items-center mt-0.5">
                                        {e.type} <span className="mx-1.5">•</span> <Ruler size={10} className="mr-0.5"/> {e.width}m
                                        {e.capacity && (
                                            <>
                                                <span className="mx-1.5">•</span> 
                                                <Box size={10} className="mr-0.5 text-amber-600"/> 
                                                <span className="text-amber-700">{e.capacity} {e.capacityUnit}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center space-x-2">
                                <div className="p-2 text-slate-300 group-hover:text-blue-500 transition-colors"><Edit2 size={16}/></div>
                                <button onClick={(event) => { event.stopPropagation(); handleDelete(e.id); }} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    </div>
  );
};

