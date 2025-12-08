
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { dbService } from '../services/db';
import { FarmProfile, StorageLocation, FertilizerType, GeoPoint, AppSettings, DEFAULT_SETTINGS } from '../types';
import { Save, Plus, Trash2, Navigation, X, Building2, Droplets, Search, Loader2, Check, Pencil, Settings as SettingsIcon, Database, Download, Upload, Wifi, AlertCircle, AlertTriangle, Palette } from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import { geocodeAddress } from '../utils/geo';
import L from 'leaflet';
import { syncData } from '../services/sync';
import { ICON_THEMES, getAppIcon } from '../utils/appIcons';

// Helper component to handle map clicks and dragging
const LocationMarker = ({ position, setPosition }: { position: GeoPoint | null, setPosition: (p: GeoPoint) => void }) => {
  
  // Handle Map Clicks (Jump to location)
  useMapEvents({
    click(e) {
      setPosition({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });

  // Handle Dragging
  const markerRef = useRef<L.Marker>(null);
  
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

  return position ? (
    <Marker 
        draggable={true}
        eventHandlers={eventHandlers}
        position={[position.lat, position.lng]} 
        ref={markerRef}
        autoPan={true}
    /> 
  ) : null;
};

// Helper to auto-center map when opened or position changes
const MapRecenter = ({ center }: { center: GeoPoint | null }) => {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView([center.lat, center.lng], 16, { animate: true });
      map.invalidateSize(); // Fix for map rendering issues in tabs/hidden containers
    }
  }, [center, map]);
  return null;
};

// Mini Inline Map Component
const InlineMap = ({ position, setPosition }: { position: GeoPoint | null, setPosition: (p: GeoPoint) => void }) => {
    const [style, setStyle] = useState<'standard' | 'satellite'>('standard');
    
    // Default center (Austria) or position
    const center = position || { lat: 47.5, lng: 14.5 };
    const zoom = position ? 15 : 6;
    
    // Use a key to force re-render if we go from "No position (Austria)" to "Position Found"
    // This solves the issue where the map initializes at default and doesn't snap correctly
    const mapKey = position ? `map-${position.lat}-${position.lng}` : 'map-default';

    return (
        <div className="h-64 w-full rounded-xl overflow-hidden border border-slate-300 relative mt-4 shadow-inner">
            <MapContainer 
                key={mapKey} // Force re-mount when position is finally loaded
                center={[center.lat, center.lng]} 
                zoom={zoom} 
                style={{ height: '100%', width: '100%' }}
            >
                <TileLayer 
                    attribution={style === 'standard' ? '&copy; OpenStreetMap' : 'Tiles &copy; Esri'}
                    url={style === 'standard' 
                        ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    }
                />
                <MapRecenter center={position} />
                <LocationMarker position={position} setPosition={setPosition} />
            </MapContainer>
            
            <div className="absolute top-2 right-2 z-[400]">
                 <button 
                    onClick={(e) => { e.preventDefault(); setStyle(prev => prev === 'standard' ? 'satellite' : 'standard'); }}
                    className="bg-white p-2 rounded shadow text-slate-700 hover:text-green-600"
                    title="Satellit/Karte"
                 >
                     <SettingsIcon size={16} />
                 </button>
            </div>
            
            <div className="absolute bottom-2 left-2 z-[400] bg-white/80 backdrop-blur px-2 py-1 rounded text-xs text-slate-600 shadow pointer-events-none">
                Klicken oder Pin verschieben
            </div>
        </div>
    );
};

export const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState<'profile' | 'storage' | 'general' | 'data'>('profile');
  
  // Profile State with defaults
  const [profile, setProfile] = useState<FarmProfile>({
    farmId: '',
    operatorName: '',
    address: '',
    totalAreaHa: 0
  });
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Storage State
  const [storages, setStorages] = useState<StorageLocation[]>([]);
  const [isAddingStorage, setIsAddingStorage] = useState(false);
  
  // App Settings State
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  
  // New Storage Form
  const [newStorage, setNewStorage] = useState<Partial<StorageLocation>>({
    name: '',
    type: FertilizerType.SLURRY,
    capacity: 100,
    currentLevel: 0,
    dailyGrowth: 0.5,
    geo: { lat: 47.5, lng: 14.5 } // Default center Austria roughly
  });

  // Restore State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isTestingConn, setIsTestingConn] = useState(false);
  const [restoreResult, setRestoreResult] = useState<{success: boolean, message: string} | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const showNotification = (msg: string) => {
      setNotification(msg);
      setTimeout(() => setNotification(null), 3000);
  };

  const loadData = async () => {
    const p = await dbService.getFarmProfile();
    // Only overwrite defaults if DB has data
    if (p.length > 0) {
        setProfile(prev => ({
            ...prev,
            ...p[0] // Merge DB data
        }));
    }
    
    // Calculate total area from fields automatically
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
    showNotification('Betriebsdaten erfolgreich gespeichert.');
  };

  const handleGeocode = async () => {
      if(!profile.address) return;
      setIsGeocoding(true);
      const coords = await geocodeAddress(profile.address);
      setIsGeocoding(false);
      
      if(coords) {
          setProfile(prev => ({...prev, addressGeo: coords}));
      } else {
          alert('Adresse konnte nicht gefunden werden. Bitte Standort manuell auf der Karte setzen.');
      }
  };

  const handleDeleteStorage = async (id: string) => {
    if (confirm('Lagerplatz wirklich löschen?')) {
        await dbService.deleteStorage(id);
        const newStorages = storages.filter(s => s.id !== id);
        setStorages(newStorages);
        showNotification('Lagerplatz gelöscht.');
    }
  };

  const handleStartAddStorage = () => {
    // If farm profile has a location, use it as start point for new storage
    const initialGeo = profile.addressGeo || { lat: 47.5, lng: 14.5 };
    
    setNewStorage({
        id: undefined, // Ensure no ID is set for creation
        name: '',
        type: FertilizerType.SLURRY,
        capacity: 100,
        currentLevel: 0,
        dailyGrowth: 0.5,
        geo: initialGeo
    });
    setIsAddingStorage(true);
  };

  const handleEditStorage = (storage: StorageLocation) => {
      setNewStorage({ ...storage });
      setIsAddingStorage(true);
  };

  const handleSaveStorage = async () => {
    if (!newStorage.name || !newStorage.geo) {
        alert("Bitte Name und Standort angeben.");
        return;
    }
    const storage: StorageLocation = {
        // Use existing ID if editing, otherwise generate new one
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
    showNotification(newStorage.id ? 'Lager aktualisiert.' : 'Neues Lager angelegt.');
    loadData();
  };

  const handleSaveAppSettings = async () => {
      await dbService.saveSettings(appSettings);
      showNotification('Einstellungen gespeichert.');
  };

  const handleTestConnection = async () => {
      setIsTestingConn(true);
      try {
          await syncData(); // Uses our real sync logic now
          alert(`Verbindung zu ${appSettings.serverUrl} erfolgreich!`);
      } catch (e: any) {
          alert(`Verbindung fehlgeschlagen:\n${e.message}\n\nPrüfen Sie ob der Server läuft und die Adresse korrekt ist.`);
      } finally {
          setIsTestingConn(false);
      }
  };

  const handleExportBackup = async () => {
      const data = {
          profile,
          settings: appSettings,
          fields: await dbService.getFields(),
          storage: await dbService.getStorageLocations(),
          activities: await dbService.getActivities()
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `AgriTrack_Backup_${new Date().toISOString().substring(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsRestoring(true);

      // Helper to read file reliably
      const readFileAsText = (file: File): Promise<string> => {
          return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsText(file);
          });
      };

      try {
          // Read file
          const text = await readFileAsText(file);
          const data = JSON.parse(text);

          // Validation
          if (!data || typeof data !== 'object') throw new Error("Ungültiges Dateiformat.");

          let restoredFields = 0;
          let restoredActs = 0;
          let restoredStorage = 0;

          // Restore Profile
          if (data.profile) await dbService.saveFarmProfile(data.profile);
          
          // Restore Settings
          if (data.settings) await dbService.saveSettings(data.settings);

          // Restore Fields
          if (Array.isArray(data.fields)) {
              for (const f of data.fields) {
                  await dbService.saveField(f);
                  restoredFields++;
              }
          }

          // Restore Storage
          if (Array.isArray(data.storage)) {
              for (const s of data.storage) {
                  await dbService.saveStorageLocation(s);
                  restoredStorage++;
              }
          }

          // Restore Activities
          if (Array.isArray(data.activities)) {
              for (const a of data.activities) {
                  await dbService.saveActivity(a);
                  restoredActs++;
              }
          }

          const message = `${restoredFields} Felder\n${restoredActs} Tätigkeiten\n${restoredStorage} Lagerplätze\n\nwurden erfolgreich wiederhergestellt.`;
          setRestoreResult({ success: true, message });
          loadData(); // Refresh UI

      } catch (err: any) {
          console.error(err);
          setRestoreResult({ success: false, message: err.message || "Unbekannter Fehler" });
      } finally {
          setIsRestoring(false);
          if (fileInputRef.current) fileInputRef.current.value = ''; // Reset input to allow re-selecting same file
      }
  };

  const getDeviceLocation = (target: 'storage' | 'farm') => {
    navigator.geolocation.getCurrentPosition(pos => {
        const geo = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (target === 'storage') {
            setNewStorage(prev => ({...prev, geo }));
        } else {
            setProfile(prev => ({...prev, addressGeo: geo }));
        }
    });
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 relative">
      {/* Toast Notification */}
      {notification && (
          <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white px-6 py-3 rounded-full shadow-lg z-[1000] flex items-center animate-in fade-in slide-in-from-bottom-4">
              <Check size={18} className="mr-2 text-green-400"/>
              <span className="font-medium text-sm">{notification}</span>
          </div>
      )}

      {/* Restore Result Modal */}
      {restoreResult && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm animate-in zoom-in-95 duration-200">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${restoreResult.success ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                      {restoreResult.success ? <Check size={32} /> : <AlertTriangle size={32} />}
                  </div>
                  <h3 className="text-xl font-bold text-center text-slate-800 mb-2">
                      {restoreResult.success ? 'Wiederherstellung fertig' : 'Fehler'}
                  </h3>
                  <p className="text-center text-slate-600 whitespace-pre-line mb-6 text-sm">
                      {restoreResult.message}
                  </p>
                  <button 
                      onClick={() => setRestoreResult(null)}
                      className="w-full bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-900 transition"
                  >
                      Schließen
                  </button>
              </div>
          </div>
      )}

      {/* Header */}
      <div className="bg-white p-4 shadow-sm border-b border-slate-200">
        <h1 className="text-2xl font-bold text-slate-800">Optionen</h1>
        <div className="flex space-x-4 mt-4 text-sm font-medium text-slate-500 overflow-x-auto">
            <button 
                onClick={() => setActiveTab('profile')}
                className={`pb-2 border-b-2 whitespace-nowrap ${activeTab === 'profile' ? 'border-green-600 text-green-600' : 'border-transparent'}`}
            >
                Betriebsdaten
            </button>
            <button 
                onClick={() => setActiveTab('storage')}
                className={`pb-2 border-b-2 whitespace-nowrap ${activeTab === 'storage' ? 'border-green-600 text-green-600' : 'border-transparent'}`}
            >
                Lagerverwaltung
            </button>
            <button 
                onClick={() => setActiveTab('general')}
                className={`pb-2 border-b-2 whitespace-nowrap ${activeTab === 'general' ? 'border-green-600 text-green-600' : 'border-transparent'}`}
            >
                Allgemein
            </button>
            <button 
                onClick={() => setActiveTab('data')}
                className={`pb-2 border-b-2 whitespace-nowrap ${activeTab === 'data' ? 'border-green-600 text-green-600' : 'border-transparent'}`}
            >
                Daten
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        
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
                            placeholder="Max Mustermann"
                        />
                    </div>

                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Adresse</label>
                        <div className="flex gap-2">
                            <textarea 
                                value={profile.address}
                                onChange={e => setProfile({...profile, address: e.target.value})}
                                className="flex-1 border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-green-500 outline-none"
                                placeholder="Straße, PLZ, Ort"
                                rows={2}
                            />
                            <button 
                                onClick={handleGeocode}
                                disabled={isGeocoding || !profile.address}
                                className="bg-blue-50 text-blue-700 px-3 py-2 rounded-lg font-medium text-sm flex flex-col items-center justify-center hover:bg-blue-100 disabled:opacity-50"
                                title="Koordinaten automatisch suchen"
                            >
                                {isGeocoding ? <Loader2 className="animate-spin mb-1" size={18}/> : <Search className="mb-1" size={18}/>}
                                <span className="text-[10px]">Suchen</span>
                            </button>
                        </div>
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-2">
                             <label className="block text-sm font-medium text-slate-700">Hof Standort</label>
                             <button 
                                onClick={() => getDeviceLocation('farm')}
                                className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded flex items-center hover:bg-slate-200"
                             >
                                 <Navigation size={12} className="mr-1"/> Mein GPS
                             </button>
                        </div>
                        
                        {/* Inline Map Preview */}
                        <InlineMap 
                            position={profile.addressGeo || null} 
                            setPosition={(geo) => setProfile({...profile, addressGeo: geo})} 
                        />
                        
                        {!profile.addressGeo && (
                            <div className="text-xs text-red-400 mt-1 text-center">Bitte Adresse suchen oder auf Karte klicken</div>
                        )}
                        {profile.addressGeo && (
                            <div className="text-[10px] text-slate-400 mt-1 text-center">
                                {profile.addressGeo.lat.toFixed(5)}, {profile.addressGeo.lng.toFixed(5)}
                            </div>
                        )}
                    </div>

                    <div className="bg-slate-50 p-3 rounded-lg flex justify-between items-center text-sm">
                        <span className="text-slate-500">Gesamtfläche (berechnet):</span>
                        <span className="font-bold text-slate-800">{profile.totalAreaHa.toFixed(2)} ha</span>
                    </div>

                    <button 
                        onClick={handleSaveProfile}
                        className="w-full bg-green-600 text-white py-3 rounded-xl font-bold flex items-center justify-center hover:bg-green-700 transition"
                    >
                        <Save className="mr-2" size={18}/> Speichern
                    </button>
                </div>
            </div>
        )}

        {/* --- STORAGE TAB --- */}
        {activeTab === 'storage' && (
            <div className="space-y-4 pb-20">
                {!isAddingStorage ? (
                    <>
                        {storages.map(storage => (
                            <div key={storage.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex justify-between items-center">
                                <div>
                                    <div className="font-bold text-lg text-slate-800">{storage.name}</div>
                                    <div className="text-xs text-slate-500 flex items-center space-x-2">
                                        <span className={`px-2 py-0.5 rounded-full ${storage.type === FertilizerType.SLURRY ? 'bg-amber-100 text-amber-800' : 'bg-orange-100 text-orange-800'}`}>
                                            {storage.type}
                                        </span>
                                        <span>{storage.capacity} m³ Kapazität</span>
                                    </div>
                                    <div className="mt-2 w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                        <div 
                                            className="h-full bg-green-500" 
                                            style={{width: `${Math.min(100, (storage.currentLevel/storage.capacity)*100)}%`}}
                                        ></div>
                                    </div>
                                </div>
                                <div className="flex space-x-2">
                                    <button 
                                        onClick={() => handleEditStorage(storage)} 
                                        className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-full transition"
                                        title="Bearbeiten"
                                    >
                                        <Pencil size={20} />
                                    </button>
                                    <button 
                                        onClick={() => handleDeleteStorage(storage.id)} 
                                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition"
                                        title="Löschen"
                                    >
                                        <Trash2 size={20} />
                                    </button>
                                </div>
                            </div>
                        ))}

                        <button 
                            onClick={handleStartAddStorage}
                            className="w-full py-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold flex items-center justify-center hover:bg-slate-50 hover:border-green-400 hover:text-green-600 transition"
                        >
                            <Plus size={24} className="mr-2"/> Neues Lager anlegen
                        </button>
                    </>
                ) : (
                    <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
                         <div className="bg-slate-50 p-4 border-b flex justify-between items-center">
                            <h3 className="font-bold text-slate-800">
                                {newStorage.id ? 'Lager bearbeiten' : 'Neues Lager'}
                            </h3>
                            <button onClick={() => setIsAddingStorage(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="p-4 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700">Bezeichnung</label>
                                <input 
                                    type="text" 
                                    className="w-full border p-2 rounded mt-1" 
                                    placeholder="z.B. Güllegrube Hof"
                                    value={newStorage.name}
                                    onChange={e => setNewStorage({...newStorage, name: e.target.value})}
                                />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700">Typ</label>
                                    <select 
                                        className="w-full border p-2 rounded mt-1"
                                        value={newStorage.type}
                                        onChange={e => setNewStorage({...newStorage, type: e.target.value as FertilizerType})}
                                    >
                                        <option value={FertilizerType.SLURRY}>Gülle</option>
                                        <option value={FertilizerType.MANURE}>Mist</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700">Kapazität (m³)</label>
                                    <input 
                                        type="number" 
                                        className="w-full border p-2 rounded mt-1" 
                                        value={newStorage.capacity}
                                        onChange={e => setNewStorage({...newStorage, capacity: parseFloat(e.target.value)})}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700">Aktuell (m³)</label>
                                    <input 
                                        type="number" 
                                        className="w-full border p-2 rounded mt-1" 
                                        value={newStorage.currentLevel}
                                        onChange={e => setNewStorage({...newStorage, currentLevel: parseFloat(e.target.value)})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700">Zuwachs / Tag</label>
                                    <input 
                                        type="number" 
                                        className="w-full border p-2 rounded mt-1" 
                                        step="0.1"
                                        value={newStorage.dailyGrowth}
                                        onChange={e => setNewStorage({...newStorage, dailyGrowth: parseFloat(e.target.value)})}
                                    />
                                </div>
                            </div>

                            {/* Location Section with Inline Map */}
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                     <label className="block text-sm font-medium text-slate-700">Lager Standort</label>
                                     <button 
                                        onClick={() => getDeviceLocation('storage')}
                                        className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded flex items-center hover:bg-blue-100"
                                     >
                                         <Navigation size={12} className="mr-1"/> Mein GPS
                                     </button>
                                </div>
                                
                                <InlineMap 
                                    position={newStorage.geo || null} 
                                    setPosition={(geo) => setNewStorage({...newStorage, geo})} 
                                />
                                
                                {newStorage.geo && (
                                    <div className="text-[10px] text-slate-400 mt-1 text-center">
                                        Lat: {newStorage.geo.lat.toFixed(5)}, Lng: {newStorage.geo.lng.toFixed(5)}
                                    </div>
                                )}
                            </div>

                            <button 
                                onClick={handleSaveStorage}
                                className="w-full bg-green-600 text-white py-3 rounded-xl font-bold mt-4 hover:bg-green-700"
                            >
                                {newStorage.id ? 'Lager aktualisiert' : 'Lager Speichern'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* --- GENERAL TAB --- */}
        {activeTab === 'general' && (
            <div className="space-y-6 max-w-lg mx-auto pb-20">
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 space-y-4">
                     <h2 className="font-bold text-lg text-slate-700 flex items-center">
                         <SettingsIcon className="mr-2" size={20}/> Standardwerte & GPS
                     </h2>

                     <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Gülle Fass (m³)</label>
                            <input 
                                type="number" 
                                value={appSettings.slurryLoadSize}
                                onChange={e => setAppSettings({...appSettings, slurryLoadSize: parseFloat(e.target.value)})}
                                className="w-full border p-2 rounded"
                            />
                         </div>
                         <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Miststreuer (m³)</label>
                            <input 
                                type="number" 
                                value={appSettings.manureLoadSize}
                                onChange={e => setAppSettings({...appSettings, manureLoadSize: parseFloat(e.target.value)})}
                                className="w-full border p-2 rounded"
                            />
                         </div>
                     </div>

                     <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Lager Radius (m)</label>
                            <input 
                                type="number" 
                                value={appSettings.storageRadius}
                                onChange={e => setAppSettings({...appSettings, storageRadius: parseFloat(e.target.value)})}
                                className="w-full border p-2 rounded"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Arbeitsbreite (m)</label>
                            <input 
                                type="number" 
                                value={appSettings.spreadWidth}
                                onChange={e => setAppSettings({...appSettings, spreadWidth: parseFloat(e.target.value)})}
                                className="w-full border p-2 rounded"
                            />
                        </div>
                     </div>

                     <div className="border-t border-slate-100 pt-4 mt-2">
                         <h3 className="font-bold text-slate-700 text-sm mb-3">GPS Tracking Grenzwerte (km/h)</h3>
                         <div className="grid grid-cols-2 gap-4">
                             <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Min. Speed</label>
                                <input 
                                    type="number" 
                                    value={appSettings.minSpeed}
                                    onChange={e => setAppSettings({...appSettings, minSpeed: parseFloat(e.target.value)})}
                                    className="w-full border p-2 rounded"
                                />
                             </div>
                             <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Max. Speed</label>
                                <input 
                                    type="number" 
                                    value={appSettings.maxSpeed}
                                    onChange={e => setAppSettings({...appSettings, maxSpeed: parseFloat(e.target.value)})}
                                    className="w-full border p-2 rounded"
                                />
                             </div>
                         </div>
                         <p className="text-xs text-slate-400 mt-2">
                             Düngung wird nur erkannt, wenn die Geschwindigkeit zwischen diesen Werten liegt.
                         </p>
                     </div>
                 </div>

                 {/* App Branding Selection */}
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 space-y-4">
                     <h2 className="font-bold text-lg text-slate-700 flex items-center">
                         <Palette className="mr-2" size={20}/> App Design (Marke)
                     </h2>
                     <p className="text-xs text-slate-500 mb-2">Wählen Sie Ihre bevorzugte Marke für das App-Icon.</p>
                     
                     <div className="grid grid-cols-4 gap-3">
                         {ICON_THEMES.map(theme => (
                             <button
                                key={theme.id}
                                onClick={() => setAppSettings({...appSettings, appIcon: theme.id})}
                                className={`flex flex-col items-center p-2 rounded-lg border-2 transition-all ${appSettings.appIcon === theme.id ? 'border-green-500 bg-green-50 scale-105' : 'border-transparent hover:bg-slate-50'}`}
                             >
                                 <img src={getAppIcon(theme.id)} alt={theme.label} className="w-10 h-10 rounded-lg shadow-sm mb-1 object-contain" />
                                 <span className="text-[9px] text-center font-bold text-slate-600 leading-tight">{theme.label}</span>
                             </button>
                         ))}
                     </div>
                 </div>

                 {/* Sync Settings */}
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 space-y-4">
                     <h2 className="font-bold text-lg text-slate-700 flex items-center">
                         <Wifi className="mr-2" size={20}/> Synchronisation
                     </h2>
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Server URL</label>
                        <input 
                            type="text" 
                            value={appSettings.serverUrl}
                            onChange={e => setAppSettings({...appSettings, serverUrl: e.target.value})}
                            className="w-full border p-2 rounded"
                            placeholder="https://192.168.178.25:6443"
                        />
                        <button 
                            onClick={handleTestConnection}
                            disabled={isTestingConn}
                            className="mt-2 text-xs bg-slate-100 text-slate-600 px-3 py-1 rounded hover:bg-slate-200 flex items-center disabled:opacity-50"
                        >
                            {isTestingConn ? <Loader2 className="animate-spin mr-1" size={12}/> : <Wifi className="mr-1" size={12}/>}
                            Verbindung testen
                        </button>
                     </div>
                 </div>

                 <button 
                    onClick={handleSaveAppSettings}
                    className="w-full bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-900 transition"
                 >
                    Einstellungen Speichern
                 </button>
            </div>
        )}

        {/* --- DATA TAB --- */}
        {activeTab === 'data' && (
            <div className="space-y-6 max-w-lg mx-auto pb-20">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 space-y-4">
                    <h2 className="font-bold text-lg text-slate-700 flex items-center">
                        <Database className="mr-2" size={20}/> Datenverwaltung
                    </h2>
                    <p className="text-sm text-slate-600">
                        Erstellen Sie regelmäßig ein Backup Ihrer Daten oder stellen Sie Daten aus einer Sicherung wieder her.
                    </p>

                    <div className="grid grid-cols-1 gap-4">
                        <button 
                            onClick={handleExportBackup}
                            className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold flex items-center justify-center hover:bg-blue-700 shadow-lg shadow-blue-100 transition"
                        >
                            <Download className="mr-2" size={24}/> Backup Datei erstellen
                        </button>

                        <div className="relative">
                            <input 
                                type="file" 
                                ref={fileInputRef}
                                accept=".json"
                                onChange={handleRestoreBackup}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <button 
                                className="w-full bg-white border-2 border-slate-300 text-slate-600 py-4 rounded-xl font-bold flex items-center justify-center hover:bg-slate-50 hover:border-slate-400 transition"
                            >
                                {isRestoring ? <Loader2 className="animate-spin mr-2" size={24}/> : <Upload className="mr-2" size={24}/>}
                                {isRestoring ? 'Wiederherstellen...' : 'Backup wiederherstellen'}
                            </button>
                        </div>
                    </div>
                    
                    <div className="mt-4 p-4 bg-amber-50 text-amber-800 text-xs rounded-lg border border-amber-100 flex items-start">
                        <AlertCircle className="shrink-0 mr-2" size={16}/>
                        <span>
                            <strong>Hinweis:</strong> Beim Wiederherstellen werden existierende Daten (Felder, Tätigkeiten) aktualisiert, falls sie im Backup vorhanden sind. Neue Daten werden hinzugefügt.
                        </span>
                    </div>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};
