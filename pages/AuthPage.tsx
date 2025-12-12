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
                setMessage("E-Mail gesendet! (Bitte auch Spam-Ordner prüfen)");
                setMode('LOGIN');
            }
        } catch (err: any) {
            // Smart Error Handling
            if (mode === 'REGISTER' && err.message.includes('bereits verwendet')) {
                 setMode('LOGIN');
                 setMessage("Konto existiert bereits. Bitte einloggen.");
            } else {
                 setError(err.message || "Ein Fehler ist aufgetreten.");
            }
        } finally {
            setLoading(false);
        }
    };

    // Dynamic Background Gradient based on Mode
    const getBgGradient = () => {
        if (mode === 'REGISTER') return "from-blue-900 to-slate-900"; // Blue for new start
        if (mode === 'RESET') return "from-orange-900 to-slate-900"; // Orange for alert/reset
        return "from-green-900 to-soil-900"; // Standard Green/Soil
    };

    return (
        <div className={`min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-gradient-to-br ${getBgGradient()} transition-colors duration-700`}>
            {/* Simple CSS Pattern Background */}
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(white_1px,transparent_1px)] [background-size:24px_24px]" />
            
            <div className="relative z-10 w-full max-w-md">
                <div className="text-center mb-8">
                    <div className={`inline-flex items-center justify-center w-20 h-20 rounded-2xl shadow-xl mb-4 transform rotate-3 transition-colors duration-500 ${mode === 'REGISTER' ? 'bg-blue-600' : mode === 'RESET' ? 'bg-orange-600' : 'bg-agri-600'}`}>
                        <Sprout size={48} className="text-white" />
                    </div>
                    <h1 className="text-4xl font-extrabold text-white tracking-tight">AgriTrack<span className={mode === 'REGISTER' ? 'text-blue-400' : 'text-agri-500'}>.AT</span></h1>
                    <p className="text-white/60 mt-2">
                        {mode === 'REGISTER' ? 'Willkommen an Bord!' : mode === 'RESET' ? 'Keine Panik.' : 'Bürokratie endet am Feld.'}
                    </p>
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
                            className={`flex-1 py-4 text-sm font-bold transition-colors ${mode === 'REGISTER' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            Registrieren
                        </button>
                    </div>

                    <div className="p-8">
                        <form onSubmit={handleSubmit} className="space-y-5">
                            {error && (
                                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-start animate-in slide-in-from-top-2">
                                    <AlertCircle size={16} className="mr-2 mt-0.5 shrink-0"/>
                                    {error}
                                </div>
                            )}
                            {message && (
                                <div className="bg-blue-50 text-blue-600 p-3 rounded-lg text-sm flex items-start animate-in slide-in-from-top-2">
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
                                <div className="animate-in fade-in slide-in-from-top-4">
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="block text-xs font-bold text-slate-500 uppercase">Passwort</label>
                                        {mode === 'LOGIN' && (
                                            <button type="button" onClick={() => { setMode('RESET'); setError(null); }} className="text-xs text-agri-600 hover:underline">
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
                                            minLength={6}
                                        />
                                    </div>
                                </div>
                            )}

                            <button 
                                type="submit" 
                                disabled={loading}
                                className={`w-full text-white font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-[0.98] ${
                                    mode === 'REGISTER' ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-200' :
                                    mode === 'RESET' ? 'bg-orange-600 hover:bg-orange-700 shadow-orange-200' :
                                    'bg-agri-600 hover:bg-agri-700 shadow-agri-200'
                                }`}
                            >
                                {loading ? 'Lade...' : mode === 'LOGIN' ? 'Anmelden' : mode === 'REGISTER' ? 'Konto erstellen' : 'Link senden'}
                                {!loading && <ArrowRight size={20} className="ml-2" />}
                            </button>

                            {mode === 'RESET' && (
                                <button 
                                    type="button"
                                    onClick={() => setMode('LOGIN')}
                                    className="w-full text-sm text-slate-500 hover:text-slate-800 font-medium pt-2"
                                >
                                    Zurück zum Login
                                </button>
                            )}
                        </form>

                        {mode !== 'RESET' && (
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
                        )}
                    </div>
                </div>
                
                <div className="mt-8 text-center text-white/50 text-xs">
                    &copy; 2024 AgriTrack Austria • Sicher & Open Source
                </div>
            </div>
        </div>
    );
};
