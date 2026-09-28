import React, { useState, useEffect, useMemo } from 'react';
import { X, Disc, Sparkles, TrendingUp, TrendingDown, ArrowRight, AlertTriangle, CheckCircle2, Filter, Calendar, MapPin, Truck, Warehouse, Layers, HelpCircle, ChevronRight, BarChart3, Scale } from 'lucide-react';
import { Field, RoundBale, ActivityRecord, ActivityType, StorageLocation } from '../types';
import { dbService } from '../services/db';

interface Props {
  show: boolean;
  onClose: () => void;
  fields: Field[];
  activities: ActivityRecord[];
  onOpenField?: (field: Field) => void;
}

export const HarvestComparisonModal: React.FC<Props> = ({ show, onClose, fields, activities, onOpenField }) => {
  const [bales, setBales] = useState<RoundBale[]>([]);
  const [storages, setStorages] = useState<StorageLocation[]>([]);
  const [activeTab, setActiveTab] = useState<'FIELDS' | 'CUTS' | 'TRACKING'>('FIELDS');
  const [filterYear, setFilterYear] = useState<number | 'ALL'>('ALL');
  const [filterCrop, setFilterCrop] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  useEffect(() => {
    if (show) {
      loadData();
    }
  }, [show]);

  const loadData = async () => {
    const allBales = await dbService.getBales();
    setBales(allBales);
    const allStorages = await dbService.getStorageLocations();
    setStorages(allStorages);
  };

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    bales.forEach(b => years.add(b.year || new Date(b.droppedAt).getFullYear()));
    activities.filter(a => a.type === ActivityType.HARVEST).forEach(a => years.add(a.year));
    years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [bales, activities]);

  // Gefilterte Ballen
  const filteredBales = useMemo(() => {
    return bales.filter(b => {
      const bYear = b.year || new Date(b.droppedAt).getFullYear();
      if (filterYear !== 'ALL' && bYear !== filterYear) return false;
      if (filterCrop !== 'ALL' && b.cropType !== filterCrop) return false;
      if (filterStatus !== 'ALL' && b.status !== filterStatus) return false;
      return true;
    });
  }, [bales, filterYear, filterCrop, filterStatus]);

  // Schlag-Statistiken und Düngebedarf
  const fieldAnalytics = useMemo(() => {
    return fields.map(f => {
      // Ballen für diesen Schlag
      const fBales = filteredBales.filter(b => b.fieldId === f.id);
      const totalBales = fBales.length;
      const totalDistance = fBales.reduce((sum, b) => sum + (b.distanceMeters || 0), 0);
      const avgDistance = totalBales > 0 ? Math.round(totalDistance / totalBales) : 0;
      const balesPerHa = f.areaHa > 0 ? Math.round((totalBales / f.areaHa) * 10) / 10 : 0;

      // Historische Ernte-Aktivitäten auf diesem Schlag (zum Vergleich)
      const pastHarvests = activities.filter(a => 
        a.type === ActivityType.HARVEST && 
        (a.fieldIds?.includes(f.id) || (a.fieldDistribution && a.fieldDistribution[f.id]))
      ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Vorherige Ernte-Ballen
      let previousCutBales: number | null = null;
      let trendPercent: number | null = null;
      if (pastHarvests.length > 1) {
        const prev = pastHarvests[1];
        if (prev.fieldDistribution && prev.fieldDistribution[f.id]) {
          previousCutBales = prev.fieldDistribution[f.id];
        } else if (prev.amount && prev.fieldIds.length === 1) {
          previousCutBales = prev.amount;
        }
        if (previousCutBales && previousCutBales > 0 && totalBales > 0) {
          trendPercent = Math.round(((totalBales - previousCutBales) / previousCutBales) * 100);
        }
      }

      // Dünge-Klassifizierung
      let status: 'DEFICIT' | 'OPTIMAL' | 'HIGH_YIELD' | 'NO_DATA' = 'NO_DATA';
      let title = 'Keine Daten erfasst';
      let recommendation = 'Noch keine Ballen per GPS aufgezeichnet.';
      let badgeBg = 'bg-slate-100 text-slate-700 border-slate-200';

      if (totalBales > 0) {
        if (avgDistance > 150 || (trendPercent !== null && trendPercent < -15)) {
          status = 'DEFICIT';
          title = 'Aufwuchs unterdurchschnittlich (Mehr Düngung nötig)';
          recommendation = 'Grasnarbe schütter oder Nährstoffmangel: Düngegabe um +10-15 m³ Gülle/ha oder 15 t Mist/ha anheben.';
          badgeBg = 'bg-amber-100 text-amber-900 border-amber-300';
        } else if (avgDistance < 85 || (trendPercent !== null && trendPercent > 20)) {
          status = 'HIGH_YIELD';
          title = 'Spitzen-Aufwuchs (Sehr ertragreich)';
          recommendation = 'Hoher Nährstoffentzug! Nach dem Schnitt zeitnah mit Gülle nachdüngen, um Auslaugung zu verhindern.';
          badgeBg = 'bg-emerald-100 text-emerald-900 border-emerald-300';
        } else {
          status = 'OPTIMAL';
          title = 'Ausgewogener Normalertrag';
          recommendation = 'Ertrag im Soll. Geplante Erhaltungsdüngung wie gewohnt fortführen.';
          badgeBg = 'bg-blue-100 text-blue-900 border-blue-200';
        }
      }

      return {
        field: f,
        totalBales,
        avgDistance,
        balesPerHa,
        pastHarvestsCount: pastHarvests.length,
        previousCutBales,
        trendPercent,
        status,
        title,
        recommendation,
        badgeBg
      };
    }).sort((a, b) => {
      // Sortiere Schläge mit Düngebedarf nach oben
      if (a.status === 'DEFICIT' && b.status !== 'DEFICIT') return -1;
      if (b.status === 'DEFICIT' && a.status !== 'DEFICIT') return 1;
      return b.totalBales - a.totalBales;
    });
  }, [fields, filteredBales, activities]);

  // Gesamt-Kennzahlen
  const summary = useMemo(() => {
    const totalBales = filteredBales.length;
    const onField = filteredBales.filter(b => b.status === 'FIELD').length;
    const collected = filteredBales.filter(b => b.status === 'COLLECTED').length;
    const wrapped = filteredBales.filter(b => b.status === 'WRAPPED').length;
    const stored = filteredBales.filter(b => b.status === 'STORED').length;
    
    const totalDistance = filteredBales.reduce((s, b) => s + (b.distanceMeters || 0), 0);
    const avgDistance = totalBales > 0 ? Math.round(totalDistance / totalBales) : 0;
    
    const needsFertilizerCount = fieldAnalytics.filter(f => f.status === 'DEFICIT').length;

    return { totalBales, onField, collected, wrapped, stored, avgDistance, needsFertilizerCount };
  }, [filteredBales, fieldAnalytics]);

  const updateBaleStatus = async (baleId: string, newStatus: RoundBale['status']) => {
    await dbService.updateBaleStatus(baleId, newStatus, {
      ...(newStatus === 'COLLECTED' ? { collectedAt: Date.now() } : {}),
      ...(newStatus === 'WRAPPED' ? { wrappedAt: Date.now() } : {}),
      ...(newStatus === 'STORED' ? { storedAt: Date.now() } : {})
    });
    loadData();
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[2500] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-amber-700 via-amber-600 to-yellow-600 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-white/20 text-white rounded-2xl backdrop-blur">
              <Disc size={26} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-black uppercase tracking-widest bg-black/30 px-2 py-0.5 rounded-full text-amber-200">
                  Ernte- & Düngeanalyse
                </span>
                {summary.needsFertilizerCount > 0 && (
                  <span className="text-[10px] font-black uppercase tracking-widest bg-red-500/80 px-2 py-0.5 rounded-full text-white">
                    {summary.needsFertilizerCount} Schlag mit Düngebedarf
                  </span>
                )}
              </div>
              <h2 className="text-xl sm:text-2xl font-black mt-1">Rundballen-Ertrag & Schnittvergleich</h2>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Schnell-Filter & Statistik-Leiste */}
        <div className="bg-slate-900 text-white p-3 sm:p-4 shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border-b border-slate-800">
          <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Rundballen erfasst</span>
            <div className="text-xl font-mono font-black text-amber-400">{summary.totalBales} <span className="text-xs font-normal text-slate-400">Stk.</span></div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {summary.onField} auf Feld • {summary.stored} im Lager
            </div>
          </div>

          <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Ø Press-Strecke</span>
            <div className="text-xl font-mono font-black text-emerald-400">{summary.avgDistance || 0} <span className="text-xs font-normal text-slate-400">m / Ballen</span></div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {summary.avgDistance < 90 ? '🌱 Dichter Aufwuchs' : summary.avgDistance > 140 ? '🌾 Schütterer Wuchs' : '🌿 Normaler Ertrag'}
            </div>
          </div>

          <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Dünge-Hinweise</span>
            <div className={`text-xl font-mono font-black ${summary.needsFertilizerCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {summary.needsFertilizerCount} <span className="text-xs font-normal text-slate-400">Schläge</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {summary.needsFertilizerCount > 0 ? '⚠️ Unterdurchschnittlich' : '✅ Alle Schläge im Soll'}
            </div>
          </div>

          <div className="flex flex-col justify-between">
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Jahr filtern</span>
              <select 
                value={filterYear} 
                onChange={e => setFilterYear(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
                className="w-full bg-slate-800 text-white font-bold p-1.5 rounded-lg border border-slate-700 text-xs"
              >
                <option value="ALL">Alle Jahre</option>
                {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="flex space-x-1 mt-1">
              <button 
                onClick={() => setFilterCrop('ALL')}
                className={`flex-1 py-1 rounded text-[10px] font-bold ${filterCrop === 'ALL' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'}`}
              >
                Alle
              </button>
              <button 
                onClick={() => setFilterCrop('Silage')}
                className={`flex-1 py-1 rounded text-[10px] font-bold ${filterCrop === 'Silage' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}
              >
                Silage
              </button>
              <button 
                onClick={() => setFilterCrop('Heu')}
                className={`flex-1 py-1 rounded text-[10px] font-bold ${filterCrop === 'Heu' ? 'bg-yellow-600 text-white' : 'bg-slate-800 text-slate-400'}`}
              >
                Heu
              </button>
            </div>
          </div>
        </div>

        {/* Tab-Navigation */}
        <div className="bg-slate-100 p-2 sm:p-3 border-b border-slate-200 flex space-x-2 shrink-0">
          <button
            onClick={() => setActiveTab('FIELDS')}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center transition-all ${
              activeTab === 'FIELDS' ? 'bg-slate-900 text-white shadow-md' : 'bg-white text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Scale size={16} className="mr-1.5 text-amber-400" />
            Schlag-Vergleich & Düngebedarf
          </button>
          <button
            onClick={() => setActiveTab('TRACKING')}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center transition-all ${
              activeTab === 'TRACKING' ? 'bg-slate-900 text-white shadow-md' : 'bg-white text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Truck size={16} className="mr-1.5 text-blue-400" />
            Ballen-Rückverfolgung & Logistik ({summary.totalBales})
          </button>
        </div>

        {/* Content Area */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 text-slate-700 text-sm">
          
          {/* TAB 1: SCHLAG-VERGLEICH & DÜNGEBEDARF */}
          {activeTab === 'FIELDS' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="bg-amber-50/80 border border-amber-200 p-3.5 rounded-2xl flex items-start space-x-3 text-xs text-amber-900">
                <Sparkles size={20} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <strong>Ertrags- & Düngeprinzip:</strong> Wenn die Rundballenpresse für einen Ballen viele Meter fahren muss (über 150m), wächst das Gras schütterer oder der Nährstoffgehalt ist geringer. Diese Schläge werden rot/orange markiert und benötigen eine höhere Düngegabe (Gülle/Mist).
                </div>
              </div>

              <div className="space-y-3">
                {fieldAnalytics.map(item => (
                  <div 
                    key={item.field.id}
                    className="p-4 bg-white rounded-2xl border-2 border-slate-200 hover:border-slate-300 transition-all shadow-sm space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="font-black text-base text-slate-900">{item.field.name}</h3>
                          <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                            {item.field.areaHa.toFixed(2)} ha • {item.field.type}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {item.totalBales > 0 ? `${item.totalBales} Ballen erfasst • ${item.balesPerHa} Ballen/ha` : 'Noch keine Erntedaten erfasst'}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        {item.totalBales > 0 && (
                          <div className={`px-3 py-1.5 rounded-xl border text-xs font-black flex items-center ${item.badgeBg}`}>
                            {item.status === 'DEFICIT' && <AlertTriangle size={15} className="mr-1.5 text-amber-600" />}
                            {item.status === 'HIGH_YIELD' && <TrendingUp size={15} className="mr-1.5 text-emerald-600" />}
                            {item.status === 'OPTIMAL' && <CheckCircle2 size={15} className="mr-1.5 text-blue-600" />}
                            {item.title}
                          </div>
                        )}
                        {onOpenField && (
                          <button
                            onClick={() => {
                              onOpenField(item.field);
                              onClose();
                            }}
                            className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-800 transition-colors"
                            title="Schlag-Details öffnen"
                          >
                            <ChevronRight size={20} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Kennzahlen-Grid */}
                    {item.totalBales > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">Ø Pressstrecke</span>
                          <span className="text-base font-black font-mono text-slate-800">{item.avgDistance} m</span>
                          <span className="text-[10px] text-slate-500 block">pro Ballen</span>
                        </div>

                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">Ballendichte</span>
                          <span className="text-base font-black font-mono text-emerald-700">{item.balesPerHa}</span>
                          <span className="text-[10px] text-slate-500 block">Ballen / ha</span>
                        </div>

                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">Schnitt-Trend</span>
                          {item.trendPercent !== null ? (
                            <span className={`text-base font-black font-mono flex items-center ${item.trendPercent >= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                              {item.trendPercent >= 0 ? `+${item.trendPercent}%` : `${item.trendPercent}%`}
                              {item.trendPercent >= 0 ? <TrendingUp size={14} className="ml-1" /> : <TrendingDown size={14} className="ml-1" />}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 font-bold block pt-1">1. Datensatz</span>
                          )}
                          <span className="text-[10px] text-slate-500 block">vs. Vorschnitt</span>
                        </div>

                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">Ernten erfasst</span>
                          <span className="text-base font-black font-mono text-slate-800">{item.pastHarvestsCount}</span>
                          <span className="text-[10px] text-slate-500 block">Aktivitäten</span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-400 italic">
                        Keine Ballen auf diesem Schlag erfasst. Starte das GPS-Tracking bei der Ernte, um Ballen automatisch aufzuzeichnen.
                      </div>
                    )}

                    {/* Dünge-Empfehlung */}
                    {item.totalBales > 0 && (
                      <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/80 flex items-start space-x-2 text-xs">
                        <Sparkles size={16} className="text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-amber-950">Dünge-Handlungsempfehlung: </strong>
                          <span className="text-amber-900">{item.recommendation}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: BALLEN-RÜCKVERFOLGUNG & LOGISTIK */}
          {activeTab === 'TRACKING' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <span className="text-xs font-bold text-slate-600">Status-Filter:</span>
                <div className="flex space-x-1.5 flex-wrap">
                  <button
                    onClick={() => setFilterStatus('ALL')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold ${filterStatus === 'ALL' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border'}`}
                  >
                    Alle ({bales.length})
                  </button>
                  <button
                    onClick={() => setFilterStatus('FIELD')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold ${filterStatus === 'FIELD' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}
                  >
                    Auf Feld ({summary.onField})
                  </button>
                  <button
                    onClick={() => setFilterStatus('COLLECTED')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold ${filterStatus === 'COLLECTED' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-800 border border-blue-200'}`}
                  >
                    Eingesammelt ({summary.collected})
                  </button>
                  <button
                    onClick={() => setFilterStatus('WRAPPED')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold ${filterStatus === 'WRAPPED' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}
                  >
                    Gewickelt ({summary.wrapped})
                  </button>
                  <button
                    onClick={() => setFilterStatus('STORED')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold ${filterStatus === 'STORED' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700 border'}`}
                  >
                    Eingelagert ({summary.stored})
                  </button>
                </div>
              </div>

              {filteredBales.length === 0 ? (
                <div className="text-center py-12 text-slate-400 border border-dashed rounded-2xl">
                  Keine Rundballen mit den ausgewählten Filtern gefunden.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredBales.map(b => (
                    <div 
                      key={b.id} 
                      className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-2 hover:border-slate-300 transition-all"
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center space-x-2">
                          <div className="w-8 h-8 rounded-xl bg-amber-500 text-white font-black flex items-center justify-center text-xs">
                            #{b.number}
                          </div>
                          <div>
                            <div className="font-extrabold text-slate-900 text-xs">Ballen #{b.number} • {b.cropType}</div>
                            <div className="text-[10px] text-slate-400">Schlag: {b.fieldName}</div>
                          </div>
                        </div>

                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                          b.status === 'FIELD' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                          b.status === 'COLLECTED' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                          b.status === 'WRAPPED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                          'bg-slate-100 text-slate-800 border border-slate-200'
                        }`}>
                          {b.status === 'FIELD' ? 'Auf Feld' :
                           b.status === 'COLLECTED' ? 'Eingesammelt' :
                           b.status === 'WRAPPED' ? 'Gewickelt' : 'Eingelagert'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[10px] bg-slate-50 p-2 rounded-xl">
                        <div>
                          <span className="text-slate-400 font-bold block">Gefahren:</span>
                          <span className="font-black text-slate-800 font-mono">{b.distanceMeters} Meter</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-bold block">Ablagezeit:</span>
                          <span className="font-medium text-slate-600">{new Date(b.droppedAt).toLocaleTimeString()}</span>
                        </div>
                      </div>

                      {/* Logistik-Aktionen */}
                      <div className="pt-1 flex items-center justify-between border-t border-slate-100">
                        {b.status === 'FIELD' && (
                          <button
                            onClick={() => updateBaleStatus(b.id, 'COLLECTED')}
                            className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all"
                          >
                            🚜 Als eingesammelt markieren
                          </button>
                        )}
                        {b.status === 'COLLECTED' && (
                          <button
                            onClick={() => updateBaleStatus(b.id, 'WRAPPED')}
                            className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all"
                          >
                            🔄 Silieren / Wickeln fertig
                          </button>
                        )}
                        {b.status === 'WRAPPED' && (
                          <button
                            onClick={() => updateBaleStatus(b.id, 'STORED')}
                            className="w-full py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition-all"
                          >
                            🏠 Auf Endlagerplatz abgestellt
                          </button>
                        )}
                        {b.status === 'STORED' && (
                          <span className="text-[10px] text-emerald-600 font-bold flex items-center w-full justify-center">
                            <CheckCircle2 size={14} className="mr-1" /> Im Lager ({b.storageLocationName || 'Hoflager'})
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center shrink-0">
          <div className="text-xs text-slate-500">
            {summary.totalBales} Ballen im System erfasst
          </div>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-black shadow-md transition-all active:scale-95"
          >
            Schließen
          </button>
        </div>

      </div>
    </div>
  );
};
