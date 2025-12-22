
import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, Droplets, Layers, CheckSquare, Square, Truck, Wheat, Hammer, FileText, ShoppingBag, Sprout, ArrowRight, Database, Tag } from 'lucide-react';
import { Field, AppSettings, ActivityRecord, ActivityType, FertilizerType, HarvestType, TillageType, StorageLocation, EquipmentCategory } from '../types';
import { dbService } from '../services/db';

interface BaseFormProps {
  fields: Field[];
  storages?: StorageLocation[]; // Added optional storages prop
  settings: AppSettings | null;
  onCancel: () => void;
  onSave: (record: ActivityRecord, summary: string[]) => void;
  onNavigate?: (view: string) => void;
}

// Helper to get field color
const getFieldColor = (f: Field) => {
    if (f.color) return f.color;
    return f.type === 'Acker' ? '#92400E' : '#15803D';
};

// Helper to get correct ISO string with time
const getSmartDateISO = (dateStr: string) => {
    const inputDate = new Date(dateStr);
    const now = new Date();
    const isToday = inputDate.getDate() === now.getDate() &&
                    inputDate.getMonth() === now.getMonth() &&
                    inputDate.getFullYear() === now.getFullYear();
    if (isToday) return now.toISOString();
    inputDate.setHours(12, 0, 0, 0);
    return inputDate.toISOString();
};

export const ManualFertilizationForm: React.FC<BaseFormProps> = ({ fields, storages = [], settings, onCancel, onSave, onNavigate }) => {
  const [selectedFertilizer, setSelectedFertilizer] = useState<FertilizerType>(FertilizerType.SLURRY);
  const [selectedStorageId, setSelectedStorageId] = useState<string>('');
  const [amount, setAmount] = useState<number>(0);
  const [unit, setUnit] = useState<'Fuhren' | 'm³' | 't'>('Fuhren');
  const [date, setDate] = useState<string>(new Date().toISOString().substring(0, 10));
  const [selectedFieldIds, setSelectedFieldIds] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState('');

  // Filter valid storages based on type
  const availableStorages = useMemo(() => {
      return storages.filter(s => s.type === selectedFertilizer);
  }, [storages, selectedFertilizer]);

  // Auto-select first storage if available
  useEffect(() => {
      if (availableStorages.length > 0) {
          // Keep current if valid, else select first
          if (!availableStorages.find(s => s.id === selectedStorageId)) {
              setSelectedStorageId(availableStorages[0].id);
          }
      } else {
          setSelectedStorageId('');
      }
  }, [selectedFertilizer, availableStorages]);

  const toggleField = (id: string) => {
    const next = new Set(selectedFieldIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedFieldIds(next);
  };

  const areAllSelected = fields.length > 0 && selectedFieldIds.size === fields.length;
  const toggleAll = () => setSelectedFieldIds(areAllSelected ? new Set() : new Set(fields.map(f => f.id)));

  const handleSave = () => {
    let totalVolume = 0;
    let totalLoads = 0;
    
    // Calculate Volume based on Load Size Settings
    if (unit === 'Fuhren') {
        totalLoads = amount;
        const loadSize = settings ? (selectedFertilizer === FertilizerType.SLURRY ? settings.slurryLoadSize : settings.manureLoadSize) : 0;
        totalVolume = amount * loadSize;
    } else {
        totalVolume = amount;
        const loadSize = settings ? (selectedFertilizer === FertilizerType.SLURRY ? settings.slurryLoadSize : settings.manureLoadSize) : 1;
        totalLoads = Math.round(totalVolume / loadSize);
    }
    
    // Distribute to fields based on area size
    const selectedFields = fields.filter(f => selectedFieldIds.has(f.id));
    const totalArea = selectedFields.reduce((sum, f) => sum + f.areaHa, 0);
    const fieldDist: Record<string, number> = {};
    
    if (totalArea > 0) {
        selectedFields.forEach(f => {
            const share = (f.areaHa / totalArea) * totalVolume;
            fieldDist[f.id] = Math.round(share * 10) / 10;
        });
    }

    const finalIsoDate = getSmartDateISO(date);

    // Create Storage Distribution (100% from selected storage)
    const storageDist: Record<string, number> = {};
    if (selectedStorageId) {
        storageDist[selectedStorageId] = totalVolume;
    }

    const record: ActivityRecord = {
      id: Math.random().toString(36).substr(2, 9),
      date: finalIsoDate,
      type: ActivityType.FERTILIZATION,
      fertilizerType: selectedFertilizer,
      fieldIds: Array.from(selectedFieldIds),
      amount: totalVolume,
      unit: unit === 'Fuhren' ? 'm³' : unit,
      loadCount: totalLoads,
      fieldDistribution: fieldDist,
      storageDistribution: Object.keys(storageDist).length > 0 ? storageDist : undefined,
      notes: notes,
      year: new Date(finalIsoDate).getFullYear()
    };

    const storageName = storages.find(s => s.id === selectedStorageId)?.name || 'Ohne Lager';
    const summary = [
        `Menge: ${totalVolume.toFixed(1)} m³ (${totalLoads} Fuhren)`,
        `Quelle: ${storageName}`,
        `Felder: ${selectedFields.map(f => f.name).join(', ')}`
    ];

    onSave(record, summary);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-white flex flex-col h-full">
        <div className="bg-amber-600 p-4 text-white shrink-0">
             <button onClick={onCancel} className="flex items-center text-white/80 hover:text-white mb-2 text-sm font-bold">
                 <ChevronLeft className="mr-1" size={16}/> Zurück
             </button>
             <div className="flex items-center space-x-3">
                 <div className="p-2 bg-white/20 rounded-full"><Truck size={24} /></div>
                 <h2 className="text-xl font-bold">Manuelle Düngung</h2>
             </div>
        </div>

        <div className="p-4 space-y-4 pb-20 flex-1 overflow-y-auto">
            <div>
                <label className="block text-sm font-bold text-slate-500 uppercase mb-1">Art</label>
                <div className="flex space-x-2">
                    <button onClick={() => setSelectedFertilizer(FertilizerType.SLURRY)} className={`flex-1 py-3 rounded-lg border font-bold flex flex-col items-center justify-center ${selectedFertilizer === FertilizerType.SLURRY ? 'bg-amber-100 border-amber-600 text-amber-900' : 'border-slate-200 text-slate-400'}`}>
                        <Droplets size={20} className="mb-1"/> Gülle
                    </button>
                    <button onClick={() => setSelectedFertilizer(FertilizerType.MANURE)} className={`flex-1 py-3 rounded-lg border font-bold flex flex-col items-center justify-center ${selectedFertilizer === FertilizerType.MANURE ? 'bg-orange-100 border-orange-600 text-orange-900' : 'border-slate-200 text-slate-400'}`}>
                        <Layers size={20} className="mb-1"/> Mist
                    </button>
                </div>
            </div>

            {/* Storage Selector */}
            <div>
                <label className="block text-sm font-bold text-slate-500 uppercase mb-1">Lager / Quelle (für Abzug)</label>
                {availableStorages.length > 0 ? (
                    <div className="relative">
                        <Database className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <select 
                            value={selectedStorageId} 
                            onChange={(e) => setSelectedStorageId(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg font-bold bg-white focus:ring-2 focus:ring-amber-500 outline-none appearance-none"
                        >
                            {availableStorages.map(s => (
                                <option key={s.id} value={s.id}>{s.name} ({s.currentLevel.toFixed(0)} m³)</option>
                            ))}
                        </select>
                        <ChevronLeft className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 rotate-270 pointer-events-none" size={16} />
                    </div>
                ) : (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-500 italic">
                        Kein passendes Lager gefunden. Erfassung erfolgt ohne Lagerabzug.
                    </div>
                )}
            </div>

            <div>
                <label className="block text-sm font-bold text-slate-500 uppercase mb-1">Menge</label>
                <div className="flex space-x-2">
                    <input type="number" value={amount || ''} onChange={e => setAmount(parseFloat(e.target.value))} className="flex-1 border p-3 rounded-lg font-bold text-lg" placeholder="0" />
                    <select value={unit} onChange={e => setUnit(e.target.value as any)} className="border p-3 rounded-lg bg-slate-50 font-bold">
                        <option value="Fuhren">Fuhren</option>
                        <option value="m³">m³</option>
                        <option value="t">t</option>
                    </select>
                </div>
            </div>
            
            <div>
                <label className="block text-sm font-bold text-slate-500 uppercase mb-1">Datum</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border p-3 rounded-lg" />
            </div>

            <div>
                <div className="flex justify-between items-end mb-1">
                    <label className="block text-sm font-bold text-slate-500 uppercase">Felder wählen</label>
                    <button onClick={toggleAll} className="text-xs font-bold text-blue-600 flex items-center hover:bg-blue-50 px-2 py-1 rounded">
                        {areAllSelected ? <><CheckSquare size={14} className="mr-1"/> Alle abwählen</> : <><Square size={14} className="mr-1"/> Alle auswählen</>}
                    </button>
                </div>
                <div className="border rounded-lg max-h-48 overflow-y-auto divide-y min-h-[100px]">
                    {fields.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 text-sm flex flex-col items-center justify-center">
                            <span className="italic mb-3">Keine Felder verfügbar.</span>
                            {onNavigate && <button onClick={() => onNavigate('FIELDS')} className="px-4 py-2 bg-slate-100 text-slate-600 font-bold rounded-lg text-xs hover:bg-slate-200 flex items-center">Jetzt Felder anlegen <ArrowRight size={14} className="ml-1"/></button>}
                        </div>
                    ) : (
                        fields.map(f => (
                            <div key={f.id} onClick={() => toggleField(f.id)} className={`p-3 flex items-center cursor-pointer border-l-4 ${selectedFieldIds.has(f.id) ? 'bg-blue-50' : 'bg-white'}`} style={{ borderLeftColor: getFieldColor(f) }}>
                                <div className={`mr-3 ${selectedFieldIds.has(f.id) ? 'text-blue-600' : 'text-slate-300'}`}>{selectedFieldIds.has(f.id) ? <CheckSquare size={20}/> : <Square size={20}/>}</div>
                                <div className="flex-1"><div className="font-bold text-sm text-slate-700">{f.name}</div><div className="text-xs text-slate-500">{f.areaHa.toFixed(2)} ha</div></div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div>
                 <label className="block text-sm font-bold text-slate-500 uppercase mb-1">Notizen</label>
                 <div className="relative">
                    <FileText className="absolute left-3 top-3 text-slate-400" size={16}/>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full pl-10 p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-sm" placeholder="Zusätzliche Infos..."/>
                 </div>
            </div>
            
            <button onClick={handleSave} disabled={amount <= 0 || selectedFieldIds.size === 0} className="w-full bg-green-600 text-white py-4 rounded-xl font-bold shadow-lg disabled:opacity-50 mt-4">Speichern</button>
        </div>
    </div>
  );
};

export const HarvestForm: React.FC<BaseFormProps> = ({ fields, onCancel, onSave, onNavigate }) => {
    const [harvestType, setHarvestType] = useState<HarvestType>(HarvestType.SILAGE);
    const [strawMode, setStrawMode] = useState<'field' | 'purchase'>('field');
    const [amount, setAmount] = useState<number>(0);
    const [date, setDate] = useState<string>(new Date().toISOString().substring(0, 10));
    const [selectedFieldIds, setSelectedFieldIds] = useState<Set<string>>(new Set());
    const [notes, setNotes] = useState('');

    useEffect(() => { if (harvestType !== HarvestType.STRAW) setStrawMode('field'); }, [harvestType]);

    const isStraw = harvestType === HarvestType.STRAW;
    const isPurchase = isStraw && strawMode === 'purchase';
    const showFieldSelection = !isStraw || (isStraw && strawMode === 'field');

    const toggleField = (id: string) => {
        const next = new Set(selectedFieldIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedFieldIds(next);
    };
    const areAllSelected = fields.length > 0 && selectedFieldIds.size === fields.length;
    const toggleAll = () => setSelectedFieldIds(areAllSelected ? new Set() : new Set(fields.map(f => f.id)));

    const handleSave = () => {
        const finalIsoDate = getSmartDateISO(date);
        const finalFieldIds = isPurchase ? [] : Array.from(selectedFieldIds);
        const record: ActivityRecord = {
            id: Math.random().toString(36).substr(2, 9),
            date: finalIsoDate,
            type: ActivityType.HARVEST,
            fieldIds: finalFieldIds,
            amount: amount,
            unit: 'Stk',
            notes: `${harvestType}${isPurchase ? ' (Zukauf)' : ''}\n${notes}`,
            year: new Date(finalIsoDate).getFullYear()
        };
        onSave(record, [`Menge: ${amount} Stk`, `Art: ${harvestType}`]);
    };

    return (
        <div className="flex-1 overflow-y-auto bg-white flex flex-col h-full">
            <div className="bg-yellow-500 p-4 text-white shrink-0">
                 <button onClick={onCancel} className="flex items-center text-white/80 hover:text-white mb-2 text-sm font-bold"><ChevronLeft className="mr-1" size={16}/> Zurück</button>
                 <div className="flex items-center space-x-3"><div className="p-2 bg-white/20 rounded-full"><Wheat size={24} /></div><h2 className="text-xl font-bold">Ernte Erfassen</h2></div>
            </div>
            <div className="p-4 space-y-4 pb-20 flex-1 overflow-y-auto">
                <div>
                     <label className="block text-sm font-bold text-slate-500 uppercase mb-1">Erntegut</label>
                     <div className="flex space-x-2">
                         <button onClick={() => setHarvestType(HarvestType.SILAGE)} className={`flex-1 py-3 rounded-lg border font-bold ${harvestType === HarvestType.SILAGE ? 'bg-lime-100 border-lime-600 text-lime-900' : 'border-slate-200 text-slate-400'}`}>Silage</button>
                         <button onClick={() => setHarvestType(HarvestType.HAY)} className={`flex-1 py-3 rounded-lg border font-bold ${harvestType === HarvestType.HAY ? 'bg-yellow-100 border-yellow-500 text-yellow-900' : 'border-slate-200 text-slate-400'}`}>Heu</button>
                         <button onClick={() => setHarvestType(HarvestType.STRAW)} className={`flex-1 py-3 rounded-lg border font-bold ${harvestType === HarvestType.STRAW ? 'bg-amber-100 border-amber-600 text-amber-900' : 'border-slate-200 text-slate-400'}`}>Stroh</button>
                     </div>
                </div>
                <div className="flex space-x-2">
                    <div className="flex-1"><label className="block text-sm font-bold text-slate-500 uppercase mb-1">Menge (Stk)</label><input type="number" value={amount || ''} onChange={e => setAmount(parseFloat(e.target.value))} className="w-full border p-3 rounded-lg font-bold text-lg" placeholder="0" /></div>
                    <div className="flex-1"><label className="block text-sm font-bold text-slate-500 uppercase mb-1">Datum</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border p-3 rounded-lg" /></div>
                </div>
                {isStraw && (
                    <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                        <span className="text-xs font-bold text-amber-800 uppercase block mb-2">Herkunft</span>
                        <div className="flex space-x-2">
                            <button onClick={() => setStrawMode('field')} className={`flex-1 py-2 rounded-lg text-sm font-bold border ${strawMode === 'field' ? 'bg-white border-amber-500 text-amber-900' : 'border-transparent text-amber-700/50'}`}><Sprout size={16} className="inline mr-1"/> Eigene Fläche</button>
                            <button onClick={() => { setStrawMode('purchase'); setSelectedFieldIds(new Set()); }} className={`flex-1 py-2 rounded-lg text-sm font-bold border ${strawMode === 'purchase' ? 'bg-white border-amber-500 text-amber-900' : 'border-transparent text-amber-700/50'}`}><ShoppingBag size={16} className="inline mr-1"/> Zukauf</button>
                        </div>
                    </div>
                )}
                {showFieldSelection && (
                    <div>
                        <div className="flex justify-between items-end mb-1"><label className="block text-sm font-bold text-slate-500 uppercase">Felder wählen</label><button onClick={toggleAll} className="text-xs font-bold text-blue-600 flex items-center hover:bg-blue-50 px-2 py-1 rounded">{areAllSelected ? <><CheckSquare size={14} className="mr-1"/> Alle abwählen</> : <><Square size={14} className="mr-1"/> Alle auswählen</>}</button></div>
                        <div className="border rounded-lg max-h-60 overflow-y-auto divide-y min-h-[100px] bg-slate-50">
                            {fields.length === 0 ? (
                                <div className="p-8 text-center text-slate-400 text-sm flex flex-col items-center"><span className="italic mb-3">Keine Felder.</span>{onNavigate && <button onClick={() => onNavigate('FIELDS')} className="px-4 py-2 bg-slate-100 text-slate-600 font-bold rounded-lg text-xs hover:bg-slate-200 flex items-center">Felder anlegen <ArrowRight size={14} className="ml-1"/></button>}</div>
                            ) : (
                                fields.map(f => (
                                    <div key={f.id} onClick={() => toggleField(f.id)} className={`p-3 flex items-center cursor-pointer border-l-4 ${selectedFieldIds.has(f.id) ? 'bg-blue-50' : 'bg-white'}`} style={{ borderLeftColor: getFieldColor(f) }}>
                                        <div className={`mr-3 ${selectedFieldIds.has(f.id) ? 'text-blue-600' : 'text-slate-300'}`}>{selectedFieldIds.has(f.id) ? <CheckSquare size={20}/> : <Square size={20}/>}</div>
                                        <div className="flex-1"><div className="font-bold text-sm text-slate-700">{f.name}</div><div className="text-xs text-slate-500">{f.areaHa.toFixed(2)} ha</div></div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
                <div><label className="block text-sm font-bold text-slate-500 uppercase mb-1">Notizen</label><div className="relative"><FileText className="absolute left-3 top-3 text-slate-400" size={16}/><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full pl-10 p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-sm" placeholder="Zusätzliche Infos..."/></div></div>
                <button onClick={handleSave} disabled={amount <= 0 || (!isPurchase && selectedFieldIds.size === 0)} className="w-full bg-green-600 text-white py-4 rounded-xl font-bold shadow-lg disabled:opacity-50 mt-4">Speichern</button>
            </div>
        </div>
    );
};

export const TillageForm: React.FC<BaseFormProps> = ({ fields, onCancel, onSave, onNavigate }) => {
    const [tillageType, setTillageType] = useState<string>('');
    const [categories, setCategories] = useState<EquipmentCategory[]>([]);
    const [date, setDate] = useState<string>(new Date().toISOString().substring(0, 10));
    const [selectedFieldIds, setSelectedFieldIds] = useState<Set<string>>(new Set());
    const [notes, setNotes] = useState('');

    useEffect(() => {
        const load = async () => {
            const cats = await dbService.getEquipmentCategories();
            setCategories(cats);
            if (cats.length > 0) setTillageType(cats[0].name);
        };
        load();
    }, []);

    const toggleField = (id: string) => {
        const next = new Set(selectedFieldIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedFieldIds(next);
    };
    const areAllSelected = fields.length > 0 && selectedFieldIds.size === fields.length;
    const toggleAll = () => setSelectedFieldIds(areAllSelected ? new Set() : new Set(fields.map(f => f.id)));

    const handleSave = () => {
        const selectedFields = fields.filter(f => selectedFieldIds.has(f.id));
        const totalArea = selectedFields.reduce((sum, f) => sum + f.areaHa, 0);
        const fieldDist: Record<string, number> = {};
        selectedFields.forEach(f => fieldDist[f.id] = f.areaHa);
        const finalIsoDate = getSmartDateISO(date);
        const record: ActivityRecord = {
            id: Math.random().toString(36).substr(2, 9),
            date: finalIsoDate,
            type: ActivityType.TILLAGE,
            tillageType: tillageType,
            fieldIds: Array.from(selectedFieldIds),
            amount: parseFloat(totalArea.toFixed(2)),
            unit: 'ha',
            fieldDistribution: fieldDist,
            notes: notes,
            year: new Date(finalIsoDate).getFullYear()
        };
        onSave(record, [`Art: ${tillageType}`, `Gesamtfläche: ${totalArea.toFixed(2)} ha`]);
    };

    return (
        <div className="flex-1 overflow-y-auto bg-white flex flex-col h-full">
            <div className="bg-blue-600 p-4 text-white shrink-0">
                 <button onClick={onCancel} className="flex items-center text-white/80 hover:text-white mb-2 text-sm font-bold"><ChevronLeft className="mr-1" size={16}/> Zurück</button>
                 <div className="flex items-center space-x-3"><div className="p-2 bg-white/20 rounded-full"><Hammer size={24} /></div><h2 className="text-xl font-bold">Bodenbearbeitung</h2></div>
            </div>
            <div className="p-4 space-y-4 pb-20 flex-1 overflow-y-auto">
                <div>
                    <label className="block text-sm font-bold text-slate-500 uppercase mb-1 flex items-center"><Tag size={12} className="mr-1"/> Tätigkeit / Typ</label>
                    <select value={tillageType} onChange={e => setTillageType(e.target.value)} className="w-full border p-3 rounded-lg font-bold bg-white">
                        {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        {categories.length === 0 && <option value="" disabled>Keine Kategorien definiert</option>}
                    </select>
                </div>
                <div><label className="block text-sm font-bold text-slate-500 uppercase mb-1">Datum</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border p-3 rounded-lg" /></div>
                <div>
                    <div className="flex justify-between items-end mb-1"><label className="block text-sm font-bold text-slate-500 uppercase">Felder wählen</label><button onClick={toggleAll} className="text-xs font-bold text-blue-600 flex items-center hover:bg-blue-50 px-2 py-1 rounded">{areAllSelected ? <><CheckSquare size={14} className="mr-1"/> Alle abwählen</> : <><Square size={14} className="mr-1"/> Alle auswählen</>}</button></div>
                    <div className="border rounded-lg max-h-60 overflow-y-auto divide-y min-h-[100px]">
                        {fields.length === 0 ? (
                             <div className="p-8 text-center text-slate-400 text-sm flex flex-col items-center"><span className="italic mb-3">Keine Felder.</span>{onNavigate && <button onClick={() => onNavigate('FIELDS')} className="px-4 py-2 bg-slate-100 text-slate-600 font-bold rounded-lg text-xs hover:bg-slate-200 flex items-center">Felder anlegen <ArrowRight size={14} className="ml-1"/></button>}</div>
                        ) : (
                            fields.map(f => (
                                <div key={f.id} onClick={() => toggleField(f.id)} className={`p-3 flex items-center cursor-pointer border-l-4 ${selectedFieldIds.has(f.id) ? 'bg-blue-50' : 'bg-white'}`} style={{ borderLeftColor: getFieldColor(f) }}>
                                    <div className={`mr-3 ${selectedFieldIds.has(f.id) ? 'text-blue-600' : 'text-slate-300'}`}>{selectedFieldIds.has(f.id) ? <CheckSquare size={20}/> : <Square size={20}/>}</div>
                                    <div className="flex-1"><div className="font-bold text-sm text-slate-700">{f.name}</div><div className="text-xs text-slate-500">{f.areaHa.toFixed(2)} ha</div></div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
                <div><label className="block text-sm font-bold text-slate-500 uppercase mb-1">Notizen</label><div className="relative"><FileText className="absolute left-3 top-3 text-slate-400" size={16}/><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full pl-10 p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-sm" placeholder="Zusätzliche Infos..."/></div></div>
                <button onClick={handleSave} disabled={selectedFieldIds.size === 0 || !tillageType} className="w-full bg-green-600 text-white py-4 rounded-xl font-bold shadow-lg disabled:opacity-50 mt-4">Speichern</button>
            </div>
        </div>
    );
};

