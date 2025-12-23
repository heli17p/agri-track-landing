
import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Plus, Database, Layers, Hammer, Terminal, Cloud, ShieldCheck, CloudOff, UserPlus, Eye, EyeOff, Search, Info, DownloadCloud, RefreshCw, Truck, Zap, Radar, User, CheckCircle2, LogOut, Wrench, Ruler, Trash2, Tag, ChevronRight, ChevronDown, Wheat, Sprout, Droplets, Server, Globe, Edit2, X, Share2, Key, Users, UserMinus, ShieldAlert, FileOutput, FileInput } from 'lucide-react';
import { FarmProfile, StorageLocation, FertilizerType, AppSettings, Equipment, EquipmentCategory, ActivityType } from '../../types';
import { getAppIcon, ICON_THEMES } from '../../utils/appIcons';
import { dbService, generateId } from '../../services/db';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';

const SharedBadge = () => <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded ml-1 inline-flex items-center"><Cloud size={10} className="mr-1"/> Sync</span>;

// Marker Icon für die Hofstelle in der Vorschau - nochmals verkleinert (22x30)
const farmMarkerIcon = L.divIcon({ 
    className: 'custom-pin', 
    html: `
      <div style="width: 22px; height: 30px; display: flex; align-items: center; justify-content: center;">
        <svg width="22" height="30" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 1.5px 2px rgba(0,0,0,0.3));">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 20 12 20s12-11 12-20c0-6.63-5.37-12-12-12z" fill="#2563eb" stroke="white" stroke-width="2"/>
          <g transform="translate(6, 6) scale(0.5)">
            <path d="M3 21h18M5 21V7l8-5 8 5v14" stroke="white" stroke-width="2.5" fill="none"/>
          </g>
        </svg>
      </div>
    `, 
    iconSize: [22, 30], 
    iconAnchor: [11, 30] 
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

// FIX: Added missing StorageTab component
export const StorageTab: React.FC<{ 
    storages: StorageLocation[], 
    onEdit: (s: StorageLocation) => void, 
    onCreate: () => void 
}> = ({ storages, onEdit, onCreate }) => {
    return (
        <div className="space-y-4 max-w-lg mx-auto">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-lg text-slate-800 flex items-center"><Database className="mr-2 text-amber-600"/> Lagerplätze</h3>
                    <button onClick={onCreate} className="bg-amber-50 text-amber-600 px-3 py-1.5 rounded-xl font-bold text-xs flex items-center hover:bg-amber-100"><Plus size={14} className="mr-1"/> Neu</button>
                </div>
                
                <div className="space-y-3">
                    {storages.length === 0 ? (
                        <div className="text-center py-10 text-slate-400 italic text-sm">Keine Lager angelegt.</div>
                    ) : (
                        storages.map(s => (
                            <div key={s.id} onClick={() => onEdit(s)} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center group hover:border-amber-300 transition-all cursor-pointer">
                                <div className="flex items-center">
                                    <div className="p-2 bg-white rounded-lg border border-slate-200 mr-4 text-amber-600 shadow-sm">
                                        {s.type === FertilizerType.SLURRY ? <Droplets size={18}/> : <Layers size={18}/>}
                                    </div>
                                    <div>
                                        <div className="font-black text-slate-700 text-sm">{s.name}</div>
                                        <div className="text-[10px] font-bold text-slate-400 uppercase flex items-center mt-0.5">
                                            {s.type} <span className="mx-1.5">•</span> {s.capacity} m³
                                        </div>
                                    </div>
                                </div>
                                <ChevronRight size={16} className="text-slate-300 group-hover:text-amber-500 transition-colors" />
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

// FIX: Added missing GeneralTab component
export const GeneralTab: React.FC<{ 
    settings: AppSettings, 
    setSettings: (s: AppSettings) => void 
}> = ({ settings, setSettings }) => {
    return (
        <div className="space-y-4 max-w-lg mx-auto">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="font-bold text-lg mb-6 text-slate-800 flex items-center"><Zap className="mr-2 text-blue-600"/> App-Einstellungen</h3>
                
                <div className="space-y-6">
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 ml-1">Erscheinungsbild</label>
                        <div className="grid grid-cols-4 gap-3">
                            {ICON_THEMES.map(theme => (
                                <button 
                                    key={theme.id}
                                    onClick={() => setSettings({...settings, appIcon: theme.id})}
                                    className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${settings.appIcon === theme.id ? 'border-blue-600 scale-105 shadow-md' : 'border-slate-100'}`}
                                    title={theme.label}
                                >
                                    <img src={getAppIcon(theme.id)} alt={theme.label} className="w-full h-full object-contain p-1" />
                                    {settings.appIcon === theme.id && (
                                        <div className="absolute top-0.5 right-0.5 bg-blue-600 text-white rounded-full p-0.5"><CheckCircle2 size={10}/></div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Grenzwerte & Automatik</label>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-1">Gülle Fuhre (m³)</label>
                                <input type="number" value={settings.slurryLoadSize} onChange={e => setSettings({...settings, slurryLoadSize: parseFloat(e.target.value) || 10})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-bold" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-1">Mist Fuhre (m³)</label>
                                <input type="number" value={settings.manureLoadSize} onChange={e => setSettings({...settings, manureLoadSize: parseFloat(e.target.value) || 8})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-bold" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-1">Min. Speed (km/h)</label>
                                <input type="number" step="0.1" value={settings.minSpeed} onChange={e => setSettings({...settings, minSpeed: parseFloat(e.target.value) || 2.0})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-bold" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-1">Lager Radius (m)</label>
                                <input type="number" value={settings.storageRadius} onChange={e => setSettings({...settings, storageRadius: parseInt(e.target.value) || 20})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-bold" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// FIX: Added missing SyncTab component
export const SyncTab: React.FC<{
    authState: any,
    settings: AppSettings,
    cloudStats: any,
    localStats: any,
    connectMode: 'VIEW' | 'JOIN' | 'CREATE',
    setConnectMode: (m: 'VIEW' | 'JOIN' | 'CREATE') => void,
    inputFarmId: string,
    setInputFarmId: (v: string) => void,
    inputPin: string,
    setInputPin: (v: string) => void,
    searchStatus: string,
    foundOwnerEmail: string | null,
    connectError: string | null,
    onSearch: () => void,
    onJoin: () => void,
    onCreate: () => void,
    onForceUpload: () => void,
    onManualDownload: () => void,
    onShowDiagnose: () => void,
    onLogout: () => void
}> = ({ 
    authState, settings, cloudStats, localStats, 
    onForceUpload, onManualDownload, onShowDiagnose, onLogout 
}) => {
    return (
        <div className="space-y-4 max-w-lg mx-auto">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-start mb-6">
                    <h3 className="font-bold text-lg text-slate-800 flex items-center"><Cloud className="mr-2 text-blue-600"/> Sync & Cloud</h3>
                    <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${authState ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}>
                        {authState ? 'Live' : 'Lokal'}
                    </div>
                </div>

                {authState ? (
                    <div className="space-y-6">
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center">
                            <div className="p-2 bg-white rounded-lg border border-slate-200 mr-4 text-blue-600 shadow-sm"><User size={20}/></div>
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-bold text-slate-400 uppercase leading-none mb-1">Angemeldet als</div>
                                <div className="font-bold text-slate-700 truncate">{authState.email}</div>
                            </div>
                            <button onClick={onLogout} className="p-2 text-slate-400 hover:text-red-500 transition-colors"><LogOut size={20}/></button>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-center">
                                <div className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Cloud Daten</div>
                                <div className="text-2xl font-black text-blue-700">{cloudStats.total === -1 ? '...' : cloudStats.total}</div>
                            </div>
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Lokal</div>
                                <div className="text-2xl font-black text-slate-700">{localStats.total}</div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <button onClick={onManualDownload} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center shadow-lg active:scale-95 transition-all">
                                <DownloadCloud size={18} className="mr-2"/> Alles vom Server laden
                            </button>
                            <button onClick={onForceUpload} className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl font-bold flex items-center justify-center hover:bg-slate-200 transition-all">
                                <RefreshCw size={18} className="mr-2"/> Lokale Daten hochladen
                            </button>
                        </div>

                        <div className="pt-4 border-t border-slate-100">
                             <button onClick={onShowDiagnose} className="w-full flex items-center justify-center text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-blue-500 transition-colors">
                                 <Terminal size={14} className="mr-1.5"/> System-Diagnose & Tools
                             </button>
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-6 space-y-4">
                        <CloudOff size={48} className="mx-auto text-slate-200" />
                        <p className="text-sm text-slate-500">Melde dich an, um deine Daten in der AgriCloud zu sichern und mit anderen Geräten zu synchronisieren.</p>
                        <button onClick={() => window.location.reload()} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold">Jetzt Anmelden</button>
                    </div>
                )}
            </div>
            
            {settings.farmId && authState && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center"><Server className="mr-2 text-green-600" size={18}/> Hof-Verbindung</h3>
                    <div className="bg-green-50 p-4 rounded-xl border border-green-100 space-y-3">
                         <div className="flex justify-between items-center">
                             <span className="text-xs font-bold text-green-700">Farm ID</span>
                             <span className="font-mono font-black text-green-900">{settings.farmId}</span>
                         </div>
                         <div className="flex justify-between items-center">
                             <span className="text-xs font-bold text-green-700">Hof PIN</span>
                             <span className="font-mono font-black text-green-900 tracking-widest">{settings.farmPin ? '****' : 'Nicht gesetzt'}</span>
                         </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export const EquipmentTab: React.FC<{ equipment: Equipment[], onUpdate: () => void }> = ({ equipment, onUpdate }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [showCatManager, setShowCatManager] = useState(false);
  const [categories, setCategories] = useState<EquipmentCategory[]>([]);
  const [newEquip, setNewEquip] = useState<Equipment>({ id: '', name: '', type: '', width: 6 });
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

  useEffect(() => { loadCats(); }, []);

  const handleSave = async () => {
    if (!newEquip.name || !newEquip.type) return;
    await dbService.saveEquipment({ ...newEquip, id: newEquip.id || generateId() });
    resetForm();
    onUpdate();
  };

  const resetForm = () => {
    setShowAdd(false);
    setEditingId(null);
    setNewEquip({ id: '', name: '', type: categories[0]?.name || '', width: 6 });
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
    loadCats();
  };

  const handleEditCategory = (cat: EquipmentCategory) => {
      setNewCatName(cat.name);
      setNewCatParent(cat.parentType);
      setEditingCatId(cat.id);
  };

  const handleDeleteCategory = async (id: string) => {
    if (confirm("Kategorie wirklich löschen?")) {
      await dbService.deleteEquipmentCategory(id);
      loadCats();
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

  return (
    <div className="space-y-4 max-w-lg mx-auto pb-10">
        
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
                                    <option value={ActivityType.TILLAGE}>Boden</option>
                                    <option value={ActivityType.FERTILIZATION}>Düngung</option>
                                    <option value={ActivityType.HARVEST}>Ernte</option>
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
                    
                    <div className="space-y-4">
                        {[ActivityType.FERTILIZATION, ActivityType.TILLAGE, ActivityType.HARVEST].map(parent => {
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
                    <div className="text-center py-10 text-slate-400 italic text-sm">Keine Geräte angelegt.</div>
                ) : (
                    equipment.map(e => (
                        <div key={e.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center group hover:border-blue-300 transition-all cursor-pointer" onClick={() => handleEdit(e)}>
                            <div className="flex items-center">
                                <div className="p-2 bg-white rounded-lg border border-slate-200 mr-4 text-blue-600 shadow-sm"><Hammer size={18}/></div>
                                <div>
                                    <div className="font-black text-slate-700 text-sm">{e.name}</div>
                                    <div className="text-[10px] font-bold text-slate-400 uppercase flex items-center mt-0.5">
                                        {e.type} <span className="mx-1.5">•</span> <Ruler size={10} className="mr-0.5"/> {e.width}m
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

