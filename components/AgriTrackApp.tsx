
import React, { useState, useEffect } from 'react';
import { BottomNav } from './BottomNav';
import { Dashboard } from '../pages/Dashboard';
import { TrackingPage } from '../pages/TrackingPage';
import { MapPage } from '../pages/MapPage';
import { FieldsPage } from '../pages/FieldsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { WelcomeGate } from './WelcomeGate'; // Import bleibt gleich, Dateipräsenz wurde oben sichergestellt
import { ShieldCheck, CloudOff, RefreshCw } from 'lucide-react';
import { isCloudConfigured } from '../services/storage';
import { dbService } from '../services/db';
import { AppSettings, DEFAULT_SETTINGS } from '../types';

interface Props {
    onFullScreenToggle?: (isFullScreen: boolean) => void;
}

export const AgriTrackApp: React.FC<Props> = ({ onFullScreenToggle }) => {
  const [currentView, setCurrentView] = useState('DASHBOARD');
  const [mapFocusFieldId, setMapFocusFieldId] = useState<string | null>(null);
  const [isActiveTracking, setIsActiveTracking] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);

  // State für die direkte Tab-Navigation in den Einstellungen
  const [settingsTab, setSettingsTab] = useState<'profile' | 'storage' | 'general' | 'sync' | 'equipment'>('profile');

  const loadSettings = async () => {
      const s = await dbService.getSettings();
      setSettings(s);
      setIsLoadingSettings(false);
  };

  useEffect(() => {
      loadSettings();
      const unsub = dbService.onDatabaseChange(loadSettings);
      return () => unsub();
  }, []);

  useEffect(() => {
      if (onFullScreenToggle) {
          onFullScreenToggle(isActiveTracking && currentView === 'TRACKING');
      }
  }, [isActiveTracking, currentView, onFullScreenToggle]);

  const navigateToMap = (fieldId?: string) => {
      if (fieldId) setMapFocusFieldId(fieldId);
      setCurrentView('MAP');
  };

  const openSettingsTab = (tab: 'profile' | 'storage' | 'general' | 'sync' | 'equipment') => {
      setSettingsTab(tab);
      setCurrentView('SETTINGS');
  };

  const activeTabId = () => {
      if (currentView === 'DASHBOARD') return 'dashboard';
      if (currentView === 'TRACKING') return 'track';
      if (currentView === 'MAP') return 'map';
      if (currentView === 'FIELDS') return 'fields';
      if (currentView === 'SETTINGS') return 'settings';
      return 'dashboard';
  };

  const handleTabChange = (tabId: string) => {
      if (tabId === 'dashboard') setCurrentView('DASHBOARD');
      if (tabId === 'track') setCurrentView('TRACKING');
      if (tabId === 'map') setCurrentView('MAP');
      if (tabId === 'fields') setCurrentView('FIELDS');
      if (tabId === 'settings') {
          if (currentView !== 'SETTINGS') setSettingsTab('profile'); 
          setCurrentView('SETTINGS');
      }
  };

  if (isLoadingSettings) return <div className="h-full w-full flex items-center justify-center bg-slate-50"><RefreshCw className="animate-spin text-green-600" size={32}/></div>;

  const isLive = isCloudConfigured();
  
  // SICHERHEITS-CHECK: Wenn eingeloggt, aber keine Farm-ID vorhanden, zeige das Welcome-Gate
  const needsFarmAssignment = isLive && !settings.farmId;

  if (needsFarmAssignment) {
      return <WelcomeGate onSetupComplete={loadSettings} />;
  }

  const showChrome = !isActiveTracking || (isActiveTracking && currentView !== 'TRACKING');
  const isFullscreenView = currentView === 'MAP' || (currentView === 'TRACKING' && isActiveTracking);

  return (
    <div className="w-full h-full bg-slate-50 flex flex-col relative overflow-hidden">
      
      {/* HEADER */}
      {showChrome && (
          <div className="bg-white/90 backdrop-blur-md p-3 flex justify-between items-center sticky top-0 z-30 border-b border-slate-200 shrink-0 h-14">
            <h2 className="font-extrabold text-slate-800 tracking-tight">AgriTrack Austria</h2>
            <div className="flex items-center">
                <button 
                    onClick={() => openSettingsTab('sync')}
                    className={`text-[10px] font-bold px-2 py-1 rounded-full flex items-center transition-colors hover:opacity-80 ${isLive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}
                    title="Hof Verbindung & Erweiterungen"
                >
                {isLive ? (
                    <>
                        <ShieldCheck className="w-3 h-3 mr-1" />
                        AGRICLOUD
                    </>
                ) : (
                    <>
                        <CloudOff className="w-3 h-3 mr-1" />
                        DEMO MODE
                    </>
                )}
                </button>
                {isActiveTracking && currentView !== 'TRACKING' && (
                    <button 
                        onClick={() => setCurrentView('TRACKING')}
                        className="ml-2 bg-red-600 text-white text-[10px] px-3 py-1 rounded-full animate-pulse font-bold flex items-center shadow-sm hover:bg-red-700 transition-colors"
                    >
                        REC
                    </button>
                )}
            </div>
          </div>
      )}

      {/* CONTENT AREA */}
      <div className="flex-1 relative w-full overflow-hidden">
         <div className={`absolute inset-0 ${isFullscreenView ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden'}`}>
            {currentView === 'DASHBOARD' && <Dashboard onNavigate={(tab) => setCurrentView(tab.toUpperCase())} />}
            {currentView === 'MAP' && <MapPage initialEditFieldId={mapFocusFieldId} clearInitialEdit={() => setMapFocusFieldId(null)} />}
            {currentView === 'FIELDS' && <FieldsPage onNavigateToMap={navigateToMap} />}
            {currentView === 'SETTINGS' && <SettingsPage initialTab={settingsTab} />}

            <div className={currentView === 'TRACKING' ? 'w-full h-full' : 'hidden'}>
                <TrackingPage 
                    onMinimize={() => setCurrentView('DASHBOARD')} 
                    onNavigate={(view) => setCurrentView(view)} 
                    onTrackingStateChange={setIsActiveTracking} 
                />
            </div>
         </div>
      </div>

      {showChrome && <BottomNav activeTab={activeTabId()} setActiveTab={handleTabChange} />}
    </div>
  );
};

