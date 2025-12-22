
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Save, User, Database, Settings, Cloud, CheckCircle, RefreshCw, X, Move } from 'lucide-react';
import { dbService, generateId } from '../services/db';
import { authService } from '../services/auth';
import { syncData } from '../services/sync';
import { AppSettings, DEFAULT_SETTINGS, FarmProfile, StorageLocation, FertilizerType } from '../types';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { ProfileTab, StorageTab, GeneralTab, SyncTab } from '../components/settings/SettingsTabs';
import { DiagnosticModal, RulesHelpModal, StorageEditModal } from '../components/settings/SettingsModals';

interface Props { initialTab?: 'profile' | 'storage' | 'general' | 'sync'; }

// Icons Helper für Hof-Marker
const createCustomIcon = (color: string, path: string) => L.divIcon({ className: 'custom-pin', html: `<div style="background-color: ${color}; width: 32px; height: 32px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; color: white;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${path}</svg></div>`, iconSize: [32, 32], iconAnchor: [16, 16] });
const farmIcon = createCustomIcon('#2563eb', '<path d="M3 21h18M5 21V7l8-5 8 5v14"/>');

const LocationPickerMap = ({ position, onPick, icon }: any) => {
    const map = useMap();
    useEffect(() => { setTimeout(() => map.invalidateSize(), 200); if (position) map.setView(position, map.getZoom() || 15); }, [map]);
    useMapEvents({ click(e) { onPick(e.latlng.lat, e.latlng.lng); } });
    return (
        <>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {position && <Marker draggable={true} eventHandlers={{ dragend(e) { onPick(e.target.getLatLng().lat, e.target.getLatLng().lng); } }} position={position} icon={icon || farmIcon} />}
        </>
    );
};

export const SettingsPage: React.FC<Props> = ({ initialTab = 'profile' }) => {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [profile, setProfile] = useState<FarmProfile>({ farmId: '', operatorName: '', address: '', totalAreaHa: 0 });
  const [storages, setStorages] = useState<StorageLocation[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [authState, setAuthState] = useState<any>(null);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [localStats, setLocalStats] = useState({ total: 0 });
  const [cloudStats, setCloudStats] = useState({ total: -1 });
  const [editingStorage, setEditingStorage] = useState<StorageLocation | null>(null);
  const [showDiagnose, setShowDiagnose] = useState(false);
  const [activeDiagTab, setActiveDiagTab] = useState('status');
  const [showMapPicker, setShowMapPicker] = useState<'profile' | 'storage' | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ status: '', percent: 0 });
  const [connectMode, setConnectMode] = useState<'VIEW' | 'JOIN' | 'CREATE'>('VIEW');
  const [inputFarmId, setInputFarmId] = useState('');
  const [inputPin, setInputPin] = useState('');
  const [showRulesHelp, setShowRulesHelp] = useState(false);
  const [conflicts, setConflicts] = useState([]);
  const [conflictSearchId, setConflictSearchId] = useState('');

  const loadAll = async () => {
    const s = await dbService.getSettings(); setSettings(s);
    const p = await dbService.getFarmProfile(); if(p.length) setProfile(p[0]);
    const st = await dbService.getStorageLocations(); setStorages(st);
    setLocalStats(await dbService.getLocalStats());
    if (s.farmId) setCloudStats(await dbService.getCloudStats(s.farmId));
  };

  useEffect(() => { 
    loadAll(); 
    return authService.onAuthStateChanged(u => { setAuthState(u); setUserInfo(dbService.getCurrentUserInfo()); }); 
  }, []);

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
        await dbService.saveFarmProfile(profile);
        await dbService.saveSettings(settings);
        syncData(); setShowToast(true); setTimeout(() => setShowToast(false), 2000);
    } catch (e) { alert("Fehler: " + e); } finally { setIsSaving(false); }
  };

  return (
    <div className="h-full flex flex-col bg-slate-100 relative overflow-hidden">
        {showToast && <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-green-600 text-white px-6 py-2 rounded-full shadow-xl z-50 animate-in fade-in slide-in-from-top-4 flex items-center"><CheckCircle size={18} className="mr-2"/> Gespeichert</div>}
        
        <div className="bg-white border-b border-slate-200 sticky top-0 z-10 shrink-0">
            <div className="flex overflow-x-auto hide-scrollbar">
                {[
                    { id: 'profile', icon: User, label: 'Betrieb' },
                    { id: 'storage', icon: Database, label: 'Lager' },
                    { id: 'general', icon: Settings, label: 'Allgemein' },
                    { id: 'sync', icon: Cloud, label: 'Sync' }
                ].map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex-1 py-4 px-4 flex flex-col items-center min-w-[80px] border-b-2 transition-colors ${activeTab === tab.id ? 'border-green-600 text-green-700 bg-green-50/50' : 'border-transparent text-slate-500'}`}><tab.icon size={20} className="mb-1" /><span className="text-xs font-bold">{tab.label}</span></button>
                ))}
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-32">
            {activeTab === 'profile' && <ProfileTab profile={profile} setProfile={setProfile} onPickMap={() => setShowMapPicker('profile')} />}
            {activeTab === 'storage' && <StorageTab storages={storages} onEdit={setEditingStorage} onCreate={() => setEditingStorage({ id: generateId(), name: '', type: FertilizerType.SLURRY, capacity: 100, currentLevel: 0, dailyGrowth: 0.5, geo: { lat: 47.5, lng: 14.5 } })} />}
            {activeTab === 'general' && <GeneralTab settings={settings} setSettings={setSettings} />}
            {activeTab === 'sync' && <SyncTab 
                authState={authState} settings={settings} cloudStats={cloudStats} localStats={localStats} 
                connectMode={connectMode} setConnectMode={setConnectMode} inputFarmId={inputFarmId} setInputFarmId={setInputFarmId} 
                inputPin={inputPin} setInputPin={setInputPin} searchStatus="IDLE" foundOwnerEmail={null} connectError={null} 
                onSearch={() => {}} onJoin={() => {}} onCreate={() => {}} 
                onForceUpload={() => dbService.forceUploadToFarm((s, p) => setUploadProgress({status: s, percent: p}))} 
                onManualDownload={syncData} onShowDiagnose={() => { setLogs(dbService.getLogs()); setShowDiagnose(true); }}
            />}
        </div>

        <div className="absolute bottom-24 right-4 z-30">
            <button onClick={handleSaveAll} disabled={isSaving} className="bg-slate-900 text-white px-5 py-3 rounded-full shadow-2xl font-bold flex items-center hover:scale-105 transition-all">{isSaving ? <RefreshCw className="animate-spin w-5 h-5"/> : <Save className="w-5 h-5 mr-2"/>}Speichern</button>
        </div>

        {/* Diagnose Modal */}
        <DiagnosticModal 
            show={showDiagnose} onClose={() => setShowDiagnose(false)} activeDiagTab={activeDiagTab} setActiveDiagTab={setActiveDiagTab}
            userInfo={userInfo} cloudStats={cloudStats} logs={logs} inspectorData={null} inspectorLoading={false} runInspector={() => {}}
            conflicts={conflicts} conflictsLoading={false} conflictSearchId={conflictSearchId} setConflictSearchId={setConflictSearchId}
            loadConflicts={() => dbService.findFarmConflicts(conflictSearchId).then(setConflicts as any)} deleteConflict={id => dbService.deleteSettingsDoc(id).then(loadAll)}
            handleForceDeleteFarm={() => dbService.forceDeleteSettings(conflictSearchId).then(loadAll)} handlePingTest={() => dbService.testCloudConnection().then(r => alert(r.message))}
            handleHardReset={() => confirm("Vollständiger Reset?") && dbService.hardReset()} isUploading={isUploading} uploadProgress={uploadProgress}
        />

        {/* Lager Editor Modal - JETZT AUSGELAGERT */}
        {editingStorage && (
            <StorageEditModal 
                storage={editingStorage}
                setStorage={setEditingStorage}
                onSave={async () => { await dbService.saveStorageLocation(editingStorage); setEditingStorage(null); loadAll(); }}
                onDelete={async (id) => { if(confirm("Lager wirklich löschen?")) { await dbService.deleteStorage(id); setEditingStorage(null); loadAll(); } }}
                onClose={() => setEditingStorage(null)}
            />
        )}

        {/* Profile Map Picker */}
        {showMapPicker === 'profile' && (
            <div className="fixed inset-0 z-[1000] bg-black/80 flex flex-col animate-in fade-in">
                <div className="bg-white p-4 flex justify-between items-center"><h3 className="font-bold">Hofstelle wählen</h3><button onClick={() => setShowMapPicker(null)} className="px-4 py-2 bg-slate-900 text-white rounded-lg font-bold">Fertig</button></div>
                <div className="flex-1 relative"><MapContainer center={profile.addressGeo || { lat: 47.5, lng: 14.5 }} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false}><LocationPickerMap position={profile.addressGeo} onPick={(lat: any, lng: any) => setProfile({...profile, addressGeo: { lat, lng }})} icon={farmIcon}/></MapContainer></div>
            </div>
        )}
    </div>
  );
};

