
import React, { useState, useEffect } from 'react';
import { dbService } from '../services/db';
import { authService } from '../services/auth';
import { Trash2, RefreshCw, Search, AlertTriangle, ShieldCheck, User, AlertOctagon, Terminal, LogIn, Eraser, ExternalLink, ShieldAlert, UserPlus, UserMinus, Mail } from 'lucide-react';

const getErrorMessage = (e: any): string => {
    const msg = e?.message || String(e);
    if (msg.includes("permission") || msg.includes("Missing or insufficient permissions")) {
        return "Zugriff verweigert. Fehlende Berechtigung für diese Operation.";
    }
    if (msg.includes("offline")) return "Offline. Bitte Internetverbindung prüfen.";
    if (msg.includes("deadline")) return "Zeitüberschreitung. Verbindung zu langsam.";
    if (msg.includes("Failed to get documents from server") || msg.includes("documents may exist in the local cache")) {
        return "Zugriff verweigert: Der Server blockiert die Anfrage. (Der Hof gehört einem anderen User).";
    }
    return msg;
};

export const AdminFarmManager: React.FC = () => {
    const [activeSubTab, setActiveSubTab] = useState<'FARMS' | 'ADMINS'>('FARMS');
    const [farms, setFarms] = useState<any[]>([]);
    const [cloudAdmins, setCloudAdmins] = useState<string[]>([]);
    const [registeredUsers, setRegisteredUsers] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchMode, setSearchMode] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [showConsoleLink, setShowConsoleLink] = useState(false);

    useEffect(() => { 
        const unsub = authService.onAuthStateChanged((u) => setCurrentUser(u));
        loadAllFarms();
        loadAdmins();
        return () => unsub();
    }, []);

    const loadAdmins = async () => {
        setLoading(true);
        const admins = await dbService.getCloudAdmins();
        const users = await dbService.getAllRegisteredEmails();
        setCloudAdmins(admins);
        setRegisteredUsers(users);
        setLoading(false);
    };

    const toggleAdminStatus = async (email: string) => {
        const lowerEmail = email.toLowerCase().trim();
        let newAdmins: string[];
        if (cloudAdmins.includes(lowerEmail)) {
            if (lowerEmail === 'helmut.preiser@gmx.at') {
                alert("Super-Admin kann nicht entfernt werden.");
                return;
            }
            newAdmins = cloudAdmins.filter(e => e !== lowerEmail);
        } else {
            newAdmins = [...cloudAdmins, lowerEmail];
        }
        
        try {
            await dbService.saveCloudAdmins(newAdmins);
            setCloudAdmins(newAdmins);
        } catch (e) {
            alert("Fehler beim Speichern der Admin-Rechte.");
        }
    };

    const loadAllFarms = async () => {
        setLoading(true);
        setError(null);
        setSearchMode(false);
        setShowConsoleLink(false);
        try {
            const list = await dbService.adminGetAllFarms();
            setFarms(list);
        } catch (e: any) {
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
        setShowConsoleLink(false);
        setSearchMode(true);
        try {
            const results = await dbService.findFarmConflicts(searchTerm.trim());
            const mapped = results.map((r: any) => ({
                docId: r.docId,
                farmId: r.farmIdStored,
                farmIdType: r.farmIdType,
                ownerEmail: r.email || 'Unbekannt',
                hasPin: r.hasPin,
                updatedAt: r.updatedAt
            }));
            setFarms(mapped);
            if (mapped.length === 0) setError(`Keine sichtbaren Einträge für ID '${searchTerm}'.`);
        } catch (e: any) {
            setError(getErrorMessage(e));
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (docId: string, farmId: string) => {
        if (!confirm(`WARNUNG: Eintrag für Farm '${farmId || 'Ohne ID'}' löschen?`)) return;
        try {
            await dbService.deleteSettingsDoc(docId);
            searchMode ? handleServerSearch() : loadAllFarms();
        } catch (e: any) {
            alert(`Fehler: ${getErrorMessage(e)}`);
        }
    };

    return (
        <div className="bg-slate-900 p-6 h-full flex flex-col">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center">
                        <ShieldCheck className="mr-2 text-green-500" /> System Verwaltung
                    </h2>
                </div>
                
                <div className="flex bg-slate-800 p-1 rounded-xl">
                    <button 
                        onClick={() => setActiveSubTab('FARMS')}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeSubTab === 'FARMS' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        Hof Manager
                    </button>
                    <button 
                        onClick={() => setActiveSubTab('ADMINS')}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeSubTab === 'ADMINS' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        Admin-Rechte
                    </button>
                </div>
            </div>

            {activeSubTab === 'FARMS' && (
                <>
                    <div className="mb-6 bg-slate-800 p-4 rounded-xl border border-slate-700">
                        <label className="block text-slate-400 text-xs font-bold uppercase mb-2">Gezielte Suche (Server-Query)</label>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input 
                                    type="text" 
                                    placeholder="Farm ID..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-600 text-white pl-10 pr-4 py-3 rounded-lg focus:outline-none"
                                />
                            </div>
                            <button onClick={handleServerSearch} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold">Suchen</button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto bg-slate-800 rounded-xl border border-slate-700">
                        <table className="w-full text-left">
                            <thead className="bg-slate-900 text-slate-400 text-xs uppercase sticky top-0">
                                <tr>
                                    <th className="p-4">Farm ID</th>
                                    <th className="p-4">Besitzer</th>
                                    <th className="p-4 text-right">Aktion</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm text-slate-300 divide-y divide-slate-700">
                                {farms.map((farm) => (
                                    <tr key={farm.docId} className="hover:bg-slate-700/50">
                                        <td className="p-4 font-bold text-white">{farm.farmId || '(Leer)'}</td>
                                        <td className="p-4">{farm.ownerEmail}</td>
                                        <td className="p-4 text-right">
                                            <button onClick={() => handleDelete(farm.docId, farm.farmId)} className="text-red-400 p-2 hover:bg-red-900/30 rounded-lg"><Trash2 size={16} /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {activeSubTab === 'ADMINS' && (
                <div className="flex-1 flex flex-col space-y-6 overflow-hidden">
                    <div className="bg-amber-900/20 border border-amber-600/30 p-4 rounded-xl flex items-start">
                        <ShieldAlert className="text-amber-500 mr-3 shrink-0" />
                        <div>
                            <h4 className="text-amber-500 font-bold text-sm">Vorsicht bei Admin-Rechten</h4>
                            <p className="text-slate-400 text-xs">Admins können alle Daten im Kummerkasten löschen und Hof-Einstellungen manipulieren. Helmut.preiser@gmx.at ist als Super-Admin geschützt.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 overflow-hidden">
                        {/* Aktive Admins */}
                        <div className="bg-slate-800 rounded-xl border border-slate-700 flex flex-col overflow-hidden">
                            <div className="p-4 bg-slate-900 border-b border-slate-700 flex justify-between items-center">
                                <h3 className="text-white font-bold text-sm flex items-center"><ShieldCheck size={16} className="mr-2 text-green-500"/> Aktive System-Admins</h3>
                                <span className="text-[10px] font-black text-slate-500">{cloudAdmins.length + 1}</span>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                                <div className="p-3 bg-slate-700/50 rounded-lg border border-slate-600 flex justify-between items-center">
                                    <div className="flex items-center"><Mail size={14} className="mr-2 text-blue-400"/><span className="text-white font-bold text-xs">helmut.preiser@gmx.at</span></div>
                                    <span className="text-[8px] font-black uppercase text-blue-400 bg-blue-900/30 px-1.5 py-0.5 rounded">Super</span>
                                </div>
                                {cloudAdmins.filter(e => e !== 'helmut.preiser@gmx.at').map(email => (
                                    <div key={email} className="p-3 bg-slate-700/50 rounded-lg border border-slate-600 flex justify-between items-center animate-in fade-in">
                                        <div className="flex items-center text-xs text-white font-medium"><Mail size={14} className="mr-2 text-slate-400"/>{email}</div>
                                        <button onClick={() => toggleAdminStatus(email)} className="text-red-400 hover:text-red-300 p-1"><UserMinus size={16}/></button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Alle Nutzer */}
                        <div className="bg-slate-800 rounded-xl border border-slate-700 flex flex-col overflow-hidden">
                            <div className="p-4 bg-slate-900 border-b border-slate-700">
                                <h3 className="text-white font-bold text-sm flex items-center"><User size={16} className="mr-2 text-blue-500"/> Registrierte Nutzer</h3>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                                {registeredUsers.map(email => {
                                    const isA = cloudAdmins.includes(email.toLowerCase()) || email.toLowerCase() === 'helmut.preiser@gmx.at';
                                    return (
                                        <div key={email} className="p-3 bg-slate-900/50 rounded-lg flex justify-between items-center hover:bg-slate-700/30 transition-colors">
                                            <span className="text-xs text-slate-300 truncate mr-2">{email}</span>
                                            {!isA ? (
                                                <button onClick={() => toggleAdminStatus(email)} className="bg-green-600/20 hover:bg-green-600 text-green-500 hover:text-white px-2 py-1 rounded text-[10px] font-bold transition-all flex items-center shadow-sm">
                                                    <UserPlus size={12} className="mr-1"/> BEFÖRDERN
                                                </button>
                                            ) : (
                                                <span className="text-[10px] font-black text-slate-600 uppercase">Admin</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

