
import React, { useState } from 'react';
import { BottomNav } from './BottomNav';
import { Dashboard } from '../pages/Dashboard';
import { TrackingPage } from '../pages/TrackingPage';
import { MapPage } from '../pages/MapPage';
import { FieldsPage } from '../pages/FieldsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { ShieldCheck, CloudOff } from 'lucide-react';
import { isCloudConfigured } from '../services/storage';

/*
  MAIN APP ROUTER
  ===============
*/

export const AgriTrackApp: React.FC = () => {
  const [currentView, setCurrentView] = useState('DASHBOARD');
  const [mapFocusFieldId, setMapFocusFieldId] = useState<string | null>(null);

  // Navigation Helper um z.B. von der Felder-Liste direkt zur Karte zu springen
  const navigateToMap = (fieldId?: string) => {
      if (fieldId) setMapFocusFieldId(fieldId);
      setCurrentView('MAP');
  };

  const renderView = () => {
    switch(currentView) {
      case 'DASHBOARD': return <Dashboard onNavigate={(tab) => setCurrentView(tab.toUpperCase())} />;
      case 'TRACKING': return <TrackingPage onMinimize={() => setCurrentView('DASHBOARD')} onNavigate={(view) => setCurrentView(view)} />;
      case 'MAP': return <MapPage initialEditFieldId={mapFocusFieldId} clearInitialEdit={() => setMapFocusFieldId(null)} />;
      case 'FIELDS': return <FieldsPage onNavigateToMap={navigateToMap} />;
      case 'SETTINGS': return <SettingsPage />;
      default: return <Dashboard onNavigate={(tab) => setCurrentView(tab.toUpperCase())} />;
    }
  };

  // Map Tab ID in BottomNav to View ID
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

  return (
    <div className="w-full h-full bg-slate-50 flex flex-col relative max-w-md mx-auto md:max-w-none shadow-2xl md:shadow-none min-h-[calc(100vh-64px)]">
      
      {/* HEADER (Nur sichtbar auf Desktop oder wenn nicht im Tracking Mode) */}
      {currentView !== 'TRACKING' && (
          <div className="bg-white/90 backdrop-blur-md p-3 flex justify-between items-center sticky top-0 z-30 border-b border-slate-200">
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
          </div>
      )}

      {/* CONTENT */}
      <div className="flex-1 overflow-hidden relative">
        {renderView()}
      </div>

      {/* NAVIGATION */}
      <BottomNav activeTab={activeTabId()} setActiveTab={handleTabChange} />
    </div>
  );
};