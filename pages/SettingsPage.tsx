import React, { useState, useEffect } from 'react';
import { 
  User, Database, Settings, Cloud, Save, Plus, Trash2, 
  MapPin, Truck, AlertTriangle, Info, Share2, UploadCloud, 
  Smartphone, CheckCircle2, X, Shield, Lock, Users, LogOut,
  ChevronRight, RefreshCw, Copy, WifiOff, FileText, Search, Map
} from 'lucide-react';
import { dbService } from '../services/db';
import { authService } from '../services/auth';
import { syncData } from '../services/sync';
import { AppSettings, FarmProfile, StorageLocation, FertilizerType, DEFAULT_SETTINGS } from '../types';
import { getAppIcon, ICON_THEMES } from '../utils/appIcons';
import { geocodeAddress } from '../utils/geo';
import { isCloudConfigured } from '../services/storage';

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
  const [cloudStats, setCloudStats] = useState({ activities: 0 });
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingCloud, setIsLoadingCloud] = useState(false);
  const [showPin, setShowPin] = useState(false);
  
  // Debug / Log State
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [inspectorData, setInspectorData] = useState<any>(null);
  const [inspectorLoading, setInspectorLoading] = useState(false);
  const [debugTab, setDebugTab] = useState<'LOGS' | 'INSPECTOR'>('LOGS');

  // Storage Edit State
  const [editingStorage, setEditingStorage] = useState<StorageLocation | null>(null);

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

  // Specific effect to reload cloud stats when farmId changes or becomes available
  useEffect(() => {
      if (isCloudConfigured() && settings.farmId) {
          loadCloudData(settings.farmId);
      }
  }, [settings.farmId]);

  const loadAll = async () => {
      const s = await dbService.getSettings();
      setSettings(s);
      
      const p = await dbService.getFarmProfile();
      if (p.length > 0) setProfile(p[0]);

      const st = await dbService.getStorageLocations();
      setStorages(st);
      
      setLoading(false); 

      // Load Cloud Data in background if configured
      if (isCloudConfigured() && s.farmId) {
          loadCloudData(s.farmId);
      }
  };

  const loadCloudData = async (farmId: string) => {
      setIsLoadingCloud(true);
      try {
        const membersPromise = dbService.getFarmMembers(farmId);
        const statsPromise = dbService.getCloudStats(farmId);
        
        const [members, stats] = await Promise.all([membersPromise, statsPromise]);
        
        setCloudMembers(members);
        setCloudStats(stats);
      } catch (e) {
        console.warn("Cloud load warning (offline?):", e);
      } finally {
        setIsLoadingCloud(false);
      }
  };

  const handleSaveAll = async () => {
      setSaving(true);
      await dbService.saveSettings(settings);
      await dbService.saveFarmProfile(profile);
      // Storages are saved individually
      
      if (isCloudConfigured()) {
          try {
              await syncData();
          } catch(e) {
              console.error("Auto-sync after save failed:", e);
          }
      }
      
      setSaving(false);
      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 2000);
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
      if (!window.confirm("Alle lokalen Daten (inkl. Felder) werden erneut an die Cloud gesendet. Fortfahren?")) return;
      
      await dbService.saveSettings(settings);

      setIsUploading(true);
      try {
          await dbService.forceUploadToFarm();
          alert("Upload erfolgreich!");
          if(settings.farmId) loadCloudData(settings.farmId);
      } catch (e: any) {
          alert("Fehler: " + e.message);
      } finally {
          setIsUploading(false);
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

  if (loading) return <div className="p-8 text-center text-slate-500 flex items-center justify-center h-full"><RefreshCw className="animate-spin mr-2"/> Lade Einstellungen...</div>;

  return (
    <div className="h-full bg-slate-50 flex flex-col relative overflow-hidden">
      {renderTabs()}

      <div className="flex-1 overflow-y-auto pb-32">
          {/* ... [Profile, Storage, General Tabs omitted for brevity, they are unchanged] ... */}
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
                              onChange={(e) => setProfile({...profile, farmId: e.target.value})}
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
                              <button onClick={handleGeocode} className="p-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors"><MapPin size={24} /></button>
                          </div>
                      </div>
                  </div>
              </div>
          )}
          
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
                              <div><h4 className="font-bold text-slate-800">{storage.name}</h4><p className="text-xs text-slate-500">{storage.capacity} m³ • {storage.type}</p></div>
                          </div>
                          <div className="flex space-x-2">
                              <button onClick={() => setEditingStorage(storage)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Settings size={20}/></button>
                              <button onClick={() => handleStorageDelete(storage.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={20}/></button>
                          </div>
                      </div>
                  ))}
              </div>
          )}

          {activeTab === 'general' && (
              <div className="p-4 space-y-6 max-w-2xl mx-auto">
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-5">
                      <h3 className="font-bold text-lg text-slate-700 flex items-center"><Truck className="mr-2" size={20}/> Maschinen</h3>
                      <div className="grid grid-cols-2 gap-4">
                          <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Güllefass (m³)</label><input type="number" value={settings.slurryLoadSize} onChange={(e) => setSettings({...settings, slurryLoadSize: parseFloat(e.target.value)})} className="w-full p-2 border border-slate-300 rounded-lg font-bold"/></div>
                          <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Breite (m)</label><input type="number" value={settings.slurrySpreadWidth || 12} onChange={(e) => setSettings({...settings, slurrySpreadWidth: parseFloat(e.target.value)})} className="w-full p-2 border border-slate-300 rounded-lg"/></div>
                      </div>
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
                                    {cloudStats.activities === -1 ? (
                                        <span className="flex items-center text-white/50 text-[10px]" title="Keine Verbindung oder Offline"><WifiOff size={10} className="mr-1"/> ?</span>
                                    ) : (
                                        cloudStats.activities
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

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Betriebsnummer (Farm ID)</label>
                                  <input 
                                      type="text" 
                                      value={settings.farmId || ''}
                                      onChange={(e) => setSettings({...settings, farmId: e.target.value})}
                                      className="w-full p-3 border border-slate-300 rounded-xl font-mono font-bold bg-slate-50"
                                      placeholder="LFBIS Nummer"
                                  />
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Hof-Passwort (PIN)</label>
                                  <div className="relative">
                                      <input 
                                          type={showPin ? "text" : "password"}
                                          value={settings.farmPin || ''}
                                          onChange={(e) => setSettings({...settings, farmPin: e.target.value})}
                                          className="w-full p-3 border border-slate-300 rounded-xl font-mono font-bold bg-slate-50"
                                          placeholder="Geheim!"
                                      />
                                      <button 
                                          onClick={() => setShowPin(!showPin)}
                                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                      >
                                          {showPin ? <Lock size={16}/> : <Shield size={16}/>}
                                      </button>
                                  </div>
                              </div>
                          </div>
                      </div>
                  )}

                  {/* Extensions & Tools Section (NEW) */}
                  {isCloudConfigured() && settings.farmId && (
                      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                          <h3 className="font-bold text-lg text-slate-700 border-b border-slate-100 pb-2">
                              Erweiterungen & Werkzeuge
                          </h3>
                          
                          <div className="grid grid-cols-1 gap-3">
                              
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

                              {/* Force Upload */}
                              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                                  <div className="flex items-center">
                                      <div className="p-2 bg-orange-100 text-orange-600 rounded-lg mr-3">
                                          <UploadCloud size={20} />
                                      </div>
                                      <div>
                                          <div className="font-bold text-slate-700">Notfall-Upload</div>
                                          <div className="text-xs text-slate-500">Erzwinge Sync aller lokalen Daten</div>
                                      </div>
                                  </div>
                                  <button 
                                      onClick={handleForceUpload}
                                      disabled={isUploading}
                                      className="p-2 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all text-slate-500"
                                  >
                                      {isUploading ? <RefreshCw className="animate-spin" size={18}/> : <ChevronRight size={18} />}
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

      {/* Floating Save Button */}
      <div className="absolute bottom-24 right-6 z-30">
          <button 
              onClick={handleSaveAll}
              disabled={saving}
              className={`flex items-center space-x-2 px-6 py-4 rounded-full shadow-2xl font-bold text-lg transition-all transform hover:scale-105 active:scale-95 ${
                  showSaveSuccess 
                  ? 'bg-green-500 text-white' 
                  : 'bg-slate-900 text-white hover:bg-black'
              }`}
          >
              {showSaveSuccess ? <CheckCircle2 size={24}/> : (saving ? <RefreshCw className="animate-spin" size={24}/> : <Save size={24}/>)}
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
                                  <strong>Farm ID:</strong> {settings.farmId} <br/>
                                  Dies zeigt rohe Daten direkt aus der Datenbank.
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
                                          </>
                                      )}
                                  </>
                              ) : (
                                  <div className="text-center py-8 text-slate-400">Keine Daten geladen.</div>
                              )}
                          </div>
                      )}
                  </div>
                  
                  <div className="p-3 bg-white border-t border-slate-200 shrink-0">
                      <button onClick={handleOpenDebug} className="w-full bg-slate-100 text-slate-700 py-2 rounded font-bold hover:bg-slate-200">
                          Aktualisieren
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Storage Edit Modal */}
      {editingStorage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-fade-scale">
                  <div className="p-4 bg-slate-800 text-white flex justify-between items-center">
                      <h3 className="font-bold">Lager bearbeiten</h3>
                      <button onClick={() => setEditingStorage(null)}><X size={20}/></button>
                  </div>
                  <div className="p-4 space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Bezeichnung</label>
                          <input 
                              type="text" 
                              value={editingStorage.name}
                              onChange={(e) => setEditingStorage({...editingStorage, name: e.target.value})}
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
                      <button 
                          onClick={() => handleStorageSave(editingStorage)}
                          className="w-full py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700"
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
