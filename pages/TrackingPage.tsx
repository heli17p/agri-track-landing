
import React, { useState, useEffect } from 'react';
import { Navigation, Play, Loader2, Truck, Hammer, Wheat } from 'lucide-react';
import { dbService } from '../services/db';
import { Field, StorageLocation, ActivityType, DEFAULT_SETTINGS, ActivityRecord } from '../types';
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

export const TrackingPage: React.FC<Props> = ({ onMinimize, onNavigate, onTrackingStateChange }) => {
  const [fields, setFields] = useState<Field[]>([]);
  const [storages, setStorages] = useState<StorageLocation[]>([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [activityType, setActivityType] = useState<ActivityType>(ActivityType.FERTILIZATION);
  const [subType, setSubType] = useState<string>('Gülle');
  const [mapStyle, setMapStyle] = useState<'standard' | 'satellite'>('standard');
  const [followUser, setFollowUser] = useState(true);
  const [historyMode, setHistoryMode] = useState('OFF');
  const [historyTracks, setHistoryTracks] = useState<ActivityRecord[]>([]);
  const [manualMode, setManualMode] = useState<ActivityType | null>(null);
  const [summaryRecord, setSummaryRecord] = useState<ActivityRecord | null>(null);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [saveNotes, setSaveNotes] = useState('');
  const [zoom, setZoom] = useState(18);

  const tracker = useTracking(settings, fields, storages, activityType, subType);

  useEffect(() => {
    const init = async () => {
      setFields(await dbService.getFields());
      setStorages(await dbService.getStorageLocations());
      setSettings(await dbService.getSettings());
      const allActs = await dbService.getActivities();
      setHistoryTracks(allActs.filter(a => a.trackPoints && a.trackPoints.length > 0));
    };
    init();
    return dbService.onDatabaseChange(init);
  }, []);

  useEffect(() => {
    onTrackingStateChange(tracker.trackingState !== 'IDLE');
  }, [tracker.trackingState, onTrackingStateChange]);

  const handleFinish = async () => {
    const record = await tracker.handleFinishLogic(saveNotes);
    setSummaryRecord(record);
    setShowSaveConfirm(false);
    setSaveNotes('');
  };

  const handleManualSave = async (record: ActivityRecord) => {
    await dbService.saveActivity(record);
    if (record.type === ActivityType.FERTILIZATION && record.storageDistribution) {
      await dbService.updateStorageLevels(record.storageDistribution);
    }
    dbService.syncActivities();
    setSummaryRecord(record);
    setManualMode(null);
  };

  if (summaryRecord) {
    return <TrackingSummary record={summaryRecord} fields={fields} onClose={() => { setSummaryRecord(null); onNavigate('DASHBOARD'); }} />;
  }

  if (manualMode) {
    const props = { fields, storages, settings, onCancel: () => setManualMode(null), onSave: handleManualSave, onNavigate };
    if (manualMode === ActivityType.FERTILIZATION) return <ManualFertilizationForm {...props} />;
    if (manualMode === ActivityType.HARVEST) return <HarvestForm {...props} />;
    if (manualMode === ActivityType.TILLAGE) return <TillageForm {...props} />;
  }

  if (tracker.trackingState === 'IDLE') {
    return (
      <div className="h-full bg-white flex flex-col overflow-y-auto">
        <div className="bg-slate-900 text-white p-6 shrink-0 shadow-lg">
          <h1 className="text-2xl font-bold mb-2">Neue Tätigkeit</h1>
          <p className="text-slate-400 text-sm">Wähle eine Methode um zu starten.</p>
        </div>
        <div className="p-6 space-y-6">
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5 shadow-sm">
            <h2 className="text-lg font-bold text-green-900 mb-4 flex items-center"><Navigation className="mr-2 fill-green-600 text-green-600"/> GPS Aufzeichnung</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setActivityType(ActivityType.FERTILIZATION); setSubType('Gülle'); }} className={`py-3 rounded-lg border-2 font-bold transition-all ${activityType === ActivityType.FERTILIZATION ? 'border-green-600 bg-white text-green-700 shadow-sm' : 'border-transparent bg-green-100/50 text-green-800/50'}`}>Düngung</button>
                <button onClick={() => { setActivityType(ActivityType.TILLAGE); setSubType('Wiesenegge'); }} className={`py-3 rounded-lg border-2 font-bold transition-all ${activityType === ActivityType.TILLAGE ? 'border-green-600 bg-white text-green-700 shadow-sm' : 'border-transparent bg-green-100/50 text-green-800/50'}`}>Boden</button>
              </div>
              <select value={subType} onChange={e => setSubType(e.target.value)} className="w-full p-3 rounded-xl border border-green-200 bg-white font-bold outline-none focus:ring-2 focus:ring-green-500">
                {activityType === ActivityType.FERTILIZATION ? <><option value="Gülle">Gülle</option><option value="Mist">Mist</option></> : <><option value="Wiesenegge">Wiesenegge</option><option value="Schlegeln">Schlegeln</option><option value="Nachsaat">Nachsaat</option></>}
              </select>
              <button onClick={tracker.startGPS} disabled={tracker.gpsLoading} className="w-full py-4 bg-green-600 text-white rounded-xl font-bold flex items-center justify-center shadow-lg active:scale-[0.98] transition-all disabled:opacity-70">{tracker.gpsLoading ? <Loader2 className="animate-spin mr-2"/> : <Play size={24} className="mr-2 fill-white"/>} {tracker.gpsLoading ? 'GPS wird gesucht...' : 'Starten'}</button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <button onClick={() => setManualMode(ActivityType.FERTILIZATION)} className="flex items-center p-4 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 active:scale-[0.98] transition-all"><Truck size={20} className="mr-4 text-amber-600"/><span className="font-bold">Düngung nachtragen</span></button>
            <button onClick={() => setManualMode(ActivityType.HARVEST)} className="flex items-center p-4 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 active:scale-[0.98] transition-all"><Wheat size={20} className="mr-4 text-lime-600"/><span className="font-bold">Ernte nachtragen</span></button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-900 overflow-hidden">
      {/* Karten-Bereich: Nimmt den RESTLICHEN Platz ein (flex-1) */}
      <div className="flex-1 relative overflow-hidden z-0">
        <TrackingMap 
          points={tracker.trackPoints} 
          fields={fields} 
          storages={storages} 
          currentLocation={tracker.currentLocation} 
          mapStyle={mapStyle} 
          followUser={followUser} 
          historyTracks={historyTracks} 
          historyMode={historyMode} 
          vehicleIconType="tractor" 
          onZoomChange={setZoom} 
          zoom={zoom} 
          storageRadius={settings.storageRadius} 
          activeSourceId={tracker.activeSourceId} 
          subType={subType} 
        />
      </div>

      {/* UI & Controls: Werden UNTER der Karte platziert */}
      <TrackingUI 
        trackingState={tracker.trackingState} 
        startTime={tracker.startTime} 
        loadCounts={tracker.loadCounts} 
        currentLocation={tracker.currentLocation} 
        detectionCountdown={tracker.detectionCountdown} 
        storageWarning={tracker.storageWarning} 
        onStopClick={() => setShowSaveConfirm(true)} 
        onDiscardClick={() => { if(confirm("Möchtest du die aktuelle Aufzeichnung wirklich löschen?")) tracker.handleDiscard(); }}
        onMapStyleToggle={() => setMapStyle(prev => prev === 'standard' ? 'satellite' : 'standard')} 
        onFollowToggle={() => setFollowUser(!followUser)} 
        onHistoryToggle={() => setHistoryMode(prev => prev === 'OFF' ? 'ON' : 'OFF')} 
        followUser={followUser} 
        historyMode={historyMode} 
        subType={subType} 
        activityType={activityType} 
      />

      {/* Speicher-Dialog (Überlagernd) */}
      {showSaveConfirm && (
        <div className="fixed inset-0 z-[2000] bg-black/60 backdrop-blur-sm p-4 flex items-end pb-24">
          <div className="bg-white w-full rounded-3xl p-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom-10">
            <h3 className="font-black text-xl text-slate-800">Aufzeichnung beenden</h3>
            <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Notizen zum Einsatz</label>
                <textarea 
                    value={saveNotes} 
                    onChange={e => setSaveNotes(e.target.value)} 
                    className="w-full border-2 border-slate-100 p-3 rounded-2xl text-sm outline-none focus:border-green-500 transition-colors" 
                    placeholder="Besonderheiten (optional)..." 
                    rows={2} 
                />
            </div>
            <div className="flex space-x-3">
              <button onClick={() => setShowSaveConfirm(false)} className="flex-1 py-4 bg-slate-100 font-bold rounded-2xl text-slate-600 active:scale-95 transition-all">Zurück</button>
              <button onClick={handleFinish} className="flex-1 py-4 bg-green-600 text-white font-bold rounded-2xl shadow-lg shadow-green-100 active:scale-95 transition-all">Speichern</button>
            </div>
            <button 
                onClick={() => { if(confirm("Wirklich alles löschen?")) { tracker.handleDiscard(); setShowSaveConfirm(false); } }} 
                className="w-full text-red-500 font-bold text-xs py-2 uppercase tracking-widest opacity-60 hover:opacity-100"
            >
                Aufzeichnung verwerfen
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

