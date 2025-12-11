import React, { useState } from 'react';
import { Sprout, Mail, Lock, ArrowRight, UserPlus, LogIn, Ghost, CloudOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { authService } from '../services/auth';

interface Props {
    onLoginSuccess: () => void;
    onGuestAccess: () => void;
}

export const AuthPage: React.FC<Props> = ({ onLoginSuccess, onGuestAccess }) => {
    const [mode, setMode] = useState<'LOGIN' | 'REGISTER' | 'RESET'>('LOGIN');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setMessage(null);
        setLoading(true);

        try {
            if (mode === 'LOGIN') {
                await authService.login(email, password);
                onLoginSuccess();
            } else if (mode === 'REGISTER') {
                await authService.register(email, password);
                onLoginSuccess();
            } else if (mode === 'RESET') {
                await authService.resetPassword(email);
                setMessage("E-Mail zum Zurücksetzen gesendet. Bitte Postfach prüfen.");
                setMode('LOGIN');
            }
        } catch (err: any) {
            setError(err.message || "Ein Fehler ist aufgetreten.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-soil-900 flex flex-col items-center justify-center p-4 relative overflow-hidden">
            {/* Background Pattern instead of blocked image */}
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#22c55e_1px,transparent_1px)] [background-size:16px_16px]" />
            
            <div className="relative z-10 w-full max-w-md">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-agri-600 rounded-2xl shadow-xl mb-4 transform rotate-3">
                        <Sprout size={48} className="text-white" />
                    </div>
                    <h1 className="text-4xl font-extrabold text-white tracking-tight">AgriTrack<span className="text-agri-500">.AT</span></h1>
                    <p className="text-agri-200 mt-2">Bürokratie endet am Feld.</p>
                </div>

                <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
                    {/* Header Tabs */}
                    <div className="flex border-b border-slate-100">
                        <button 
                            onClick={() => { setMode('LOGIN'); setError(null); }}
                            className={`flex-1 py-4 text-sm font-bold transition-colors ${mode === 'LOGIN' ? 'text-agri-600 border-b-2 border-agri-600 bg-green-50/50' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            Anmelden
                        </button>
                        <button 
                            onClick={() => { setMode('REGISTER'); setError(null); }}
                            className={`flex-1 py-4 text-sm font-bold transition-colors ${mode === 'REGISTER' ? 'text-agri-600 border-b-2 border-agri-600 bg-green-50/50' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            Registrieren
                        </button>
                    </div>

                    <div className="p-8">
                        <form onSubmit={handleSubmit} className="space-y-5">
                            {error && (
                                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-start">
                                    <AlertCircle size={16} className="mr-2 mt-0.5 shrink-0"/>
                                    {error}
                                </div>
                            )}
                            {message && (
                                <div className="bg-green-50 text-green-600 p-3 rounded-lg text-sm flex items-start">
                                    <CheckCircle2 size={16} className="mr-2 mt-0.5 shrink-0"/>
                                    {message}
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">E-Mail Adresse</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                    <input 
                                        type="email" 
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-agri-500 outline-none transition-all"
                                        placeholder="bauer@hof.at"
                                    />
                                </div>
                            </div>

                            {mode !== 'RESET' && (
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="block text-xs font-bold text-slate-500 uppercase">Passwort</label>
                                        {mode === 'LOGIN' && (
                                            <button type="button" onClick={() => setMode('RESET')} className="text-xs text-agri-600 hover:underline">
                                                Vergessen?
                                            </button>
                                        )}
                                    </div>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                        <input 
                                            type="password" 
                                            required
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-agri-500 outline-none transition-all"
                                            placeholder="••••••••"
                                        />
                                    </div>
                                </div>
                            )}

                            <button 
                                type="submit" 
                                disabled={loading}
                                className="w-full bg-agri-600 hover:bg-agri-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-agri-200 transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? 'Lade...' : mode === 'LOGIN' ? 'Anmelden' : mode === 'REGISTER' ? 'Konto erstellen' : 'Link senden'}
                                {!loading && <ArrowRight size={20} className="ml-2" />}
                            </button>
                        </form>

                        <div className="mt-8 pt-6 border-t border-slate-100">
                            <button 
                                onClick={onGuestAccess}
                                className="w-full flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors group"
                            >
                                <div className="bg-slate-100 p-2 rounded-full mr-3 group-hover:bg-slate-200 transition-colors">
                                    <Ghost size={20} />
                                </div>
                                <div className="text-left">
                                    <span className="block text-sm font-bold">Als Gast fortfahren</span>
                                    <span className="block text-[10px] text-slate-400">Nur lokale Speicherung • Kein Sync</span>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
                
                <div className="mt-8 text-center text-slate-400 text-xs">
                    &copy; 2024 AgriTrack Austria • Sicher & Open Source
                </div>
            </div>
        </div>
    );
};
