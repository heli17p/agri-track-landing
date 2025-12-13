import React, { useState, useEffect } from 'react';
import { 
  User, Database, Settings, Cloud, Save, Plus, Trash2, 
  MapPin, Truck, AlertTriangle, Info, Share2, UploadCloud, 
  Smartphone, CheckCircle2, X, Shield, Lock, Users, LogOut,
  ChevronRight, RefreshCw, Copy
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
      // Don't set global loading=true to prevent full page flicker
      const s = await dbService.getSettings();
      setSettings(s);
      
      const p = await dbService.getFarmProfile();
      if (p.length > 0) setProfile(p[0]);

      const st = await dbService.getStorageLocations();
      setStorages(st);

      // Cloud Data attempt
      if (isCloudConfigured() && s.farmId) {
          loadCloudData(s.farmId);
      } else {
        setLoading(false);
      }
  };

  const loadCloudData = async (farmId: string) => {
      setIsLoadingCloud(true);
      try {
        const members = await dbService.getFarmMembers(farmId);
        setCloudMembers(members);
        const stats = await dbService.getCloudStats(farmId);
        setCloudStats(stats);
      } catch (e) {
        console.error("Cloud load error", e);
      } finally {
        setIsLoadingCloud(false);
        setLoading(false);
      }
  };

  const handleSaveAll = async () => {
      setSaving(true);
      await dbService.saveSettings(settings);
      await dbService.saveFarmProfile(profile);
      // Storages are saved individually
      
      // Force Sync to download data for new Farm ID immediately
      if (isCloudConfigured()) {
          try {
              await syncData();
              // Cloud stats will reload via useEffect on settings.farmId or db change
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
      if (!window.confirm("Alle lokalen Daten werden erneut an die Cloud gesendet. Fortfahren?")) return;
      
      // CRITICAL FIX: Ensure settings (Farm ID) are saved to storage BEFORE starting upload
      // Otherwise the upload service might read old/empty settings from storage.
      await dbService.saveSettings(settings);

      setIsUploading(true);
      try {
          await dbService.forceUploadToFarm();
          alert("Upload erfolgreich!");
          // Reload stats
          if(settings.farmId) loadCloudData(settings.farmId);
      } catch (e: any) {
          alert("Fehler: " + e.message);
      } finally {
          setIsUploading(false);
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
          
          {/* --- PROFILE TAB --- */}
          {activeTab === 'profile' && (
              <div className="p-4 space-y-6 max-w-2xl mx-auto">
                  
                  {/* Farm ID Card */}
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 text-center">
                      <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                          <User size={40} />
                      </div>
                      <h2 className="text-xl font-bold text-slate-800">
                          {profile.operatorName || 'Mein Betrieb'}
                      </h2>
                      <p className="text-slate-500">{profile.farmId || 'Keine Betriebsnummer'}</p>
                  </div>

                  {/* Form */}
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
                              <button 
                                  onClick={handleGeocode}
                                  className="p-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors"
                                  title="Adresse auf Karte suchen"
                              >
                                  <MapPin size={24} />
                              </button>
                          </div>
                          {geoCodingStatus === 'SUCCESS' && <p className="text-xs text-green-600 mt-1 flex items-center"><CheckCircle2 size={12} className="mr-1"/> Koordinate gefunden</p>}
                          {geoCodingStatus === 'ERROR' && <p className="text-xs text-red-600 mt-1 flex items-center"><AlertTriangle size={12} className="mr-1"/> Adresse nicht gefunden</p>}
                      </div>

                      <div>
                          <label className="block text-sm font-bold text-slate-500 uppercase mb-1">Gesamtfläche (ha)</label>
                          <input 
                              type="number" 
                              value={profile.totalAreaHa || ''}
                              onChange={(e) => setProfile({...profile, totalAreaHa: parseFloat(e.target.value)})}
                              className="w-full p-3 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-green-500"
                              placeholder="Automatisch berechnet wenn leer"
                          />
                          <p className="text-xs text-slate-400 mt-1">Wird automatisch aus den Feldern berechnet, falls leer gelassen.</p>
                      </div>
                  </div>
              </div>
          )}

          {/* --- STORAGE TAB --- */}
          {activeTab === 'storage' && (
              <div className="p-4 space-y-4 max-w-2xl mx-auto">
                  <div className="flex justify-between items-center mb-2">
                      <h3 className="font-bold text-lg text-slate-700">Meine Lager</h3>
                      <button 
                          onClick={() => setEditingStorage({
                              id: Math.random().toString(36).substr(2, 9),
                              name: '',
                              type: FertilizerType.SLURRY,
                              capacity: 100,
                              currentLevel: 0,
                              dailyGrowth: 0.5,
                              geo: { lat: 47.5, lng: 14.5 } // Default placeholder
                          })}
                          className="flex items-center text-sm font-bold text-green-600 bg-green-50 px-3 py-2 rounded-lg hover:bg-green-100"
                      >
                          <Plus size={16} className="mr-1"/> Neu anlegen
                      </button>
                  </div>

                  {storages.length === 0 && (
                      <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 border-dashed">
                          <Database size={48} className="text-slate-300 mx-auto mb-3"/>
                          <p className="text-slate-500">Noch keine Lager angelegt.</p>
                      </div>
                  )}

                  {storages.map(storage => (
                      <div key={storage.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
                          <div className="flex items-center space-x-4">
                              <div className={`p-3 rounded-full ${storage.type === FertilizerType.SLURRY ? 'bg-amber-100 text-amber-800' : 'bg-orange-100 text-orange-800'}`}>
                                  {storage.type === FertilizerType.SLURRY ? <Database size={24}/> : <Database size={24}/>}
                              </div>
                              <div>
                                  <h4 className="font-bold text-slate-800">{storage.name}</h4>
                                  <p className="text-xs text-slate-500">
                                      {storage.capacity} m³ • {storage.type} • {storage.currentLevel.toFixed(1)} m³ voll
                                  </p>
                              </div>
                          </div>
                          <div className="flex space-x-2">
                              <button onClick={() => setEditingStorage(storage)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                                  <Settings size={20}/>
                              </button>
                              <button onClick={() => handleStorageDelete(storage.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                                  <Trash2 size={20}/>
                              </button>
                          </div>
                      </div>
                  ))}

                  {/* Info Box */}
                  <div className="bg-blue-50 p-4 rounded-xl flex items-start text-blue-800 text-sm mt-6">
                      <Info className="shrink-0 mr-3 mt-0.5" size={18}/>
                      <p>
                          <strong>Tipp:</strong> Um den Standort eines Lagers zu ändern, 
                          öffne die Karte, tippe auf das Lager-Icon und verschiebe es. 
                          Hier kannst du nur die Kapazitäten verwalten.
                      </p>
                  </div>
              </div>
          )}

          {/* --- GENERAL TAB --- */}
          {activeTab === 'general' && (
              <div className="p-4 space-y-6 max-w-2xl mx-auto">
                  
                  {/* Equipment Settings */}
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-5">
                      <h3 className="font-bold text-lg text-slate-700 flex items-center">
                          <Truck className="mr-2" size={20}/> Maschinen & Ausbringung
                      </h3>
                      
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Güllefass (m³)</label>
                              <input 
                                  type="number" 
                                  value={settings.slurryLoadSize}
                                  onChange={(e) => setSettings({...settings, slurryLoadSize: parseFloat(e.target.value)})}
                                  className="w-full p-2 border border-slate-300 rounded-lg font-bold"
                              />
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Breite (m)</label>
                              <input 
                                  type="number" 
                                  value={settings.slurrySpreadWidth || 12}
                                  onChange={(e) => setSettings({...settings, slurrySpreadWidth: parseFloat(e.target.value)})}
                                  className="w-full p-2 border border-slate-300 rounded-lg"
                              />
                          </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                          <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Miststreuer (m³)</label>
                              <input 
                                  type="number" 
                                  value={settings.manureLoadSize}
                                  onChange={(e) => setSettings({...settings, manureLoadSize: parseFloat(e.target.value)})}
                                  className="w-full p-2 border border-slate-300 rounded-lg font-bold"
                              />
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Breite (m)</label>
                              <input 
                                  type="number" 
                                  value={settings.manureSpreadWidth || 10}
                                  onChange={(e) => setSettings({...settings, manureSpreadWidth: parseFloat(e.target.value)})}
                                  className="w-full p-2 border border-slate-300 rounded-lg"
                              />
                          </div>
                      </div>
                  </div>

                  {/* GPS Settings */}
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-5">
                      <h3 className="font-bold text-lg text-slate-700 flex items-center">
                          <Smartphone className="mr-2" size={20}/> GPS Automatik
                      </h3>
                      
                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Start-Geschwindigkeit (km/h)</label>
                          <div className="flex items-center space-x-3">
                              <input 
                                  type="range" min="1" max="10" step="0.5"
                                  value={settings.minSpeed}
                                  onChange={(e) => setSettings({...settings, minSpeed: parseFloat(e.target.value)})}
                                  className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                              />
                              <span className="font-bold text-slate-700 w-12 text-right">{settings.minSpeed}</span>
                          </div>
                          <p className="text-xs text-slate-400 mt-1">Unterhalb dieser Geschwindigkeit wird nicht aufgezeichnet (Stillstand).</p>
                      </div>

                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Max. Arbeits-Geschwindigkeit (km/h)</label>
                          <div className="flex items-center space-x-3">
                              <input 
                                  type="range" min="5" max="30" step="1"
                                  value={settings.maxSpeed}
                                  onChange={(e) => setSettings({...settings, maxSpeed: parseFloat(e.target.value)})}
                                  className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                              />
                              <span className="font-bold text-slate-700 w-12 text-right">{settings.maxSpeed}</span>
                          </div>
                          <p className="text-xs text-slate-400 mt-1">Oberhalb dieser Geschwindigkeit wird die Fahrt als "Transport" gewertet (keine Ausbringung).</p>
                      </div>

                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Lager-Erkennungsradius (m)</label>
                          <input 
                              type="number" 
                              value={settings.storageRadius}
                              onChange={(e) => setSettings({...settings, storageRadius: parseFloat(e.target.value)})}
                              className="w-full p-2 border border-slate-300 rounded-lg"
                          />
                      </div>
                  </div>

                  {/* App Icon */}
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                      <h3 className="font-bold text-lg text-slate-700">App Design (Traktor Marke)</h3>
                      <div className="grid grid-cols-4 gap-4">
                          {ICON_THEMES.map(theme => (
                              <button
                                  key={theme.id}
                                  onClick={() => setSettings({...settings, appIcon: theme.id})}
                                  className={`p-2 rounded-xl border-2 flex flex-col items-center space-y-2 transition-all ${
                                      (settings.appIcon || 'standard') === theme.id 
                                      ? 'border-green-500 bg-green-50' 
                                      : 'border-transparent hover:bg-slate-50'
                                  }`}
                              >
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
                                  <div className="font-mono text-sm">{cloudStats.activities}</div>
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

                          <p className="text-sm text-slate-500 mb-4">
                              Um mehrere Geräte (z.B. Fahrer) mit diesem Hof zu verbinden, müssen alle die gleiche 
                              <strong> Betriebsnummer</strong> und das gleiche <strong>Hof-Passwort</strong> eingeben.
                          </p>
                          
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
                          
                          <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100 text-yellow-800 text-sm flex items-start">
                               <Lock className="shrink-0 mr-2 mt-0.5" size={16} />
                               <p>
                                   <strong>Schließfach-Prinzip:</strong> Nur Geräte mit der exakt gleichen Kombination aus 
                                   Nummer und PIN können die Daten dieses Hofes lesen oder schreiben.
                               </p>
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

                              {/* Connected Devices (Mock List based on DB members) */}
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
                                          {cloudMembers.length > 3 && <div className="text-xs text-center text-slate-400 pt-1">...und {cloudMembers.length - 3} weitere</div>}
                                      </div>
                                  )}
                              </div>
                          </div>
                      </div>
                  )}

                  {/* Sign Out Button */}
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
                              placeholder="z.B. Güllegrube Hof"
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
                      <div className="grid grid-cols-2 gap-4">
                           <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Aktuell (m³)</label>
                              <input 
                                  type="number" 
                                  value={editingStorage.currentLevel}
                                  onChange={(e) => setEditingStorage({...editingStorage, currentLevel: parseFloat(e.target.value)})}
                                  className="w-full p-2 border border-slate-300 rounded-lg"
                              />
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Zuwachs / Tag</label>
                              <input 
                                  type="number" step="0.1"
                                  value={editingStorage.dailyGrowth}
                                  onChange={(e) => setEditingStorage({...editingStorage, dailyGrowth: parseFloat(e.target.value)})}
                                  className="w-full p-2 border border-slate-300 rounded-lg"
                              />
                          </div>
                      </div>
                      <div className="bg-blue-50 p-3 rounded-lg text-xs text-blue-700">
                          <Info size={14} className="inline mr-1"/>
                          Position kann nur auf der Karte geändert werden.
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
