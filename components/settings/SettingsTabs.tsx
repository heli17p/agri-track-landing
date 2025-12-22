
import React, { useState, useEffect } from 'react';
import { MapPin, Plus, Database, Layers, Hammer, Terminal, Cloud, ShieldCheck, CloudOff, UserPlus, Eye, EyeOff, Search, Info, DownloadCloud, RefreshCw, Truck, Zap, Radar, User, CheckCircle2, LogOut, Wrench, Ruler, Trash2, Tag, ChevronRight, ChevronDown, Wheat, Sprout, Droplets, Server, Globe, Edit2 } from 'lucide-react';
import { FarmProfile, StorageLocation, FertilizerType, AppSettings, Equipment, EquipmentCategory, ActivityType } from '../../types';
import { getAppIcon, ICON_THEMES } from '../../utils/appIcons';
import { dbService, generateId } from '../../services/db';

const SharedBadge = () => <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded ml-1 inline-flex items-center"><Cloud size={10} className="mr-1"/> Sync</span>;

export const ProfileTab: React.FC<{ profile: FarmProfile, setProfile: (p: any) => void, onPickMap: () => void }> = ({ profile, setProfile, onPickMap }) => (
    <div className="space-y-4 max-w-lg mx-auto">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-lg mb-4 text-slate-800">Betriebsdaten</h3>
            <div className="space-y-4">
                <div><label className="block text-sm font-bold text-slate-500 mb-1">Betriebsname</label><input type="text" value={profile.operatorName} onChange={(e) => setProfile({...profile, operatorName: e.target.value})} className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" /></div>
                <div><label className="block text-sm font-bold text-slate-500 mb-1">Anschrift</label><textarea value={profile.address} onChange={(e) => setProfile({...profile, address: e.target.value})} rows={3} className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" /></div>
                <div><label className="block text-sm font-bold text-slate-500 mb-1">Hofstelle</label><button onClick={onPickMap} className="w-full py-3 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 font-bold hover:bg-slate-50 flex items-center justify-center"><MapPin size={18} className="mr-2"/> {profile.addressGeo ? `Position gesetzt` : 'Auf Karte wählen'}</button></div>
            </div>
        </div>
    </div>
);

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
                    <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            {editingCatId ? 'Gruppe umbenennen' : 'Neue Gruppe anlegen'}
                        </label>
                        <div className="flex space-x-2">
                            <input type="text" value={newCatName} onChange={e => setNewCatName(e.target.value)} className="flex-1 p-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 font-bold text-sm" placeholder="z.B. Walze..." />
                            <select value={newCatParent} onChange={e => setNewCatParent(e.target.value as ActivityType)} className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold">
                                <option value={ActivityType.TILLAGE}>Boden</option>
                                <option value={ActivityType.FERTILIZATION}>Düngung</option>
                                <option value={ActivityType.HARVEST}>Ernte</option>
                            </select>
                            <button onClick={handleAddCategory} className="bg-purple-600 text-white px-3 py-2 rounded-lg font-bold text-xs">{editingCatId ? 'OK' : 'OK'}</button>
                        </div>
                    </div>
                    
                    <div className="space-y-4">
                        {[ActivityType.FERTILIZATION, ActivityType.TILLAGE, ActivityType.HARVEST].map(parent => (
                            <div key={parent}>
                                <h4 className="text-[9px] font-black text-slate-400 uppercase mb-2 flex items-center">{getParentIcon(parent)} {parent}</h4>
                                <div className="flex flex-wrap gap-2">
                                    {categories.filter(c => c.parentType === parent).map(cat => (
                                        <div key={cat.id} className="bg-white border border-slate-200 pl-3 pr-1 py-1 rounded-full flex items-center shadow-sm">
                                            <span 
                                                className="text-[10px] font-black text-slate-700 uppercase tracking-tighter mr-2 cursor-pointer hover:text-purple-600"
                                                onClick={() => handleEditCategory(cat)}
                                            >
                                                {cat.name}
                                            </span>
                                            <button onClick={() => handleDeleteCategory(cat.id)} className="p-1 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={10}/></button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
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

export const StorageTab: React.FC<{ storages: StorageLocation[], onEdit: (s: StorageLocation) => void, onCreate: () => void }> = ({ storages, onEdit, onCreate }) => (
    <div className="space-y-4 max-w-lg mx-auto">
        {storages.map(s => (
            <div key={s.id} onClick={() => onEdit(s)} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center cursor-pointer hover:border-green-500 transition-all">
                <div className="flex items-center">
                    <div className={`p-3 rounded-full mr-4 ${s.type === FertilizerType.SLURRY ? 'bg-amber-100 text-amber-800' : 'bg-orange-100 text-orange-800'}`}>{s.type === FertilizerType.SLURRY ? <Database size={20}/> : <Layers size={20}/>}</div>
                    <div><h4 className="font-bold text-slate-800">{s.name}</h4><div className="text-xs text-slate-500">{s.capacity} m³ • {s.currentLevel.toFixed(0)} m³ aktuell</div></div>
                </div>
                <div className="text-slate-400 text-xs font-bold uppercase">Bearbeiten</div>
            </div>
        ))}
        <button onClick={onCreate} className="w-full py-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold hover:bg-white hover:border-green-500 transition-all flex items-center justify-center"><Plus size={20} className="mr-2"/> Neues Lager</button>
    </div>
);

export const GeneralTab: React.FC<{ settings: AppSettings, setSettings: (s: any) => void }> = ({ settings, setSettings }) => (
    <div className="space-y-6 max-w-lg mx-auto">
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center"><Database size={18} className="mr-2 text-blue-600"/> Standard-Breiten & Volumen</h3>
            <p className="text-[10px] text-slate-400 mb-4 italic leading-tight">Hinweis: Diese Werte werden als Fallback genutzt, falls kein spezifisches Gerät ausgewählt wird.</p>
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Güllefass (m³) <SharedBadge/></label><input type="number" value={settings.slurryLoadSize} onChange={e => setSettings({...settings, slurryLoadSize: parseFloat(e.target.value)})} className="w-full p-2 border rounded font-bold" /></div>
                    <div><label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Miststreuer (m³) <SharedBadge/></label><input type="number" value={settings.manureLoadSize} onChange={e => setSettings({...settings, manureLoadSize: parseFloat(e.target.value)})} className="w-full p-2 border rounded font-bold" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4 border-t pt-4">
                    <div><label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Breite Gülle (m) <SharedBadge/></label><input type="number" value={settings.slurrySpreadWidth || 12} onChange={e => setSettings({...settings, slurrySpreadWidth: parseFloat(e.target.value)})} className="w-full p-2 border rounded font-bold" /></div>
                    <div><label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Breite Mist (m) <SharedBadge/></label><input type="number" value={settings.manureSpreadWidth || 10} onChange={e => setSettings({...settings, manureSpreadWidth: parseFloat(e.target.value)})} className="w-full p-2 border rounded font-bold" /></div>
                </div>
            </div>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center"><Zap size={18} className="mr-2 text-amber-500"/> GPS & Automatik</h3>
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Min. Speed (km/h)</label>
                        <input type="number" step="0.1" value={settings.minSpeed} onChange={e => setSettings({...settings, minSpeed: parseFloat(e.target.value)})} className="w-full p-2 border rounded font-medium" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Max. Speed (km/h)</label>
                        <input type="number" step="0.1" value={settings.maxSpeed} onChange={e => setSettings({...settings, maxSpeed: parseFloat(e.target.value)})} className="w-full p-2 border rounded font-medium" />
                    </div>
                </div>
                <div className="pt-2 border-t">
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1 flex items-center"><Radar size={12} className="mr-1"/> Lager Radius (m) <SharedBadge/></label>
                    <input type="number" value={settings.storageRadius} onChange={e => setSettings({...settings, storageRadius: parseFloat(e.target.value)})} className="w-full p-2 border rounded font-medium" />
                </div>
            </div>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-slate-800 mb-4">App Design</h3>
            <div className="grid grid-cols-4 gap-2">
                {ICON_THEMES.map(theme => (
                    <button key={theme.id} onClick={() => setSettings({...settings, appIcon: theme.id})} className={`p-2 rounded-lg border-2 flex flex-col items-center ${settings.appIcon === theme.id ? 'border-green-500 bg-green-50' : 'border-transparent hover:bg-slate-50'}`}>
                        <img src={getAppIcon(theme.id)} className="w-8 h-8 mb-1 rounded bg-white shadow-sm border border-slate-100" /><span className="text-[9px] font-bold text-slate-600 truncate w-full text-center">{theme.label}</span>
                    </button>
                ))}
            </div>
        </div>
    </div>
);

export const SyncTab: React.FC<{ authState: any, settings: AppSettings, cloudStats: any, localStats: any, connectMode: string, setConnectMode: (m: any) => void, inputFarmId: string, setInputFarmId: (v: string) => void, inputPin: string, setInputPin: (v: string) => void, searchStatus: string, foundOwnerEmail: string | null, connectError: string | null, onSearch: () => void, onJoin: () => void, onCreate: () => void, onForceUpload: () => void, onManualDownload: () => void, onShowDiagnose: () => void, onLogout: () => void }> = (props) => (
    <div className="space-y-6 max-w-lg mx-auto">
        
        {/* AGRICLOUD / FIREBASE INFO CARD */}
        <div className="bg-gradient-to-br from-green-600 to-green-800 text-white p-6 rounded-2xl shadow-xl overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-10"><Cloud size={80}/></div>
            <div className="relative z-10">
                <div className="flex items-center space-x-2 mb-2 text-green-200 font-bold uppercase text-[10px] tracking-[0.2em]"><ShieldCheck size={14}/> <span>Echtzeit-Sicherung</span></div>
                <h3 className="text-xl font-black mb-2 italic">AgriCloud <span className="text-green-300">Live</span></h3>
                <p className="text-green-50 text-xs leading-relaxed mb-4">Deine Daten werden sicher in der <span className="white font-bold underline">AgriCloud (Firebase)</span> verschlüsselt gespeichert und automatisch über alle deine Geräte synchronisiert.</p>
                <div className="flex items-center space-x-3">
                    <div className="bg-white/20 text-white px-3 py-1 rounded-full text-[10px] font-bold border border-white/30 flex items-center">
                        <div className="w-1.5 h-1.5 bg-green-300 rounded-full mr-2 animate-pulse"></div>
                        CONNECTED TO CLOUD
                    </div>
                </div>
            </div>
        </div>

        <div className={`p-6 rounded-2xl border-2 flex flex-col items-center text-center shadow-sm transition-all ${props.authState && props.settings.farmId ? 'bg-green-50 border-green-200' : 'bg-slate-100 border-slate-300'}`}>
            <div className="relative mb-3"><div className={`p-4 rounded-full ${props.authState && props.settings.farmId ? 'bg-green-200 text-green-800' : 'bg-slate-200 text-slate-600'}`}>{props.authState ? <ShieldCheck size={40}/> : <CloudOff size={40}/>}</div>{props.authState && <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 border-2 border-white rounded-full animate-pulse shadow-sm"></div>}</div>
            <h3 className="font-black text-xl text-slate-800">{props.authState ? (props.settings.farmId ? 'Verbindung aktiv' : 'Bereit (Kein Hof)') : 'Offline Modus'}</h3>
            {props.authState && (<><div className="mt-2 flex items-center text-xs font-bold text-green-700 bg-white/50 px-3 py-1 rounded-full border border-green-100"><User size={12} className="mr-1.5"/> {props.authState.email}</div><button onClick={props.onLogout} className="mt-4 flex items-center text-[10px] font-black text-red-600 uppercase tracking-widest hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-red-100"><LogOut size={12} className="mr-1.5"/> Verbindung trennen</button></>)}
            {props.authState && props.settings.farmId && <div className="mt-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Farm ID: <span className="text-slate-700">{props.settings.farmId}</span></div>}
        </div>
        {props.authState && props.settings.farmId && (<div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4"><h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center"><RefreshCw size={14} className="mr-2"/> Synchronisations-Status</h4><div className="grid grid-cols-2 gap-4"><div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col items-center"><span className="text-2xl font-black text-slate-800">{props.localStats.total}</span><span className="text-[9px] font-bold text-slate-500 uppercase">Lokal (Handy)</span></div><div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex flex-col items-center"><span className="text-2xl font-black text-blue-700">{props.cloudStats.total === -1 ? '...' : props.cloudStats.total}</span><span className="text-[9px] font-bold text-blue-500 uppercase">Cloud (Server)</span></div></div>{props.localStats.total === props.cloudStats.total ? (<div className="flex items-center justify-center text-green-600 text-xs font-bold py-1"><CheckCircle2 size={14} className="mr-1.5"/> Alle Daten sind aktuell</div>) : (<div className="text-[10px] text-center text-slate-400 italic">Unterschiede? Nutze "Daten hochladen" um manuell zu sichern.</div>)}</div>)}
        {props.authState && !props.settings.farmId && props.connectMode === 'VIEW' && (<div className="grid grid-cols-1 gap-4"><button onClick={() => props.setConnectMode('JOIN')} className="bg-white p-6 rounded-xl border-2 border-slate-200 hover:border-blue-500 flex items-center font-bold text-blue-600 transition-all active:scale-95"><UserPlus size={24} className="mr-3"/> Hof beitreten</button><button onClick={() => props.setConnectMode('CREATE')} className="bg-white p-6 rounded-xl border-2 border-slate-200 hover:border-green-500 flex items-center font-bold text-green-600 transition-all active:scale-95"><Plus size={24} className="mr-3"/> Hof neu erstellen</button></div>)}
        {props.authState && props.settings.farmId && (<div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-3"><button onClick={props.onForceUpload} className="w-full py-4 bg-blue-600 text-white rounded-xl font-black shadow-lg shadow-blue-100 flex items-center justify-center active:scale-95 transition-all"><Cloud size={18} className="mr-2"/> Daten jetzt sichern</button><button onClick={props.onManualDownload} className="w-full py-3 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold flex items-center justify-center active:scale-95 transition-all"><DownloadCloud size={18} className="mr-2"/> Server-Daten laden</button><button onClick={props.onShowDiagnose} className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl font-bold flex items-center justify-center active:scale-95 transition-all"><Terminal size={18} className="mr-2"/> 🛠 Diagnose-Tool</button></div>)}
    </div>
);

