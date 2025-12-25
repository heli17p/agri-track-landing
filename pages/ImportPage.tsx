
import React, { useState, useEffect } from 'react';
import { Upload, FileUp, AlertTriangle, ChevronLeft, Loader2, CheckCircle, RefreshCw, CopyPlus, CheckSquare, Square, AlertCircle, Table, Eye } from 'lucide-react';
import { Field, GeoPoint } from '../types';
import { dbService, generateId } from '../services/db';

interface ImportCandidate {
    tempId: string; // internal id for list handling
    name: string;
    area: number;
    type: string;
    usage: string;
    codes: string;
    geometry: GeoPoint[];
    status: 'NEW' | 'EXISTS';
    selected: boolean;
}

export const ImportPage = ({ onBack }: { onBack?: () => void }) => {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isLibReady, setIsLibReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Raw parsed shapefile data
  const [rawData, setRawData] = useState<any[]>([]);
  
  // Analyzed candidates for selection step
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  
  // Duplicate handling strategy for the selected items
  const [duplicateStrategy, setDuplicateStrategy] = useState<'update' | 'create'>('update');

  const [importStats, setImportStats] = useState({ imported: 0, skipped: 0, updated: 0 });
  
  // Mapping state
  const [columnMap, setColumnMap] = useState({
    name: 'FSNAME',
    area: 'FLAECHE_NE',
    type: 'FNAR_CODE',
    usage: 'SNAR',
    codes: 'CODES'
  });
  
  const [offset, setOffset] = useState({ n: -133, e: -55 });

  // Check and load library if missing
  useEffect(() => {
    const checkLib = () => {
        if ((window as any).shp) {
            setIsLibReady(true);
        } else {
            const script = document.createElement('script');
            script.src = "https://unpkg.com/shpjs@latest/dist/shp.js";
            script.onload = () => setIsLibReady(true);
            script.onerror = () => setError("Bibliothek konnte nicht geladen werden. Bitte Internetverbindung prüfen.");
            document.body.appendChild(script);
        }
    };
    const t = setTimeout(checkLib, 500);
    return () => clearTimeout(t);
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setIsLoading(true);
      setError(null);

      try {
        const buffer = await file.arrayBuffer();
        const shp = (window as any).shp;
        if (!shp) throw new Error("Shapefile parser noch nicht bereit.");

        let geojson: any = await shp(buffer);
        if (Array.isArray(geojson)) geojson = geojson[0];

        if (!geojson || !geojson.features) throw new Error("Keine gültigen Geometriedaten gefunden.");

        const parsedData = geojson.features.map((f: any) => {
            let geometry: GeoPoint[] = [];
            if (f.geometry && f.geometry.type === 'Polygon') {
                geometry = f.geometry.coordinates[0].map((c: number[]) => ({ lat: c[1], lng: c[0] }));
            } else if (f.geometry && f.geometry.type === 'MultiPolygon') {
                 if (f.geometry.coordinates[0] && f.geometry.coordinates[0][0]) {
                     geometry = f.geometry.coordinates[0][0].map((c: number[]) => ({ lat: c[1], lng: c[0] }));
                 }
            }
            return { ...f.properties, geometry: geometry };
        });

        setRawData(parsedData);
        setStep(2); // Go to column mapping

        // Auto-detect columns
        if (parsedData.length > 0) {
            const keys = Object.keys(parsedData[0]);
            const findKey = (candidates: string[]) => {
                for (const c of candidates) {
                    const exact = keys.find(k => k.toUpperCase() === c.toUpperCase());
                    if (exact) return exact;
                    const partial = keys.find(k => k.toUpperCase().includes(c.toUpperCase()));
                    if (partial) return partial;
                }
                return '';
            };
            setColumnMap({
                name: findKey(['FSNAME', 'NAME', 'BEZEICHNUNG']) || columnMap.name,
                area: findKey(['FLAECHE_NE', 'FLAECHE', 'AREA', 'FLACHE']) || columnMap.area,
                type: findKey(['FNAR_CODE', 'FNAR', 'ART', 'TYPE']) || columnMap.type,
                usage: findKey(['SNAR', 'NUTZUNG', 'USAGE']) || columnMap.usage,
                codes: findKey(['CODES', 'CODE', 'BEMERKUNG']) || columnMap.codes
            });
        }
      } catch (err: any) {
          console.error(err);
          setError(err.message || "Fehler beim Lesen der Datei.");
      } finally {
          setIsLoading(false);
      }
    }
  };

  // Analyze Data against DB and prepare selection list
  const analyzeAndPrepare = async () => {
      setIsLoading(true);
      const existingFields = await dbService.getFields();
      const existingNames = new Set(existingFields.map(f => f.name.toLowerCase().trim()));

      const latOffsetDeg = offset.n / 111132;
      const lngOffsetDeg = offset.e / 74000;

      const prepared: ImportCandidate[] = rawData.map((row, idx) => {
          const name = String(row[columnMap.name] || `Feld ${idx + 1}`).trim();
          const exists = existingNames.has(name.toLowerCase());
          
          const geom = row.geometry.map((p: GeoPoint) => ({
             lat: p.lat + latOffsetDeg, 
             lng: p.lng + lngOffsetDeg 
          }));

          const typeRaw = row[columnMap.type];
          const isAcker = typeRaw === 'AL' || (typeof typeRaw === 'string' && typeRaw.toLowerCase().includes('acker'));

          return {
              tempId: `row-${idx}`,
              name: name,
              area: typeof row[columnMap.area] === 'number' ? row[columnMap.area] : parseFloat(row[columnMap.area] || '0'),
              type: isAcker ? 'Acker' : 'Grünland',
              usage: row[columnMap.usage] || '',
              codes: row[columnMap.codes] || '',
              geometry: geom,
              status: exists ? 'EXISTS' : 'NEW',
              // Select NEW by default, Deselect EXISTS by default (safety)
              selected: !exists 
          };
      });

      setCandidates(prepared);
      setStep(3); // Go to selection
      setIsLoading(false);
  };

  const toggleCandidate = (tempId: string) => {
      setCandidates(prev => prev.map(c => c.tempId === tempId ? { ...c, selected: !c.selected } : c));
  };

  const toggleAll = (select: boolean) => {
      setCandidates(prev => prev.map(c => ({ ...c, selected: select })));
  };

  const executeImport = async () => {
    setIsLoading(true);
    const existingFields = await dbService.getFields();
    
    let imported = 0;
    let updated = 0;
    let skipped = 0;

    // We only process selected candidates
    const toProcess = candidates.filter(c => c.selected);
    const unselected = candidates.filter(c => !c.selected).length;
    skipped = unselected;

    for (const cand of toProcess) {
        // Check DB again to be sure (though we checked in analyze step)
        const dbField = existingFields.find(f => f.name.toLowerCase().trim() === cand.name.toLowerCase().trim());

        if (dbField) {
            // It's a duplicate
            if (duplicateStrategy === 'update') {
                const updatedField: Field = {
                    ...dbField,
                    areaHa: cand.area,
                    type: cand.type as 'Acker' | 'Grünland',
                    usage: cand.usage,
                    codes: cand.codes,
                    boundary: cand.geometry
                };
                await dbService.saveField(updatedField);
                updated++;
            } else {
                // Create as NEW (Duplicate)
                const newField: Field = {
                    id: generateId(),
                    name: cand.name, // Name stays same, ID differs
                    areaHa: cand.area,
                    type: cand.type as 'Acker' | 'Grünland',
                    usage: cand.usage,
                    boundary: cand.geometry,
                    codes: cand.codes
                };
                await dbService.saveField(newField);
                imported++;
            }
        } else {
            // Truly NEW
            const newField: Field = {
                id: generateId(),
                name: cand.name,
                areaHa: cand.area,
                type: cand.type as 'Acker' | 'Grünland',
                usage: cand.usage,
                boundary: cand.geometry,
                codes: cand.codes
            };
            await dbService.saveField(newField);
            imported++;
        }
    }

    setImportStats({ imported, updated, skipped });
    setIsLoading(false);
    setStep(4); // Summary
  };

  const handleFinish = () => {
      setStep(1);
      setRawData([]);
      if (onBack) onBack();
  };

  // Helper to determine if a column is currently mapped to something
  const getMappingForColumn = (columnName: string) => {
    return Object.entries(columnMap).find(([_, mappedName]) => mappedName === columnName);
  };

  return (
    <div className="p-4 bg-white h-full overflow-y-auto">
        <div className="flex items-center mb-4 sticky top-0 bg-white z-10 py-2 border-b border-slate-100">
            {onBack && step !== 4 && (
                <button onClick={onBack} className="mr-3 p-2 rounded-full hover:bg-slate-100 text-slate-600">
                    <ChevronLeft size={24} />
                </button>
            )}
            <h2 className="text-xl font-bold">Daten Import</h2>
        </div>

        {step === 1 && (
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center justify-center bg-slate-50 transition-colors hover:bg-slate-100 relative min-h-[300px]">
                {isLoading ? (
                    <div className="flex flex-col items-center text-green-600">
                        <Loader2 size={48} className="animate-spin mb-4" />
                        <p>Verarbeite Shapefile...</p>
                    </div>
                ) : !isLibReady ? (
                    <div className="flex flex-col items-center text-slate-500">
                        <Loader2 size={32} className="animate-spin mb-2" />
                        <p>Lade Bibliothek...</p>
                    </div>
                ) : (
                    <>
                        <Upload size={48} className="text-slate-400 mb-4" />
                        <p className="mb-4 text-center text-slate-600 font-medium">eAMA Shapefile (.zip) auswählen</p>
                        <input type="file" accept=".zip" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                        <button className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-full text-sm font-semibold pointer-events-none">Datei wählen</button>
                    </>
                )}
                {error && <div className="mt-4 text-red-500 text-sm bg-red-50 p-2 rounded"><AlertTriangle size={16} className="inline mr-2"/> {error}</div>}
            </div>
        )}

        {step === 2 && (
            <div className="space-y-6 pb-20">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 shadow-sm">
                    <h3 className="font-semibold mb-3 text-blue-900 flex items-center">
                        <span className="bg-blue-200 text-blue-800 w-6 h-6 rounded-full flex items-center justify-center text-xs mr-2">1</span>
                        Spaltenzuordnung
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        {[
                            { key: 'name', label: 'Feld Name' },
                            { key: 'area', label: 'Fläche (ha)' },
                            { key: 'type', label: 'Feldart' },
                            { key: 'usage', label: 'Nutzung' },
                            { key: 'codes', label: 'Codes' }
                        ].map((field) => (
                             <div key={field.key}>
                                <label className="block text-slate-600 mb-1 font-bold">
                                    {field.label}
                                </label>
                                <select 
                                    className="w-full border border-blue-200 p-2 rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium" 
                                    value={(columnMap as any)[field.key]} 
                                    onChange={e => setColumnMap({...columnMap, [field.key]: e.target.value})}
                                >
                                    <option value="">-- Nicht importieren --</option>
                                    {rawData.length > 0 && Object.keys(rawData[0]).filter(k => k !== 'geometry').map(k => (
                                        <option key={k} value={k}>{k}</option>
                                    ))}
                                </select>
                            </div>
                        ))}
                    </div>
                </div>

                {/* NEU: DATEN-VORSCHAU TABELLE */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="bg-slate-50 p-3 border-b border-slate-200 flex justify-between items-center">
                        <h3 className="text-xs font-black uppercase text-slate-500 tracking-widest flex items-center">
                            <Table size={14} className="mr-2"/> Vorschau der Dateiinhalte (Top 5)
                        </h3>
                        <div className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-bold uppercase">
                            Rohdaten
                        </div>
                    </div>
                    
                    <div className="overflow-x-auto max-w-full">
                        <table className="min-w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    {rawData.length > 0 && Object.keys(rawData[0]).filter(k => k !== 'geometry').map(key => {
                                        const mapping = getMappingForColumn(key);
                                        return (
                                            <th key={key} className={`p-2 text-[10px] font-black uppercase whitespace-nowrap border-r border-slate-100 last:border-0 ${mapping ? 'bg-blue-100/50 text-blue-800' : 'text-slate-400'}`}>
                                                <div className="flex flex-col">
                                                    {mapping && (
                                                        <span className="text-[8px] bg-blue-600 text-white px-1 py-0.5 rounded mb-1 w-fit">
                                                            → {mapping[0] === 'name' ? 'FELD NAME' : mapping[0] === 'area' ? 'FLÄCHE' : mapping[0] === 'type' ? 'ART' : mapping[0] === 'usage' ? 'NUTZUNG' : 'CODES'}
                                                        </span>
                                                    )}
                                                    {key}
                                                </div>
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {rawData.slice(0, 5).map((row, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                        {Object.keys(row).filter(k => k !== 'geometry').map(key => {
                                            const mapping = getMappingForColumn(key);
                                            return (
                                                <td key={key} className={`p-2 text-xs font-medium truncate max-w-[120px] border-r border-slate-100 last:border-0 ${mapping ? 'bg-blue-50/30 font-bold text-slate-800' : 'text-slate-500'}`}>
                                                    {row[key]}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {rawData.length > 5 && (
                        <div className="p-2 text-center text-[10px] text-slate-400 italic bg-slate-50/50 border-t border-slate-100">
                            + {rawData.length - 5} weitere Zeilen in der Datei vorhanden...
                        </div>
                    )}
                </div>

                <div className="bg-amber-50 p-4 rounded-lg border border-amber-100 shadow-sm">
                    <h3 className="font-semibold mb-2 text-amber-900 flex items-center">
                        <span className="bg-amber-200 text-amber-800 w-6 h-6 rounded-full flex items-center justify-center text-xs mr-2">2</span>
                        Geometrie Korrektur
                    </h3>
                    <div className="flex space-x-4">
                        <div>
                            <label className="block text-xs font-bold text-amber-800">Nord/Süd (m)</label>
                            <input type="number" value={offset.n} onChange={e => setOffset({...offset, n: parseInt(e.target.value) || 0})} className="border border-amber-200 p-2 w-24 rounded-lg font-bold outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-amber-800">Ost/West (m)</label>
                            <input type="number" value={offset.e} onChange={e => setOffset({...offset, e: parseInt(e.target.value) || 0})} className="border border-amber-200 p-2 w-24 rounded-lg font-bold outline-none" />
                        </div>
                    </div>
                    <p className="mt-2 text-[10px] text-amber-600 font-medium italic">Standard-Verschiebung für eAMA Shapefiles bereits voreingestellt.</p>
                </div>

                <button onClick={analyzeAndPrepare} disabled={isLoading} className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold flex items-center justify-center shadow-lg hover:bg-blue-700 active:scale-[0.98] transition-all">
                   {isLoading ? <Loader2 className="animate-spin mr-2"/> : <FileUp className="mr-2" size={20}/>} 
                   Vorschau & Auswahl
                </button>
            </div>
        )}

        {step === 3 && (
            <div className="flex flex-col h-full pb-24">
                <div className="mb-4 space-y-4">
                    <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <div className="flex space-x-2">
                             <button onClick={() => toggleAll(true)} className="text-xs font-bold text-blue-600 hover:underline">Alle</button>
                             <span className="text-slate-300">|</span>
                             <button onClick={() => toggleAll(false)} className="text-xs font-bold text-slate-500 hover:underline">Keine</button>
                        </div>
                        <div className="text-xs text-slate-500">
                            {candidates.filter(c => c.selected).length} von {candidates.length} ausgewählt
                        </div>
                    </div>
                    
                    {/* Duplicate Strategy for Selected Items */}
                    <div className="bg-orange-50 p-3 rounded-lg border border-orange-100">
                        <label className="block text-xs font-bold text-orange-800 mb-2 flex items-center">
                            <AlertCircle size={12} className="mr-1"/> Umgang mit ausgewählten Duplikaten:
                        </label>
                        <div className="flex space-x-2">
                             <button 
                                onClick={() => setDuplicateStrategy('update')}
                                className={`flex-1 py-2 rounded text-xs font-bold border ${duplicateStrategy === 'update' ? 'bg-white border-orange-400 text-orange-700 shadow-sm' : 'border-transparent text-slate-500 hover:bg-white/50'}`}
                             >
                                 <RefreshCw size={14} className="inline mr-1"/> Aktualisieren
                             </button>
                             <button 
                                onClick={() => setDuplicateStrategy('create')}
                                className={`flex-1 py-2 rounded text-xs font-bold border ${duplicateStrategy === 'create' ? 'bg-white border-orange-400 text-orange-700 shadow-sm' : 'border-transparent text-slate-500 hover:bg-white/50'}`}
                             >
                                 <CopyPlus size={14} className="inline mr-1"/> Als Neu (Kopie)
                             </button>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto border rounded-xl bg-slate-50">
                    {candidates.map(cand => (
                        <div 
                            key={cand.tempId} 
                            onClick={() => toggleCandidate(cand.tempId)}
                            className={`flex items-center p-3 border-b border-slate-100 cursor-pointer hover:bg-white transition-colors ${cand.selected ? 'bg-white' : 'opacity-60 grayscale'}`}
                        >
                            <div className={`mr-3 ${cand.selected ? 'text-blue-600' : 'text-slate-300'}`}>
                                {cand.selected ? <CheckSquare size={20} /> : <Square size={20} />}
                            </div>
                            <div className="flex-1">
                                <div className="flex justify-between items-center">
                                    <span className="font-bold text-sm text-slate-800">{cand.name}</span>
                                    {cand.status === 'EXISTS' ? (
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-200">
                                            Existiert
                                        </span>
                                    ) : (
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-100 text-green-700 border border-green-200">
                                            Neu
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-slate-500 flex items-center space-x-2 mt-1">
                                    <span>{cand.area.toFixed(2)} ha</span>
                                    <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                                    <span>{cand.type}</span>
                                    {cand.codes && (
                                        <>
                                          <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                                          <span className="text-blue-500 truncate max-w-[150px]">{cand.codes}</span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <button onClick={executeImport} disabled={candidates.filter(c => c.selected).length === 0 || isLoading} className="mt-4 w-full bg-green-600 text-white py-4 rounded-xl font-bold flex items-center justify-center shadow-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
                   {isLoading ? <Loader2 className="animate-spin mr-2"/> : <FileUp className="mr-2" size={20}/>} 
                   Auswahl Importieren ({candidates.filter(c => c.selected).length})
                </button>
            </div>
        )}

        {step === 4 && (
            <div className="flex flex-col items-center justify-center pt-10 text-center">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6 text-green-600">
                    <CheckCircle size={48} />
                </div>
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Import Erfolgreich!</h2>
                <div className="bg-slate-50 rounded-xl p-6 w-full max-w-sm mb-8 border border-slate-100 space-y-3">
                    <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                        <span className="text-slate-600 font-medium">Neu angelegt</span>
                        <span className="font-bold text-green-600 text-xl">{importStats.imported}</span>
                    </div>
                    {importStats.updated > 0 && (
                        <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                            <span className="text-slate-600 font-medium">Aktualisiert</span>
                            <span className="font-bold text-blue-600 text-xl">{importStats.updated}</span>
                        </div>
                    )}
                    {importStats.skipped > 0 && (
                        <div className="flex justify-between items-center text-slate-400">
                            <span className="text-sm">Nicht ausgewählt</span>
                            <span className="font-bold">{importStats.skipped}</span>
                        </div>
                    )}
                </div>
                <button onClick={handleFinish} className="w-full max-w-sm bg-slate-800 text-white py-4 rounded-xl font-bold shadow-lg">Zurück zur Liste</button>
            </div>
        )}
    </div>
  );
};

