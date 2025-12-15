
import React, { useState, useEffect } from 'react';
import { dbService } from '../services/db';
import { Trash2, RefreshCw, Search, AlertTriangle, ShieldCheck, User, AlertOctagon } from 'lucide-react';

const getErrorMessage = (e: any): string => {
    const msg = e?.message || String(e);
    if (msg.includes("permission")) return "Zugriff verweigert (Firebase Rules). Du bist kein Admin in der Datenbank.";
    if (msg.includes("offline")) return "Offline. Bitte Internetverbindung prüfen.";
    if (msg.includes("deadline")) return "Zeitüberschreitung. Verbindung zu langsam.";
    if (msg.includes("Failed to get documents from server")) return "Verbindungsfehler: Der Server konnte nicht erreicht werden. Bitte Internetverbindung prüfen.";
    return msg;
};

export const AdminFarmManager: React.FC = () => {
    const [farms, setFarms] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        loadFarms();
    }, []);

    const loadFarms = async () => {
        setLoading(true);
        setError(null);
        try {
            const list = await dbService.adminGetAllFarms();
            setFarms(list);
        } catch (e: any) {
            console.error(e);
            setError(getErrorMessage(e));
            // Don't clear farms, maybe we want to keep old data visible? No, consistency first.
            setFarms([]);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (docId: string, farmId: string) => {
        if (!confirm(`WARNUNG: Möchten Sie den Einstellungs-Eintrag für Farm '${farmId}' (Doc: ${docId}) wirklich löschen?`)) return;
        
        try {
            await dbService.deleteSettingsDoc(docId);
            loadFarms(); // Refresh list
        } catch (e: any) {
            alert(`Fehler: ${e.message}`);
        }
    };

    // Filter Logic
    const filteredFarms = farms.filter(f => {
        const term = searchTerm.toLowerCase();
        return (
            String(f.farmId).toLowerCase().includes(term) ||
            String(f.ownerEmail).toLowerCase().includes(term) ||
            String(f.docId).toLowerCase().includes(term)
        );
    });

    return (
        <div className="bg-slate-900 p-6 h-full flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center">
                        <ShieldCheck className="mr-2 text-green-500" /> Hof Manager (Master Liste)
                    </h2>
                    <p className="text-slate-400 text-sm mt-1">
                        Übersicht aller "Settings"-Dokumente in der Cloud. Hier können Konflikte und Geister-Höfe gelöscht werden.
                    </p>
                </div>
                <button 
                    onClick={loadFarms} 
                    disabled={loading}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold flex items-center transition-colors"
                >
                    <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Aktualisieren
                </button>
            </div>

            {/* Search Bar */}
            <div className="mb-4 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                    type="text" 
                    placeholder="Suche nach ID, Email oder User-UID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-white pl-10 pr-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>

            {/* Error Banner */}
            {error && (
                <div className="bg-red-900/50 border border-red-500 text-red-200 p-4 rounded-xl mb-4 flex items-start">
                    <AlertOctagon className="shrink-0 mr-3 mt-0.5" />
                    <div>
                        <h4 className="font-bold">Laden fehlgeschlagen</h4>
                        <p className="text-sm">{error}</p>
                    </div>
                </div>
            )}

            {/* List */}
            <div className="flex-1 overflow-y-auto bg-slate-800 rounded-xl border border-slate-700">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-900 text-slate-400 text-xs uppercase sticky top-0 z-10">
                        <tr>
                            <th className="p-4 border-b border-slate-700">Farm ID</th>
                            <th className="p-4 border-b border-slate-700">Datentyp</th>
                            <th className="p-4 border-b border-slate-700">Besitzer / Email</th>
                            <th className="p-4 border-b border-slate-700">PIN?</th>
                            <th className="p-4 border-b border-slate-700">User UID (Doc ID)</th>
                            <th className="p-4 border-b border-slate-700 text-right">Aktion</th>
                        </tr>
                    </thead>
                    <tbody className="text-sm text-slate-300 divide-y divide-slate-700">
                        {filteredFarms.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="p-8 text-center text-slate-500">
                                    {loading ? 'Lade Daten...' : error ? 'Keine Daten (Fehler)' : 'Keine Einträge gefunden.'}
                                </td>
                            </tr>
                        ) : (
                            filteredFarms.map((farm) => (
                                <tr key={farm.docId} className="hover:bg-slate-700/50 transition-colors">
                                    <td className="p-4 font-bold text-white font-mono">{farm.farmId}</td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${farm.farmIdType === 'string' ? 'bg-blue-900 text-blue-300' : 'bg-orange-900 text-orange-300'}`}>
                                            {farm.farmIdType === 'string' ? 'TEXT' : 'ZAHL'}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex items-center">
                                            <User size={14} className="mr-2 text-slate-500"/>
                                            <span className={farm.ownerEmail === 'Unbekannt' ? 'text-red-400 italic' : 'text-green-400'}>
                                                {farm.ownerEmail}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        {farm.hasPin ? (
                                            <span className="text-green-500 font-bold">JA</span>
                                        ) : (
                                            <span className="text-red-500 font-bold opacity-50">NEIN</span>
                                        )}
                                    </td>
                                    <td className="p-4 font-mono text-xs text-slate-500 select-all">{farm.docId}</td>
                                    <td className="p-4 text-right">
                                        <button 
                                            onClick={() => handleDelete(farm.docId, farm.farmId)}
                                            className="bg-red-900/50 hover:bg-red-600 text-red-200 hover:text-white p-2 rounded-lg transition-colors border border-red-800 hover:border-red-500"
                                            title="Eintrag löschen"
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
            <div className="mt-4 text-xs text-slate-500 text-center">
                Gesamt: {filteredFarms.length} Einträge
            </div>
        </div>
    );
};

