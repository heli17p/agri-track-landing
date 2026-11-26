
import { useState, useEffect, useMemo, useRef } from 'react';
import { Navigation, Play, Loader2, Truck, Hammer, Wheat, AlertTriangle, Settings, RefreshCw, Wrench, Tag, Droplets, Sprout, Usb, Smartphone, CheckCircle2, Unplug } from 'lucide-react';
import { dbService } from '../services/db';
import { Field, StorageLocation, ActivityType, DEFAULT_SETTINGS, ActivityRecord, Equipment, EquipmentCategory, GpsSourceMode } from '../types';
import { useTracking } from '../hooks/useTracking';
import { externalGpsService } from '../services/externalGps';
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
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
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
    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    try {
      const record = await tracker.handleFinishLogic(saveNotes);
      if (record) {
        setSummaryRecord(record);
      }
      setShowSaveConfirm(false);
      setSaveNotes('');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const handleManualSave = async (record: ActivityRecord) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    try {
      await dbService.saveActivity(record);
      if (record.type === ActivityType.FERTILIZATION && record.storageDistribution) await dbService.updateStorageLevels(record.storageDistribution);
      dbService.syncActivities();
      setSummaryRecord(record);
      setManualMode(null);
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const handleGpsSourceChange = async (mode: GpsSourceMode) => {
    const updated = { ...settings, gpsSource: mode };
    setSettings(updated);
    await dbService.saveSettings(updated);
  };

  const handleConnectExternalGps = async () => {
    const ok = await externalGpsService.connectAuto(settings.externalGpsBaudRate || 115200);
    if (ok && settings.gpsSource !== 'external') {
      await handleGpsSourceChange('external');
    }
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
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => { setActivityType(ActivityType.FERTILIZATION); const first = categories.find(c => c.parentType === ActivityType.FERTILIZATION); setSubType(first?.name || 'Gülle'); }} className={`py-3 rounded-lg border-2 font-bold transition-all text-xs ${activityType === ActivityType.FERTILIZATION ? 'border-green-600 bg-white text-green-700 shadow-sm' : 'border-transparent bg-green-100/50 text-green-800/50'}`}>Düngung</button>
                <button onClick={() => { setActivityType(ActivityType.TILLAGE); const first = categories.find(c => c.parentType === ActivityType.TILLAGE); setSubType(first?.name || 'Boden'); }} className={`py-3 rounded-lg border-2 font-bold transition-all text-xs ${activityType === ActivityType.TILLAGE ? 'border-green-600 bg-white text-green-700 shadow-sm' : 'border-transparent bg-green-100/50 text-green-800/50'}`}>Boden</button>
                <button onClick={() => { setActivityType(ActivityType.HARVEST); const first = categories.find(c => c.parentType === ActivityType.HARVEST); setSubType(first?.name || 'Silage'); }} className={`py-3 rounded-lg border-2 font-bold transition-all text-xs ${activityType === ActivityType.HARVEST ? 'border-amber-600 bg-white text-amber-700 shadow-sm' : 'border-transparent bg-amber-100/50 text-amber-800/50'}`}>Ernte / Ballen</button>
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

              {/* GPS-QUELLE SCHNELLWAHL */}
              <div className="bg-white/80 rounded-xl p-3 border border-green-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">GPS-Empfänger</span>
                  {tracker.externalGpsStatus.connected && (
                    <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center">
                      <CheckCircle2 size={11} className="mr-1"/> {tracker.externalGpsStatus.hz} Hz • {tracker.externalGpsStatus.satellites} Sat
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleGpsSourceChange('internal')}
                    className={`py-2 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center border transition-all ${
                      (settings.gpsSource || 'internal') === 'internal'
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Smartphone size={14} className="mr-1.5"/> Handy-GPS
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGpsSourceChange('external')}
                    className={`py-2 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center border transition-all ${
                      settings.gpsSource === 'external'
                        ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Usb size={14} className="mr-1.5"/> USB-GPS (10 Hz)
                  </button>
                </div>

                {settings.gpsSource === 'external' && (
                  <div className="pt-1 space-y-2">
                    {tracker.externalGpsStatus.connected ? (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-bold text-emerald-900">{tracker.externalGpsStatus.deviceName}</div>
                          <div className="text-[11px] text-emerald-700">
                            {tracker.externalGpsStatus.fixLabel} • ±{tracker.externalGpsStatus.accuracyMeters} m • {tracker.externalGpsStatus.baudRate} Baud
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => externalGpsService.disconnect()}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                          title="USB-GPS trennen"
                        >
                          <Unplug size={16}/>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <button
                          type="button"
                          onClick={handleConnectExternalGps}
                          disabled={tracker.externalGpsStatus.connecting}
                          className="w-full py-2.5 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold flex items-center justify-center transition-all"
                        >
                          {tracker.externalGpsStatus.connecting ? <Loader2 size={14} className="animate-spin mr-1.5"/> : <Usb size={14} className="mr-1.5"/>}
                          USB-GPS verbinden ({settings.externalGpsBaudRate || 115200} Baud)
                        </button>
                        {externalGpsService.getCapabilities().hasWebUsb && (
                          <button
                            type="button"
                            onClick={async () => {
                              const ok = await externalGpsService.connectWebUsb(settings.externalGpsBaudRate || 115200, true);
                              if (ok && settings.gpsSource !== 'external') await handleGpsSourceChange('external');
                            }}
                            className="w-full py-1.5 text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all"
                          >
                            Alle USB-Geräte zeigen (WebUSB)
                          </button>
                        )}
                      </div>
                    )}
                    {tracker.externalGpsStatus.lastError && (
                      <div className="text-[11px] text-red-600 font-medium bg-red-50 p-2 rounded-lg border border-red-100">
                        {tracker.externalGpsStatus.lastError}
                      </div>
                    )}
                  </div>
                )}
              </div>

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
        <TrackingMap 
          points={tracker.trackPoints} 
          fields={fields} 
          storages={storages} 
          currentLocation={tracker.currentLocation} 
          mapStyle={mapStyle} 
          followUser={followUser} 
          historyTracks={filteredHistoryTracks} 
          historyMode={historyMode} 
          vehicleIconType="tractor" 
          onZoomChange={setZoom} 
          zoom={zoom} 
          storageRadius={settings.storageRadius} 
          activeSourceId={tracker.activeSourceId} 
          subType={subType} 
          isTestMode={tracker.isTestMode} 
          onSimulateClick={tracker.simulateMovement} 
          activityType={activityType} 
          bales={tracker.detectedBales}
        />
      </div>
      <TrackingUI 
        trackingState={tracker.trackingState} 
        startTime={tracker.startTime} 
        loadCounts={tracker.loadCounts} 
        workedAreaHa={tracker.workedAreaHa} 
        currentLocation={tracker.currentLocation} 
        detectionCountdown={tracker.detectionCountdown} 
        pendingStorageId={tracker.pendingStorageId} 
        storageWarning={tracker.storageWarning} 
        onStopClick={() => setShowSaveConfirm(true)} 
        onDiscardClick={() => { if(confirm("Wirklich löschen?")) tracker.handleDiscard(); }} 
        onMapStyleToggle={() => setMapStyle(prev => prev === 'standard' ? 'satellite' : 'standard')} 
        onFollowToggle={() => setFollowUser(!followUser)} 
        onHistoryToggle={() => setHistoryMode(h => h === 'OFF' ? 'YEAR' : h === 'YEAR' ? '12M' : 'OFF')} 
        onTestModeToggle={() => tracker.setIsTestMode(!tracker.isTestMode)} 
        onMinimizeClick={onMinimize} 
        followUser={followUser} 
        historyMode={historyMode} 
        subType={subType} 
        activityType={activityType} 
        isTestMode={tracker.isTestMode} 
        activeSourceId={tracker.activeSourceId} 
        storages={storages} 
        wakeLockActive={tracker.wakeLockActive}
        isReturningHome={tracker.isReturningHome}
        homeDistanceMeters={tracker.homeDistanceMeters}
        detectedBales={tracker.detectedBales}
        currentBaleDistance={tracker.currentBaleDistance}
        baleDropCountdown={tracker.baleDropCountdown}
        lastBaleNotice={tracker.lastBaleNotice}
        onManualBaleDrop={tracker.triggerManualBaleDrop}
        externalGpsStatus={tracker.externalGpsStatus}
      />
      {showSaveConfirm && (
        <div className="fixed inset-0 z-[2000] bg-black/60 backdrop-blur-sm p-4 flex items-end pb-24">
          <div className="bg-white w-full rounded-3xl p-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom-10">
            <h3 className="font-black text-xl text-slate-800">Aufzeichnung beenden</h3>
            <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 flex items-center mb-2"><Wrench size={24} className="text-blue-600 mr-3 shrink-0"/><div><div className="text-[10px] font-black text-blue-400 uppercase tracking-widest leading-none">Gerät</div><div className="font-bold text-blue-900">{selectedEquipment ? selectedEquipment.name : 'Standard'}</div></div></div>
            <textarea value={saveNotes} disabled={isSaving} onChange={e => setSaveNotes(e.target.value)} className="w-full border-2 border-slate-100 p-3 rounded-2xl text-sm outline-none disabled:opacity-60" placeholder="Notizen..." rows={2} />
            <div className="flex space-x-3">
              <button disabled={isSaving} onClick={() => setShowSaveConfirm(false)} className="flex-1 py-4 bg-slate-100 font-bold rounded-2xl text-slate-600 disabled:opacity-50">Zurück</button>
              <button disabled={isSaving} onClick={handleFinish} className="flex-1 py-4 bg-green-600 text-white font-bold rounded-2xl shadow-lg flex items-center justify-center disabled:opacity-70">
                {isSaving ? <><Loader2 size={18} className="animate-spin mr-2"/> Speichert...</> : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
