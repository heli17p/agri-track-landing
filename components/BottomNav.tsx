import React from 'react';
import { Map, List, PlusCircle, Settings, BarChart3 } from 'lucide-react';

interface Props {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const BottomNav: React.FC<Props> = ({ activeTab, setActiveTab }) => {
  const tabs = [
    { id: 'dashboard', icon: BarChart3, label: 'Übersicht' },
    { id: 'map', icon: Map, label: 'Karte' },
    { id: 'track', icon: PlusCircle, label: 'Tätigkeit' }, // Central action
    { id: 'fields', icon: List, label: 'Felder' },
    { id: 'settings', icon: Settings, label: 'Optionen' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg z-50 h-16 pb-safe">
      <div className="flex justify-around items-center h-full">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
                isActive ? 'text-green-600' : 'text-slate-500 hover:text-green-500'
              }`}
            >
              <tab.icon size={isActive ? 24 : 20} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};