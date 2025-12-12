import React, { useState, useEffect } from 'react';
import { BottomNav } from './BottomNav';
import { Dashboard } from '../pages/Dashboard';
import { TrackingPage } from '../pages/TrackingPage';
import { MapPage } from '../pages/MapPage';
import { FieldsPage } from '../pages/FieldsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { ShieldCheck, CloudOff } from 'lucide-react';
import { isCloudConfigured } from '../services/storage';

interface Props {
    onFullScreenToggle?: (isFullScreen: boolean) => void;
}

export const AgriTrackApp: React.FC<Props> = ({ onFullScreenToggle }) => {
  const [currentView, setCurrentView] = useState('DASHBOARD');
  const [mapFocusFieldId, setMapFocusFieldId] = useState<string | null>(null);
  
  const [isActiveTracking, setIsActiveTracking] = useState(false);

  useEffect(() => {
      if (onFullScreenToggle) {
          onFullScreenToggle(isActiveTracking && currentView === 'TRACKING');
      }
  }, [isActiveTracking, currentView, onFullScreenToggle]);

  const navigateToMap = (fieldId?: string) => {
      if (fieldId) setMapFocusFieldId(fieldId);
      setCurrentView('MAP');
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
      if (tabId === 'settings') setCurrentView('SETTINGS');
  };

  const isLive = isCloudConfigured();
  
  // Show Chrome if NOT tracking OR if tracking but looking at another tab
  const showChrome = !isActiveTracking || (isActiveTracking && currentView !== 'TRACKING');
  const isFullscreenView = currentView === 'MAP' || (currentView === 'TRACKING' && isActiveTracking);

  return (
    <div className="w-full h-full bg-slate-50 flex flex-col relative overflow-hidden">
      
      {/* HEADER */}
      {showChrome && (
          <div className="bg-white/90 backdrop-blur-md p-3 flex justify-between items-center sticky top-0 z-30 border-b border-slate-200 shrink-0 h-14">
            <h2 className="font-extrabold text-slate-800 tracking-tight">AgriTrack Austria</h2>
            <div className="flex items-center">
                <div className={`text-[10px] font-bold px-2 py-1 rounded-full flex items-center ${isLive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
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
                </div>
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
            
            {/* Standard Views - Conditionally Rendered */}
            {currentView === 'DASHBOARD' && <Dashboard onNavigate={(tab) => setCurrentView(tab.toUpperCase())} />}
            {currentView === 'MAP' && <MapPage initialEditFieldId={mapFocusFieldId} clearInitialEdit={() => setMapFocusFieldId(null)} />}
            {currentView === 'FIELDS' && <FieldsPage onNavigateToMap={navigateToMap} />}
            {currentView === 'SETTINGS' && <SettingsPage />}

            {/* Tracking Page - ALWAYS Rendered but hidden if not needed (to keep GPS alive) */}
            <div className={currentView === 'TRACKING' ? 'w-full h-full' : 'hidden'}>
                <TrackingPage 
                    onMinimize={() => {
                        // Switch view but keep tracking active
                        setCurrentView('DASHBOARD');
                    }} 
                    onNavigate={(view) => setCurrentView(view)} 
                    onTrackingStateChange={setIsActiveTracking} 
                />
            </div>

         </div>
      </div>

      {/* NAVIGATION */}
      {showChrome && <BottomNav activeTab={activeTabId()} setActiveTab={handleTabChange} />}
    </div>
  );
};
