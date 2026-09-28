import React, { useState } from 'react';
import { X, Disc, Truck, Check, MapPin, Calendar, Clock, Warehouse, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { RoundBale, StorageLocation, BaleStatus } from '../types';
import { dbService } from '../services/db';

interface Props {
  bale: RoundBale;
  storages: StorageLocation[];
  onClose: () => void;
  onUpdate: () => void;
}

export const BaleDetailModal: React.FC<Props> = ({ bale, storages, onClose, onUpdate }) => {
  const [loading, setLoading] = useState(false);
  const [selectedStorageId, setSelectedStorageId] = useState<string>(
    bale.storageLocationId || (storages.length > 0 ? storages[0].id : '')
  );

  const handleStatusChange = async (newStatus: BaleStatus, extra: Partial<RoundBale> = {}) => {
    setLoading(true);
    try {
      await dbService.updateBaleStatus(bale.id, newStatus, extra);
      onUpdate();
    } catch (e) {
      console.error("Error updating bale status", e);
    } finally {
      setLoading(false);
    }
  };

  const markCollected = () => {
    handleStatusChange('COLLECTED', {
      collectedAt: Date.now()
    });
  };

  const markWrapped = () => {
    handleStatusChange('WRAPPED', {
      wrappedAt: Date.now()
    });
  };

  const markStored = () => {
    const store = storages.find(s => s.id === selectedStorageId);
    handleStatusChange('STORED', {
      storedAt: Date.now(),
      storageLocationId: selectedStorageId,
      storageLocationName: store?.name || 'Hauptlager'
    });
  };

  const getStatusBadge = () => {
    switch (bale.status) {
      case 'FIELD':
        return <span className="bg-amber-100 text-amber-800 border border-amber-300 font-extrabold px-3 py-1 rounded-full text-xs">Auf Feld (Abholbereit)</span>;
      case 'COLLECTED':
        return <span className="bg-blue-100 text-blue-800 border border-blue-300 font-extrabold px-3 py-1 rounded-full text-xs">Eingesammelt (Am Wagen)</span>;
      case 'WRAPPED':
        return <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 font-extrabold px-3 py-1 rounded-full text-xs">Gewickelt (Silage fertig)</span>;
      case 'STORED':
        return <span className="bg-slate-100 text-slate-800 border border-slate-300 font-extrabold px-3 py-1 rounded-full text-xs">Eingelagert</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-[2500] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-amber-600 via-yellow-600 to-amber-700 text-white flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center font-black text-lg">
              #{bale.number}
            </div>
            <div>
              <h2 className="font-extrabold text-lg leading-tight">Rundballen #{bale.number}</h2>
              <p className="text-xs text-amber-100">{bale.cropType} • Schlag: {bale.fieldName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Status</span>
            {getStatusBadge()}
          </div>

          {/* Aufwuchs- & Press-Kennzahl */}
          <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Gefahrene Strecke</span>
              <span className="text-lg font-mono font-black text-emerald-600">{bale.distanceMeters} m</span>
              <span className="text-[10px] text-slate-500 block leading-tight">bis Ballen voll war</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Aufwuchs-Dichte</span>
              <span className="text-xs font-bold text-slate-700 block mt-1">
                {bale.distanceMeters < 80 ? '🌱 Sehr dicht / ertragreich' :
                 bale.distanceMeters < 160 ? '🌿 Normaler Ertrag' :
                 '🌾 Eher schütter / weniger Wuchs'}
              </span>
            </div>
          </div>

          {/* Logistik-Schritte */}
          <div className="space-y-3">
            <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">Logistik & Rückverfolgung</h4>

            {/* Schritt 1: Abholen */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center space-x-2.5">
                <Truck size={18} className={bale.status !== 'FIELD' ? 'text-blue-600' : 'text-slate-400'} />
                <div>
                  <div className="text-xs font-bold text-slate-800">1. Einsammeln (Traktor)</div>
                  <div className="text-[10px] text-slate-400">
                    {bale.collectedAt ? `Eingesammelt: ${new Date(bale.collectedAt).toLocaleTimeString()}` : 'Noch auf dem Feld'}
                  </div>
                </div>
              </div>
              {bale.status === 'FIELD' && (
                <button
                  disabled={loading}
                  onClick={markCollected}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all active:scale-95"
                >
                  Als aufgeladen markieren
                </button>
              )}
            </div>

            {/* Schritt 2: Wickeln */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center space-x-2.5">
                <Disc size={18} className={(bale.status === 'WRAPPED' || bale.status === 'STORED') ? 'text-emerald-600' : 'text-slate-400'} />
                <div>
                  <div className="text-xs font-bold text-slate-800">2. Silieren / Wickeln (Hoflader)</div>
                  <div className="text-[10px] text-slate-400">
                    {bale.wrappedAt ? `Gewickelt: ${new Date(bale.wrappedAt).toLocaleTimeString()}` : 'Noch nicht gewickelt'}
                  </div>
                </div>
              </div>
              {bale.status === 'COLLECTED' && (
                <button
                  disabled={loading}
                  onClick={markWrapped}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all active:scale-95"
                >
                  Als gewickelt markieren
                </button>
              )}
            </div>

            {/* Schritt 3: Endlager */}
            <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <Warehouse size={18} className={bale.status === 'STORED' ? 'text-purple-600' : 'text-slate-400'} />
                  <div>
                    <div className="text-xs font-bold text-slate-800">3. Endgültiger Lagerplatz</div>
                    <div className="text-[10px] text-slate-400">
                      {bale.storageLocationName ? `Abgestellt bei: ${bale.storageLocationName}` : 'Noch kein Lagerplatz'}
                    </div>
                  </div>
                </div>
              </div>

              {(bale.status === 'WRAPPED' || bale.status === 'COLLECTED') && (
                <div className="pt-2 flex items-center space-x-2">
                  <select
                    value={selectedStorageId}
                    onChange={e => setSelectedStorageId(e.target.value)}
                    className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                  >
                    {storages.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                    <option value="bale_stack_main">Ballenlager Hof</option>
                    <option value="field_edge">Feldrand / Fahrsilo</option>
                  </select>
                  <button
                    disabled={loading}
                    onClick={markStored}
                    className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all active:scale-95"
                  >
                    Einlagern
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-400">
            <span>Ablage: {new Date(bale.droppedAt).toLocaleString()}</span>
            <button
              onClick={async () => {
                if (confirm(`Ballen #${bale.number} wirklich löschen?`)) {
                  await dbService.deleteBale(bale.id);
                  onUpdate();
                  onClose();
                }
              }}
              className="text-red-500 hover:underline"
            >
              Ballen entfernen
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
