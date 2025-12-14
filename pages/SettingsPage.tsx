
import React, { useState, useEffect } from 'react';
import { 
  Save, User, Database, Settings, Cloud, MapPin, Plus, Trash2, 
  AlertTriangle, RefreshCw, CheckCircle, Smartphone, 
  Terminal, ShieldCheck, CloudOff, Info, DownloadCloud,
  X, Layers, Link as LinkIcon, Lock
} from 'lucide-react';
import { dbService, generateId } from '../services/db';
import { authService } from '../services/auth';
import { syncData } from '../services/sync';
import { AppSettings, DEFAULT_SETTINGS, FarmProfile, StorageLocation, FertilizerType } from '../types';
import { ICON_THEMES, getAppIcon } from '../utils/appIcons';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';

// --- ICONS & ASSETS ---
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

// --- MAP COMPONENT ---
const LocationPickerMap = ({ position, onPick, icon }: { position: { lat: number, lng: number } | undefined, onPick: (lat: number, lng: number) => void, icon?: any }) => {
    const map = useMap();
    useEffect(() => {
        if (position) map.setView(position, 15);
        else map.locate({ setView: true, maxZoom: 14 });
    }, [map]);

    useMapEvents({
        click(e) { onPick(e.latlng.lat, e.latlng.lng); }
    });

    return position ? <Marker position={position} icon={icon || farmIcon} /> : null;
};

// --- MAIN COMPONENT ---
interface Props {
    initialTab?: 'profile' | 'storage' | 'general' | 'sync';
}

export const SettingsPage: React.FC<Props> = ({ initialTab = 'profile' }) => {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [profile, setProfile] = useState<FarmProfile>({ farmId: '', operatorName: '', address: '', totalAreaHa: 0 });
  const [storages, setStorages] = useState<StorageLocation[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showToast, setShowToast] = useState(false);
  
  // Cloud Stats
  const [cloudStats, setCloudStats] = useState({ total: -1, activities: 0, fields: 0, storages: 0, profiles: 0 });
  const [localStats, setLocalStats] = useState({ total: 0 });
  const [authState, setAuthState] = useState<any>(null);
  
  // Modals
  const [editingStorage, setEditingStorage] = useState<StorageLocation | null>(null);
  const [showDiagnose, setShowDiagnose] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState<'profile' | 'storage' | null>(null);
  const [showDangerZone, setShowDangerZone] = useState(false);

  // Upload State
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ status: '', percent: 0 });

  // Connection Check
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'checking' | 'success' | 'error' | 'pin_required'>('idle');
  const [checkResult, setCheckResult] = useState<string>('');

  useEffect(() => {
      loadAll();
      const unsubAuth = authService.onAuthStateChanged((user) => {
          setAuthState(user);
          if (user) loadCloudData(settings.farmId);
      });
      const unsubDb = dbService.onDatabaseChange(() => {
          loadCloudData(settings.farmId);
      });
      return () => { unsubAuth(); unsubDb(); }
  }, []);

  useEffect(() => {
      if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
      if (activeTab === 'sync') {
          loadCloudData(settings.farmId);
      }
  }, [activeTab]);

  const loadAll = async () => {
      const s = await dbService.getSettings();
      setSettings(s);
      
      const p = await dbService.getFarmProfile();
      if(p.length > 0) setProfile(p[0]);
      
      const st = await dbService.getStorageLocations();
      setStorages(st);
      
      setLoading(false);
      
      // Load cloud async
      if (s.farmId) loadCloudData(s.farmId);
  };

  const loadCloudData = async (farmId?: string) => {
      // Load Local Stats first
      const local = await dbService.getLocalStats();
      setLocalStats(local);

      // Then Cloud
      if (farmId) {
          const stats = await dbService.getCloudStats(farmId);
          setCloudStats(stats);
      } else {
          setCloudStats({ total: -1, activities: 0, fields: 0, storages: 0, profiles: 0 });
      }
  };

  const handleSaveAll = async () => {
      setIsSaving(true);
      try {
          // 1. Save Profile
          await dbService.saveFarmProfile(profile);
          
          // 2. Save Settings (Sanitize Farm ID)
          const cleanSettings = { ...settings };
          if (cleanSettings.farmId) cleanSettings.farmId = String(cleanSettings.farmId).trim();
          await dbService.saveSettings(cleanSettings);

          // 3. Verify PIN / Security Check if Farm ID changed
          if (cleanSettings.farmId) {
              const verify = await dbService.verifyFarmPin(cleanSettings.farmId, cleanSettings.farmPin || '');
              if (!verify.valid && verify.reason !== "New Farm") {
                  alert(`Warnung: Die Farm-ID existiert, aber die PIN ist falsch (${verify.reason}). Sie können keine Daten hochladen.`);
              }
          }

          // 4. Trigger Sync in Background
          syncData().catch(console.error);
          
          setShowToast(true);
          setTimeout(() => setShowToast(false), 2000);
          
          // Reload stats
          loadCloudData(cleanSettings.farmId);

      } catch (e) {
          console.error(e);
          alert("Fehler beim Speichern.");
      } finally {
          setIsSaving(false);
      }
  };

  const handleCheckConnection = async () => {
      if (!settings.farmId) return;
      setConnectionStatus('checking');
      const cleanId = String(settings.farmId).trim();
      
      const stats = await dbService.getCloudStats(cleanId);
      
      if (stats.total === -1) {
          setConnectionStatus('error');
          setCheckResult("Offline oder Fehler.");
          return;
      }

      // Check PIN
      const pinCheck = await dbService.verifyFarmPin(cleanId, settings.farmPin || '');
      
      if (stats.total > 0) {
          if (pinCheck.valid) {
              setConnectionStatus('success');
              setCheckResult(`Verbindung OK! ${stats.total} Einträge (${stats.activities} Akt., ${stats.fields} Felder).`);
          } else {
              setConnectionStatus('pin_required');
              setCheckResult(`Hof gefunden, aber PIN falsch.`);
          }
      } else {
          setConnectionStatus('success');
          setCheckResult("Hof-ID ist frei (Neu).");
      }
      setCloudStats(stats);
  };

  const handleForceUpload = async () => {
      if (!confirm("Dies lädt alle lokalen Daten in die Cloud hoch. Bestehende Daten in der Cloud werden ggf. überschrieben. Fortfahren?")) return;
      
      setIsUploading(true);
      setUploadProgress({ status: 'Vorbereitung...', percent: 0 });

      try {
          // Save settings first locally to ensure ID is set
          localStorage.setItem('agritrack_settings_full', JSON.stringify(settings));
          
          await dbService.forceUploadToFarm((status, percent) => {
              setUploadProgress({ status, percent });
          });
          
          alert("Upload erfolgreich abgeschlossen!");
          loadCloudData(settings.farmId);
      } catch (e: any) {
          alert(`Upload fehlgeschlagen: ${e.message}`);
      } finally {
          setIsUploading(false);
      }
  };

  const handleManualDownload = async () => {
      setIsUploading(true); // Reuse loading state
      setUploadProgress({ status: 'Lade herunter...', percent: 50 });
      try {
          await syncData();
          await loadAll();
          alert("Daten erfolgreich heruntergeladen.");
      } catch (e) {
          alert("Download Fehler (Offline?).");
      } finally {
          setIsUploading(false);
      }
  };

  const handleClearCache = () => {
      if(confirm("ACHTUNG: Dies löscht die LOKALE Datenbank der App. Nicht gespeicherte Daten gehen verloren. Nur bei Problemen nutzen!")) {
          localStorage.clear();
          window.location.reload();
      }
  }

  const handleDeleteFarm = async () => {
      const pin = prompt("SICHERHEITS-CHECK: Geben Sie die Hof-PIN ein, um ALLE Daten in der Cloud zu löschen:");
      if (pin !== settings.farmPin) {
          alert("Falsche PIN. Abbruch.");
          return;
      }
      
      if(!confirm("Sind Sie absolut sicher? Dies kann nicht rückgängig gemacht werden!")) return;

      setIsUploading(true);
      setUploadProgress({ status: 'Lösche...', percent: 100 });
      
      try {
          const deleted = await dbService.deleteEntireFarm(settings.farmId!, pin);
          alert(`Hof gelöscht. ${deleted} Datensätze entfernt.`);
          setSettings({ ...settings, farmId: '', farmPin: '' });
          await handleSaveAll();
      } catch(e: any) {
          alert("Fehler: " + e.message);
      } finally {
          setIsUploading(false);
          setShowDangerZone(false);
      }
  };

  return (
    <div className="h-full flex flex-col bg-slate-100 relative">
        
        {/* Toast */}
        {showToast && (
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-green-600 text-white px-6 py-2 rounded-full shadow-xl z-50 flex items-center animate-in fade-in slide-in-from-top-4">
                <CheckCircle size={18} className="mr-2"/> Einstellungen gespeichert
            </div>
        )}

        {/* Tab Navigation */}
        <div className="bg-white border-b border-slate-200 sticky top-0 z-10 shrink-0">
            <div className="flex overflow-x-auto hide-scrollbar">
                {[
                    { id: 'profile', icon: User, label: 'Betrieb' },
                    { id: 'storage', icon: Database, label: 'Lager' },
                    { id: 'general', icon: Settings, label: 'Allgemein' },
                    { id: 'sync', icon: Cloud, label: 'Cloud & Daten' }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex-1 py-4 px-4 flex flex-col items-center min-w-[80px] border-b-2 transition-colors ${
                            activeTab === tab.id 
                            ? 'border-green-600 text-green-700 bg-green-50/50' 
                            : 'border-transparent text-slate-500 hover:bg-slate-50'
                        }`}
                    >
                        <tab.icon size={20} className="mb-1" />
                        <span className="text-xs font-bold">{tab.label}</span>
                    </button>
                ))}
            </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 pb-32">
            
            {/* --- PROFILE TAB --- */}
            {activeTab === 'profile' && (
                <div className="space-y-4 max-w-lg mx-auto">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-lg mb-4 text-slate-800">Betriebsdaten</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-500 mb-1">Name des Betriebs / Bewirtschafter</label>
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
                            <div>
                                <label className="block text-sm font-bold text-slate-500 mb-1">Standort Hofstelle</label>
                                {profile.addressGeo ? (
                                    <div className="flex items-center justify-between bg-green-50 p-3 rounded-lg border border-green-100">
                                        <span className="text-green-700 text-sm flex items-center">
                                            <MapPin size={16} className="mr-2"/> Gesetzt ({profile.addressGeo.lat.toFixed(4)}, {profile.addressGeo.lng.toFixed(4)})
                                        </span>
                                        <button onClick={() => setShowMapPicker('profile')} className="text-xs font-bold text-green-800 hover:underline">Ändern</button>
                                    </div>
                                ) : (
                                    <button 
                                        onClick={() => setShowMapPicker('profile')}
                                        className="w-full py-3 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 font-bold hover:bg-slate-50 flex items-center justify-center"
                                    >
                                        <MapPin size={18} className="mr-2"/> Auf Karte wählen
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- STORAGE TAB --- */}
            {activeTab === 'storage' && (
                <div className="space-y-4 max-w-lg mx-auto">
                    {storages.map(s => (
                        <div key={s.id} onClick={() => setEditingStorage(s)} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center cursor-pointer hover:border-green-500 transition-all">
                            <div className="flex items-center">
                                <div className={`p-3 rounded-full mr-4 ${s.type === FertilizerType.SLURRY ? 'bg-amber-100 text-amber-800' : 'bg-orange-100 text-orange-800'}`}>
                                    {s.type === FertilizerType.SLURRY ? <Database size={20}/> : <Layers size={20}/>}
                                </div>
                                <div>
                                    <h4 className="font-bold text-slate-800">{s.name}</h4>
                                    <div className="text-xs text-slate-500">
                                        {s.capacity} m³ • {s.currentLevel.toFixed(0)} m³ aktuell
                                    </div>
                                </div>
                            </div>
                            <div className="text-slate-400">Bearbeiten</div>
                        </div>
                    ))}

                    <button 
                        onClick={() => setEditingStorage({
                            id: generateId(),
                            name: '',
                            type: FertilizerType.SLURRY,
                            capacity: 100,
                            currentLevel: 0,
                            dailyGrowth: 0.5,
                            geo: { lat: 47.5, lng: 14.5 } // Default placeholder
                        })}
                        className="w-full py-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold hover:bg-white hover:border-green-500 hover:text-green-600 transition-all flex items-center justify-center"
                    >
                        <Plus size={20} className="mr-2"/> Neues Lager
                    </button>
                </div>
            )}

            {/* --- GENERAL TAB --- */}
            {activeTab === 'general' && (
                <div className="space-y-6 max-w-lg mx-auto">
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center"><Database size={18} className="mr-2 text-blue-600"/> Standard Fuhrengrößen</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Güllefass (m³)</label>
                                <input type="number" value={settings.slurryLoadSize} onChange={e => setSettings({...settings, slurryLoadSize: parseFloat(e.target.value)})} className="w-full p-2 border rounded font-bold" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Miststreuer (m³)</label>
                                <input type="number" value={settings.manureLoadSize} onChange={e => setSettings({...settings, manureLoadSize: parseFloat(e.target.value)})} className="w-full p-2 border rounded font-bold" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center"><Terminal size={18} className="mr-2 text-purple-600"/> GPS & Automatik</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Arbeitsbreite Gülle (m)</label>
                                <input type="number" value={settings.slurrySpreadWidth || 12} onChange={e => setSettings({...settings, slurrySpreadWidth: parseFloat(e.target.value)})} className="w-full p-2 border rounded" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Arbeitsbreite Mist (m)</label>
                                <input type="number" value={settings.manureSpreadWidth || 10} onChange={e => setSettings({...settings, manureSpreadWidth: parseFloat(e.target.value)})} className="w-full p-2 border rounded" />
                            </div>
                            <div className="grid grid-cols-2 gap-4 pt-2">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Min. Speed (km/h)</label>
                                    <input type="number" value={settings.minSpeed} onChange={e => setSettings({...settings, minSpeed: parseFloat(e.target.value)})} className="w-full p-2 border rounded text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Max. Speed (km/h)</label>
                                    <input type="number" value={settings.maxSpeed} onChange={e => setSettings({...settings, maxSpeed: parseFloat(e.target.value)})} className="w-full p-2 border rounded text-sm" />
                                </div>
                            </div>
                            <div className="pt-2">
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Lager Radius (m)</label>
                                <input type="number" value={settings.storageRadius} onChange={e => setSettings({...settings, storageRadius: parseFloat(e.target.value)})} className="w-full p-2 border rounded text-sm" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-slate-800 mb-4">App Design (Traktor Marke)</h3>
                        <div className="grid grid-cols-4 gap-2">
                            {ICON_THEMES.map(theme => (
                                <button 
                                    key={theme.id}
                                    onClick={() => setSettings({...settings, appIcon: theme.id})}
                                    className={`p-2 rounded-lg border-2 flex flex-col items-center transition-all ${settings.appIcon === theme.id ? 'border-green-500 bg-green-50' : 'border-transparent hover:bg-slate-50'}`}
                                >
                                    <img src={getAppIcon(theme.id)} className="w-8 h-8 mb-1 rounded object-contain bg-white shadow-sm border border-slate-100" alt={theme.label} />
                                    <span className="text-[9px] font-bold text-slate-600 truncate w-full text-center">{theme.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* --- SYNC / CLOUD TAB --- */}
            {activeTab === 'sync' && (
                <div className="space-y-6 max-w-lg mx-auto">
                    
                    {/* Status Card */}
                    <div className={`p-5 rounded-xl border-2 flex flex-col items-center text-center ${
                        authState && settings.farmId && cloudStats.total >= 0 
                        ? 'bg-green-50 border-green-200' 
                        : authState 
                            ? 'bg-amber-50 border-amber-200'
                            : 'bg-slate-100 border-slate-300'
                    }`}>
                        <div className={`p-3 rounded-full mb-3 ${authState && settings.farmId ? 'bg-green-200 text-green-800' : 'bg-slate-200 text-slate-600'}`}>
                            {authState ? <ShieldCheck size={32}/> : <CloudOff size={32}/>}
                        </div>
                        <h3 className="font-bold text-lg text-slate-800">
                            {authState ? (settings.farmId ? 'Verbunden mit AgriCloud' : 'Angemeldet (Kein Hof gewählt)') : 'Gast Modus (Offline)'}
                        </h3>
                        {authState && settings.farmId && (
                            <div className="text-sm text-green-700 mt-1 font-medium">
                                Farm ID: {settings.farmId}
                            </div>
                        )}
                        {!authState && (
                            <button 
                                onClick={() => { localStorage.removeItem('agritrack_guest_mode'); window.location.reload(); }}
                                className="mt-3 text-sm bg-blue-600 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-blue-700"
                            >
                                Jetzt Anmelden / Registrieren
                            </button>
                        )}
                    </div>

                    {/* Connection Form */}
                    {authState && (
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                            <h3 className="font-bold text-slate-800 mb-4 flex items-center">
                                <Settings size={18} className="mr-2 text-slate-500"/> Hof Verbindung
                            </h3>
                            
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Betriebsnummer (Farm ID)</label>
                                    <div className="flex space-x-2">
                                        <input 
                                            type="text" 
                                            // Dummy fields to confuse autofill
                                            name="agri_farm_id_field_random"
                                            id="agri_farm_id_field_random"
                                            autoComplete="off"
                                            data-lpignore="true"
                                            value={settings.farmId || ''} 
                                            onChange={(e) => {
                                                // Aggressive cleaning: Numbers only or simple alphanumeric, no spaces
                                                const val = e.target.value.replace(/[^0-9a-zA-Z]/g, ''); 
                                                setSettings({...settings, farmId: val});
                                                setConnectionStatus('idle');
                                            }}
                                            className="flex-1 p-3 border border-slate-300 rounded-lg font-mono text-lg font-bold tracking-wider"
                                            placeholder="z.B. 1234567"
                                        />
                                        {settings.farmId && (
                                            <button 
                                                onClick={() => setSettings({...settings, farmId: '', farmPin: ''})}
                                                className="p-3 bg-red-50 text-red-600 rounded-lg border border-red-100 hover:bg-red-100"
                                                title="Reset"
                                            >
                                                <Trash2 size={20}/>
                                            </button>
                                        )}
                                    </div>
                                    {/* X-Ray Debug View */}
                                    {settings.farmId && (
                                        <div className="text-[10px] text-slate-400 mt-1 font-mono">
                                            Gespeichert: '{settings.farmId}' (Länge: {settings.farmId.length})
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Hof-Passwort (PIN)</label>
                                    <input 
                                        type="password" 
                                        name="agri_pin_field_random"
                                        id="agri_pin_field_random"
                                        autoComplete="new-password"
                                        data-lpignore="true"
                                        value={settings.farmPin || ''} 
                                        onChange={(e) => setSettings({...settings, farmPin: e.target.value})}
                                        className={`w-full p-3 border rounded-lg font-bold tracking-widest ${connectionStatus === 'pin_required' ? 'border-red-500 bg-red-50' : 'border-slate-300'}`}
                                        placeholder="••••"
                                    />
                                    {connectionStatus === 'pin_required' && <div className="text-xs text-red-500 mt-1 font-bold">PIN erforderlich!</div>}
                                </div>

                                {checkResult && (
                                    <div className={`p-3 rounded-lg text-sm font-bold ${connectionStatus === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                        {checkResult}
                                    </div>
                                )}

                                <div className="flex space-x-2 pt-2">
                                    <button 
                                        onClick={handleCheckConnection}
                                        disabled={!settings.farmId}
                                        className="flex-1 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg hover:bg-slate-200 disabled:opacity-50 flex items-center justify-center"
                                    >
                                        <LinkIcon size={16} className="mr-2"/> Prüfen
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Data Comparison Stats */}
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-slate-800">Datenstatus</h3>
                            <button onClick={() => loadCloudData(settings.farmId)} className="text-slate-400 hover:text-blue-500"><RefreshCw size={16}/></button>
                        </div>
                        
                        <div className="flex items-center space-x-4">
                            <div className="flex-1 bg-slate-50 p-3 rounded-lg text-center border border-slate-200">
                                <div className="text-xs text-slate-500 uppercase font-bold mb-1"><Smartphone size={14} className="inline mr-1"/> Lokal</div>
                                <div className="text-xl font-bold text-slate-800">{localStats.total}</div>
                                <div className="text-[10px] text-slate-400">Objekte</div>
                            </div>
                            
                            <div className="text-slate-300 font-bold">VS</div>

                            <div className="flex-1 bg-blue-50 p-3 rounded-lg text-center border border-blue-100">
                                <div className="text-xs text-blue-600 uppercase font-bold mb-1"><Cloud size={14} className="inline mr-1"/> Cloud</div>
                                <div className="text-xl font-bold text-blue-800">
                                    {cloudStats.total === -1 ? '-' : cloudStats.total}
                                </div>
                                <div className="text-[10px] text-blue-400">Objekte</div>
                            </div>
                        </div>

                        {localStats.total > cloudStats.total && cloudStats.total !== -1 && (
                            <div className="mt-4 bg-amber-50 p-3 rounded-lg border border-amber-200 text-amber-800 text-sm flex items-start">
                                <Info size={16} className="shrink-0 mr-2 mt-0.5"/>
                                <div>
                                    <strong>Daten nicht synchron!</strong><br/>
                                    Du hast lokale Daten, die noch nicht in der Cloud sind. Bitte "Alle Daten hochladen" nutzen.
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Tools Section */}
                    {authState && (
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 space-y-3">
                            <h3 className="font-bold text-slate-800 mb-2">Erweiterungen & Werkzeuge</h3>
                            
                            <button 
                                onClick={handleForceUpload}
                                className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold shadow hover:bg-blue-700 flex items-center justify-center"
                            >
                                <Cloud size={18} className="mr-2"/> Alle Daten hochladen (Gast-Daten sichern)
                            </button>

                            <button 
                                onClick={handleManualDownload}
                                className="w-full py-3 bg-white border border-slate-300 text-slate-700 rounded-lg font-bold hover:bg-slate-50 flex items-center justify-center"
                            >
                                <DownloadCloud size={18} className="mr-2"/> Daten jetzt herunterladen
                            </button>

                            <button 
                                onClick={() => setShowDiagnose(true)}
                                className="w-full py-3 bg-slate-100 text-slate-600 rounded-lg font-bold hover:bg-slate-200 flex items-center justify-center"
                            >
                                <Terminal size={18} className="mr-2"/> 🛠 Diagnose & Protokolle
                            </button>
                            
                            <div className="pt-4 border-t border-slate-100">
                                <button 
                                    onClick={() => setShowDangerZone(!showDangerZone)}
                                    className="text-xs text-red-400 hover:text-red-600 font-bold underline w-full text-center"
                                >
                                    {showDangerZone ? 'Gefahrenzone ausblenden' : 'Gefahrenzone anzeigen'}
                                </button>
                                
                                {showDangerZone && (
                                    <div className="mt-3 p-4 bg-red-50 border border-red-200 rounded-lg animate-in slide-in-from-top-2">
                                        <h4 className="font-bold text-red-800 text-sm mb-2 flex items-center"><AlertTriangle size={14} className="mr-1"/> Danger Zone</h4>
                                        <p className="text-xs text-red-600 mb-3">
                                            Aktionen hier sind unwiderruflich. Sei vorsichtig.
                                        </p>
                                        <button 
                                            onClick={handleDeleteFarm}
                                            className="w-full py-2 bg-red-600 text-white rounded font-bold text-xs hover:bg-red-700"
                                        >
                                            HOF KOMPLETT LÖSCHEN
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

        </div>

        {/* Global Floating Save Button (Small) */}
        <div className="absolute bottom-24 right-4 z-30">
             <button 
                onClick={handleSaveAll}
                disabled={isSaving}
                className="bg-slate-900 text-white px-5 py-3 rounded-full shadow-2xl font-bold flex items-center hover:bg-slate-800 disabled:opacity-50 transition-all hover:scale-105"
             >
                 {isSaving ? <RefreshCw className="animate-spin w-5 h-5"/> : <Save className="w-5 h-5 mr-2"/>}
                 Speichern
             </button>
        </div>

        {/* --- MODALS --- */}

        {/* Storage Editor Modal */}
        {editingStorage && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
                    <div className="p-4 bg-slate-800 text-white flex justify-between items-center shrink-0">
                        <h3 className="font-bold">Lager bearbeiten</h3>
                        <button onClick={() => setEditingStorage(null)}><X size={20}/></button>
                    </div>
                    <div className="p-4 overflow-y-auto space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Bezeichnung</label>
                            <input type="text" value={editingStorage.name} onChange={e => setEditingStorage({...editingStorage, name: e.target.value})} className="w-full p-2 border rounded font-bold" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Kapazität (m³)</label>
                                <input type="number" value={editingStorage.capacity} onChange={e => setEditingStorage({...editingStorage, capacity: parseFloat(e.target.value)})} className="w-full p-2 border rounded" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Typ</label>
                                <select value={editingStorage.type} onChange={e => setEditingStorage({...editingStorage, type: e.target.value as any})} className="w-full p-2 border rounded">
                                    <option value={FertilizerType.SLURRY}>Gülle</option>
                                    <option value={FertilizerType.MANURE}>Mist</option>
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Aktuell (m³)</label>
                                <input type="number" value={editingStorage.currentLevel} onChange={e => setEditingStorage({...editingStorage, currentLevel: parseFloat(e.target.value)})} className="w-full p-2 border rounded" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Zuwachs / Tag</label>
                                <input type="number" value={editingStorage.dailyGrowth} onChange={e => setEditingStorage({...editingStorage, dailyGrowth: parseFloat(e.target.value)})} className="w-full p-2 border rounded" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Standort (Karte)</label>
                            <div className="h-48 w-full rounded-lg overflow-hidden border relative">
                                <MapContainer center={[editingStorage.geo.lat, editingStorage.geo.lng]} zoom={13} style={{height: '100%', width: '100%'}}>
                                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
                                    <LocationPickerMap 
                                        position={editingStorage.geo} 
                                        onPick={(lat, lng) => setEditingStorage({...editingStorage, geo: {lat, lng}})}
                                        icon={editingStorage.type === FertilizerType.SLURRY ? slurryIcon : manureIcon}
                                    />
                                </MapContainer>
                            </div>
                        </div>
                        <div className="flex space-x-2 pt-2">
                            <button 
                                onClick={async () => {
                                    if(confirm("Lager löschen?")) {
                                        await dbService.deleteStorage(editingStorage.id);
                                        setEditingStorage(null);
                                        loadAll();
                                    }
                                }}
                                className="px-4 py-3 border border-red-200 text-red-600 rounded-lg font-bold"
                            >
                                <Trash2 size={20}/>
                            </button>
                            <button 
                                onClick={async () => {
                                    await dbService.saveStorageLocation(editingStorage);
                                    setEditingStorage(null);
                                    loadAll();
                                }}
                                className="flex-1 py-3 bg-green-600 text-white rounded-lg font-bold shadow"
                            >
                                Speichern
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* Map Picker Modal (Generic) */}
        {showMapPicker && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg h-[80vh] flex flex-col">
                    <div className="p-3 border-b flex justify-between items-center">
                        <h3 className="font-bold">Standort wählen</h3>
                        <button onClick={() => setShowMapPicker(null)}><X/></button>
                    </div>
                    <div className="flex-1 relative">
                        <MapContainer center={[47.5, 14.5]} zoom={7} style={{height: '100%', width: '100%'}}>
                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
                            <LocationPickerMap 
                                position={profile.addressGeo} 
                                onPick={(lat, lng) => setProfile({...profile, addressGeo: {lat, lng}})}
                                icon={farmIcon}
                            />
                        </MapContainer>
                        <div className="absolute bottom-4 left-4 right-4 bg-white/90 p-3 rounded-lg shadow text-center text-sm pointer-events-none">
                            Klicke auf die Karte um den Pin zu setzen.
                        </div>
                    </div>
                    <div className="p-4 border-t">
                        <button onClick={() => setShowMapPicker(null)} className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold">Übernehmen</button>
                    </div>
                </div>
            </div>
        )}

        {/* Diagnose Modal */}
        {showDiagnose && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col">
                    <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                        <h3 className="font-bold text-lg flex items-center"><Terminal size={20} className="mr-2"/> System Diagnose</h3>
                        <button onClick={() => setShowDiagnose(false)}><X/></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 font-mono text-xs bg-slate-900 text-green-400 space-y-2">
                        {dbService.getLogs().map((log, i) => (
                            <div key={i} className="border-b border-green-900/30 pb-1">{log}</div>
                        ))}
                    </div>
                    <div className="p-4 border-t bg-slate-800 text-slate-400 text-[10px] font-mono">
                        {settings.farmId && (
                            <div>
                                Farm ID: ['{settings.farmId}'] (Länge: {settings.farmId.length})<br/>
                                ASCII Check: {settings.farmId.split('').map(c => `${c} (${c.charCodeAt(0)})`).join(' ')}
                            </div>
                        )}
                    </div>
                    <div className="p-4 border-t bg-slate-100 flex justify-between items-center">
                        <button 
                            onClick={async () => {
                                const id = settings.farmId;
                                if (!id) return alert("Keine Farm ID.");
                                const data = await dbService.inspectCloudData(id);
                                console.log(data);
                                alert("Check Konsole für Details.\n" + JSON.stringify(data, null, 2).substring(0, 500) + "...");
                            }}
                            className="text-blue-600 font-bold text-xs"
                        >
                            Cloud Inspektor starten
                        </button>
                        <button onClick={handleClearCache} className="bg-red-600 text-white px-4 py-2 rounded text-xs font-bold hover:bg-red-700">
                            Cache leeren / Reset
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Upload Progress Overlay */}
        {isUploading && (
            <div className="fixed inset-0 z-[100] bg-black/80 flex flex-col items-center justify-center text-white">
                <Cloud size={48} className="animate-bounce mb-4 text-blue-400"/>
                <h3 className="text-xl font-bold mb-2">{uploadProgress.status}</h3>
                <div className="w-64 h-3 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 transition-all duration-300" style={{width: `${uploadProgress.percent}%`}}></div>
                </div>
                <div className="mt-2 font-mono">{uploadProgress.percent}%</div>
            </div>
        )}

    </div>
  );
};

