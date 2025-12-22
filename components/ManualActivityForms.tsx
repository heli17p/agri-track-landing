
import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, CheckSquare, Square, Truck, Wheat, Hammer, FileText, ArrowRight, Database, Tag, Droplets, Layers } from 'lucide-react';
import { Field, AppSettings, ActivityRecord, ActivityType, FertilizerType, StorageLocation, EquipmentCategory } from '../types';
import { dbService } from '../services/db';

interface BaseFormProps {
  fields: Field[];
  storages?: StorageLocation[];
  settings: AppSettings | null;
  onCancel: () => void;
  onSave: (record: ActivityRecord, summary: string[]) => void;
  onNavigate?: (view: string) => void;
}

const getSmartDateISO = (dateStr: string) => {
    const inputDate = new Date(dateStr);
    const now = new Date();
    if (inputDate.toDateString() === now.toDateString()) return now.toISOString();
    inputDate.setHours(12, 0, 0, 0);
    return inputDate.toISOString();
};

export const ManualFertilizationForm: React.FC<BaseFormProps> = ({ fields, storages = [], settings, onCancel, onSave, onNavigate }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [categories, setCategories] = useState<EquipmentCategory[]>([]);
  const [selectedStorageId, setSelectedStorageId] = useState<string>('');
  const [amount, setAmount] = useState<number>(0);
  const [unit, setUnit] = useState<'Fuhren' | 'm³' | 't'>('Fuhren');
  const [date, setDate] = useState<string>(new Date().toISOString().substring(0, 10));
  const [selectedFieldIds, setSelectedFieldIds] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState('');

  useEffect(() => {
      const load = async () => {
          const cats = await dbService.getEquipmentCategories();
          const fertCats = cats.filter(c => c.parentType === ActivityType.FERTILIZATION);
          setCategories(fertCats);
          if (fertCats.length > 0) setSelectedCategory(fertCats[0].name);
      };
      load();
  }, []);

  const availableStorages = useMemo(() => {
      // Wenn die Kategorie "Mist" im Namen hat, zeige Mistlager, sonst Gülle
      const isManureType = selectedCategory.toLowerCase().includes('mist') || selectedCategory.toLowerCase().includes('fest');
      return storages.filter(s => isManureType ? s.type === FertilizerType.MANURE : s.type === FertilizerType.SLURRY);
  }, [storages, selectedCategory]);

  useEffect(() => {
      if (availableStorages.length > 0 && !availableStorages.find(s => s.id === selectedStorageId)) {
          setSelectedStorageId(availableStorages[0].id);
      }
  }, [availableStorages, selectedStorageId]);

  const toggleField = (fieldId: string) => {
    const next = new Set(selectedFieldIds);
    if (next.has(fieldId)) next.delete(fieldId); else next.add(fieldId);
    setSelectedFieldIds(next);
  };

  const handleSave = () => {
    const isManure = selectedCategory.toLowerCase().includes('mist') || selectedCategory.toLowerCase().includes('fest');
    const loadSize = settings ? (isManure ? settings.manureLoadSize : settings.slurryLoadSize) : 10;
    const totalVolume = unit === 'Fuhren' ? amount * loadSize : amount;
    const totalLoads = unit === 'Fuhren' ? amount : Math.round(totalVolume / loadSize);
    
    const selectedFields = fields.filter(f => selectedFieldIds.has(f.id));
    const totalArea = selectedFields.reduce((sum, f) => sum + f.areaHa, 0);
    const fieldDist: Record<string, number> = {};
    if (totalArea > 0) selectedFields.forEach(f => fieldDist[f.id] = Math.round((f.areaHa / totalArea) * totalVolume * 10) / 10);

    const finalIsoDate = getSmartDateISO(date);
    const storageDist: Record<string, number> = selectedStorageId ? { [selectedStorageId]: totalVolume } : {};

    const record: ActivityRecord = {
      id: Math.random().toString(36).substr(2, 9),
      date: finalIsoDate,
      type: ActivityType.FERTILIZATION,
      fertilizerType: isManure ? FertilizerType.MANURE : FertilizerType.SLURRY,
      tillageType: selectedCategory, // Wir nutzen hier den Namen der Gruppe
      fieldIds: Array.from(selectedFieldIds),
      amount: totalVolume,
      unit: unit === 't' ? 't' : 'm³',
      loadCount: totalLoads,
      fieldDistribution: fieldDist,
      storageDistribution: Object.keys(storageDist).length > 0 ? storageDist : undefined,
      notes: notes,
      year: new Date(finalIsoDate).getFullYear()
    };
    onSave(record, [`Menge: ${totalVolume} ${record.unit}`, `Typ: ${selectedCategory}`]);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-white flex flex-col h-full">
        <div className="bg-amber-600 p-4 text-white shrink-0"><button onClick={onCancel} className="flex items-center text-white/80 mb-2 text-sm font-bold"><ChevronLeft className="mr-1" size={16}/> Zurück</button><h2 className="text-xl font-bold flex items-center"><Truck className="mr-2" size={24} /> Düngung erfassen</h2></div>
        <div className="p-4 space-y-4 pb-20 flex-1 overflow-y-auto">
            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Düngungs-Art / Gruppe</label>
                <div className="relative">
                    <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} className="w-full p-3 pl-10 border rounded-lg font-bold bg-white outline-none appearance-none">
                        {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                </div>
            </div>
            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Quelle (Lager)</label>
                <div className="relative">
                    <select value={selectedStorageId} onChange={e => setSelectedStorageId(e.target.value)} className="w-full p-3 pl-10 border rounded-lg font-bold bg-white appearance-none">
                        {availableStorages.map(s => <option key={s.id} value={s.id}>{s.name} ({s.currentLevel.toFixed(0)} m³)</option>)}
                        {availableStorages.length === 0 && <option value="">Kein passendes Lager</option>}
                    </select>
                    <Database className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                </div>
            </div>
            <div className="flex space-x-2">
                <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Menge</label>
                    <input type="number" value={amount || ''} onChange={e => setAmount(parseFloat(e.target.value))} className="w-full border p-3 rounded-lg font-bold text-lg" placeholder="0" />
                </div>
                <div className="w-24">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Einheit</label>
                    <select value={unit} onChange={e => setUnit(e.target.value as any)} className="w-full border p-3 rounded-lg bg-slate-50 font-bold">
                        <option value="Fuhren">Fuhren</option>
                        <option value="m³">m³</option>
                        <option value="t">t</option>
                    </select>
                </div>
            </div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Datum</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border p-3 rounded-lg font-bold" /></div>
            <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Felder wählen</label>
                <div className="border rounded-xl max-h-48 overflow-y-auto divide-y bg-slate-50">
                    {fields.map(f => (<div key={f.id} onClick={() => toggleField(f.id)} className={`p-3 flex items-center cursor-pointer transition-colors ${selectedFieldIds.has(f.id) ? 'bg-amber-50' : 'bg-white'}`}><div className={`mr-3 ${selectedFieldIds.has(f.id) ? 'text-amber-600' : 'text-slate-300'}`}>{selectedFieldIds.has(f.id) ? <CheckSquare size={20}/> : <Square size={20}/>}</div><div className="flex-1"><div className="font-bold text-sm text-slate-700">{f.name}</div><div className="text-[10px] text-slate-400 uppercase font-bold">{f.areaHa.toFixed(2)} ha • {f.usage}</div></div></div>))}
                </div>
            </div>
            <div>
                 <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Anmerkungen</label>
                 <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border p-3 rounded-lg text-sm" rows={2} placeholder="Optional..."/>
            </div>
            <button onClick={handleSave} disabled={amount <= 0 || selectedFieldIds.size === 0} className="w-full bg-green-600 text-white py-4 rounded-xl font-black shadow-lg shadow-green-100 disabled:opacity-50 mt-4 uppercase tracking-widest">Aktivität Speichern</button>
        </div>
    </div>
  );
};

export const HarvestForm: React.FC<BaseFormProps> = ({ fields, onCancel, onSave, onNavigate }) => {
    const [selectedType, setSelectedType] = useState<string>('');
    const [categories, setCategories] = useState<EquipmentCategory[]>([]);
    const [amount, setAmount] = useState<number>(0);
    const [date, setDate] = useState<string>(new Date().toISOString().substring(0, 10));
    const [selectedFieldIds, setSelectedFieldIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        const load = async () => {
            const cats = await dbService.getEquipmentCategories();
            const harvestCats = cats.filter(c => c.parentType === ActivityType.HARVEST);
            setCategories(harvestCats);
            if (harvestCats.length > 0) setSelectedType(harvestCats[0].name);
        };
        load();
    }, []);

    const handleSave = () => {
        const finalIsoDate = getSmartDateISO(date);
        const record: ActivityRecord = {
            id: Math.random().toString(36).substr(2, 9),
            date: finalIsoDate,
            type: ActivityType.HARVEST,
            tillageType: selectedType,
            fieldIds: Array.from(selectedFieldIds),
            amount: amount,
            unit: 'Stk',
            notes: `${selectedType}`,
            year: new Date(finalIsoDate).getFullYear()
        };
        onSave(record, [`Menge: ${amount} Stk`, `Art: ${selectedType}`]);
    };

    return (
        <div className="flex-1 overflow-y-auto bg-white flex flex-col h-full">
            <div className="bg-yellow-500 p-4 text-white shrink-0"><button onClick={onCancel} className="flex items-center text-white/80 mb-2 text-sm font-bold"><ChevronLeft className="mr-1" size={16}/> Zurück</button><h2 className="text-xl font-bold flex items-center"><Wheat className="mr-2" size={24} /> Ernte erfassen</h2></div>
            <div className="p-4 space-y-4 pb-20">
                <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Erntegut / Typ</label><select value={selectedType} onChange={e => setSelectedType(e.target.value)} className="w-full p-3 border rounded-lg font-bold bg-white">{categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select></div>
                <div className="flex space-x-2"><div className="flex-1"><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Menge (Ballen/Stk)</label><input type="number" value={amount || ''} onChange={e => setAmount(parseFloat(e.target.value))} className="w-full border p-3 rounded-lg font-bold" /></div><div className="flex-1"><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Datum</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border p-3 rounded-lg font-bold" /></div></div>
                <div className="border rounded-xl max-h-60 overflow-y-auto divide-y bg-slate-50">{fields.map(f => (<div key={f.id} onClick={() => { const n = new Set(selectedFieldIds); if(n.has(f.id)) n.delete(f.id); else n.add(f.id); setSelectedFieldIds(n); }} className={`p-3 flex items-center cursor-pointer ${selectedFieldIds.has(f.id) ? 'bg-lime-50' : 'bg-white'}`}><div className={`mr-3 ${selectedFieldIds.has(f.id) ? 'text-lime-600' : 'text-slate-300'}`}>{selectedFieldIds.has(f.id) ? <CheckSquare size={20}/> : <Square size={20}/>}</div><div className="flex-1 font-bold text-sm text-slate-700">{f.name}</div></div>))}</div>
                <button onClick={handleSave} disabled={amount <= 0 || selectedFieldIds.size === 0} className="w-full bg-green-600 text-white py-4 rounded-xl font-black shadow-lg uppercase tracking-widest">Speichern</button>
            </div>
        </div>
    );
};

export const TillageForm: React.FC<BaseFormProps> = ({ fields, onCancel, onSave, onNavigate }) => {
    const [tillageType, setTillageType] = useState<string>('');
    const [categories, setCategories] = useState<EquipmentCategory[]>([]);
    const [date, setDate] = useState<string>(new Date().toISOString().substring(0, 10));
    const [selectedFieldIds, setSelectedFieldIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        const load = async () => {
            const cats = await dbService.getEquipmentCategories();
            const tillageCats = cats.filter(c => c.parentType === ActivityType.TILLAGE);
            setCategories(tillageCats);
            if (tillageCats.length > 0) setTillageType(tillageCats[0].name);
        };
        load();
    }, []);

    const handleSave = () => {
        const selectedFields = fields.filter(f => selectedFieldIds.has(f.id));
        const totalArea = selectedFields.reduce((sum, f) => sum + f.areaHa, 0);
        const finalIsoDate = getSmartDateISO(date);
        onSave({ id: Math.random().toString(36).substr(2, 9), date: finalIsoDate, type: ActivityType.TILLAGE, tillageType: tillageType, fieldIds: Array.from(selectedFieldIds), amount: parseFloat(totalArea.toFixed(2)), unit: 'ha', year: new Date(finalIsoDate).getFullYear() }, [`Art: ${tillageType}`, `Fläche: ${totalArea.toFixed(2)} ha`]);
    };

    return (
        <div className="flex-1 overflow-y-auto bg-white flex flex-col h-full">
            <div className="bg-blue-600 p-4 text-white shrink-0"><button onClick={onCancel} className="flex items-center text-white/80 mb-2 text-sm font-bold"><ChevronLeft className="mr-1" size={16}/> Zurück</button><h2 className="text-xl font-bold flex items-center"><Hammer className="mr-2" size={24} /> Bodenbearbeitung</h2></div>
            <div className="p-4 space-y-4 pb-20">
                <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tätigkeit / Typ</label><select value={tillageType} onChange={e => setTillageType(e.target.value)} className="w-full border p-3 rounded-lg font-bold bg-white">{categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select></div>
                <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Datum</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border p-3 rounded-lg font-bold" /></div>
                <div className="border rounded-xl max-h-60 overflow-y-auto divide-y bg-slate-50">{fields.map(f => (<div key={f.id} onClick={() => { const n = new Set(selectedFieldIds); if(n.has(f.id)) n.delete(f.id); else n.add(f.id); setSelectedFieldIds(n); }} className={`p-3 flex items-center cursor-pointer ${selectedFieldIds.has(f.id) ? 'bg-blue-50' : 'bg-white'}`}><div className={`mr-3 ${selectedFieldIds.has(f.id) ? 'text-blue-600' : 'text-slate-300'}`}>{selectedFieldIds.has(f.id) ? <CheckSquare size={20}/> : <Square size={20}/>}</div><div className="flex-1 font-bold text-sm text-slate-700">{f.name}</div></div>))}</div>
                <button onClick={handleSave} disabled={selectedFieldIds.size === 0 || !tillageType} className="w-full bg-green-600 text-white py-4 rounded-xl font-black shadow-lg uppercase tracking-widest">Speichern</button>
            </div>
        </div>
    );
};

