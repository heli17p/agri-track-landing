
import React from 'react';
import { MapPin, Plus, Database, Layers, Hammer, Terminal, Cloud, ShieldCheck, CloudOff, UserPlus, Eye, EyeOff, Search, Info, DownloadCloud, RefreshCw, Truck, Zap, Radar, User, CheckCircle2, LogOut } from 'lucide-react';
/* Fix: ICON_THEMES is exported from utils/appIcons, not types.ts */
import { FarmProfile, StorageLocation, FertilizerType, AppSettings } from '../../types';
import { getAppIcon, ICON_THEMES } from '../../utils/appIcons';

const SharedBadge = () => <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded ml-1 inline-flex items-center"><Cloud size={10} className="mr-1"/> Sync</span>;

export const ProfileTab: React.FC<{ profile: FarmProfile, setProfile: (p: any) => void, onPickMap: () => void }> = ({ profile, setProfile, onPickMap }) => (
    <div className="space-y-4 max-w-lg mx-auto">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-lg mb-4 text-slate-800">Betriebsdaten</h3>
            <div className="space-y-4">
                <div><label className="block text-sm font-bold text-slate-500 mb-1">Betriebsname</label><input type="text" value={profile.operatorName} onChange={(e) => setProfile({...profile, operatorName: e.target.value})} className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" /></div>
                <div><label className="block text-sm font-bold text-slate-500 mb-1">Anschrift</label><textarea value={profile.address} onChange={(e) => setProfile({...profile, address: e.target.value})} rows={3} className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" /></div>
                <div><label className="block text-sm font-bold text-slate-500 mb-1">Hofstelle</label><button onClick={onPickMap} className="w-full py-3 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 font-bold hover:bg-slate-50 flex items-center justify-center"><MapPin size={18} className="mr-2"/> {profile.addressGeo ? `Position gesetzt` : 'Auf Karte wählen'}</button></div>
            </div>
        </div>
    </div>
);

export const StorageTab: React.FC<{ storages: StorageLocation[], onEdit: (s: StorageLocation) => void, onCreate: () => void }> = ({ storages, onEdit, onCreate }) => (
    <div className="space-y-4 max-w-lg mx-auto">
        {storages.map(s => (
            <div key={s.id} onClick={() => onEdit(s)} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center cursor-pointer hover:border-green-500 transition-all">
                <div className="flex items-center">
                    <div className={`p-3 rounded-full mr-4 ${s.type === FertilizerType.SLURRY ? 'bg-amber-100 text-amber-800' : 'bg-orange-100 text-orange-800'}`}>{s.type === FertilizerType.SLURRY ? <Database size={20}/> : <Layers size={20}/>}</div>
                    <div><h4 className="font-bold text-slate-800">{s.name}</h4><div className="text-xs text-slate-500">{s.capacity} m³ • {s.currentLevel.toFixed(0)} m³ aktuell</div></div>
                </div>
                <div className="text-slate-400 text-xs font-bold uppercase">Bearbeiten</div>
            </div>
        ))}
        <button onClick={onCreate} className="w-full py-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold hover:bg-white hover:border-green-500 transition-all flex items-center justify-center"><Plus size={20} className="mr-2"/> Neues Lager</button>
    </div>
);

export const GeneralTab: React.FC<{ settings: AppSettings, setSettings: (s: any) => void }> = ({ settings, setSettings }) => (
    <div className="space-y-6 max-w-lg mx-auto">
        {/* Gerätebreiten & Volumen */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center"><Database size={18} className="mr-2 text-blue-600"/> Gerätebreiten & Volumen</h3>
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Güllefass (m³) <SharedBadge/></label><input type="number" value={settings.slurryLoadSize} onChange={e => setSettings({...settings, slurryLoadSize: parseFloat(e.target.value)})} className="w-full p-2 border rounded font-bold" /></div>
                    <div><label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Miststreuer (m³) <SharedBadge/></label><input type="number" value={settings.manureLoadSize} onChange={e => setSettings({...settings, manureLoadSize: parseFloat(e.target.value)})} className="w-full p-2 border rounded font-bold" /></div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 border-t pt-4">
                    <div><label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Breite Gülle (m) <SharedBadge/></label><input type="number" value={settings.slurrySpreadWidth || 12} onChange={e => setSettings({...settings, slurrySpreadWidth: parseFloat(e.target.value)})} className="w-full p-2 border rounded font-bold" /></div>
                    <div><label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Breite Mist (m) <SharedBadge/></label><input type="number" value={settings.manureSpreadWidth || 10} onChange={e => setSettings({...settings, manureSpreadWidth: parseFloat(e.target.value)})} className="w-full p-2 border rounded font-bold" /></div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl space-y-3">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase flex items-center"><Hammer size={14} className="mr-2"/> Bodenbearbeitung (Meter)</h4>
                    <div className="grid grid-cols-2 gap-3">
                        <div><label className="text-[10px] font-bold text-slate-500 block mb-1">Wiesenegge <SharedBadge/></label><input type="number" value={settings.harrowWidth || 6} onChange={e => setSettings({...settings, harrowWidth: parseFloat(e.target.value)})} className="w-full p-2 border rounded text-xs" /></div>
                        <div><label className="text-[10px] font-bold text-slate-500 block mb-1">Mulcher <SharedBadge/></label><input type="number" value={settings.mulchWidth || 3} onChange={e => setSettings({...settings, mulchWidth: parseFloat(e.target.value)})} className="w-full p-2 border rounded text-xs" /></div>
                        <div><label className="text-[10px] font-bold text-slate-500 block mb-1">Striegel <SharedBadge/></label><input type="number" value={settings.weederWidth || 6} onChange={e => setSettings({...settings, weederWidth: parseFloat(e.target.value)})} className="w-full p-2 border rounded text-xs" /></div>
                        <div><label className="text-[10px] font-bold text-slate-500 block mb-1">Nachsaat <SharedBadge/></label><input type="number" value={settings.reseedingWidth || 3} onChange={e => setSettings({...settings, reseedingWidth: parseFloat(e.target.value)})} className="w-full p-2 border rounded text-xs" /></div>
                    </div>
                </div>
            </div>
        </div>

        {/* GPS & Automatik Parameter */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center"><Zap size={18} className="mr-2 text-amber-500"/> GPS & Automatik</h3>
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Min. Speed (km/h)</label>
                        <input type="number" step="0.1" value={settings.minSpeed} onChange={e => setSettings({...settings, minSpeed: parseFloat(e.target.value)})} className="w-full p-2 border rounded font-medium" />
                        <p className="text-[9px] text-slate-400 mt-1 italic">Ab dieser Speed wird "Ausbringung" erkannt.</p>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Max. Speed (km/h)</label>
                        <input type="number" step="0.1" value={settings.maxSpeed} onChange={e => setSettings({...settings, maxSpeed: parseFloat(e.target.value)})} className="w-full p-2 border rounded font-medium" />
                        <p className="text-[9px] text-slate-400 mt-1 italic">Speed-Limit für die Aufzeichnung.</p>
                    </div>
                </div>
                <div className="pt-2 border-t">
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1 flex items-center"><Radar size={12} className="mr-1"/> Lager Radius (m) <SharedBadge/></label>
                    <input type="number" value={settings.storageRadius} onChange={e => setSettings({...settings, storageRadius: parseFloat(e.target.value)})} className="w-full p-2 border rounded font-medium" />
                    <p className="text-[9px] text-slate-400 mt-1 italic">Radius um das Lager für die automatische Fuhren-Erkennung.</p>
                </div>
            </div>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-slate-800 mb-4">App Design</h3>
            <div className="grid grid-cols-4 gap-2">
                {ICON_THEMES.map(theme => (
                    <button key={theme.id} onClick={() => setSettings({...settings, appIcon: theme.id})} className={`p-2 rounded-lg border-2 flex flex-col items-center ${settings.appIcon === theme.id ? 'border-green-500 bg-green-50' : 'border-transparent hover:bg-slate-50'}`}>
                        <img src={getAppIcon(theme.id)} className="w-8 h-8 mb-1 rounded bg-white shadow-sm border border-slate-100" /><span className="text-[9px] font-bold text-slate-600 truncate w-full text-center">{theme.label}</span>
                    </button>
                ))}
            </div>
        </div>
    </div>
);

export const SyncTab: React.FC<{ 
    authState: any, settings: AppSettings, cloudStats: any, localStats: any,
    connectMode: string, setConnectMode: (m: any) => void,
    inputFarmId: string, setInputFarmId: (v: string) => void,
    inputPin: string, setInputPin: (v: string) => void,
    searchStatus: string, foundOwnerEmail: string | null, connectError: string | null,
    onSearch: () => void, onJoin: () => void, onCreate: () => void,
    onForceUpload: () => void, onManualDownload: () => void, onShowDiagnose: () => void,
    onLogout: () => void
}> = (props) => (
    <div className="space-y-6 max-w-lg mx-auto">
        {/* Haupt-Statusbox mit Verbindungs-Indikator */}
        <div className={`p-6 rounded-2xl border-2 flex flex-col items-center text-center shadow-sm transition-all ${props.authState && props.settings.farmId ? 'bg-green-50 border-green-200' : 'bg-slate-100 border-slate-300'}`}>
            <div className="relative mb-3">
                <div className={`p-4 rounded-full ${props.authState && props.settings.farmId ? 'bg-green-200 text-green-800' : 'bg-slate-200 text-slate-600'}`}>
                    {props.authState ? <ShieldCheck size={40}/> : <CloudOff size={40}/>}
                </div>
                {props.authState && (
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 border-2 border-white rounded-full animate-pulse shadow-sm"></div>
                )}
            </div>
            
            <h3 className="font-black text-xl text-slate-800">
                {props.authState ? (props.settings.farmId ? 'Verbindung aktiv' : 'Bereit (Kein Hof)') : 'Offline Modus'}
            </h3>
            
            {props.authState && (
                <>
                    <div className="mt-2 flex items-center text-xs font-bold text-green-700 bg-white/50 px-3 py-1 rounded-full border border-green-100">
                        <User size={12} className="mr-1.5"/> {props.authState.email}
                    </div>
                    {/* Logout / Verbindung trennen Button */}
                    <button 
                        onClick={props.onLogout}
                        className="mt-4 flex items-center text-[10px] font-black text-red-600 uppercase tracking-widest hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-red-100"
                    >
                        <LogOut size={12} className="mr-1.5"/> Verbindung trennen
                    </button>
                </>
            )}
            
            {props.authState && props.settings.farmId && (
                <div className="mt-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Farm ID: <span className="text-slate-700">{props.settings.farmId}</span>
                </div>
            )}
        </div>

        {/* Datenstatistik-Vergleich */}
        {props.authState && props.settings.farmId && (
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center">
                    <RefreshCw size={14} className="mr-2"/> Synchronisations-Status
                </h4>
                
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col items-center">
                        <span className="text-2xl font-black text-slate-800">{props.localStats.total}</span>
                        <span className="text-[9px] font-bold text-slate-500 uppercase">Lokal (Handy)</span>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex flex-col items-center">
                        <span className="text-2xl font-black text-blue-700">
                            {props.cloudStats.total === -1 ? '...' : props.cloudStats.total}
                        </span>
                        <span className="text-[9px] font-bold text-blue-500 uppercase">Cloud (Server)</span>
                    </div>
                </div>

                {props.localStats.total === props.cloudStats.total ? (
                    <div className="flex items-center justify-center text-green-600 text-xs font-bold py-1">
                        <CheckCircle2 size={14} className="mr-1.5"/> Alle Daten sind aktuell
                    </div>
                ) : (
                    <div className="text-[10px] text-center text-slate-400 italic">
                        Unterschiede? Nutze "Daten hochladen" um manuell zu sichern.
                    </div>
                )}
            </div>
        )}

        {props.authState && !props.settings.farmId && props.connectMode === 'VIEW' && (
            <div className="grid grid-cols-1 gap-4">
                <button onClick={() => props.setConnectMode('JOIN')} className="bg-white p-6 rounded-xl border-2 border-slate-200 hover:border-blue-500 flex items-center font-bold text-blue-600 transition-all active:scale-95"><UserPlus size={24} className="mr-3"/> Hof beitreten</button>
                <button onClick={() => props.setConnectMode('CREATE')} className="bg-white p-6 rounded-xl border-2 border-slate-200 hover:border-green-500 flex items-center font-bold text-green-600 transition-all active:scale-95"><Plus size={24} className="mr-3"/> Hof neu erstellen</button>
            </div>
        )}

        {props.authState && props.settings.farmId && (
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-3">
                <button onClick={props.onForceUpload} className="w-full py-4 bg-blue-600 text-white rounded-xl font-black shadow-lg shadow-blue-100 flex items-center justify-center active:scale-95 transition-all">
                    <Cloud size={18} className="mr-2"/> Daten jetzt sichern
                </button>
                <button onClick={props.onManualDownload} className="w-full py-3 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold flex items-center justify-center active:scale-95 transition-all">
                    <DownloadCloud size={18} className="mr-2"/> Server-Daten laden
                </button>
                <button onClick={props.onShowDiagnose} className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl font-bold flex items-center justify-center active:scale-95 transition-all">
                    <Terminal size={18} className="mr-2"/> 🛠 Diagnose-Tool
                </button>
            </div>
        )}
    </div>
);

