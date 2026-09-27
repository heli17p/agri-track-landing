import React, { useState, useEffect } from 'react';
import { Database, ShieldCheck, CheckCircle2, AlertTriangle, RefreshCw, QrCode, BookOpen, ExternalLink, Sparkles, Check, Copy, ArrowRight, Trash2, Key, Info } from 'lucide-react';
import { 
  CustomFirebaseConfig, 
  getCustomFirebaseConfig, 
  getActiveFirebaseConfig, 
  isCustomCloudActive, 
  parseFirebaseConfigInput, 
  testCustomFirebaseConfig, 
  saveCustomFirebaseConfig, 
  clearCustomFirebaseConfig 
} from '../../services/storage';
import { AppSettings } from '../../types';
import { CustomCloudGuideModal } from './CustomCloudGuideModal';
import { FarmShareModal } from './FarmShareModal';

interface Props {
  settings: AppSettings;
  onUpdateSettings?: (s: AppSettings) => void;
}

export const CustomCloudTab: React.FC<Props> = ({ settings, onUpdateSettings }) => {
  const [activeConfigData, setActiveConfigData] = useState(getActiveFirebaseConfig());
  const [showGuide, setShowGuide] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // Form State
  const [rawInput, setRawInput] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [projectId, setProjectId] = useState('');
  const [appId, setAppId] = useState('');
  const [authDomain, setAuthDomain] = useState('');
  const [farmName, setFarmName] = useState(settings.farmName || '');
  const [farmPin, setFarmPin] = useState(settings.farmPin || '');

  // Testing & Status State
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const active = getActiveFirebaseConfig();
    setActiveConfigData(active);
    if (active.isCustom) {
      setApiKey(active.config.apiKey || '');
      setProjectId(active.config.projectId || '');
      setAppId(active.config.appId || '');
      setAuthDomain(active.config.authDomain || '');
      setFarmName(active.config.farmName || settings.farmName || '');
    }
  }, [settings]);

  const handleParseRaw = () => {
    if (!rawInput.trim()) {
      alert("Bitte füge zuerst den Konfigurationstext aus der Firebase-Konsole ein.");
      return;
    }

    const parsed = parseFirebaseConfigInput(rawInput);
    if (parsed) {
      setApiKey(parsed.apiKey);
      setProjectId(parsed.projectId);
      setAppId(parsed.appId || '');
      setAuthDomain(parsed.authDomain || `${parsed.projectId}.firebaseapp.com`);
      if (parsed.farmName) setFarmName(parsed.farmName);
      setTestResult({
        success: true,
        message: 'Konfiguration erfolgreich erkannt! Klicke jetzt auf "Verbindung testen".'
      });
    } else {
      setTestResult({
        success: false,
        message: 'Konnte keine gültige Firebase-Konfiguration erkennen. Bitte prüfe das Format (JSON oder const firebaseConfig = {...}).'
      });
    }
  };

  const handleTestConnection = async () => {
    if (!apiKey.trim() || !projectId.trim()) {
      setTestResult({
        success: false,
        message: 'Bitte gib mindestens den API-Key und die Projekt-ID an.'
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    const testConfig: CustomFirebaseConfig = {
      apiKey: apiKey.trim(),
      projectId: projectId.trim(),
      appId: appId.trim() || '1:000000000000:web:000000000000',
      authDomain: authDomain.trim() || `${projectId.trim()}.firebaseapp.com`,
      storageBucket: `${projectId.trim()}.appspot.com`,
      farmName: farmName.trim()
    };

    const result = await testCustomFirebaseConfig(testConfig);
    setTestResult(result);
    setIsTesting(false);
  };

  const handleSaveAndActivate = async () => {
    if (!apiKey.trim() || !projectId.trim()) {
      alert("Bitte gib mindestens den API-Key und die Projekt-ID ein.");
      return;
    }

    setIsSaving(true);
    try {
      const newConfig: CustomFirebaseConfig = {
        apiKey: apiKey.trim(),
        projectId: projectId.trim(),
        appId: appId.trim() || '1:000000000000:web:000000000000',
        authDomain: authDomain.trim() || `${projectId.trim()}.firebaseapp.com`,
        storageBucket: `${projectId.trim()}.appspot.com`,
        farmName: farmName.trim()
      };

      await saveCustomFirebaseConfig(newConfig);
    } catch (e: any) {
      alert("Fehler beim Speichern: " + e.message);
      setIsSaving(false);
    }
  };

  const handleResetToDefault = async () => {
    if (confirm("Möchtest du deine Betriebs-Cloud wirklich trennen und zur Standard-Cloud zurückkehren?")) {
      await clearCustomFirebaseConfig();
    }
  };

  const isCustom = activeConfigData.isCustom;

  return (
    <div className="space-y-6 max-w-lg mx-auto pb-12 animate-in fade-in">
      
      {/* STATUS BANNER */}
      <div className={`p-6 rounded-3xl shadow-sm border-2 transition-all ${
        isCustom 
          ? 'bg-gradient-to-br from-green-900 to-slate-900 text-white border-green-500/40 shadow-green-900/10'
          : 'bg-white text-slate-800 border-slate-200 shadow-sm'
      }`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className={`p-3 rounded-2xl ${isCustom ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-blue-50 text-blue-600'}`}>
              <Database size={24} />
            </div>
            <div>
              <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full inline-block ${
                isCustom ? 'bg-green-400/20 text-green-300 border border-green-400/30' : 'bg-slate-100 text-slate-500'
              }`}>
                {isCustom ? 'EIGENE BETRIEBS-DATENBANK AKTIV' : 'STANDARD GEMEINSCHAFTS-CLOUD'}
              </span>
              <h3 className="font-extrabold text-base mt-1">
                {isCustom ? (activeConfigData.config.farmName || activeConfigData.config.projectId) : 'AgriTrack Cloud'}
              </h3>
            </div>
          </div>
          {isCustom && (
            <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-ping"></div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-slate-200/20 text-xs space-y-2">
          <div className="flex justify-between items-center opacity-90">
            <span className="text-[10px] uppercase font-bold tracking-wider">Projekt-ID:</span>
            <span className="font-mono font-bold">{activeConfigData.config.projectId}</span>
          </div>
          <div className="flex justify-between items-center opacity-90">
            <span className="text-[10px] uppercase font-bold tracking-wider">Datenschutz:</span>
            <span className="font-bold flex items-center">
              <ShieldCheck size={14} className="mr-1 text-green-400" />
              {isCustom ? '100% Autonom & Privat' : 'Gemeinschafts-Server'}
            </span>
          </div>
        </div>

        {isCustom ? (
          <div className="mt-5 grid grid-cols-2 gap-2 pt-2">
            <button
              onClick={() => setShowShareModal(true)}
              className="py-2.5 px-3 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold flex items-center justify-center backdrop-blur transition-all active:scale-95"
            >
              <QrCode size={16} className="mr-2 text-green-300" />
              QR-Code teilen
            </button>
            <button
              onClick={handleResetToDefault}
              className="py-2.5 px-3 bg-red-500/20 hover:bg-red-500/30 text-red-200 rounded-xl text-xs font-bold flex items-center justify-center transition-all active:scale-95 border border-red-500/30"
            >
              <Trash2 size={16} className="mr-2" />
              Trennen
            </button>
          </div>
        ) : (
          <div className="mt-4 pt-2">
            <button
              onClick={() => setShowGuide(true)}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center shadow-md transition-all active:scale-95"
            >
              <BookOpen size={16} className="mr-2 text-green-400" />
              Schritt-für-Schritt Anleitung (3 Min.)
            </button>
          </div>
        )}
      </div>

      {/* VORTEILE INFO BOX */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 p-5 rounded-3xl space-y-3">
        <div className="flex items-center space-x-2 text-green-900 font-extrabold text-xs uppercase tracking-wider">
          <Sparkles size={16} className="text-green-600" />
          <span>Warum eine eigene Betriebs-Cloud?</span>
        </div>
        <ul className="text-xs text-green-800 space-y-1.5 list-disc list-inside">
          <li><strong>0 € Kosten:</strong> Das Google Firebase Spark-Kontingent ist für landwirtschaftliche Betriebe dauerhaft kostenlos.</li>
          <li><strong>100% Datenschutz:</strong> Deine Schlagkartei und Maschinen gehören ausschließlich dir.</li>
          <li><strong>Einfaches Teilen:</strong> Mitarbeiter scannen einmalig deinen Betriebs-QR-Code und sind sofort synchronisiert.</li>
        </ul>
      </div>

      {/* FORM: EIGENE CLOUD KONFIGURIEREN */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-slate-800 text-sm flex items-center">
            <Key size={18} className="mr-2 text-blue-600" />
            {isCustom ? 'Betriebs-Cloud bearbeiten' : 'Eigene Betriebs-Cloud anbinden'}
          </h3>
          <button
            onClick={() => setShowGuide(true)}
            className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center hover:underline"
          >
            <BookOpen size={13} className="mr-1" />
            Anleitung
          </button>
        </div>

        {/* Schnell-Import Textarea */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Schnell-Import (Firebase-Code oder JSON einfügen)
            </label>
            <button
              onClick={handleParseRaw}
              className="text-[10px] font-black text-blue-600 uppercase tracking-wider bg-blue-50 px-2 py-0.5 rounded-lg hover:bg-blue-100 transition-colors"
            >
              Auto-Erkennen
            </button>
          </div>
          <textarea
            value={rawInput}
            onChange={e => setRawInput(e.target.value)}
            placeholder={`Füge hier den Code aus Firebase ein:\nconst firebaseConfig = {\n  apiKey: "...",\n  projectId: "..."\n};`}
            className="w-full h-24 p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-[11px] outline-none focus:ring-2 focus:ring-blue-500 shadow-inner"
          />
        </div>

        <div className="relative flex py-1 items-center">
          <div className="flex-grow border-t border-slate-200"></div>
          <span className="flex-shrink mx-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Oder Felder einzeln</span>
          <div className="flex-grow border-t border-slate-200"></div>
        </div>

        {/* Einzelne Eingabefelder */}
        <div className="space-y-3.5">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
              Projekt-ID (erforderlich)
            </label>
            <input
              type="text"
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              placeholder="z. B. hof-huber-agritrack"
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
              API-Key (erforderlich)
            </label>
            <input
              type="text"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="z. B. AIzaSyAyVM8YA2F3..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                App-ID (Web)
              </label>
              <input
                type="text"
                value={appId}
                onChange={e => setAppId(e.target.value)}
                placeholder="1:123456:web:..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                Betriebsname (optional)
              </label>
              <input
                type="text"
                value={farmName}
                onChange={e => setFarmName(e.target.value)}
                placeholder="z. B. Biohof Huber"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Test Result Message */}
        {testResult && (
          <div className={`p-4 rounded-2xl text-xs font-medium border flex items-start space-x-3 animate-in fade-in ${
            testResult.success
              ? 'bg-green-50 border-green-200 text-green-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}>
            {testResult.success ? (
              <CheckCircle2 size={18} className="text-green-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 leading-relaxed">
              {testResult.message}
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="space-y-2 pt-2">
          <button
            onClick={handleTestConnection}
            disabled={isTesting}
            className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-extrabold flex items-center justify-center transition-all active:scale-95 disabled:opacity-50"
          >
            {isTesting ? (
              <RefreshCw size={16} className="animate-spin mr-2" />
            ) : (
              <ShieldCheck size={16} className="mr-2 text-blue-600" />
            )}
            Verbindung testen
          </button>

          <button
            onClick={handleSaveAndActivate}
            disabled={isSaving}
            className="w-full py-3.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-black shadow-lg shadow-green-900/20 flex items-center justify-center transition-all active:scale-95 disabled:opacity-50"
          >
            {isSaving ? (
              <RefreshCw size={16} className="animate-spin mr-2" />
            ) : (
              <CheckCircle2 size={16} className="mr-2" />
            )}
            Betriebs-Cloud aktivieren & speichern
          </button>
        </div>

      </div>

      {/* MODALS */}
      <CustomCloudGuideModal
        show={showGuide}
        onClose={() => setShowGuide(false)}
      />

      <FarmShareModal
        show={showShareModal}
        onClose={() => setShowShareModal(false)}
        config={activeConfigData.config}
        farmPin={settings.farmPin}
      />

    </div>
  );
};
