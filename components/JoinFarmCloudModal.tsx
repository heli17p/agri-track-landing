import React, { useState } from 'react';
import { Database, ShieldCheck, CheckCircle2, X, Loader2 } from 'lucide-react';
import { CustomFirebaseConfig, saveCustomFirebaseConfig } from '../services/storage';

interface Props {
  invite: CustomFirebaseConfig & { farmPin?: string };
  onClose: () => void;
}

export const JoinFarmCloudModal: React.FC<Props> = ({ invite, onClose }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const handleAccept = async () => {
    if (isProcessing || isDone) return;
    try {
      setIsProcessing(true);
      // Bereinige die URL sofort
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', window.location.pathname);
      }
      setIsDone(true);
      // Kurze Verzögerung für visuelles Feedback
      setTimeout(async () => {
        await saveCustomFirebaseConfig(invite);
      }, 500);
    } catch (e) {
      setIsProcessing(false);
      setIsDone(false);
      alert("Fehler beim Aktivieren der Betriebs-Cloud: " + e);
    }
  };

  const handleDismiss = () => {
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', window.location.pathname);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-slate-200">
        
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-green-700 to-green-900 text-white text-center relative">
          <div className="w-16 h-16 bg-white/20 rounded-2xl mx-auto flex items-center justify-center mb-3 backdrop-blur border border-white/20">
            {isDone ? (
              <CheckCircle2 size={34} className="text-white animate-bounce" />
            ) : (
              <Database size={32} className="text-green-300" />
            )}
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-green-300 bg-white/10 px-3 py-1 rounded-full border border-white/20">
            {isDone ? 'Verbindung hergestellt' : 'Einladung empfangen'}
          </span>
          <h2 className="text-xl font-black mt-2">
            {isDone ? 'Erfolgreich beigetreten!' : 'Betriebs-Cloud beitreten?'}
          </h2>
          <p className="text-xs text-green-100 mt-1">
            {isDone 
              ? 'Die App wird jetzt mit deiner Betriebs-Datenbank neu geladen...' 
              : 'Du wurdest eingeladen, deine AgriTrack App mit dieser Betriebs-Datenbank zu verbinden.'}
          </p>
        </div>

        {/* Details */}
        <div className="p-6 space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-bold uppercase text-[9px]">Betrieb / Name:</span>
              <span className="font-extrabold text-slate-800">{invite.farmName || invite.projectId}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-bold uppercase text-[9px]">Cloud Projekt-ID:</span>
              <span className="font-mono font-bold text-blue-600">{invite.projectId}</span>
            </div>
            {invite.farmPin && (
              <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                <span className="text-slate-500 font-bold uppercase text-[9px]">Betriebs-PIN:</span>
                <span className="font-mono font-black text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {invite.farmPin}
                </span>
              </div>
            )}
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 leading-snug">
            💡 <strong>Hinweis:</strong> Nach dem Beitritt werden alle Feldarbeiten und Schläge direkt mit dieser privaten Betriebs-Cloud synchronisiert.
          </div>

          <div className="space-y-2 pt-2">
            <button
              onClick={handleAccept}
              disabled={isProcessing || isDone}
              className={`w-full py-3.5 rounded-xl font-black text-sm shadow-lg flex items-center justify-center transition-all ${
                isDone 
                  ? 'bg-emerald-600 text-white' 
                  : 'bg-green-600 hover:bg-green-700 text-white shadow-green-900/20 active:scale-95'
              }`}
            >
              {isDone ? (
                <>
                  <CheckCircle2 size={18} className="mr-2" />
                  Verbunden! App lädt neu...
                </>
              ) : isProcessing ? (
                <>
                  <Loader2 size={18} className="mr-2 animate-spin" />
                  Verbindung wird aktiviert...
                </>
              ) : (
                <>
                  <CheckCircle2 size={18} className="mr-2" />
                  Jetzt verbinden & beitreten
                </>
              )}
            </button>

            {!isDone && (
              <button
                onClick={handleDismiss}
                disabled={isProcessing}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs transition-colors"
              >
                Abbrechen (Nicht beitreten)
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
