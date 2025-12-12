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
          onFullScreenToggle(isActiveTracking);
      }
  }, [isActiveTracking, onFullScreenToggle]);

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
  const showChrome = !isActiveTracking;
  
  // Decide if the view needs a scroll container or full height lock
  const isFullscreenView = currentView === 'MAP' || currentView === 'TRACKING';

  return (
    <div className="w-full h-full bg-slate-50 flex flex-col relative overflow-hidden">
      
      {/* HEADER */}
      {showChrome && (
          <div className="bg-white/90 backdrop-blur-md p-3 flex justify-between items-center sticky top-0 z-30 border-b border-slate-200 shrink-0 h-14">
            <h2 className="font-extrabold text-slate-800 tracking-tight">AgriTrack Austria</h2>
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
            {/* REC Indicator if tracking in background */}
            {isActiveTracking && currentView !== 'TRACKING' && (
                <button 
                    onClick={() => setCurrentView('TRACKING')}
                    className="ml-2 bg-red-600 text-white text-[10px] px-2 py-1 rounded-full animate-pulse font-bold flex items-center"
                >
                    REC
                </button>
            )}
          </div>
      )}

      {/* CONTENT AREA */}
      <div className="flex-1 relative w-full overflow-hidden">
         {/* 
            Wenn Fullscreen (Map/Tracking): Absolute inset-0 und kein Scroll
            Sonst: Absolute inset-0 mit Auto-Scroll 
         */}
         <div className={`absolute inset-0 ${isFullscreenView ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden'}`}>
            {currentView === 'DASHBOARD' && <Dashboard onNavigate={(tab) => setCurrentView(tab.toUpperCase())} />}
            
            {/* TrackingPage rendern wir bedingt oder immer, je nach Logik. 
                Hier rendern wir sie immer wenn view=TRACKING oder active=true, 
                aber wir steuern die Sichtbarkeit. */}
            {(currentView === 'TRACKING' || isActiveTracking) && (
                <div className={currentView === 'TRACKING' ? 'h-full w-full' : 'hidden'}>
                     <TrackingPage 
                        onMinimize={() => {
                            setIsActiveTracking(false);
                            // Stay on selection screen implicitly
                        }} 
                        onNavigate={(view) => setCurrentView(view)} 
                        onTrackingStateChange={setIsActiveTracking} 
                      />
                </div>
            )}

            {currentView === 'MAP' && <MapPage initialEditFieldId={mapFocusFieldId} clearInitialEdit={() => setMapFocusFieldId(null)} />}
            {currentView === 'FIELDS' && <FieldsPage onNavigateToMap={navigateToMap} />}
            {currentView === 'SETTINGS' && <SettingsPage />}
         </div>
      </div>

      {/* NAVIGATION */}
      {showChrome && <BottomNav activeTab={activeTabId()} setActiveTab={handleTabChange} />}
    </div>
  );
};
