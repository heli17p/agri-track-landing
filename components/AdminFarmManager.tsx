
import React, { useState, useEffect } from 'react';
import { dbService } from '../services/db';
import { Trash2, RefreshCw, Search, AlertTriangle, ShieldCheck, User, AlertOctagon, Terminal } from 'lucide-react';

const getErrorMessage = (e: any): string => {
    const msg = e?.message || String(e);
    if (msg.includes("permission") || msg.includes("Missing or insufficient permissions")) {
        return "Zugriff verweigert. Die Datenbank erlaubt das Auflisten aller Höfe nicht (Sicherheitsregel). Bitte nutzen Sie die SUCHE unten.";
    }
    if (msg.includes("offline")) return "Offline. Bitte Internetverbindung prüfen.";
    if (msg.includes("deadline")) return "Zeitüberschreitung. Verbindung zu langsam.";
    
    if (msg.includes("Failed to get documents from server")) {
        return "Zugriff blockiert oder Netzwerkfehler. Bitte nutzen Sie die SUCHE.";
    }
    
    return msg;
};

export const AdminFarmManager: React.FC = () => {
    const [farms, setFarms] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchMode, setSearchMode] = useState(false);

    // Initial load disabled to prevent immediate error
    // useEffect(() => { loadFarms(); }, []);

    const loadAllFarms = async () => {
        setLoading(true);
        setError(null);
        setSearchMode(false);
        try {
            const list = await dbService.adminGetAllFarms();
            setFarms(list);
        } catch (e: any) {
            console.error("Admin Load Error:", e);
            setError(getErrorMessage(e));
            setFarms([]);
        } finally {
            setLoading(false);
        }
    };

    const handleServerSearch = async () => {
        if (!searchTerm.trim()) {
            loadAllFarms();
            return;
        }
        
        setLoading(true);
        setError(null);
        setSearchMode(true);
        try {
            // Use findFarmConflicts which performs a query by ID (allowed by rules usually)
            const results = await dbService.findFarmConflicts(searchTerm.trim());
            
            // Map conflict result format to admin table format
            const mapped = results.map((r: any) => ({
                docId: r.docId,
                farmId: r.farmIdStored,
                farmIdType: r.farmIdType,
                ownerEmail: r.email || 'Unbekannt',
                hasPin: r.hasPin,
                updatedAt: r.updatedAt
            }));
            
            setFarms(mapped);
            if (mapped.length === 0) setError(`Keine Einträge für ID '${searchTerm}' gefunden.`);
        } catch (e: any) {
            setError(getErrorMessage(e));
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (docId: string, farmId: string) => {
        if (!confirm(`WARNUNG: Möchten Sie den Einstellungs-Eintrag für Farm '${farmId}' (Doc: ${docId}) wirklich löschen?`)) return;
        
        try {
            await dbService.deleteSettingsDoc(docId);
            // Refresh based on current mode
            if (searchMode) {
                handleServerSearch();
            } else {
                loadAllFarms();
            }
        } catch (e: any) {
            alert(`Fehler: ${e.message}`);
        }
    };

    return (
        <div className="bg-slate-900 p-6 h-full flex flex-col">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center">
                        <ShieldCheck className="mr-2 text-green-500" /> Hof Manager
                    </h2>
                    <p className="text-slate-400 text-sm mt-1">
                        Verwaltung der Hof-Einstellungen in der Cloud.
                    </p>
                </div>
                
                <div className="flex space-x-2 w-full md:w-auto">
                    <button 
                        onClick={loadAllFarms} 
                        disabled={loading}
                        className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg font-bold flex items-center transition-colors text-sm"
                    >
                        <RefreshCw className={`mr-2 h-4 w-4 ${loading && !searchMode ? 'animate-spin' : ''}`} />
                        Alle Laden (Admin)
                    </button>
                </div>
            </div>

            {/* Search Bar - SERVER SIDE */}
            <div className="mb-6 bg-slate-800 p-4 rounded-xl border border-slate-700">
                <label className="block text-slate-400 text-xs font-bold uppercase mb-2">Gezielte Suche (Server-Query)</label>
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                            type="text" 
                            placeholder="Farm ID eingeben (z.B. 2421798)..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleServerSearch()}
                            className="w-full bg-slate-900 border border-slate-600 text-white pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                        />
                    </div>
                    <button 
                        onClick={handleServerSearch}
                        disabled={loading}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold flex items-center shadow-lg transition-colors"
                    >
                        {loading && searchMode ? <RefreshCw className="animate-spin mr-2 h-4 w-4"/> : <Search className="mr-2 h-4 w-4"/>}
                        Suchen
                    </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-2 flex items-center">
                    <Terminal size={10} className="mr-1"/>
                    Tipp: Nutzen Sie die Suche, wenn "Alle Laden" aufgrund fehlender Berechtigungen fehlschlägt.
                </p>
            </div>

            {/* Error Banner */}
            {error && (
                <div className={`border p-4 rounded-xl mb-4 flex items-start ${error.includes("Keine Einträge") ? 'bg-slate-800 border-slate-600 text-slate-300' : 'bg-red-900/30 border-red-500/50 text-red-200'}`}>
                    {error.includes("Keine Einträge") ? <Search className="shrink-0 mr-3 mt-0.5"/> : <AlertOctagon className="shrink-0 mr-3 mt-0.5" />}
                    <div>
                        <h4 className="font-bold">{error.includes("Keine Einträge") ? "Info" : "Meldung"}</h4>
                        <p className="text-sm">{error}</p>
                    </div>
                </div>
            )}

            {/* List */}
            <div className="flex-1 overflow-y-auto bg-slate-800 rounded-xl border border-slate-700 relative">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-900 text-slate-400 text-xs uppercase sticky top-0 z-10 shadow-md">
                        <tr>
                            <th className="p-4 border-b border-slate-700 w-[120px]">Farm ID</th>
                            <th className="p-4 border-b border-slate-700 w-[100px]">Typ</th>
                            <th className="p-4 border-b border-slate-700">Besitzer / Email</th>
                            <th className="p-4 border-b border-slate-700 w-[80px]">PIN?</th>
                            <th className="p-4 border-b border-slate-700 hidden md:table-cell">User UID (Doc ID)</th>
                            <th className="p-4 border-b border-slate-700 text-right">Aktion</th>
                        </tr>
                    </thead>
                    <tbody className="text-sm text-slate-300 divide-y divide-slate-700">
                        {farms.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="p-12 text-center text-slate-500">
                                    {loading 
                                        ? <div className="flex items-center justify-center"><RefreshCw className="animate-spin mr-2"/> Lade Daten...</div> 
                                        : 'Liste leer. Bitte Suche nutzen oder "Alle Laden" klicken.'}
                                </td>
                            </tr>
                        ) : (
                            farms.map((farm) => (
                                <tr key={farm.docId} className="hover:bg-slate-700/50 transition-colors group">
                                    <td className="p-4 font-bold text-white font-mono bg-slate-800/30">{farm.farmId}</td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${farm.farmIdType === 'string' ? 'bg-blue-900/30 text-blue-300 border-blue-800' : 'bg-orange-900/30 text-orange-300 border-orange-800'}`}>
                                            {farm.farmIdType === 'string' ? 'TEXT' : 'ZAHL'}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex items-center">
                                            <User size={14} className="mr-2 text-slate-500"/>
                                            <span className={farm.ownerEmail === 'Unbekannt' ? 'text-red-400 italic' : 'text-green-400 font-medium'}>
                                                {farm.ownerEmail}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        {farm.hasPin ? (
                                            <span className="text-green-500 font-bold flex items-center"><ShieldCheck size={14} className="mr-1"/> JA</span>
                                        ) : (
                                            <span className="text-red-500 font-bold opacity-50 text-xs">NEIN</span>
                                        )}
                                    </td>
                                    <td className="p-4 font-mono text-[10px] text-slate-500 select-all hidden md:table-cell">{farm.docId}</td>
                                    <td className="p-4 text-right">
                                        <button 
                                            onClick={() => handleDelete(farm.docId, farm.farmId)}
                                            className="bg-red-900/20 hover:bg-red-600 text-red-400 hover:text-white p-2 rounded-lg transition-colors border border-red-900/50 hover:border-red-500 shadow-sm"
                                            title="Eintrag unwiderruflich löschen"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            <div className="mt-4 text-xs text-slate-500 text-center flex justify-between items-center">
               <span>Modus: {searchMode ? 'Suchergebnisse' : 'Gesamtliste'}</span>
               <span>{farms.length} Einträge angezeigt</span>
            </div>
        </div>
    );
};

