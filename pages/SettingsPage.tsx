import React, { useState, useEffect, useRef, useMemo } from 'react';
import { dbService } from '../services/db';
import { FarmProfile, StorageLocation, FertilizerType, GeoPoint, AppSettings, DEFAULT_SETTINGS } from '../types';
import { Save, Plus, Trash2, Navigation, X, Building2, Droplets, Search, Loader2, Check, Pencil, Settings as SettingsIcon, Database, Download, Upload, Wifi, Palette, Users, Lock, Key, LocateFixed, Layers, Tractor, Activity, MapPin, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import { geocodeAddress } from '../utils/geo';
import L from 'leaflet';
import { syncData } from '../services/sync';
import { ICON_THEMES, getAppIcon } from '../utils/appIcons';
import 'leaflet/dist/leaflet.css';

// --- Shared Icon Helper (Consistent with MapPage) ---
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

// Define Icons using the same style as MapPage
const farmIcon = createCustomIcon('#2563eb', iconPaths.house); 
const slurryIcon = createCustomIcon('#78350f', iconPaths.droplet); 
const manureIcon = createCustomIcon('#d97706', iconPaths.layers); 

// --- Helper Components ---

// Component to force recenter map when position changes
const MapRecenter = ({ position }: { position: GeoPoint | null }) => {
    const map = useMap();
    useEffect(() => {
        if (position) {
            map.invalidateSize();
            // Use flyTo for smooth transition
            map.flyTo([position.lat, position.lng], 15, { animate: true, duration: 1.0 });
        }
    }, [position, map]);
    return null;
};

const LocationMarker = ({ position, setPosition, iconType = 'farm' }: { position: GeoPoint | null, setPosition: (p: GeoPoint) => void, iconType?: 'farm' | 'slurry' | 'manure' }) => {
    const map = useMap();
    const markerRef = useRef<L.Marker>(null);
    
    // Select Icon based on Type
    const icon = iconType === 'slurry' ? slurryIcon : iconType === 'manure' ? manureIcon : farmIcon;

    useMapEvents({
        click(e) {
            setPosition({ lat: e.latlng.lat, lng: e.latlng.lng });
        },
    });

    const eventHandlers = useMemo(
        () => ({
            dragend() {
                const marker = markerRef.current;
                if (marker != null) {
                    const { lat, lng } = marker.getLatLng();
                    setPosition({ lat, lng });
                }
            },
        }),
        [setPosition],
    );

    useEffect(() => {
        setTimeout(() => map.invalidateSize(), 200);
    }, [map]);

    return position ? (
        <Marker 
            draggable={true}
            eventHandlers={eventHandlers}
            position={[position.lat, position.lng]} 
            icon={icon} 
            ref={markerRef}
        />
    ) : null;
};

const InlineMap = ({ position, setPosition, iconType = 'farm' }: { position: GeoPoint | null, setPosition: (p: GeoPoint) => void, iconType?: 'farm' | 'slurry' | 'manure' }) => {
    const [style, setStyle] = useState<'standard' | 'satellite'>('standard');
    // Default center only used for initial render if no position
    const center = position || { lat: 47.5, lng: 14.5 };
    
    return (
        <div className="h-64 w-full rounded-xl overflow-hidden border border-slate-300 relative mt-2 shadow-inner group z-0">
            <MapContainer center={[center.lat, center.lng]} zoom={15} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                <TileLayer attribution='&copy; OpenStreetMap' url={style === 'standard' ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"} />
                <LocationMarker position={position} setPosition={setPosition} iconType={iconType} />
                <MapRecenter position={position} />
            </MapContainer>
            
            <div className="absolute top-2 right-2 flex flex-col gap-2 z-[400]">
                 <button onClick={() => setStyle(prev => prev === 'standard' ? 'satellite' : 'standard')} className="bg-white/90 p-2 rounded shadow text-slate-700 hover:text-green-600 text-xs font-bold backdrop-blur">
                    {style === 'standard' ? 'Satellit' : 'Karte'}
                 </button>
                 <button onClick={() => {
                     navigator.geolocation.getCurrentPosition(pos => {
                         const p = {lat: pos.coords.latitude, lng: pos.coords.longitude};
                         setPosition(p);
                     });
                 }} className="bg-white/90 p-2 rounded shadow text-slate-700 hover:text-blue-600 backdrop-blur" title="Mein Standort">
                    <LocateFixed size={16}/>
                 </button>
            </div>
            {!position && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/10 pointer-events-none z-[400]">
                    <span className="bg-white/80 px-3 py-1 rounded text-sm text-slate-600 font-medium backdrop-blur">Auf Karte tippen zum Setzen</span>
                </div>
            )}
        </div>
    );
};

export const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState<'profile' | 'storage' | 'general' | 'sync'>('profile');
  
  // Profile State
  const [profile, setProfile] = useState<FarmProfile>({ farmId: '', operatorName: '', address: '', totalAreaHa: 0 });
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Storage State
  const [storages, setStorages] = useState<StorageLocation[]>([]);
  const [isAddingStorage, setIsAddingStorage] = useState(false);
  
  // App Settings State
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  
  // New Storage Form
  const [newStorage, setNewStorage] = useState<Partial<StorageLocation>>({ name: '', type: FertilizerType.SLURRY, capacity: 100, currentLevel: 0, dailyGrowth: 0.5, geo: { lat: 47.5, lng: 14.5 } });

  // Sync State
  const [isTestingConn, setIsTestingConn] = useState(false);
  
  // Restore State
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // PIN Visibility
  const [showPin, setShowPin] = useState(false);

  useEffect(() => { loadData(); }, []);

  const showNotification = (msg: string) => {
      setNotification(msg);
      setTimeout(() => setNotification(null), 3000);
  };

  const loadData = async () => {
    const p = await dbService.getFarmProfile();
    if (p.length > 0) setProfile(prev => ({ ...prev, ...p[0] }));
    
    const fields = await dbService.getFields();
    const totalHa = fields.reduce((sum, f) => sum + f.areaHa, 0);
    setProfile(prev => ({ ...prev, totalAreaHa: totalHa }));

    const s = await dbService.getStorageLocations();
    setStorages(s);

    const as = await dbService.getSettings();
    setAppSettings(as);
  };

  const handleSaveProfile = async () => {
    await dbService.saveFarmProfile(profile);
    showNotification('Betriebsdaten gespeichert.');
  };

  const handleGeocode = async () => {
      if(!profile.address) return;
      setIsGeocoding(true);
      const coords = await geocodeAddress(profile.address);
      setIsGeocoding(false);
      if(coords) setProfile(prev => ({...prev, addressGeo: coords}));
      else alert('Adresse konnte nicht gefunden werden.');
  };

  const handleDeleteStorage = async (id: string) => {
    if (confirm('Lagerplatz wirklich löschen?')) {
        await dbService.deleteStorage(id);
        loadData();
        showNotification('Lagerplatz gelöscht.');
    }
  };

  const handleStartAddStorage = () => {
    // If we have a farm location, use it as start for new storage, otherwise Austria center
    const initialGeo = profile.addressGeo || { lat: 47.5, lng: 14.5 };
    setNewStorage({ id: undefined, name: '', type: FertilizerType.SLURRY, capacity: 100, currentLevel: 0, dailyGrowth: 0.5, geo: initialGeo });
    setIsAddingStorage(true);
  };

  const handleEditStorage = (storage: StorageLocation) => {
      setNewStorage({ ...storage });
      setIsAddingStorage(true);
  };

  const handleSaveStorage = async () => {
    if (!newStorage.name || !newStorage.geo) { alert("Bitte Name und Standort angeben."); return; }
    const storage: StorageLocation = {
        id: newStorage.id || Math.random().toString(36).substr(2, 9),
        name: newStorage.name,
        type: newStorage.type || FertilizerType.SLURRY,
        capacity: newStorage.capacity || 0,
        currentLevel: newStorage.currentLevel || 0,
        dailyGrowth: newStorage.dailyGrowth || 0,
        geo: newStorage.geo
    };
    await dbService.saveStorageLocation(storage);
    setIsAddingStorage(false);
    loadData();
    showNotification('Lager gespeichert.');
  };

  const handleSaveAppSettings = async () => {
      await dbService.saveSettings(appSettings);
      showNotification('Einstellungen gespeichert.');
  };

  const handleTestConnection = async () => {
      setIsTestingConn(true);
      try {
          await syncData(); 
          alert(`Sync erfolgreich!\nDaten für Betrieb "${appSettings.farmId || 'Privat'}" geladen.`);
      } catch (e: any) {
          alert(`Fehler: ${e.message}`);
      } finally {
          setIsTestingConn(false);
      }
  };

  // --- BACKUP IMPLEMENTATION ---
  
  const handleExportBackup = async () => { 
      try {
          const backup = await dbService.createFullBackup();
          const jsonStr = JSON.stringify(backup, null, 2);
          const blob = new Blob([jsonStr], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          
          const a = document.createElement('a');
          a.href = url;
          a.download = `agritrack_backup_${new Date().toISOString().slice(0,10)}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          showNotification('Backup heruntergeladen.');
      } catch (e) {
          console.error(e);
          alert('Fehler beim Backup erstellen.');
      }
  };
  
  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      if (!confirm("WARNUNG: Alle lokalen Daten werden überschrieben! Fortfahren?")) {
          e.target.value = '';
          return;
      }

      try {
          const text = await file.text();
          const json = JSON.parse(text);
          await dbService.restoreFullBackup(json);
          await loadData(); // Reload UI
          showNotification('Backup erfolgreich wiederhergestellt!');
      } catch (err: any) {
          console.error(err);
          alert("Fehler beim Wiederherstellen: " + err.message);
      } finally {
          e.target.value = ''; // Reset input
      }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 relative">
      {notification && (
          <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white px-6 py-3 rounded-full shadow-lg z-[1000] flex items-center animate-in fade-in slide-in-from-bottom-4">
              <Check size={18} className="mr-2 text-green-400"/> {notification}
          </div>
      )}

      {/* Header */}
      <div className="bg-white p-4 shadow-sm border-b border-slate-200 shrink-0">
        <h1 className="text-2xl font-bold text-slate-800">Optionen</h1>
        <div className="flex space-x-4 mt-4 text-sm font-medium text-slate-500 overflow-x-auto">
            <button onClick={() => setActiveTab('profile')} className={`pb-2 border-b-2 whitespace-nowrap ${activeTab === 'profile' ? 'border-green-600 text-green-600' : 'border-transparent'}`}>Betrieb</button>
            <button onClick={() => setActiveTab('storage')} className={`pb-2 border-b-2 whitespace-nowrap ${activeTab === 'storage' ? 'border-green-600 text-green-600' : 'border-transparent'}`}>Lager</button>
            <button onClick={() => setActiveTab('general')} className={`pb-2 border-b-2 whitespace-nowrap ${activeTab === 'general' ? 'border-green-600 text-green-600' : 'border-transparent'}`}>Allgemein</button>
            <button onClick={() => setActiveTab('sync')} className={`pb-2 border-b-2 whitespace-nowrap ${activeTab === 'sync' ? 'border-green-600 text-green-600' : 'border-transparent'}`}>Cloud & Daten</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
        
        {/* --- PROFILE TAB --- */}
        {activeTab === 'profile' && (
            <div className="space-y-4 max-w-lg mx-auto pb-20">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 space-y-4">
                    <h2 className="font-bold text-lg flex items-center text-slate-700">
                        <Building2 className="mr-2" size={20}/> Stammdaten
                    </h2>
                    
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Betriebsnummer (LFBIS)</label>
                        <input 
                            type="text" 
                            value={profile.farmId}
                            onChange={e => setProfile({...profile, farmId: e.target.value})}
                            className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-green-500 outline-none"
                            placeholder="z.B. 1234567"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Bewirtschafter</label>
                        <input 
                            type="text" 
                            value={profile.operatorName}
                            onChange={e => setProfile({...profile, operatorName: e.target.value})}
                            className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-green-500 outline-none"
                        />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Adresse</label>
                        <div className="flex gap-2">
                            <input 
                                type="text"
                                value={profile.address}
                                onChange={e => setProfile({...profile, address: e.target.value})}
                                className="flex-1 border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-green-500 outline-none"
                            />
                            <button onClick={handleGeocode} disabled={isGeocoding} className="bg-blue-50 text-blue-700 px-3 rounded-lg"><Search size={18}/></button>
                        </div>
                    </div>

                    {/* RESTORED: Total Area Display */}
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex justify-between items-center">
                        <span className="text-sm font-bold text-slate-600">Gesamtfläche (aus Feldern)</span>
                        <span className="text-lg font-bold text-slate-800">{profile.totalAreaHa.toFixed(2)} ha</span>
                    </div>

                    {/* RESTORED: Farm Location Map */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Hofstelle (Kartenmittelpunkt)</label>
                        <InlineMap 
                            position={profile.addressGeo || null} 
                            setPosition={(p) => setProfile({...profile, addressGeo: p})} 
                            iconType='farm'
                        />
                    </div>

                    <button onClick={handleSaveProfile} className="w-full bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 transition">Speichern</button>
                </div>
            </div>
        )}

        {/* --- STORAGE TAB --- */}
        {activeTab === 'storage' && (
            <div className="space-y-4 pb-20 max-w-lg mx-auto">
                {!isAddingStorage ? (
                    <>
                        {storages.map(s => (
                            <div key={s.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex justify-between items-center">
                                <div className="flex items-center space-x-3">
                                    <div className={`p-2 rounded-full ${s.type === FertilizerType.SLURRY ? 'bg-amber-100 text-amber-800' : 'bg-orange-100 text-orange-800'}`}>
                                        {s.type === FertilizerType.SLURRY ? <Droplets size={18}/> : <Layers size={18}/>}
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-800">{s.name}</div>
                                        <div className="text-xs text-slate-500">{s.type} • {s.capacity} m³ • {s.dailyGrowth} m³/Tag</div>
                                    </div>
                                </div>
                                <div className="flex space-x-2">
                                    <button onClick={() => handleEditStorage(s)} className="p-2 text-blue-400 bg-blue-50 rounded-full hover:bg-blue-100"><Pencil size={16}/></button>
                                    <button onClick={() => handleDeleteStorage(s.id)} className="p-2 text-red-400 bg-red-50 rounded-full hover:bg-red-100"><Trash2 size={16}/></button>
                                </div>
                            </div>
                        ))}
                        <button onClick={handleStartAddStorage} className="w-full py-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold flex justify-center items-center hover:border-green-500 hover:text-green-600 hover:bg-green-50 transition-all">
                            <Plus className="mr-2"/> Neues Lager hinzufügen
                        </button>
                    </>
                ) : (
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4 animate-in fade-in slide-in-from-bottom-4">
                        <h2 className="font-bold text-lg text-slate-800 border-b border-slate-100 pb-2">Lager Bearbeiten</h2>
                        
                        {/* RESTORED: Labels and Fields */}
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Bezeichnung</label>
                            <input type="text" placeholder="z.B. Güllegrube Hof" className="w-full border p-2 rounded-lg" value={newStorage.name} onChange={e => setNewStorage({...newStorage, name: e.target.value})} />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Typ</label>
                            <div className="flex space-x-2">
                                <button 
                                    onClick={() => setNewStorage({...newStorage, type: FertilizerType.SLURRY})}
                                    className={`flex-1 py-2 rounded-lg border font-bold flex items-center justify-center ${newStorage.type === FertilizerType.SLURRY ? 'bg-amber-100 border-amber-500 text-amber-900' : 'bg-white border-slate-200 text-slate-400'}`}
                                >
                                    <Droplets size={16} className="mr-2"/> Gülle
                                </button>
                                <button 
                                    onClick={() => setNewStorage({...newStorage, type: FertilizerType.MANURE})}
                                    className={`flex-1 py-2 rounded-lg border font-bold flex items-center justify-center ${newStorage.type === FertilizerType.MANURE ? 'bg-orange-100 border-orange-500 text-orange-900' : 'bg-white border-slate-200 text-slate-400'}`}
                                >
                                    <Layers size={16} className="mr-2"/> Mist
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="col-span-1">
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Kapazität (m³)</label>
                                <input type="number" className="w-full border p-2 rounded-lg font-bold" value={newStorage.capacity} onChange={e => setNewStorage({...newStorage, capacity: parseFloat(e.target.value)})} />
                            </div>
                            <div className="col-span-1">
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Aktuell (m³)</label>
                                <input type="number" className="w-full border p-2 rounded-lg" value={newStorage.currentLevel} onChange={e => setNewStorage({...newStorage, currentLevel: parseFloat(e.target.value)})} />
                            </div>
                            <div className="col-span-1">
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Zuwachs/Tag</label>
                                <input type="number" step="0.1" className="w-full border p-2 rounded-lg" value={newStorage.dailyGrowth} onChange={e => setNewStorage({...newStorage, dailyGrowth: parseFloat(e.target.value)})} />
                            </div>
                        </div>

                        {/* RESTORED: Map Selection */}
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Standort</label>
                            <InlineMap 
                                position={newStorage.geo || null}
                                setPosition={(p) => setNewStorage({...newStorage, geo: p})}
                                iconType={newStorage.type === FertilizerType.SLURRY ? 'slurry' : 'manure'}
                            />
                        </div>

                        <div className="flex justify-between pt-4">
                            <button onClick={() => setIsAddingStorage(false)} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg">Abbrechen</button>
                            <button onClick={handleSaveStorage} className="bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-700 shadow-lg">Speichern</button>
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* --- GENERAL TAB (UPDATED) --- */}
        {activeTab === 'general' && (
            <div className="space-y-6 max-w-lg mx-auto pb-20">
                 
                 {/* Standard Values */}
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 space-y-4">
                     <h2 className="font-bold text-lg text-slate-700 flex items-center"><Tractor className="mr-2" size={20}/> Standard Lademengen</h2>
                     <div className="grid grid-cols-2 gap-4">
                         <div>
                             <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Güllefass (m³)</label>
                             <input type="number" value={appSettings.slurryLoadSize} onChange={e => setAppSettings({...appSettings, slurryLoadSize: parseFloat(e.target.value)})} className="w-full border p-2 rounded-lg font-bold text-slate-800"/>
                         </div>
                         <div>
                             <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Miststreuer (m³)</label>
                             <input type="number" value={appSettings.manureLoadSize} onChange={e => setAppSettings({...appSettings, manureLoadSize: parseFloat(e.target.value)})} className="w-full border p-2 rounded-lg font-bold text-slate-800"/>
                         </div>
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                         <div>
                             {/* RENAMED LABEL */}
                             <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Arbeitsbr. Gülle (m)</label>
                             <input type="number" value={appSettings.slurrySpreadWidth || appSettings.spreadWidth} onChange={e => setAppSettings({...appSettings, slurrySpreadWidth: parseFloat(e.target.value)})} className="w-full border p-2 rounded-lg"/>
                         </div>
                         <div>
                             {/* RENAMED LABEL */}
                             <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Arbeitsbr. Mist (m)</label>
                             <input type="number" value={appSettings.manureSpreadWidth || 10} onChange={e => setAppSettings({...appSettings, manureSpreadWidth: parseFloat(e.target.value)})} className="w-full border p-2 rounded-lg"/>
                         </div>
                     </div>
                 </div>

                 {/* RESTORED: GPS & Tracking Settings */}
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 space-y-4">
                     <h2 className="font-bold text-lg text-slate-700 flex items-center"><Activity className="mr-2" size={20}/> Tracking & GPS</h2>
                     
                     <div className="grid grid-cols-2 gap-4">
                         <div>
                             <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Min. Speed (km/h)</label>
                             <input type="number" step="0.5" value={appSettings.minSpeed} onChange={e => setAppSettings({...appSettings, minSpeed: parseFloat(e.target.value)})} className="w-full border p-2 rounded-lg"/>
                             <p className="text-[10px] text-slate-400 mt-1">Darunter kein Ausbringen.</p>
                         </div>
                         <div>
                             <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Max. Speed (km/h)</label>
                             <input type="number" value={appSettings.maxSpeed} onChange={e => setAppSettings({...appSettings, maxSpeed: parseFloat(e.target.value)})} className="w-full border p-2 rounded-lg"/>
                             <p className="text-[10px] text-slate-400 mt-1">Maximalgeschwindigkeit.</p>
                         </div>
                     </div>

                     <div>
                         <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Lager Radius (m)</label>
                         <input type="number" value={appSettings.storageRadius} onChange={e => setAppSettings({...appSettings, storageRadius: parseFloat(e.target.value)})} className="w-full border p-2 rounded-lg"/>
                         <p className="text-[10px] text-slate-400 mt-1">Erkennungsbereich für automatisches Laden.</p>
                     </div>
                 </div>

                 {/* RESTORED: App Design / Brand */}
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 space-y-4">
                     <h2 className="font-bold text-lg text-slate-700 flex items-center"><Palette className="mr-2" size={20}/> Design / Marke</h2>
                     <div className="grid grid-cols-4 gap-2">
                         {ICON_THEMES.map(theme => (
                             <button
                                key={theme.id}
                                onClick={() => setAppSettings({...appSettings, appIcon: theme.id})}
                                className={`p-2 rounded-lg border-2 flex flex-col items-center ${appSettings.appIcon === theme.id ? 'border-blue-500 bg-blue-50' : 'border-transparent hover:bg-slate-50'}`}
                             >
                                 <div className="w-8 h-8 rounded-full mb-1 border shadow-sm" style={{backgroundColor: theme.bg}}></div>
                                 <span className="text-[10px] font-bold text-slate-600 truncate w-full text-center">{theme.label}</span>
                             </button>
                         ))}
                     </div>
                 </div>

                 <button onClick={handleSaveAppSettings} className="w-full bg-slate-800 text-white py-4 rounded-xl font-bold hover:bg-slate-900 transition shadow-lg sticky bottom-20">Einstellungen Speichern</button>
            </div>
        )}

        {/* --- CLOUD & DATA TAB --- */}
        {activeTab === 'sync' && (
            <div className="space-y-6 max-w-lg mx-auto pb-20">
                
                {/* FARM CONNECTION SETTINGS */}
                <div className="bg-blue-50 p-6 rounded-xl shadow-sm border border-blue-100 space-y-4">
                    <h2 className="font-bold text-lg text-blue-900 flex items-center">
                        <Users className="mr-2" size={20}/> Hof Verbindung
                    </h2>
                    <p className="text-sm text-blue-700">
                        Verbinde dich mit deinem Betrieb, um Daten mit Mitarbeitern zu teilen. 
                        Alle Geräte mit derselben Nummer und demselben Passwort arbeiten zusammen.
                    </p>

                    <div>
                        <label className="block text-xs font-bold text-blue-800 uppercase mb-1">Betriebsnummer (Gruppen-ID)</label>
                        <div className="relative">
                            <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400" size={18}/>
                            <input 
                                type="text" 
                                value={appSettings.farmId || ''}
                                onChange={e => setAppSettings({...appSettings, farmId: e.target.value})}
                                className="w-full pl-10 pr-4 py-3 bg-white border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="z.B. LFBIS Nummer"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-blue-800 uppercase mb-1">Hof-Passwort (PIN)</label>
                        <div className="relative flex items-center">
                            <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400" size={18}/>
                            <input 
                                type={showPin ? "text" : "password"} 
                                value={appSettings.farmPin || ''}
                                onChange={e => setAppSettings({...appSettings, farmPin: e.target.value})}
                                className="w-full pl-10 pr-10 py-3 bg-white border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Sicherer Code"
                            />
                            <button 
                                type="button"
                                onClick={() => setShowPin(!showPin)}
                                className="absolute right-3 text-blue-400 hover:text-blue-600"
                            >
                                {showPin ? <EyeOff size={18}/> : <Eye size={18}/>}
                            </button>
                        </div>
                        <p className="text-xs text-blue-600 mt-1 font-medium bg-blue-100/50 p-2 rounded">
                            <AlertTriangle size={12} className="inline mr-1 -mt-0.5"/>
                            WICHTIG: Wenn du diese PIN vergisst, musst du sie auf allen Geräten neu setzen. Alte Daten sind dann eventuell nicht mehr sichtbar, bis die richtige PIN wieder eingegeben wird.
                        </p>
                    </div>

                    <div className="flex gap-2 mt-4">
                        <button 
                            onClick={handleSaveAppSettings}
                            className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition"
                        >
                            Verbindung speichern
                        </button>
                        <button 
                            onClick={handleTestConnection}
                            disabled={isTestingConn}
                            className="bg-white text-blue-700 border border-blue-200 px-4 rounded-lg font-bold hover:bg-blue-50 flex items-center"
                        >
                            {isTestingConn ? <Loader2 className="animate-spin"/> : <Wifi size={20}/>}
                        </button>
                    </div>
                </div>

                {/* BACKUP */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 space-y-4">
                    <h2 className="font-bold text-lg text-slate-700 flex items-center">
                        <Database className="mr-2" size={20}/> Backup & Wiederherstellung
                    </h2>
                    <div className="flex flex-col gap-3">
                         <button onClick={handleExportBackup} className="w-full bg-slate-100 text-slate-700 py-3 rounded-xl font-bold flex items-center justify-center hover:bg-slate-200">
                             <Download className="mr-2" size={20}/> Daten sichern (Export)
                         </button>
                         
                         <div className="relative">
                             <input 
                                 type="file" 
                                 accept=".json"
                                 ref={fileInputRef}
                                 onChange={handleRestoreBackup}
                                 className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                             />
                             <button className="w-full bg-slate-100 text-red-600 border border-red-100 py-3 rounded-xl font-bold flex items-center justify-center hover:bg-red-50">
                                 <Upload className="mr-2" size={20}/> Daten wiederherstellen (Import)
                             </button>
                         </div>
                    </div>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};
