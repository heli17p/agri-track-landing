
import React, { useState } from 'react';
import { UserPlus, Plus, ShieldCheck, Key, ArrowRight, Loader2, LogOut, Tractor } from 'lucide-react';
import { dbService } from '../services/db';
import { authService } from '../services/auth';

export const WelcomeGate: React.FC<{ onSetupComplete: () => void }> = ({ onSetupComplete }) => {
    const [mode, setMode] = useState<'CHOOSE' | 'JOIN' | 'CREATE'>('CHOOSE');
    const [farmId, setFarmId] = useState('');
    const [pin, setPin] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleJoin = async () => {
        if (!farmId || !pin) return;
        setLoading(true);
        setError(null);
        try {
            const check = await dbService.verifyFarmPin(farmId, pin);
            if (check.valid) {
                const settings = await dbService.getSettings();
                await dbService.saveSettings({ 
                    ...settings, 
                    farmId: farmId.trim(), 
                    farmPin: pin.trim() 
                });
                await dbService.syncActivities(); 
                onSetupComplete();
            } else {
                setError("Farm-ID oder PIN falsch. Bitte beim Betriebsleiter nachfragen.");
            }
        } catch (e) {
            setError("Verbindung zur AgriCloud fehlgeschlagen. Bitte Internet prüfen.");
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        setLoading(true);
        try {
            // Generiere eine zufällige 7-stellige ID und 4-stelligen PIN
            const newId = Math.floor(1000000 + Math.random() * 9000000).toString();
            const newPin = Math.floor(1000 + Math.random() * 9000).toString();
            const settings = await dbService.getSettings();
            await dbService.saveSettings({ 
                ...settings, 
                farmId: newId, 
                farmPin: newPin 
            });
            onSetupComplete();
        } catch (e) {
            setError("Fehler beim Erstellen des Hofes.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-20 h-20 bg-green-600 rounded-2xl shadow-xl flex items-center justify-center text-white mb-8 rotate-3">
                <Tractor size={48} />
            </div>

            <h1 className="text-3xl font-black text-slate-800 mb-2 tracking-tight">Servus!</h1>
            <p className="text-slate-500 mb-10 max-w-xs mx-auto">Um fortzufahren, verbinde dich bitte mit einem Betrieb.</p>

            <div className="w-full max-w-sm space-y-4">
                {mode === 'CHOOSE' && (
                    <>
                        <button onClick={() => setMode('JOIN')} className="w-full bg-white p-6 rounded-2xl border-2 border-slate-200 hover:border-blue-500 flex items-center shadow-sm transition-all group active:scale-95 text-left">
                            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl mr-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                <UserPlus size={24}/>
                            </div>
                            <div>
                                <div className="font-black text-slate-800 uppercase text-[10px] tracking-widest mb-0.5">Mitarbeiter</div>
                                <div className="font-bold text-slate-600 text-lg leading-tight">Hof beitreten</div>
                            </div>
                        </button>

                        <button onClick={() => setMode('CREATE')} className="w-full bg-white p-6 rounded-2xl border-2 border-slate-200 hover:border-green-500 flex items-center shadow-sm transition-all group active:scale-95 text-left">
                            <div className="p-3 bg-green-50 text-green-600 rounded-xl mr-4 group-hover:bg-green-600 group-hover:text-white transition-colors">
                                <Plus size={24}/>
                            </div>
                            <div>
                                <div className="font-black text-slate-800 uppercase text-[10px] tracking-widest mb-0.5">Betriebsleiter</div>
                                <div className="font-bold text-slate-600 text-lg leading-tight">Hof neu gründen</div>
                            </div>
                        </button>
                    </>
                )}

                {mode === 'JOIN' && (
                    <div className="bg-white p-6 rounded-3xl border-2 border-blue-500 shadow-xl space-y-4 animate-in zoom-in-95">
                        <div className="flex items-center text-blue-600 font-black uppercase text-[10px] tracking-[0.2em] mb-2">
                            <Key size={14} className="mr-2"/> Zugang anfordern
                        </div>
                        <div className="space-y-3">
                            <input 
                                type="text" 
                                value={farmId} 
                                onChange={e => setFarmId(e.target.value)} 
                                placeholder="Farm-ID (7-stellig)" 
                                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-mono text-center text-xl tracking-widest outline-none focus:ring-2 focus:ring-blue-500" 
                            />
                            <input 
                                type="password" 
                                value={pin} 
                                onChange={e => setPin(e.target.value)} 
                                placeholder="Hof-PIN" 
                                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-mono text-center text-xl tracking-widest outline-none focus:ring-2 focus:ring-blue-500" 
                            />
                        </div>
                        {error && <p className="text-red-500 text-xs font-bold bg-red-50 p-2 rounded-lg">{error}</p>}
                        <div className="flex space-x-2 pt-2">
                            <button onClick={() => setMode('CHOOSE')} className="flex-1 py-4 text-slate-400 font-bold">Zurück</button>
                            <button 
                                onClick={handleJoin} 
                                disabled={loading || !farmId || !pin} 
                                className="flex-[2] bg-blue-600 text-white py-4 rounded-xl font-black shadow-lg shadow-blue-200 flex items-center justify-center disabled:opacity-50"
                            >
                                {loading ? <Loader2 className="animate-spin" /> : 'BEITRETEN'}
                            </button>
                        </div>
                    </div>
                )}

                {mode === 'CREATE' && (
                    <div className="bg-white p-6 rounded-3xl border-2 border-green-500 shadow-xl space-y-4 animate-in zoom-in-95">
                        <div className="flex items-center text-green-600 font-black uppercase text-[10px] tracking-[0.2em] mb-2">
                            <ShieldCheck size={14} className="mr-2"/> Betrieb anlegen
                        </div>
                        <p className="text-slate-500 text-sm leading-relaxed text-left">
                            Hiermit erstellst du eine neue, leere Datenbank für deinen Betrieb. Danach erhältst du eine ID für deine Mitarbeiter.
                        </p>
                        <div className="flex space-x-2 pt-2">
                            <button onClick={() => setMode('CHOOSE')} className="flex-1 py-4 text-slate-400 font-bold">Abbrechen</button>
                            <button 
                                onClick={handleCreate} 
                                disabled={loading} 
                                className="flex-[2] bg-green-600 text-white py-4 rounded-xl font-black shadow-lg shadow-green-200 flex items-center justify-center"
                            >
                                {loading ? <Loader2 className="animate-spin" /> : 'HOF ERSTELLEN'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <button onClick={() => authService.logout()} className="mt-12 text-slate-400 font-bold flex items-center text-sm hover:text-red-500 transition-colors">
                <LogOut size={16} className="mr-2"/> Abmelden
            </button>
        </div>
    );
};

