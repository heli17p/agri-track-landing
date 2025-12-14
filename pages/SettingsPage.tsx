import React, { useState, useEffect } from 'react';
import { 
  Save, User, Database, Settings, Cloud, MapPin, Plus, Trash2, 
  AlertTriangle, RefreshCw, CheckCircle, Smartphone, 
  Terminal, ShieldCheck, CloudOff, Info, DownloadCloud,
  X, Layers, Link as LinkIcon, Lock, Calendar, FileText, UserPlus, Eye, EyeOff, Wrench
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
  
  // Modals & Tools
  const [editingStorage, setEditingStorage] = useState<StorageLocation | null>(null);
  const [showDiagnose, setShowDiagnose] = useState(false);
  const [activeDiagTab, setActiveDiagTab] = useState<'logs' | 'inspector' | 'repair'>('inspector'); 
  const [inspectorData, setInspectorData] = useState<any>(null);
  const [inspectorLoading, setInspectorLoading] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState<'profile' | 'storage' | null>(null);
  const [showDangerZone, setShowDangerZone] = useState(false);
  
  // Repair Tool State
  const [repairAnalysis, setRepairAnalysis] = useState<any>(null);
  const [repairLoading, setRepairLoading] = useState(false);

  // Upload State
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ status: '', percent: 0 });

  // --- CONNECT / JOIN FLOW STATE ---
  const [connectMode, setConnectMode] = useState<'VIEW' | 'JOIN' | 'CREATE'>('VIEW');
  const [inputFarmId, setInputFarmId] = useState('');
  const [inputPin, setInputPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  
  const [searchStatus, setSearchStatus] = useState<'IDLE' | 'SEARCHING' | 'FOUND' | 'NOT_FOUND'>('IDLE');
  const [foundOwnerEmail, setFoundOwnerEmail] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
      loadAll();
      const unsubAuth = authService.onAuthStateChanged((user) => {
          setAuthState(user);
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
      if (activeTab === 'sync' && settings.farmId) {
          loadCloudData(settings.farmId);
          setConnectMode('VIEW');
      } else if (activeTab === 'sync' && !settings.farmId) {
          setConnectMode('VIEW'); // Or allow user to choose
      }
  }, [activeTab, settings.farmId]);

  const loadAll = async () => {
      const s = await dbService.getSettings();
      setSettings(s);
      
      const p = await dbService.getFarmProfile();
      if(p.length > 0) setProfile(p[0]);
      
      const st = await dbService.getStorageLocations();
      setStorages(st);
      
      setLoading(false);
      
      if (s.farmId) loadCloudData(s.farmId);
  };

  const loadCloudData = async (farmId?: string) => {
      const local = await dbService.getLocalStats();
      setLocalStats(local);

      if (farmId) {
          const stats = await dbService.getCloudStats(farmId);
          setCloudStats(stats);
      } else {
          setCloudStats({ total: -1, activities: 0, fields: 0, storages: 0, profiles: 0 });
      }
  };

  // --- SAVE LOGIC ---
  const handleSaveAll = async () => {
      setIsSaving(true);
      try {
          await dbService.saveFarmProfile(profile);
          
          const cleanSettings = { ...settings };
          if (cleanSettings.farmId) cleanSettings.farmId = String(cleanSettings.farmId).trim();
          await dbService.saveSettings(cleanSettings);

          // Trigger Sync
          syncData().catch(console.error);
          
          setShowToast(true);
          setTimeout(() => setShowToast(false), 2000);
          loadCloudData(cleanSettings.farmId);

      } catch (e) {
          console.error(e);
          alert("Fehler beim Speichern.");
      } finally {
          setIsSaving(false);
      }
  };

  // --- JOIN FLOW ---
  const handleSearchFarm = async () => {
      if (!inputFarmId) return;
      setSearchStatus('SEARCHING');
      setConnectError(null);
      setFoundOwnerEmail(null);

      const cleanId = inputFarmId.trim();
      
      // Perform handshake check
      // Pass empty PIN to check existence and get owner info
      const result = await dbService.verifyFarmPin(cleanId, ''); 
      
      if (result.isNew) {
          setSearchStatus('NOT_FOUND');
      } else {
          setSearchStatus('FOUND');
          // Mask email for privacy (e.g. m***@gmail.com)
          const rawEmail = result.ownerEmail || 'Unbekannt';
          let maskedEmail = rawEmail;
          if (rawEmail.includes('@')) {
              const [name, domain] = rawEmail.split('@');
              maskedEmail = `${name.substring(0, 2)}***@${domain}`;
          }
          setFoundOwnerEmail(maskedEmail);
      }
  };

  const handleJoinFarm = async () => {
      if (!inputPin) {
          setConnectError("Bitte PIN eingeben.");
          return;
      }
      
      const cleanId = inputFarmId.trim();
      const result = await dbService.verifyFarmPin(cleanId, inputPin);

      if (result.valid) {
          // Success! Save settings and switch mode
          const newSettings = { ...settings, farmId: cleanId, farmPin: inputPin };
          setSettings(newSettings);
          await dbService.saveSettings(newSettings); // This triggers joinFarm in DB service
          
          // Trigger download
          await syncData();
          
          setConnectMode('VIEW');
          loadCloudData(cleanId);
          alert(`Erfolg! Verbindung zu Hof ${cleanId} hergestellt.`);
      } else {
          setConnectError("PIN ist falsch.");
      }
  };

  const handleCreateFarm = async () => {
      if (!inputFarmId || !inputPin) {
          setConnectError("Bitte ID und PIN wählen.");
          return;
      }
      
      const cleanId = inputFarmId.trim();
      
      // Double check it doesn't exist
      const check = await dbService.verifyFarmPin(cleanId, '');
      if (!check.isNew) {
          setConnectError("Dieser Hof existiert bereits! Bitte 'Hof beitreten' nutzen.");
          return;
      }

      const newSettings = { ...settings, farmId: cleanId, farmPin: inputPin };
      setSettings(newSettings);
      await dbService.saveSettings(newSettings); // Will create new entry with owner email
      
      setConnectMode('VIEW');
      loadCloudData(cleanId);
      alert(`Hof ${cleanId} erfolgreich erstellt!`);
  };

  const handleForceUpload = async () => {
      if (!confirm("Dies lädt alle lokalen Daten in die Cloud hoch. Bestehende Daten in der Cloud werden ggf. überschrieben. Fortfahren?")) return;
      
      setIsUploading(true);
      setUploadProgress({ status: 'Vorbereitung...', percent: 0 });

      try {
          localStorage.setItem('agritrack_settings_full', JSON.stringify(settings));
          await dbService.forceUploadToFarm((status, percent) => {
              setUploadProgress({ status, percent });
          });
          alert("Upload erfolgreich abgeschlossen!");
          loadCloudData(settings.farmId);
          setIsUploading(false);
      } catch (e: any) {
          alert(`Upload fehlgeschlagen: ${e.message}`);
          setIsUploading(false);
      } 
  };

  const handleManualDownload = async () => {
      setIsUploading(true); 
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

  const handleHardReset = async () => {
      if(confirm("ACHTUNG: Dies führt einen vollständigen Reset durch. Die App wird geschlossen und der Speicher bereinigt. Fortfahren?")) {
          await dbService.hardReset();
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
      setUploadProgress({ status: 'Starte Löschvorgang...', percent: 5 }); 
      try {
          const deleted = await dbService.deleteEntireFarm(settings.farmId!, pin, (msg) => {
              setUploadProgress({ status: msg, percent: 50 });
          });
          setUploadProgress({ status: 'Fertig!', percent: 100 });
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

  const runInspector = async () => {
        if (!settings.farmId) {
            alert("Keine Farm ID.");
            return;
        }
        setInspectorLoading(true);
        try {
            const data = await dbService.inspectCloudData(settings.farmId);
            if(data.error) {
                alert("Fehler: " + data.error);
            } else {
                setInspectorData(data);
            }
        } catch (e: any) {
            alert("Inspektor Fehler: " + e.message);
        } finally {
            setInspectorLoading(false);
        }
  };

  const analyzeRepair = async () => {
      if (!settings.farmId) return;
      setRepairLoading(true);
      try {
          const res = await dbService.analyzeDataTypes(settings.farmId);
          setRepairAnalysis(res);
      } finally {
          setRepairLoading(false);
      }
  };

  const executeRepair = async () => {
      if (!settings.farmId) return;
      if (!confirm("Reparatur starten? Dies konvertiert alte 'Zahlen-IDs' in 'Text-IDs'.")) return;
      setRepairLoading(true);
      try {
          const msg = await dbService.repairDataTypes(settings.farmId);
          alert(msg);
          analyzeRepair(); // Refresh
          loadCloudData(settings.farmId); // Update Main Stats
      } catch (e: any) {
          alert("Fehler: " + e.message);
      } finally {
          setRepairLoading(false);
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

                    {/* Connection Form - NEW LOGIC */}
                    {authState && !settings.farmId && connectMode === 'VIEW' && (
                        <div className="grid grid-cols-1 gap-4">
                            <button 
                                onClick={() => { setConnectMode('JOIN'); setInputFarmId(''); setInputPin(''); setConnectError(null); setSearchStatus('IDLE'); }}
                                className="bg-white p-6 rounded-xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
                            >
                                <div className="flex items-center mb-2 text-blue-600 group-hover:text-blue-700">
                                    <UserPlus size={24} className="mr-3"/>
                                    <h3 className="font-bold text-lg">Hof beitreten</h3>
                                </div>
                                <p className="text-sm text-slate-500">
                                    Du bist Mitarbeiter oder Familienmitglied? Gib die Betriebsnummer ein, um dich zu verbinden.
                                </p>
                            </button>

                            <button 
                                onClick={() => { setConnectMode('CREATE'); setInputFarmId(''); setInputPin(''); setConnectError(null); }}
                                className="bg-white p-6 rounded-xl border-2 border-slate-200 hover:border-green-500 hover:bg-green-50 transition-all text-left group"
                            >
                                <div className="flex items-center mb-2 text-green-600 group-hover:text-green-700">
                                    <Plus size={24} className="mr-3"/>
                                    <h3 className="font-bold text-lg">Hof erstellen</h3>
                                </div>
                                <p className="text-sm text-slate-500">
                                    Du bist der Bewirtschafter? Lege deinen Hof neu in der Cloud an.
                                </p>
                            </button>
                        </div>
                    )}

                    {/* JOIN MODE UI */}
                    {authState && connectMode === 'JOIN' && (
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-slate-800 flex items-center">
                                    <UserPlus size={18} className="mr-2 text-blue-600"/> Hof beitreten
                                </h3>
                                <button onClick={() => setConnectMode('VIEW')} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Betriebsnummer (LFBIS)</label>
                                    <div className="flex space-x-2">
                                        <input 
                                            type="text" 
                                            value={inputFarmId}
                                            onChange={(e) => {
                                                const val = e.target.value.replace(/[^0-9a-zA-Z]/g, '');
                                                setInputFarmId(val);
                                                setSearchStatus('IDLE');
                                                setConnectError(null);
                                            }}
                                            className="flex-1 p-3 border border-slate-300 rounded-lg font-bold"
                                            placeholder="z.B. 1234567"
                                        />
                                        <button 
                                            onClick={handleSearchFarm}
                                            disabled={!inputFarmId || searchStatus === 'SEARCHING'}
                                            className="px-4 bg-slate-100 font-bold text-slate-600 rounded-lg hover:bg-slate-200 disabled:opacity-50"
                                        >
                                            {searchStatus === 'SEARCHING' ? <RefreshCw className="animate-spin"/> : 'Suchen'}
                                        </button>
                                    </div>
                                </div>

                                {searchStatus === 'NOT_FOUND' && (
                                    <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-100 flex items-start">
                                        <AlertTriangle size={16} className="mr-2 shrink-0 mt-0.5"/>
                                        <div>
                                            <strong>Hof nicht gefunden.</strong><br/>
                                            Bitte überprüfe die Nummer. Falls du den Hof neu anlegen willst, gehe zurück und wähle "Hof erstellen".
                                        </div>
                                    </div>
                                )}

                                {searchStatus === 'FOUND' && (
                                    <div className="animate-in slide-in-from-top-2 space-y-4">
                                        <div className="p-3 bg-green-50 text-green-800 rounded-lg text-sm border border-green-100">
                                            <div className="font-bold flex items-center mb-1"><CheckCircle size={14} className="mr-1"/> Hof gefunden!</div>
                                            Besitzer: <span className="font-mono bg-white/50 px-1 rounded">{foundOwnerEmail}</span>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Hof-PIN eingeben</label>
                                            <div className="relative">
                                                <input 
                                                    type={showPin ? "text" : "password"}
                                                    value={inputPin}
                                                    onChange={(e) => setInputPin(e.target.value)}
                                                    className="w-full p-3 border border-slate-300 rounded-lg font-bold tracking-widest"
                                                    placeholder="••••"
                                                />
                                                <button onClick={() => setShowPin(!showPin)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                                                    {showPin ? <EyeOff size={18}/> : <Eye size={18}/>}
                                                </button>
                                            </div>
                                        </div>

                                        {connectError && <div className="text-red-600 text-sm font-bold">{connectError}</div>}

                                        <button 
                                            onClick={handleJoinFarm}
                                            className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700"
                                        >
                                            Jetzt Verbinden
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* CREATE MODE UI */}
                    {authState && connectMode === 'CREATE' && (
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-slate-800 flex items-center">
                                    <Plus size={18} className="mr-2 text-green-600"/> Hof erstellen
                                </h3>
                                <button onClick={() => setConnectMode('VIEW')} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Neue Betriebsnummer</label>
                                    <input 
                                        type="text" 
                                        value={inputFarmId}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/[^0-9a-zA-Z]/g, '');
                                            setInputFarmId(val);
                                            setConnectError(null);
                                        }}
                                        className="w-full p-3 border border-slate-300 rounded-lg font-bold"
                                        placeholder="z.B. 2421..."
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Neuen PIN festlegen</label>
                                    <div className="relative">
                                        <input 
                                            type={showPin ? "text" : "password"}
                                            value={inputPin}
                                            onChange={(e) => setInputPin(e.target.value)}
                                            className="w-full p-3 border border-slate-300 rounded-lg font-bold tracking-widest"
                                            placeholder="••••"
                                        />
                                        <button onClick={() => setShowPin(!showPin)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                                            {showPin ? <EyeOff size={18}/> : <Eye size={18}/>}
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-1">Diesen PIN benötigen Ihre Mitarbeiter zum Beitreten.</p>
                                </div>

                                {connectError && <div className="text-red-600 text-sm font-bold">{connectError}</div>}

                                <button 
                                    onClick={handleCreateFarm}
                                    className="w-full py-3 bg-green-600 text-white font-bold rounded-xl shadow-lg hover:bg-green-700"
                                >
                                    Hof Anlegen
                                </button>
                            </div>
                        </div>
                    )}

                    {/* EXISTING CONNECTION UI (Reset/Info) */}
                    {authState && settings.farmId && (
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                            <h3 className="font-bold text-slate-800 mb-4 flex items-center">
                                <LinkIcon size={18} className="mr-2 text-green-600"/> Verbindung aktiv
                            </h3>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-2">
                                    <span className="text-slate-500">Farm ID</span>
                                    <span className="font-bold font-mono">{settings.farmId}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-2">
                                    <span className="text-slate-500">Status</span>
                                    <span className="text-green-600 font-bold flex items-center"><CheckCircle size={14} className="mr-1"/> Online</span>
                                </div>
                                
                                <button 
                                    onClick={() => {
                                        if(confirm("Verbindung wirklich trennen?")) {
                                            setSettings({...settings, farmId: '', farmPin: ''});
                                            handleSaveAll(); // Save empty
                                            setConnectMode('VIEW');
                                        }
                                    }}
                                    className="w-full mt-2 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-bold hover:bg-red-50"
                                >
                                    Verbindung trennen / Abmelden
                                </button>
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
                    {authState && settings.farmId && (
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
        {activeTab !== 'sync' && (
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
        )}

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

        {/* Diagnose Modal with Tabs and Inspector */}
        {showDiagnose && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl h-[85vh] flex flex-col overflow-hidden">
                    <div className="p-4 border-b flex justify-between items-center bg-slate-50 shrink-0">
                        <h3 className="font-bold text-lg flex items-center"><Terminal size={20} className="mr-2"/> System Diagnose</h3>
                        {/* FORCE RELOAD ON CLOSE */}
                        <button onClick={() => { setShowDiagnose(false); loadCloudData(settings.farmId); }}><X/></button>
                    </div>
                    
                    {/* TABS */}
                    <div className="flex border-b border-slate-200 bg-white shrink-0">
                        <button onClick={() => setActiveDiagTab('logs')} className={`flex-1 py-3 text-xs font-bold transition-colors ${activeDiagTab === 'logs' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400 hover:bg-slate-50'}`}>Protokoll</button>
                        <button onClick={() => setActiveDiagTab('inspector')} className={`flex-1 py-3 text-xs font-bold transition-colors ${activeDiagTab === 'inspector' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400 hover:bg-slate-50'}`}>Cloud Inhalt</button>
                        <button onClick={() => { setActiveDiagTab('repair'); analyzeRepair(); }} className={`flex-1 py-3 text-xs font-bold transition-colors ${activeDiagTab === 'repair' ? 'text-red-600 border-b-2 border-red-600' : 'text-slate-400 hover:bg-slate-50'}`}>Erweiterte Analyse</button>
                    </div>

                    <div className="flex-1 overflow-y-auto bg-slate-50">
                        {activeDiagTab === 'logs' ? (
                            // LOG VIEW
                            <div className="p-4 font-mono text-xs bg-slate-900 text-green-400 min-h-full space-y-2">
                                {dbService.getLogs().map((log, i) => (
                                    <div key={i} className="border-b border-green-900/30 pb-1 break-words">{log}</div>
                                ))}
                            </div>
                        ) : activeDiagTab === 'inspector' ? (
                            // INSPECTOR VIEW
                            <div className="p-4 space-y-6">
                                <div className="flex justify-between items-center mb-2">
                                    <h4 className="font-bold text-slate-700 text-sm">Gespeicherte Daten für '{settings.farmId}'</h4>
                                    <button onClick={runInspector} className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded text-xs font-bold flex items-center hover:bg-blue-200 transition-colors shadow-sm">
                                        {inspectorLoading ? <RefreshCw className="animate-spin mr-1" size={14}/> : <RefreshCw size={14} className="mr-1"/>} Inhalt laden
                                    </button>
                                </div>

                                {!inspectorData ? (
                                    <div className="text-center py-12 border-2 border-dashed border-slate-300 rounded-xl">
                                        <Cloud size={32} className="mx-auto text-slate-300 mb-2"/>
                                        <p className="text-sm text-slate-500">Klicke auf "Inhalt laden", um die Cloud abzufragen.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {/* Stats Summary */}
                                        <div className="grid grid-cols-4 gap-2 text-center">
                                            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                                                <div className="font-bold text-lg text-slate-800">{inspectorData.activities?.length || 0}</div>
                                                <div className="text-[10px] text-slate-500 uppercase font-bold">Aktivitäten</div>
                                            </div>
                                            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                                                <div className="font-bold text-lg text-slate-800">{inspectorData.fields?.length || 0}</div>
                                                <div className="text-[10px] text-slate-500 uppercase font-bold">Felder</div>
                                            </div>
                                            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                                                <div className="font-bold text-lg text-slate-800">{inspectorData.storages?.length || 0}</div>
                                                <div className="text-[10px] text-slate-500 uppercase font-bold">Lager</div>
                                            </div>
                                            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                                                <div className="font-bold text-lg text-slate-800">{inspectorData.profiles?.length || 0}</div>
                                                <div className="text-[10px] text-slate-500 uppercase font-bold">Profil</div>
                                            </div>
                                        </div>

                                        {/* Activities List */}
                                        {inspectorData.activities?.length > 0 && (
                                            <div>
                                                <h5 className="text-xs font-bold text-slate-500 uppercase mb-2">Letzte Aktivitäten</h5>
                                                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100 max-h-48 overflow-y-auto">
                                                    {inspectorData.activities.map((a: any, i: number) => (
                                                        <div key={i} className="p-3 text-xs flex justify-between items-center hover:bg-slate-50">
                                                            <div>
                                                                <span className="font-bold block text-slate-700">{new Date(a.date).toLocaleDateString()}</span>
                                                                <span className="text-slate-500">{a.type}</span>
                                                            </div>
                                                            <span className="bg-slate-100 px-2 py-1 rounded text-slate-600">{a.device}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Fields List */}
                                        {inspectorData.fields?.length > 0 && (
                                            <div>
                                                <h5 className="text-xs font-bold text-slate-500 uppercase mb-2">Felder</h5>
                                                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100 max-h-48 overflow-y-auto">
                                                    {inspectorData.fields.map((f: any, i: number) => (
                                                        <div key={i} className="p-3 text-xs flex justify-between items-center hover:bg-slate-50">
                                                            <span className="font-bold text-slate-700">{f.name}</span>
                                                            <span className="text-slate-500">{f.area?.toFixed(2)} ha</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        
                                        {/* Storages List */}
                                        {inspectorData.storages?.length > 0 && (
                                            <div>
                                                <h5 className="text-xs font-bold text-slate-500 uppercase mb-2">Lager</h5>
                                                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                                                    {inspectorData.storages.map((s: any, i: number) => (
                                                        <div key={i} className="p-3 text-xs flex justify-between items-center hover:bg-slate-50">
                                                            <span className="font-bold text-slate-700">{s.name}</span>
                                                            <span className="text-slate-500">{s.capacity} m³ ({s.type})</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            // REPAIR VIEW
                            <div className="p-6">
                                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
                                    <h4 className="font-bold text-orange-900 flex items-center mb-2">
                                        <Wrench className="mr-2" size={18}/> Datentyp Konflikt Analyse
                                    </h4>
                                    <p className="text-sm text-orange-800">
                                        Prüft, ob Daten unter zwei verschiedenen ID-Formaten (Zahl vs. Text) gespeichert sind. 
                                        Dies ist oft der Grund, warum Geräte unterschiedliche Daten sehen.
                                    </p>
                                </div>

                                {repairLoading ? (
                                    <div className="text-center py-8 text-slate-500">
                                        <RefreshCw className="animate-spin mx-auto mb-2"/>
                                        Analysiere Datenbank...
                                    </div>
                                ) : repairAnalysis ? (
                                    <div className="space-y-6">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="bg-white p-4 rounded-xl border-2 border-blue-100 text-center">
                                                <div className="text-2xl font-bold text-blue-600">{repairAnalysis.stringIdCount}</div>
                                                <div className="text-xs font-bold text-slate-500">Einträge als TEXT (Neu)</div>
                                                <div className="text-[10px] text-slate-400 font-mono mt-1">ID: '{settings.farmId}'</div>
                                            </div>
                                            <div className="bg-white p-4 rounded-xl border-2 border-amber-100 text-center">
                                                <div className="text-2xl font-bold text-amber-600">{repairAnalysis.numberIdCount}</div>
                                                <div className="text-xs font-bold text-slate-500">Einträge als ZAHL (Alt)</div>
                                                <div className="text-[10px] text-slate-400 font-mono mt-1">ID: {settings.farmId}</div>
                                            </div>
                                        </div>

                                        <div className="bg-white rounded-lg border border-slate-200 p-4 text-xs font-mono text-slate-600 space-y-1">
                                            {repairAnalysis.details.map((line: string, i: number) => (
                                                <div key={i}>{line}</div>
                                            ))}
                                        </div>

                                        {repairAnalysis.numberIdCount > 0 && (
                                            <button 
                                                onClick={executeRepair}
                                                className="w-full py-4 bg-green-600 text-white rounded-xl font-bold shadow-lg hover:bg-green-700 flex items-center justify-center animate-pulse"
                                            >
                                                <Wrench className="mr-2"/> Daten zusammenführen (Reparieren)
                                            </button>
                                        )}
                                        
                                        {repairAnalysis.numberIdCount === 0 && (
                                            <div className="text-center text-green-600 font-bold p-4 bg-green-50 rounded-xl">
                                                Alles OK! Keine Konflikte gefunden.
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <button onClick={analyzeRepair} className="w-full py-3 bg-slate-200 text-slate-700 font-bold rounded-lg hover:bg-slate-300">
                                        Analyse Starten
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer Info */}
                    <div className="p-4 border-t bg-slate-800 text-slate-400 text-[10px] font-mono shrink-0">
                        {settings.farmId && (
                            <div>
                                Farm ID: ['{settings.farmId}'] (Länge: {settings.farmId.length})<br/>
                                ASCII Check: {settings.farmId.split('').map(c => `${c} (${c.charCodeAt(0)})`).join(' ')}
                            </div>
                        )}
                    </div>
                    
                    <div className="p-4 border-t bg-slate-100 flex justify-between items-center shrink-0">
                        <button 
                            onClick={handleHardReset} 
                            className="bg-red-600 text-white px-4 py-3 w-full rounded text-sm font-bold hover:bg-red-700 transition-colors shadow-lg animate-pulse"
                        >
                            ⚠️ App & Datenbank komplett zurücksetzen (Hard Reset)
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
                    <div 
                        className={`h-full transition-all duration-300 ${uploadProgress.status.includes('fehlgeschlagen') ? 'bg-red-500' : 'bg-blue-500'}`} 
                        style={{width: `${uploadProgress.percent}%`}}
                    ></div>
                </div>
                <div className="mt-2 font-mono">{uploadProgress.percent}%</div>
                
                {uploadProgress.status.includes('fehlgeschlagen') && (
                    <button onClick={() => setIsUploading(false)} className="mt-6 px-6 py-2 bg-white text-slate-900 rounded-full font-bold hover:bg-slate-200">
                        Schließen
                    </button>
                )}
            </div>
        )}

    </div>
  );
};
