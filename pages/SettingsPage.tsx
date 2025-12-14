import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  User, Database, Settings, Cloud, Save, Plus, Trash2, 
  MapPin, Truck, AlertTriangle, Info, Share2, UploadCloud, 
  Smartphone, CheckCircle2, X, Shield, Lock, Users, LogOut,
  ChevronRight, RefreshCw, Copy, WifiOff, FileText, Search, Map,
  Signal, Activity, ArrowRightLeft, Upload, DownloadCloud, Link, RotateCcw, Binary
} from 'lucide-react';
import { dbService } from '../services/db';
import { authService } from '../services/auth';
import { syncData } from '../services/sync';
import { AppSettings, FarmProfile, StorageLocation, FertilizerType, DEFAULT_SETTINGS, GeoPoint } from '../types';
import { getAppIcon, ICON_THEMES } from '../utils/appIcons';
import { geocodeAddress } from '../utils/geo';
import { isCloudConfigured } from '../services/storage';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';

// --- SHARED ICONS (Duplicates from Tracking/Map for isolation) ---
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

const farmIcon = createCustomIcon('#2563eb', iconPaths.house); // Blue
const slurryIcon = createCustomIcon('#78350f', iconPaths.droplet); // Dark Brown
const manureIcon = createCustomIcon('#d97706', iconPaths.layers); // Orange

// --- HELPER COMPONENT: Location Picker Map ---
const LocationPickerMap = ({ position, onPositionChange, icon }: { position: GeoPoint, onPositionChange: (lat: number, lng: number) => void, icon?: L.DivIcon }) => {
    const map = useMap();
    
    // Ensure map renders correctly in modal
    useEffect(() => {
        const t = setTimeout(() => map.invalidateSize(), 250);
        return () => clearTimeout(t);
    }, [map]);

    // Fly to position if it changes externally (e.g. geocoding)
    useEffect(() => {
        map.setView([position.lat, position.lng], map.getZoom());
    }, [position.lat, position.lng, map]);

    const MapEvents = () => {
        useMapEvents({
            click(e) {
                onPositionChange(e.latlng.lat, e.latlng.lng);
            },
        });
        return null;
    };

    const markerRef = useRef<L.Marker>(null);
    const eventHandlers = useMemo(() => ({
        dragend() {
            const marker = markerRef.current;
            if (marker != null) {
                const { lat, lng } = marker.getLatLng();
                onPositionChange(lat, lng);
            }
        },
    }), [onPositionChange]);

    return (
        <>
            <TileLayer
                attribution='&copy; OpenStreetMap'
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
            <Marker
                draggable={true}
                eventHandlers={eventHandlers}
                position={[position.lat, position.lng]}
                ref={markerRef}
                icon={icon}
            />
            <MapEvents />
        </>
    );
};

interface Props {
    initialTab?: 'profile' | 'storage' | 'general' | 'sync';
}

export const SettingsPage: React.FC<Props> = ({ initialTab = 'profile' }) => {
  const [activeTab, setActiveTab] = useState(initialTab);
  
  // Data State
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [profile, setProfile] = useState<FarmProfile>({
      farmId: '',
      operatorName: '',
      address: '',
      totalAreaHa: 0
  });
  const [storages, setStorages] = useState<StorageLocation[]>([]);
  
  // UI State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [geoCodingStatus, setGeoCodingStatus] = useState<'IDLE'|'LOADING'|'SUCCESS'|'ERROR'>('IDLE');
  
  // Cloud State
  const [cloudMembers, setCloudMembers] = useState<any[]>([]);
  const [cloudStats, setCloudStats] = useState({ total: 0, activities: 0, fields: 0, storages: 0, profiles: 0 });
  const [localStats, setLocalStats] = useState({ total: 0 });
  
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatusText, setUploadStatusText] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const [isDownloading, setIsDownloading] = useState(false); // New Download State

  const [isLoadingCloud, setIsLoadingCloud] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [pinError, setPinError] = useState(false); // Visual Error for PIN
  
  // Debug / Log State
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [inspectorData, setInspectorData] = useState<any>(null);
  const [inspectorLoading, setInspectorLoading] = useState(false);
  const [debugTab, setDebugTab] = useState<'LOGS' | 'INSPECTOR'>('LOGS');

  // Storage Edit State
  const [editingStorage, setEditingStorage] = useState<StorageLocation | null>(null);
  
  // Profile Map Toggle
  const [showProfileMap, setShowProfileMap] = useState(false);

  useEffect(() => {
    loadAll();

    // 1. Listen for DB Changes (e.g. Sync finished downloading settings)
    const unsubDb = dbService.onDatabaseChange(() => {
        loadAll();
    });

    // 2. Listen for Auth Ready (e.g. Page Reload on PC, wait for Firebase)
    const unsubAuth = authService.onAuthStateChanged((user) => {
        if (user) loadAll();
    });

    return () => {
        unsubDb();
        unsubAuth();
    };
  }, []);

  useEffect(() => {
      if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  // Force Cloud Reload when switching to Sync Tab or when ID changes
  useEffect(() => {
      if (activeTab === 'sync' && isCloudConfigured()) {
          // If we have a farm ID, load it.
          if (settings.farmId) {
              loadCloudData(settings.farmId);
          } else {
              // Reload local stats at least
              dbService.getLocalStats().then(setLocalStats);
          }
      }
  }, [settings.farmId, activeTab]);

  const loadAll = async () => {
      const s = await dbService.getSettings();
      setSettings(s);
      
      const p = await dbService.getFarmProfile();
      if (p.length > 0) setProfile(p[0]);

      const st = await dbService.getStorageLocations();
      setStorages(st);
      
      setLoading(false); 
  };

  const loadCloudData = async (farmId: string) => {
      if (!farmId) return;
      const cleanId = cleanFarmId(farmId);
      setIsLoadingCloud(true);
      try {
        const local = await dbService.getLocalStats();
        // Fire both requests
        const membersPromise = dbService.getFarmMembers(cleanId);
        const statsPromise = dbService.getCloudStats(cleanId);
        
        const [members, stats] = await Promise.all([membersPromise, statsPromise]);
        
        setCloudMembers(members);
        setCloudStats(stats);
        setLocalStats(local);
      } catch (e) {
        console.warn("Cloud load warning (offline?):", e);
      } finally {
        setIsLoadingCloud(false);
      }
  };

  const cleanFarmId = (id: string | undefined) => {
      if (!id) return '';
      // Aggressively remove ANYTHING that isn't alphanumeric or dash/underscore
      return id.replace(/[^a-zA-Z0-9-_]/g, '');
  };

  const handleSaveAll = async () => {
      setSaving(true);
      setPinError(false);
      
      // AUTO-CLEAN INPUTS (Remove ALL whitespace)
      const cleanId = cleanFarmId(settings.farmId);
      const cleanPin = settings.farmPin || '';
      
      const cleanSettings = { ...settings, farmId: cleanId, farmPin: cleanPin };
      const cleanProfile = { ...profile, farmId: cleanId };
      
      // 1. PIN CHECK: If cloud configured, we MUST verify the PIN if the farm exists
      if (isCloudConfigured() && cleanId) {
          const verification = await dbService.verifyFarmPin(cleanId, cleanPin);
          if (!verification.valid) {
              // PIN Check Failed!
              setSaving(false);
              setPinError(true);
              alert("Fehler: Das Hof-Passwort (PIN) ist falsch!\nZugriff verweigert.");
              return;
          }
      }

      setSettings(cleanSettings);
      setProfile(cleanProfile);

      // Force UI cleanup after 2 seconds regardless of async result
      const cleanupTimer = setTimeout(() => {
          setSaving(false);
          setShowSaveSuccess(true);
          setTimeout(() => setShowSaveSuccess(false), 2000);
      }, 500); // Super fast feedback

      try {
          // 1. Save Locally (Very Fast)
          localStorage.setItem('agritrack_settings_full', JSON.stringify(cleanSettings));
          localStorage.setItem('agritrack_profile', JSON.stringify(cleanProfile));

          // 2. Trigger Cloud Save (Background - Fire & Forget)
          // We don't await this to prevent UI freezing if internet is slow
          if (isCloudConfigured()) {
              Promise.all([
                  dbService.saveSettings(cleanSettings),
                  dbService.saveFarmProfile(cleanProfile)
              ]).then(() => {
                  // After save, try to refresh stats if we have an ID
                  if (cleanSettings.farmId) loadCloudData(cleanSettings.farmId);
              }).catch(err => console.error("Background save failed:", err));
          }
      } catch (e: any) {
          alert("Fehler beim Speichern: " + e.message);
      }
      // Note: finally is handled by the timer to ensure "Saving..." disappears
  };

  const handleResetConnection = () => {
      if (window.confirm("Möchten Sie die gespeicherte Hof-Verbindung wirklich löschen? (Lokale Daten bleiben erhalten)")) {
          setSettings(prev => ({ ...prev, farmId: '', farmPin: '' }));
          const resetSettings = { ...settings, farmId: '', farmPin: '' };
          localStorage.setItem('agritrack_settings_full', JSON.stringify(resetSettings));
          setCloudStats({ total: -1, activities: 0, fields: 0, storages: 0, profiles: 0 });
          alert("Verbindung getrennt. Bitte Nummer neu eingeben.");
      }
  };

  const handleCheckConnection = async () => {
      if (!settings.farmId) {
          alert("Bitte erst eine Betriebsnummer eingeben.");
          return;
      }
      setIsLoadingCloud(true);
      setPinError(false);
      
      // Use aggressive cleaning for check
      const cleanId = cleanFarmId(settings.farmId);
      const cleanPin = settings.farmPin || '';
      
      // Check credentials strictly
      const verification = await dbService.verifyFarmPin(cleanId, cleanPin);
      if (!verification.valid) {
          setIsLoadingCloud(false);
          setPinError(true);
          alert(`PIN FEHLER: Zugriff auf Hof '${cleanId}' verweigert.\nDas eingegebene Passwort stimmt nicht mit dem Server überein.`);
          return;
      }
      
      // Update state to reflect cleaned version
      setSettings(prev => ({ ...prev, farmId: cleanId }));

      const stats = await dbService.getCloudStats(cleanId);
      setIsLoadingCloud(false);
      
      if (stats.total >= 0) {
          const detailStr = `(Aktivitäten: ${stats.activities}, Felder: ${stats.fields}, Lager: ${stats.storages}, Profile: ${stats.profiles})`;
          alert(`Erfolg! Verbindung zu Hof '${cleanId}' hergestellt.\n\n${stats.total} Einträge gefunden.\n${detailStr}`);
          loadCloudData(cleanId);
      } else {
          alert(`Verbindung fehlgeschlagen.\nIst die Betriebsnummer '${cleanId}' korrekt?\nSind Sie online?`);
      }
  };

  const handleGeocode = async () => {
      if (!profile.address) return;
      setGeoCodingStatus('LOADING');
      const coords = await geocodeAddress(profile.address);
      if (coords) {
          setProfile(prev => ({ ...prev, addressGeo: coords }));
          setGeoCodingStatus('SUCCESS');
      } else {
          setGeoCodingStatus('ERROR');
      }
  };

  const handleStorageSave = async (storage: StorageLocation) => {
      await dbService.saveStorageLocation(storage);
      setEditingStorage(null);
      const st = await dbService.getStorageLocations();
      setStorages(st);
  };

  const handleStorageDelete = async (id: string) => {
      if (window.confirm("Lager wirklich löschen?")) {
          await dbService.deleteStorage(id);
          const st = await dbService.getStorageLocations();
          setStorages(st);
      }
  };

  const handleForceUpload = async () => {
      if (!window.confirm("Alle lokalen Daten (inkl. Felder, Lager, Profil) werden an die Cloud gesendet. Fortfahren?")) return;
      
      setIsUploading(true);
      setUploadProgress(0);
      setUploadStatusText('Vorbereitung...');
      
      try {
          // Force save settings locally first so upload has the ID
          localStorage.setItem('agritrack_settings_full', JSON.stringify(settings));

          await dbService.forceUploadToFarm((msg, percent) => {
              setUploadStatusText(msg);
              setUploadProgress(percent);
          });
          setUploadStatusText('Upload erfolgreich!');
          
          // Force refresh of stats
          if(settings.farmId) {
              await loadCloudData(settings.farmId);
          }
      } catch (e: any) {
          alert("Upload Fehler: " + e.message + "\nBitte Internet prüfen oder Protokoll ansehen.");
          setUploadStatusText('Fehler!');
      } finally {
          // Stop spinner in both success and error cases after a moment
          setTimeout(() => {
              setIsUploading(false);
          }, 1500);
      }
  };

  const handleManualDownload = async () => {
      setIsDownloading(true);
      try {
          await syncData();
          await loadAll(); // Refresh local state
          if (settings.farmId) await loadCloudData(settings.farmId); // Refresh cloud stats
          alert("Daten wurden erfolgreich heruntergeladen!");
      } catch (e: any) {
          alert("Download fehlgeschlagen: " + e.message);
      } finally {
          setIsDownloading(false);
      }
  };
  
  const handleOpenDebug = async () => {
      setShowDebugModal(true);
      setDebugLogs(dbService.getLogs());
      if (settings.farmId && isCloudConfigured()) {
          setInspectorLoading(true);
          const data = await dbService.inspectCloudData(settings.farmId);
          setInspectorData(data);
          setInspectorLoading(false);
          // Refresh logs after inspection log events
          setDebugLogs(dbService.getLogs());
      }
  };

  const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text);
      alert("Kopiert: " + text);
  };

  const handleClearCache = () => {
      if(window.confirm('Achtung: Dies löscht alle lokalen Daten auf diesem Gerät und lädt die App neu.\n\nNicht gespeicherte Daten gehen verloren!\nNur ausführen, wenn die Cloud-Daten aktuell sind.')) {
          localStorage.clear();
          window.location.reload();
      }
  };

  const renderTabs = () => (
      <div className="flex bg-white border-b border-slate-200 overflow-x-auto hide-scrollbar sticky top-0 z-10">
          {[
              { id: 'profile', icon: User, label: 'Betrieb' },
              { id: 'storage', icon: Database, label: 'Lager' },
              { id: 'general', icon: Settings, label: 'Allgemein' },
              { id: 'sync', icon: Cloud, label: 'Cloud & Daten' }
          ].map(tab => (
              <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex-1 flex flex-col items-center justify-center py-4 px-4 min-w-[80px] transition-colors border-b-2 ${
                      activeTab === tab.id 
                      ? 'border-green-600 text-green-700 bg-green-50' 
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
              >
                  <tab.icon size={20} className="mb-1" />
                  <span className="text-xs font-bold whitespace-nowrap">{tab.label}</span>
              </button>
          ))}
      </div>
  );

  // Helper to show ASCII codes of string
  const renderAsciiBreakdown = (str: string) => {
      if(!str) return null;
      return (
          <div className="flex flex-wrap gap-1 mt-2">
              {str.split('').map((char, i) => (
                  <span key={i} className="text-[10px] bg-white border px-1 rounded font-mono" title={`ASCII: ${char.charCodeAt(0)}`}>
                      {char} <span className="text-slate-400">({char.charCodeAt(0)})</span>
                  </span>
              ))}
          </div>
      )
  };

  if (loading) return <div className="p-8 text-center text-slate-500 flex items-center justify-center h-full"><RefreshCw className="animate-spin mr-2"/> Lade Einstellungen...</div>;

  return (
    <div className="h-full bg-slate-50 flex flex-col relative overflow-hidden">
      {renderTabs()}

      <div className="flex-1 overflow-y-auto pb-32">
          
          {/* PROFILE TAB */}
          {activeTab === 'profile' && (
              <div className="p-4 space-y-6 max-w-2xl mx-auto">
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 text-center">
                      <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                          <User size={40} />
                      </div>
                      <h2 className="text-xl font-bold text-slate-800">
                          {profile.operatorName || 'Mein Betrieb'}
                      </h2>
                      <p className="text-slate-500">{profile.farmId || 'Keine Betriebsnummer'}</p>
                  </div>

                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                      <h3 className="font-bold text-lg text-slate-700 mb-4">Stammdaten</h3>
                      <div>
                          <label className="block text-sm font-bold text-slate-500 uppercase mb-1">Betriebsname / Bewirtschafter</label>
                          <input 
                              type="text" 
                              value={profile.operatorName}
                              onChange={(e) => setProfile({...profile, operatorName: e.target.value})}
                              className="w-full p-3 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-green-500"
                              placeholder="Max Mustermann"
                          />
                      </div>
                      <div>
                          <label className="block text-sm font-bold text-slate-500 uppercase mb-1">Betriebsnummer (LFBIS)</label>
                          <input 
                              type="text" 
                              value={profile.farmId}
                              onChange={(e) => setProfile({...profile, farmId: cleanFarmId(e.target.value)})}
                              className="w-full p-3 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-mono"
                              placeholder="1234567"
                          />
                      </div>
                      <div>
                          <label className="block text-sm font-bold text-slate-500 uppercase mb-1">Hofadresse</label>
                          <div className="flex space-x-2">
                              <input 
                                  type="text" 
                                  value={profile.address}
                                  onChange={(e) => setProfile({...profile, address: e.target.value})}
                                  className="flex-1 p-3 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-green-500"
                                  placeholder="Dorfstraße 1, 1234 Ort"
                              />
                              <button onClick={handleGeocode} className="p-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors" title="Adresse suchen"><Search size={20} /></button>
                          </div>
                      </div>
                      
                      {/* Interactive Map Picker */}
                      <div>
                          <button 
                            onClick={() => setShowProfileMap(!showProfileMap)}
                            className="w-full py-2 bg-slate-100 text-slate-700 rounded-lg font-bold text-xs flex items-center justify-center hover:bg-slate-200 border border-slate-200"
                          >
                              <MapPin size={14} className="mr-1"/> {showProfileMap ? 'Karte ausblenden' : 'Standort auf Karte wählen'}
                          </button>
                          
                          {showProfileMap && (
                              <div className="mt-2 h-64 w-full rounded-xl overflow-hidden border-2 border-slate-300 relative">
                                  <MapContainer center={[profile.addressGeo?.lat || 47.5, profile.addressGeo?.lng || 14.5]} zoom={13} style={{ height: '100%', width: '100%' }}>
                                      <LocationPickerMap 
                                        position={profile.addressGeo || {lat: 47.5, lng: 14.5}} 
                                        onPositionChange={(lat, lng) => setProfile(prev => ({...prev, addressGeo: {lat, lng}}))}
                                        icon={farmIcon}
                                      />
                                  </MapContainer>
                                  <div className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-[10px] font-bold shadow-sm z-[1000] pointer-events-none">
                                      Pin verschieben um Position zu setzen
                                  </div>
                              </div>
                          )}
                      </div>
                  </div>
              </div>
          )}
          
          {/* STORAGE TAB */}
          {activeTab === 'storage' && (
              <div className="p-4 space-y-4 max-w-2xl mx-auto">
                   <div className="flex justify-between items-center mb-2">
                      <h3 className="font-bold text-lg text-slate-700">Meine Lager</h3>
                      <button onClick={() => setEditingStorage({ id: Math.random().toString(36).substr(2, 9), name: '', type: FertilizerType.SLURRY, capacity: 100, currentLevel: 0, dailyGrowth: 0.5, geo: { lat: 47.5, lng: 14.5 } })} className="flex items-center text-sm font-bold text-green-600 bg-green-50 px-3 py-2 rounded-lg hover:bg-green-100"><Plus size={16} className="mr-1"/> Neu</button>
                  </div>
                  {storages.map(storage => (
                      <div key={storage.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
                          <div className="flex items-center space-x-4">
                              <div className={`p-3 rounded-full ${storage.type === FertilizerType.SLURRY ? 'bg-amber-100 text-amber-800' : 'bg-orange-100 text-orange-800'}`}><Database size={24}/></div>
                              <div>
                                  <h4 className="font-bold text-slate-800">{storage.name}</h4>
                                  <p className="text-xs text-slate-500">
                                      {storage.currentLevel?.toFixed(0)}/{storage.capacity} m³ • {storage.type}
                                  </p>
                              </div>
                          </div>
                          <div className="flex space-x-2">
                              <button onClick={() => setEditingStorage(storage)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Settings size={20}/></button>
                              <button onClick={() => handleStorageDelete(storage.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={20}/></button>
                          </div>
                      </div>
                  ))}
              </div>
          )}

          {/* GENERAL TAB */}
          {activeTab === 'general' && (
              <div className="p-4 space-y-6 max-w-2xl mx-auto">
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-5">
                      <h3 className="font-bold text-lg text-slate-700 flex items-center"><Truck className="mr-2" size={20}/> Maschinen</h3>
                      
                      <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                              <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Güllefass (m³)</label><input type="number" value={settings.slurryLoadSize} onChange={(e) => setSettings({...settings, slurryLoadSize: parseFloat(e.target.value)})} className="w-full p-2 border border-slate-300 rounded-lg font-bold"/></div>
                              <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Breite Gülle (m)</label><input type="number" value={settings.slurrySpreadWidth || 12} onChange={(e) => setSettings({...settings, slurrySpreadWidth: parseFloat(e.target.value)})} className="w-full p-2 border border-slate-300 rounded-lg"/></div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                              <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Miststreuer (m³)</label><input type="number" value={settings.manureLoadSize || 8} onChange={(e) => setSettings({...settings, manureLoadSize: parseFloat(e.target.value)})} className="w-full p-2 border border-slate-300 rounded-lg font-bold"/></div>
                              <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Breite Mist (m)</label><input type="number" value={settings.manureSpreadWidth || 10} onChange={(e) => setSettings({...settings, manureSpreadWidth: parseFloat(e.target.value)})} className="w-full p-2 border border-slate-300 rounded-lg"/></div>
                          </div>
                      </div>
                  </div>

                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-5">
                      <h3 className="font-bold text-lg text-slate-700 flex items-center"><Signal className="mr-2" size={20}/> GPS & Automatik</h3>
                      <div className="grid grid-cols-3 gap-3">
                          <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Lager Radius (m)</label>
                              <input type="number" value={settings.storageRadius || 15} onChange={(e) => setSettings({...settings, storageRadius: parseFloat(e.target.value)})} className="w-full p-2 border border-slate-300 rounded-lg text-center font-bold"/>
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Min. Speed (km/h)</label>
                              <input type="number" value={settings.minSpeed || 2.0} step="0.5" onChange={(e) => setSettings({...settings, minSpeed: parseFloat(e.target.value)})} className="w-full p-2 border border-slate-300 rounded-lg text-center"/>
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Max. Speed (km/h)</label>
                              <input type="number" value={settings.maxSpeed || 8.0} step="0.5" onChange={(e) => setSettings({...settings, maxSpeed: parseFloat(e.target.value)})} className="w-full p-2 border border-slate-300 rounded-lg text-center"/>
                          </div>
                      </div>
                      <p className="text-[10px] text-slate-400">
                          Radius: Abstand zum Lager für Erkennung. Min/Max Speed: Nur in diesem Bereich wird eine Ausbringung aufgezeichnet.
                      </p>
                  </div>

                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                      <h3 className="font-bold text-lg text-slate-700">App Design</h3>
                      <div className="grid grid-cols-4 gap-4">
                          {ICON_THEMES.map(theme => (
                              <button key={theme.id} onClick={() => setSettings({...settings, appIcon: theme.id})} className={`p-2 rounded-xl border-2 flex flex-col items-center space-y-2 transition-all ${settings.appIcon === theme.id ? 'border-green-500 bg-green-50' : 'border-transparent hover:bg-slate-50'}`}>
                                  <img src={getAppIcon(theme.id)} className="w-10 h-10 rounded-lg shadow-sm" alt={theme.label} />
                                  <span className="text-[10px] font-bold text-slate-600 truncate w-full text-center">{theme.label}</span>
                              </button>
                          ))}
                      </div>
                  </div>
              </div>
          )}

          {/* --- CLOUD TAB --- */}
          {activeTab === 'sync' && (
              <div className="p-4 space-y-6 max-w-2xl mx-auto">
                  
                  {/* Status Banner */}
                  <div className={`p-6 rounded-2xl shadow-sm border text-white ${isCloudConfigured() ? 'bg-slate-800 border-slate-700' : 'bg-slate-500 border-slate-400'}`}>
                      <div className="flex items-center space-x-4 mb-4">
                          <div className={`p-3 rounded-full ${isCloudConfigured() ? 'bg-green-500 text-white' : 'bg-slate-400 text-slate-200'}`}>
                              <Shield size={32} />
                          </div>
                          <div>
                              <h2 className="text-xl font-bold">
                                  {isCloudConfigured() ? 'AgriCloud Aktiv' : 'Demo Modus (Offline)'}
                              </h2>
                              <p className="text-white/70 text-sm">
                                  {isCloudConfigured() ? 'Daten werden synchronisiert.' : 'Daten werden nur lokal gespeichert.'}
                              </p>
                          </div>
                      </div>

                      {isCloudConfigured() ? (
                          <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-white/10">
                              <div>
                                  <div className="text-xs uppercase font-bold text-white/50">User ID</div>
                                  <div className="font-mono text-sm truncate">{authService.login ? 'Angemeldet' : 'Gast'}</div>
                              </div>
                              <div>
                                  <div className="text-xs uppercase font-bold text-white/50 flex items-center justify-between">
                                      <span>Cloud Einträge</span>
                                      <button onClick={() => settings.farmId && loadCloudData(settings.farmId)} className="text-white/80 hover:text-white">
                                         {isLoadingCloud ? <RefreshCw className="animate-spin w-3 h-3"/> : <RefreshCw className="w-3 h-3"/>}
                                      </button>
                                  </div>
                                  <div className="font-mono text-sm flex items-center">
                                    {cloudStats.total === -1 ? (
                                        <span className="flex items-center text-white/50 text-[10px]" title="Keine Verbindung oder Offline"><WifiOff size={10} className="mr-1"/> -</span>
                                    ) : (
                                        cloudStats.total
                                    )}
                                  </div>
                              </div>
                          </div>
                      ) : (
                          <button className="w-full bg-white text-slate-800 py-3 rounded-xl font-bold mt-2">
                              Jetzt Anmelden / Registrieren
                          </button>
                      )}
                  </div>

                  {/* Warning if no Farm ID */}
                  {isCloudConfigured() && !settings.farmId && (
                      <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl flex items-start animate-pulse">
                          <AlertTriangle className="mr-3 shrink-0" size={20}/>
                          <div className="text-sm font-bold">
                              Achtung: Keine Betriebsnummer gespeichert.<br/>
                              Bitte unten eingeben und "Speichern" drücken, um Daten zu laden.
                          </div>
                      </div>
                  )}

                  {/* Connection Settings */}
                  {isCloudConfigured() && (
                      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                          <div className="flex justify-between items-center mb-2">
                              <h3 className="font-bold text-lg text-slate-700 flex items-center">
                                  <Cloud className="mr-2" size={20}/> Hof Verbindung
                              </h3>
                              <div className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold border border-green-200 flex items-center">
                                  <CheckCircle2 size={12} className="mr-1"/> Verbunden
                              </div>
                          </div>

                          {/* Anti-Autofill Wrapper: Using a form with autoComplete="off" + hidden dummy fields */}
                          <form autoComplete="off" className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* DUMMY FIELDS to catch browser autofill */}
                              <input type="text" name="email" style={{display: 'none'}} />
                              <input type="password" name="password" style={{display: 'none'}} />
                              
                              <div>
                                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Betriebsnummer (Farm ID)</label>
                                  <div className="flex space-x-2">
                                      <input 
                                          type="text" 
                                          name="agri_farm_id_custom_field" 
                                          id="agri_farm_id_input"
                                          autoComplete="off"
                                          value={settings.farmId || ''}
                                          onChange={(e) => setSettings({...settings, farmId: cleanFarmId(e.target.value)})}
                                          className={`flex-1 p-3 border rounded-xl font-mono font-bold bg-slate-50 ${pinError ? 'border-red-500 ring-2 ring-red-200' : 'border-slate-300'}`}
                                          placeholder="LFBIS Nummer"
                                      />
                                      {/* Reset Button to clear field if corrupt */}
                                      <button 
                                        type="button" 
                                        onClick={handleResetConnection}
                                        className="p-3 bg-red-50 text-red-600 border border-red-100 rounded-xl hover:bg-red-100"
                                        title="Eingabe löschen & Reset"
                                      >
                                          <Trash2 size={18} />
                                      </button>
                                      <button 
                                        type="button" 
                                        onClick={handleCheckConnection}
                                        className="p-3 bg-slate-100 rounded-xl text-slate-600 hover:bg-slate-200 font-bold text-sm border border-slate-200"
                                        title="Verbindung prüfen"
                                      >
                                          <Link size={18}/>
                                      </button>
                                  </div>
                                  {/* DEBUG DISPLAY: Show EXACT value including whitespace */}
                                  <div className="mt-1 text-[10px] text-slate-400 font-mono">
                                      Gespeichert: '{settings.farmId}'
                                  </div>
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Hof-Passwort (PIN)</label>
                                  <div className="relative">
                                      <input 
                                          type={showPin ? "text" : "password"}
                                          name="agri_farm_pin_custom_field" 
                                          id="agri_farm_pin_input"
                                          autoComplete="new-password" 
                                          value={settings.farmPin || ''}
                                          onChange={(e) => setSettings({...settings, farmPin: e.target.value})}
                                          className={`w-full p-3 border rounded-xl font-mono font-bold bg-slate-50 ${pinError ? 'border-red-500 ring-2 ring-red-200' : 'border-slate-300'}`}
                                          placeholder="Geheim!"
                                      />
                                      <button 
                                          type="button"
                                          onClick={() => setShowPin(!showPin)}
                                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                      >
                                          {showPin ? <Lock size={16}/> : <Shield size={16}/>}
                                      </button>
                                  </div>
                                  {pinError && <p className="text-xs text-red-500 mt-1 font-bold">Passwort falsch!</p>}
                              </div>
                          </form>
                      </div>
                  )}

                  {/* Extensions & Tools Section (NEW) */}
                  {isCloudConfigured() && settings.farmId && (
                      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                          <h3 className="font-bold text-lg text-slate-700 border-b border-slate-100 pb-2">
                              Erweiterungen & Werkzeuge
                          </h3>
                          
                          <div className="grid grid-cols-1 gap-3">
                              
                              {/* --- DATA SYNC & COMPARISON --- */}
                              <div className="bg-slate-50 rounded-xl border border-slate-100 overflow-hidden">
                                  <div className="p-3 bg-slate-100 border-b border-slate-200 flex justify-between items-center">
                                      <span className="text-xs font-bold text-slate-500 uppercase flex items-center">
                                          <ArrowRightLeft className="w-3 h-3 mr-1"/> Datenstatus
                                      </span>
                                      <div className="flex space-x-3 items-center">
                                          <div className="flex space-x-2 text-xs font-mono">
                                              <span className="text-slate-600">Lokal: <strong>{localStats.total}</strong></span>
                                              <span className="text-slate-600">Cloud: <strong>{cloudStats.total === -1 ? '-' : cloudStats.total}</strong></span>
                                          </div>
                                          <button 
                                            onClick={() => settings.farmId && loadCloudData(settings.farmId)}
                                            className="bg-white p-1 rounded border border-slate-300 hover:bg-slate-50 text-slate-500"
                                            title="Status aktualisieren"
                                          >
                                              <RefreshCw size={10} className={isLoadingCloud ? "animate-spin" : ""} />
                                          </button>
                                      </div>
                                  </div>
                                  
                                  {/* Warning Banner if Local > Cloud */}
                                  {localStats.total > (cloudStats.total === -1 ? 0 : cloudStats.total) && (
                                      <div className="bg-amber-50 p-3 text-xs text-amber-800 border-b border-amber-100 flex items-start">
                                          <AlertTriangle size={14} className="mr-2 mt-0.5 shrink-0"/>
                                          <span>Achtung: Es befinden sich Daten auf diesem Gerät, die noch nicht in der Cloud sind. Bitte unten hochladen.</span>
                                      </div>
                                  )}

                                  <div className="p-3 space-y-4">
                                      {/* DOWNLOAD BUTTON */}
                                      <div className="flex items-center justify-between">
                                          <div className="flex items-center">
                                              <div className="p-2 bg-blue-100 text-blue-600 rounded-lg mr-3">
                                                  <DownloadCloud size={20} />
                                              </div>
                                              <div>
                                                  <div className="font-bold text-slate-700">Daten herunterladen</div>
                                                  <div className="text-xs text-slate-500">
                                                      {isDownloading ? "Lade Daten..." : "Vom Server auf dieses Gerät"}
                                                  </div>
                                              </div>
                                          </div>
                                          <button 
                                              onClick={handleManualDownload}
                                              disabled={isDownloading || isUploading}
                                              className="p-2 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 transition-all text-slate-600 shadow-sm"
                                          >
                                              {isDownloading ? <RefreshCw className="animate-spin" size={18}/> : <RefreshCw size={18} />}
                                          </button>
                                      </div>

                                      <div className="w-full h-px bg-slate-200"></div>

                                      {/* UPLOAD BUTTON */}
                                      <div className="flex flex-col">
                                          <div className="flex items-center justify-between mb-2">
                                              <div className="flex items-center">
                                                  <div className="p-2 bg-orange-100 text-orange-600 rounded-lg mr-3">
                                                      <UploadCloud size={20} />
                                                  </div>
                                                  <div>
                                                      <div className="font-bold text-slate-700">Alle Daten hochladen</div>
                                                      <div className="text-xs text-slate-500">
                                                          {isUploading ? <span className="text-orange-600 font-bold">{uploadStatusText}</span> : "Gast-Daten sichern / Manueller Upload"}
                                                      </div>
                                                  </div>
                                              </div>
                                              <button 
                                                  onClick={handleForceUpload}
                                                  disabled={isUploading || isDownloading}
                                                  className="p-2 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 transition-all text-slate-600 shadow-sm"
                                              >
                                                  {isUploading ? <RefreshCw className="animate-spin" size={18}/> : <Upload size={18} />}
                                              </button>
                                          </div>
                                          {isUploading && (
                                              <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden mt-2">
                                                  <div className="bg-orange-500 h-full transition-all duration-300 ease-out" style={{width: `${uploadProgress}%`}}></div>
                                              </div>
                                          )}
                                      </div>
                                  </div>
                              </div>

                              {/* Share Credentials */}
                              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                                  <div className="flex items-center">
                                      <div className="p-2 bg-blue-100 text-blue-600 rounded-lg mr-3">
                                          <Share2 size={20} />
                                      </div>
                                      <div>
                                          <div className="font-bold text-slate-700">Zugangsdaten teilen</div>
                                          <div className="text-xs text-slate-500">Sende ID & PIN an Mitarbeiter</div>
                                      </div>
                                  </div>
                                  <button 
                                      onClick={() => copyToClipboard(`AgriTrack Login:\nBetrieb: ${settings.farmId}\nPIN: ${settings.farmPin}`)}
                                      className="p-2 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all text-slate-500"
                                  >
                                      <Copy size={18} />
                                  </button>
                              </div>

                              {/* Debug & Log Inspector */}
                              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                                  <div className="flex items-center">
                                      <div className="p-2 bg-slate-200 text-slate-600 rounded-lg mr-3">
                                          <FileText size={20} />
                                      </div>
                                      <div>
                                          <div className="font-bold text-slate-700">Diagnose & Protokolle</div>
                                          <div className="text-xs text-slate-500">Log-Datei und Datenbank-Inspektor</div>
                                      </div>
                                  </div>
                                  <button 
                                      onClick={handleOpenDebug}
                                      className="p-2 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all text-slate-500"
                                  >
                                      <Search size={18} />
                                  </button>
                              </div>

                              {/* Connected Devices */}
                              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                  <div className="flex items-center mb-3">
                                      <div className="p-2 bg-green-100 text-green-600 rounded-lg mr-3">
                                          <Users size={20} />
                                      </div>
                                      <div>
                                          <div className="font-bold text-slate-700">Verbundene Geräte</div>
                                          <div className="text-xs text-slate-500">{cloudMembers.length} aktive Nutzer</div>
                                      </div>
                                  </div>
                                  {cloudMembers.length > 0 && (
                                      <div className="pl-12 space-y-2">
                                          {cloudMembers.slice(0, 3).map((m, i) => (
                                              <div key={i} className="text-xs text-slate-500 flex justify-between bg-white p-2 rounded border border-slate-200">
                                                  <span>{m.email || 'Unbekannt'}</span>
                                                  <span className="font-mono text-[10px]">{new Date(m.joinedAt).toLocaleDateString()}</span>
                                              </div>
                                          ))}
                                      </div>
                                  )}
                              </div>
                          </div>
                      </div>
                  )}

                  {/* Sign Out */}
                  <button 
                      onClick={async () => {
                          await authService.logout();
                          window.location.reload();
                      }}
                      className="w-full border-2 border-slate-200 text-slate-500 py-3 rounded-xl font-bold flex items-center justify-center hover:bg-slate-100 hover:text-slate-800 transition-colors"
                  >
                      <LogOut size={18} className="mr-2"/> Abmelden
                  </button>
              </div>
          )}
      </div>

      {/* Floating Save Button - COMPACT DESIGN */}
      <div className="absolute bottom-24 right-4 z-30 flex flex-col items-end">
          {/* Helper Text for clarity */}
          {saving && (
              <div className="mb-2 bg-black/70 backdrop-blur text-white text-xs px-3 py-1 rounded-full animate-pulse">
                  Speichere...
              </div>
          )}
          
          <button 
              onClick={handleSaveAll}
              disabled={saving}
              className={`flex items-center space-x-2 px-5 py-3 rounded-full shadow-2xl font-bold text-sm transition-all transform hover:scale-105 active:scale-95 ${
                  showSaveSuccess 
                  ? 'bg-green-500 text-white' 
                  : 'bg-slate-900 text-white hover:bg-black'
              }`}
          >
              {showSaveSuccess ? <CheckCircle2 size={20}/> : (saving ? <RefreshCw className="animate-spin" size={20}/> : <Save size={20}/>)}
              <span>{showSaveSuccess ? 'Gespeichert!' : 'Speichern'}</span>
          </button>
      </div>

      {/* DEBUG MODAL */}
      {showDebugModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg h-[80vh] flex flex-col overflow-hidden animate-fade-scale">
                  <div className="p-4 bg-slate-800 text-white flex justify-between items-center shrink-0">
                      <h3 className="font-bold flex items-center"><FileText className="mr-2" size={18}/> Diagnose Konsole</h3>
                      <button onClick={() => setShowDebugModal(false)}><X size={20}/></button>
                  </div>
                  
                  {/* Tabs */}
                  <div className="flex border-b border-slate-200 shrink-0">
                      <button 
                          onClick={() => setDebugTab('LOGS')}
                          className={`flex-1 py-3 text-sm font-bold ${debugTab === 'LOGS' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500'}`}
                      >
                          Live Protokoll
                      </button>
                      <button 
                          onClick={() => setDebugTab('INSPECTOR')}
                          className={`flex-1 py-3 text-sm font-bold ${debugTab === 'INSPECTOR' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500'}`}
                      >
                          Cloud Inspektor
                      </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 bg-slate-50 font-mono text-xs">
                      {debugTab === 'LOGS' ? (
                          <div className="space-y-1">
                              {debugLogs.length === 0 && <div className="text-slate-400 italic">Keine Protokolleinträge.</div>}
                              {debugLogs.map((log, i) => (
                                  <div key={i} className="border-b border-slate-200 pb-1 mb-1 text-slate-700 break-words">
                                      {log}
                                  </div>
                              ))}
                          </div>
                      ) : (
                          <div className="space-y-4">
                              <div className="bg-blue-100 p-3 rounded text-blue-800 border border-blue-200 mb-2">
                                  <strong>Farm ID:</strong> ['{settings.farmId}'] (Länge: {settings.farmId?.length}) <br/>
                                  <strong>ASCII Check:</strong>
                                  {renderAsciiBreakdown(settings.farmId || '')}
                              </div>

                              {inspectorLoading ? (
                                  <div className="flex justify-center py-8"><RefreshCw className="animate-spin text-slate-400"/></div>
                              ) : inspectorData ? (
                                  <>
                                      {inspectorData.error ? (
                                          <div className="text-red-600 font-bold p-4 border border-red-300 bg-red-50 rounded">
                                              Fehler: {inspectorData.error}
                                          </div>
                                      ) : (
                                          <>
                                              <div>
                                                  <h4 className="font-bold text-slate-800 mb-1">Einstellungen ({inspectorData.settings?.length})</h4>
                                                  {inspectorData.settings?.length === 0 ? <div className="text-slate-400 italic">Keine gefunden.</div> : (
                                                      inspectorData.settings.map((s: any, i: number) => (
                                                          <div key={i} className="bg-white p-2 rounded border mb-1">
                                                              ID: {s.id} <br/>
                                                              User: {s.userId} <br/>
                                                              Last Update: {s.updatedAt ? new Date(s.updatedAt.seconds * 1000).toLocaleString() : '-'}
                                                          </div>
                                                      ))
                                                  )}
                                              </div>
                                              <div>
                                                  <h4 className="font-bold text-slate-800 mb-1">Aktivitäten ({inspectorData.activities?.length})</h4>
                                                  {inspectorData.activities?.length === 0 ? <div className="text-slate-400 italic">Keine gefunden.</div> : (
                                                      inspectorData.activities.map((a: any, i: number) => (
                                                          <div key={i} className="bg-white p-2 rounded border mb-1">
                                                              Type: {a.type} <br/>
                                                              Date: {a.date} <br/>
                                                              Status: {a.device}
                                                          </div>
                                                      ))
                                                  )}
                                              </div>
                                              <div>
                                                  <h4 className="font-bold text-slate-800 mb-1 flex items-center"><Map className="w-3 h-3 mr-1"/> Felder ({inspectorData.fields?.length})</h4>
                                                  {inspectorData.fields?.length === 0 ? <div className="text-slate-400 italic">Keine gefunden.</div> : (
                                                      inspectorData.fields.map((f: any, i: number) => (
                                                          <div key={i} className="bg-white p-2 rounded border mb-1">
                                                              Name: {f.name} <br/>
                                                              Fläche: {f.area} ha <br/>
                                                              Typ: {f.type}
                                                          </div>
                                                      ))
                                                  )}
                                              </div>
                                              <div>
                                                  <h4 className="font-bold text-slate-800 mb-1 flex items-center"><Database className="w-3 h-3 mr-1"/> Lager ({inspectorData.storages?.length})</h4>
                                                  {inspectorData.storages?.length === 0 ? <div className="text-slate-400 italic">Keine gefunden.</div> : (
                                                      inspectorData.storages.map((s: any, i: number) => (
                                                          <div key={i} className="bg-white p-2 rounded border mb-1">
                                                              Name: {s.name} <br/>
                                                              Typ: {s.type} <br/>
                                                              Kapazität: {s.capacity}
                                                          </div>
                                                      ))
                                                  )}
                                              </div>
                                              <div>
                                                  <h4 className="font-bold text-slate-800 mb-1 flex items-center"><User className="w-3 h-3 mr-1"/> Profil ({inspectorData.profiles?.length})</h4>
                                                  {inspectorData.profiles?.length === 0 ? <div className="text-slate-400 italic">Keine gefunden.</div> : (
                                                      inspectorData.profiles.map((p: any, i: number) => (
                                                          <div key={i} className="bg-white p-2 rounded border mb-1">
                                                              Name: {p.name} <br/>
                                                              Adresse: {p.address}
                                                          </div>
                                                      ))
                                                  )}
                                              </div>
                                          </>
                                      )}
                                  </>
                              ) : (
                                  <div className="text-center py-8 text-slate-400">Keine Daten geladen.</div>
                              )}
                          </div>
                      )}
                  </div>
                  
                  <div className="p-3 bg-white border-t border-slate-200 shrink-0 flex gap-2">
                      <button onClick={handleOpenDebug} className="flex-1 bg-slate-100 text-slate-700 py-2 rounded font-bold hover:bg-slate-200">
                          Aktualisieren
                      </button>
                      <button onClick={handleClearCache} className="flex-1 bg-red-50 text-red-600 border border-red-200 py-2 rounded font-bold hover:bg-red-100">
                          Cache leeren & Neustart
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Storage Edit Modal */}
      {editingStorage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm h-[80vh] flex flex-col overflow-hidden animate-fade-scale">
                  <div className="p-4 bg-slate-800 text-white flex justify-between items-center shrink-0">
                      <h3 className="font-bold">Lager bearbeiten</h3>
                      <button onClick={() => setEditingStorage(null)}><X size={20}/></button>
                  </div>
                  <div className="p-4 space-y-4 overflow-y-auto flex-1">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Bezeichnung</label>
                          <input 
                              type="text" 
                              value={editingStorage.name}
                              onChange={(e) => setEditingStorage({...editingStorage,name: e.target.value})}
                              className="w-full p-2 border border-slate-300 rounded-lg"
                          />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Typ</label>
                              <select 
                                  value={editingStorage.type}
                                  onChange={(e) => setEditingStorage({...editingStorage, type: e.target.value as any})}
                                  className="w-full p-2 border border-slate-300 rounded-lg bg-white"
                              >
                                  <option value={FertilizerType.SLURRY}>Gülle</option>
                                  <option value={FertilizerType.MANURE}>Mist</option>
                              </select>
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Kapazität (m³)</label>
                              <input 
                                  type="number" 
                                  value={editingStorage.capacity}
                                  onChange={(e) => setEditingStorage({...editingStorage, capacity: parseFloat(e.target.value)})}
                                  className="w-full p-2 border border-slate-300 rounded-lg"
                              />
                          </div>
                      </div>
                      
                      {/* Added Missing Storage Fields: Current Level & Growth */}
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Aktuell (m³)</label>
                              <input 
                                  type="number" 
                                  value={editingStorage.currentLevel}
                                  onChange={(e) => setEditingStorage({...editingStorage, currentLevel: parseFloat(e.target.value)})}
                                  className="w-full p-2 border border-slate-300 rounded-lg bg-slate-50"
                              />
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Zuwachs / Tag (m³)</label>
                              <input 
                                  type="number" 
                                  value={editingStorage.dailyGrowth}
                                  onChange={(e) => setEditingStorage({...editingStorage, dailyGrowth: parseFloat(e.target.value)})}
                                  className="w-full p-2 border border-slate-300 rounded-lg bg-slate-50"
                              />
                          </div>
                      </div>
                      
                      {/* Storage Map Picker */}
                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Position</label>
                          <div className="h-48 w-full rounded-xl overflow-hidden border border-slate-300 relative">
                              <MapContainer center={[editingStorage.geo.lat, editingStorage.geo.lng]} zoom={15} style={{ height: '100%', width: '100%' }}>
                                  <LocationPickerMap 
                                    position={editingStorage.geo} 
                                    onPositionChange={(lat, lng) => setEditingStorage(prev => prev ? ({...prev, geo: {lat, lng}}) : null)}
                                    icon={editingStorage.type === FertilizerType.SLURRY ? slurryIcon : manureIcon}
                                  />
                              </MapContainer>
                              <div className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-white/90 backdrop-blur px-2 py-1 rounded text-[10px] font-bold z-[1000] pointer-events-none">
                                  Pin ziehen oder klicken
                              </div>
                          </div>
                          <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                              <span>Lat: {editingStorage.geo.lat.toFixed(6)}</span>
                              <span>Lng: {editingStorage.geo.lng.toFixed(6)}</span>
                          </div>
                      </div>

                      <button 
                          onClick={() => handleStorageSave(editingStorage)}
                          className="w-full py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 shadow-lg mt-4"
                      >
                          Speichern
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
