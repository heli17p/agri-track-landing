
import React from 'react';
import { X, Terminal, User, Server, RefreshCw, Search, Trash2, AlertTriangle, Move, Copy } from 'lucide-react';
import { MapContainer } from 'react-leaflet';
import { StorageLocation, FarmProfile } from '../../types';

interface DiagnoseProps {
  show: boolean;
  onClose: () => void;
  activeDiagTab: string;
  setActiveDiagTab: (tab: any) => void;
  userInfo: any;
  cloudStats: any;
  logs: string[];
  inspectorData: any;
  inspectorLoading: boolean;
  runInspector: () => void;
  conflicts: any[];
  conflictsLoading: boolean;
  conflictSearchId: string;
  setConflictSearchId: (id: string) => void;
  loadConflicts: (id?: string) => void;
  deleteConflict: (id: string) => void;
  handleForceDeleteFarm: () => void;
  handlePingTest: () => void;
  handleHardReset: () => void;
  isUploading: boolean;
  uploadProgress: { status: string, percent: number };
}

export const DiagnosticModal: React.FC<DiagnoseProps> = (props) => {
  if (!props.show) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg h-[80vh] flex flex-col overflow-hidden">
            <div className="p-4 bg-slate-800 text-white flex justify-between items-center shrink-0">
                <h3 className="font-bold flex items-center"><Terminal size={18} className="mr-2"/> System Diagnose</h3>
                <button onClick={props.onClose}><X size={20}/></button>
            </div>
            
            <div className="flex border-b border-slate-200 bg-slate-50 overflow-x-auto hide-scrollbar">
                {['status', 'logs', 'inspector', 'conflicts'].map(tab => (
                    <button 
                        key={tab}
                        onClick={() => {
                            props.setActiveDiagTab(tab);
                            if (tab === 'inspector') props.runInspector();
                            if (tab === 'conflicts') props.loadConflicts();
                        }}
                        className={`flex-1 min-w-[70px] py-3 text-xs font-bold capitalize ${props.activeDiagTab === tab ? 'bg-white border-b-2 border-blue-500 text-blue-600' : 'text-slate-500 hover:bg-slate-100'}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-slate-50 font-mono text-xs">
                {props.activeDiagTab === 'status' && (
                    <div className="space-y-4">
                        <div className="bg-white p-4 rounded border border-slate-200 shadow-sm">
                            <h4 className="font-bold text-slate-800 mb-3 text-sm flex items-center"><User size={14} className="mr-2"/> Benutzer</h4>
                            <div className="space-y-2">
                                <div className="flex justify-between border-b border-slate-100 pb-1"><span>Status:</span><span className={props.userInfo?.status === 'Eingeloggt' ? 'text-green-600' : 'text-red-500'}>{props.userInfo?.status}</span></div>
                                <div className="flex justify-between border-b border-slate-100 pb-1"><span>E-Mail:</span><span className="font-bold">{props.userInfo?.email || '-'}</span></div>
                                <div className="bg-slate-100 p-2 rounded text-[10px] break-all border border-slate-200 font-bold">{props.userInfo?.uid || '-'}</div>
                            </div>
                        </div>
                        <button onClick={props.handlePingTest} disabled={props.isUploading} className="w-full py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded font-bold">Verbindungstest (Ping)</button>
                    </div>
                )}

                {props.activeDiagTab === 'logs' && (
                    <div className="bg-black text-green-400 p-3 rounded h-full overflow-y-auto whitespace-pre-wrap">
                        {props.logs.length === 0 ? "Keine Logs." : props.logs.join('\n')}
                    </div>
                )}

                {props.activeDiagTab === 'conflicts' && (
                    <div className="space-y-4">
                        <div className="bg-white p-3 rounded border flex items-center space-x-2">
                            <input type="text" value={props.conflictSearchId} onChange={(e) => props.setConflictSearchId(e.target.value)} placeholder="Farm ID..." className="flex-1 p-2 border rounded font-bold"/>
                            <button onClick={() => props.loadConflicts()} className="p-2 bg-blue-50 text-blue-600 rounded border border-blue-200"><Search size={16}/></button>
                        </div>
                        {props.conflicts.map((c, i) => (
                            <div key={i} className="bg-white p-3 rounded border border-slate-200 shadow-sm flex justify-between">
                                <div><div className="font-bold">{c.email}</div><div className="text-[10px]">{c.updatedAt}</div></div>
                                <button onClick={() => props.deleteConflict(c.docId)} className="text-red-600"><Trash2 size={16}/></button>
                            </div>
                        ))}
                        {props.conflictSearchId && props.conflicts.length === 0 && !props.conflictsLoading && (
                            <button onClick={props.handleForceDeleteFarm} className="w-full bg-red-600 text-white py-2 rounded text-xs font-bold">Blind-Löschung ID '{props.conflictSearchId}'</button>
                        )}
                    </div>
                )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-white shrink-0">
                <button onClick={props.handleHardReset} className="w-full py-3 bg-red-50 text-red-600 border border-red-200 rounded-lg font-bold flex items-center justify-center"><Trash2 size={16} className="mr-2"/> Komplett-Reset</button>
            </div>
        </div>
    </div>
  );
};

export const RulesHelpModal: React.FC<{ show: boolean, onClose: () => void }> = ({ show, onClose }) => {
    if (!show) return null;
    return (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
                <div className="bg-amber-100 p-4 border-b border-amber-200 flex items-start">
                    <AlertTriangle className="text-amber-600 shrink-0 mr-3" size={24}/>
                    <h3 className="font-bold text-amber-800">Datenbank ist gesperrt!</h3>
                </div>
                <div className="p-6 space-y-4 text-sm">
                    <p>Firebase Sicherheitsregeln müssen angepasst werden:</p>
                    <div className="bg-slate-900 text-slate-300 p-4 rounded-lg font-mono text-[10px]">
                        <pre>{`allow read, write: if request.auth != null;`}</pre>
                    </div>
                    <button onClick={onClose} className="w-full bg-slate-800 text-white py-3 rounded-lg font-bold">Verstanden</button>
                </div>
            </div>
        </div>
    );
};

