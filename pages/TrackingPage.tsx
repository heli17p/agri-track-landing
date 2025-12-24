
import { useState, useEffect, useMemo } from 'react';
import { Navigation, Play, Loader2, Truck, Hammer, Wheat, AlertTriangle, Settings, RefreshCw, Wrench, Tag, Droplets, Sprout } from 'lucide-react';
import { dbService } from '../services/db';
import { Field, StorageLocation, ActivityType, DEFAULT_SETTINGS, ActivityRecord, Equipment, EquipmentCategory } from '../types';
import { useTracking } from '../hooks/useTracking';
import { TrackingMap } from '../components/tracking/TrackingMap';
import { TrackingUI } from '../components/tracking/TrackingUI';
import { TrackingSummary } from '../components/tracking/TrackingSummary';
import { ManualFertilizationForm, HarvestForm, TillageForm } from '../components/ManualActivityForms';

interface Props {
  onMinimize: () => void;
  onNavigate: (view: string) => void;
  onTrackingStateChange: (isActive: boolean) => void;
}

export type HistoryFilterMode = 'OFF' | 'YEAR' | '12M';

export const TrackingPage: React.FC<Props> = ({ onMinimize, onNavigate, onTrackingStateChange }) => {
  const [fields, setFields] = useState<Field[]>([]);
  const [storages, setStorages] = useState<StorageLocation[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [categories, setCategories] = useState<EquipmentCategory[]>([]); 
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [activityType, setActivityType] = useState<ActivityType>(ActivityType.FERTILIZATION);
  const [subType, setSubType] = useState<string>('Gülle');
  const [selectedEquipId, setSelectedEquipId] = useState<string>('default');
  const [mapStyle, setMapStyle] = useState<'standard' | 'satellite'>('standard');
  const [followUser, setFollowUser] = useState(true);
  const [historyMode, setHistoryMode] = useState<HistoryFilterMode>('OFF');
  const [allHistoryTracks, setAllHistoryTracks] = useState<ActivityRecord[]>([]);
  const [manualMode, setManualMode] = useState<ActivityType | null>(null);
  const [summaryRecord, setSummaryRecord] = useState<ActivityRecord | null>(null);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [saveNotes, setSaveNotes] = useState('');
  const [zoom, setZoom] = useState(18);

  const selectedEquipment = useMemo(() => 
    equipment.find(e => e.id === selectedEquipId) || null
  , [equipment, selectedEquipId]);

  const tracker = useTracking(settings, fields, storages, activityType, subType, selectedEquipment);

  const init = async () => {
    setFields(await dbService.getFields());
    setStorages(await dbService.getStorageLocations());
    setEquipment(await dbService.getEquipment());
    const cats = await dbService.getEquipmentCategories();
    setCategories(cats);
    setSettings(await dbService.getSettings());
    const allActs = await dbService.getActivities();
    setAllHistoryTracks(allActs.filter(a => a.trackPoints && a.trackPoints.length > 0));

    // Falls Boden gewählt ist, nimm erste Boden-Kategorie
    if (activityType === ActivityType.TILLAGE) {
        const tillageCats = cats.filter(c => c.parentType === ActivityType.TILLAGE);
        if (tillageCats.length > 0) setSubType(tillageCats[0].name);
    }
  };

  useEffect(() => {
    init();
    return dbService.onDatabaseChange(init);
  }, []);

  // Filter der Kategorien für das Auswahlfeld
  const filteredCategories = useMemo(() => {
      return categories.filter(c => c.parentType === activityType);
  }, [categories, activityType]);

  // Filter passender Geräte für den gewählten Typ
  const filteredEquipment = useMemo(() => {
    return equipment.filter(e => e.type === subType);
  }, [equipment, subType]);

  const filteredHistoryTracks = useMemo(() => {
      if (historyMode === 'OFF') return [];
      const thresholdDate = historyMode === 'YEAR' 
        ? new Date(new Date().getFullYear(), 0, 1).getTime()
        : Date.now() - (365 * 24 * 60 * 60 * 1000);

      return allHistoryTracks.filter(act => {
          const dateMatch = new Date(act.date).getTime() >= thresholdDate;
          if (!dateMatch) return false;
          if (activityType === ActivityType.FERTILIZATION) return act.type === ActivityType.FERTILIZATION;
          return act.type === activityType && (act as any).tillageType === subType;
      });
  }, [allHistoryTracks, historyMode, activityType, subType]);

  useEffect(() => { onTrackingStateChange(tracker.trackingState !== 'IDLE'); }, [tracker.trackingState]);

  const handleFinish = async () => {
    const record = await tracker.handleFinishLogic(saveNotes);
    setSummaryRecord(record);
    setShowSaveConfirm(false);
    setSaveNotes('');
  };

  const handleManualSave = async (record: ActivityRecord) => {
    await dbService.saveActivity(record);
    if (record.type === ActivityType.FERTILIZATION && record.storageDistribution) await dbService.updateStorageLevels(record.storageDistribution);
    dbService.syncActivities();
    setSummaryRecord(record);
    setManualMode(null);
  };

  if (summaryRecord) return <TrackingSummary record={summaryRecord} fields={fields} onClose={() => { setSummaryRecord(null); onNavigate('DASHBOARD'); }} />;

  if (manualMode) {
    const props = { fields, storages, settings, onCancel: () => setManualMode(null), onSave: handleManualSave, onNavigate };
    if (manualMode === ActivityType.FERTILIZATION) return <ManualFertilizationForm {...props} />;
    if (manualMode === ActivityType.HARVEST) return <HarvestForm {...props} />;
    if (manualMode === ActivityType.TILLAGE) return <TillageForm {...props} />;
  }

  if (tracker.trackingState === 'IDLE') {
    return (
      <div className="h-full bg-white flex flex-col overflow-y-auto">
        <div className="bg-slate-900 text-white p-6 shrink-0 shadow-lg"><h1 className="text-2xl font-bold mb-2">Neue Tätigkeit</h1><p className="text-slate-400 text-sm">Wähle eine Methode um zu starten.</p></div>
        <div className="p-6 space-y-6 pb-24">
          {tracker.gpsError && (
              <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-5 animate-in zoom-in-95 duration-300">
                  <div className="flex items-start space-x-3 text-red-700"><AlertTriangle className="shrink-0 mt-1" size={24}/><div><h3 className="font-black uppercase tracking-tight text-sm">GPS Problem</h3><p className="text-xs font-medium mt-1 leading-relaxed">{tracker.gpsError}</p></div></div>
                  <div className="mt-4 flex space-x-2"><button onClick={() => tracker.startGPS()} className="flex-1 bg-red-600 text-white py-2.5 rounded-xl font-bold text-xs flex items-center justify-center shadow-lg"><RefreshCw size={14} className="mr-2"/> Erneut versuchen</button></div>
              </div>
          )}
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5 shadow-sm">
            <h2 className="text-lg font-bold text-green-900 mb-4 flex items-center"><Navigation className="mr-2 fill-green-600 text-green-600"/> GPS Aufzeichnung</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setActivityType(ActivityType.FERTILIZATION); const first = categories.find(c => c.parentType === ActivityType.FERTILIZATION); setSubType(first?.name || 'Gülle'); }} className={`py-3 rounded-lg border-2 font-bold transition-all ${activityType === ActivityType.FERTILIZATION ? 'border-green-600 bg-white text-green-700 shadow-sm' : 'border-transparent bg-green-100/50 text-green-800/50'}`}>Düngung</button>
                <button onClick={() => { setActivityType(ActivityType.TILLAGE); const first = categories.find(c => c.parentType === ActivityType.TILLAGE); setSubType(first?.name || 'Boden'); }} className={`py-3 rounded-lg border-2 font-bold transition-all ${activityType === ActivityType.TILLAGE ? 'border-green-600 bg-white text-green-700 shadow-sm' : 'border-transparent bg-green-100/50 text-green-800/50'}`}>Boden</button>
              </div>
              
              <div className="space-y-3">
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center">
                    <Tag size={12} className="mr-1"/> Geräte-Gruppe
                </label>
                <select value={subType} onChange={e => { setSubType(e.target.value); setSelectedEquipId('default'); }} className="w-full p-3 rounded-xl border border-green-200 bg-white font-bold outline-none focus:ring-2 focus:ring-green-500 shadow-sm appearance-none">
                  {filteredCategories.length > 0 ? (
                    filteredCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)
                  ) : (
                    <option value="" disabled>Keine Gruppen definiert</option>
                  )}
                </select>
              </div>

              {filteredEquipment.length > 0 && (
                <div className="space-y-3 animate-in fade-in duration-300">
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center">
                    <Wrench size={12} className="mr-1"/> Spezifisches Gerät
                  </label>
                  <select value={selectedEquipId} onChange={e => setSelectedEquipId(e.target.value)} className="w-full p-3 rounded-xl border-2 border-blue-200 bg-white font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm text-blue-800 appearance-none">
                    <option value="default">-- Standard nutzen --</option>
                    {filteredEquipment.map(e => {
                      const capInfo = e.capacity ? ` | ${e.capacity} ${e.capacityUnit || 'm³'}` : '';
                      return (
                        <option key={e.id} value={e.id}>
                          {e.name} ({e.width}m{capInfo})
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              <button onClick={tracker.startGPS} disabled={tracker.gpsLoading || (filteredCategories.length === 0)} className={`w-full py-4 text-white rounded-xl font-bold flex items-center justify-center shadow-lg active:scale-[0.98] transition-all disabled:opacity-70 ${tracker.gpsError ? 'bg-slate-400' : 'bg-green-600'}`}>{tracker.gpsLoading ? <Loader2 className="animate-spin mr-2"/> : <Play size={24} className="mr-2 fill-white"/>} {tracker.gpsLoading ? 'GPS wird gesucht...' : 'Starten'}</button>
            </div>
          </div>
          <div className="space-y-3">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Manuell nachtragen</h3>
            <div className="grid grid-cols-1 gap-3">
              <button onClick={() => setManualMode(ActivityType.FERTILIZATION)} className="flex items-center p-4 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm"><Truck size={20} className="mr-4 text-amber-600"/><span className="font-bold text-slate-700">Düngung</span></button>
              <button onClick={() => setManualMode(ActivityType.TILLAGE)} className="flex items-center p-4 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm"><Hammer size={20} className="mr-4 text-blue-600"/><span className="font-bold text-slate-700">Bodenbearbeitung</span></button>
              <button onClick={() => setManualMode(ActivityType.HARVEST)} className="flex items-center p-4 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm"><Wheat size={20} className="mr-4 text-lime-600"/><span className="font-bold text-slate-700">Ernte</span></button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-900 overflow-hidden">
      <div className="flex-1 relative overflow-hidden z-0">
        <TrackingMap points={tracker.trackPoints} fields={fields} storages={storages} currentLocation={tracker.currentLocation} mapStyle={mapStyle} followUser={followUser} historyTracks={filteredHistoryTracks} historyMode={historyMode} vehicleIconType="tractor" onZoomChange={setZoom} zoom={zoom} storageRadius={settings.storageRadius} activeSourceId={tracker.activeSourceId} subType={subType} isTestMode={tracker.isTestMode} onSimulateClick={tracker.simulateMovement} activityType={activityType} />
      </div>
      <TrackingUI trackingState={tracker.trackingState} startTime={tracker.startTime} loadCounts={tracker.loadCounts} workedAreaHa={tracker.workedAreaHa} currentLocation={tracker.currentLocation} detectionCountdown={tracker.detectionCountdown} pendingStorageId={tracker.pendingStorageId} storageWarning={tracker.storageWarning} onStopClick={() => setShowSaveConfirm(true)} onDiscardClick={() => { if(confirm("Wirklich löschen?")) tracker.handleDiscard(); }} onMapStyleToggle={() => setMapStyle(prev => prev === 'standard' ? 'satellite' : 'standard')} onFollowToggle={() => setFollowUser(!followUser)} onHistoryToggle={() => setHistoryMode(h => h === 'OFF' ? 'YEAR' : h === 'YEAR' ? '12M' : 'OFF')} onTestModeToggle={() => tracker.setIsTestMode(!tracker.isTestMode)} onMinimizeClick={onMinimize} followUser={followUser} historyMode={historyMode} subType={subType} activityType={activityType} isTestMode={tracker.isTestMode} activeSourceId={tracker.activeSourceId} storages={storages} wakeLockActive={tracker.wakeLockActive} />
      {showSaveConfirm && (
        <div className="fixed inset-0 z-[2000] bg-black/60 backdrop-blur-sm p-4 flex items-end pb-24">
          <div className="bg-white w-full rounded-3xl p-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom-10">
            <h3 className="font-black text-xl text-slate-800">Aufzeichnung beenden</h3>
            <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 flex items-center mb-2"><Wrench size={24} className="text-blue-600 mr-3 shrink-0"/><div><div className="text-[10px] font-black text-blue-400 uppercase tracking-widest leading-none">Gerät</div><div className="font-bold text-blue-900">{selectedEquipment ? selectedEquipment.name : 'Standard'}</div></div></div>
            <textarea value={saveNotes} onChange={e => setSaveNotes(e.target.value)} className="w-full border-2 border-slate-100 p-3 rounded-2xl text-sm outline-none" placeholder="Notizen..." rows={2} />
            <div className="flex space-x-3"><button onClick={() => setShowSaveConfirm(false)} className="flex-1 py-4 bg-slate-100 font-bold rounded-2xl text-slate-600">Zurück</button><button onClick={handleFinish} className="flex-1 py-4 bg-green-600 text-white font-bold rounded-2xl shadow-lg">Speichern</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

