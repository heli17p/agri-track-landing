
import React from 'react';
import { CheckCircle, Home, Clock, Database, Truck, Square } from 'lucide-react';
import { ActivityRecord, Field } from '../../types';

interface Props {
  record: ActivityRecord;
  fields: Field[];
  onClose: () => void;
}

export const TrackingSummary: React.FC<Props> = ({ record, fields, onClose }) => {
  return (
    <div className="absolute inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-green-600 p-8 text-center text-white relative">
          <div className="relative z-10 flex flex-col items-center">
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mb-4"><CheckCircle size={48} className="text-white"/></div>
            <h2 className="text-3xl font-bold mb-1">Gespeichert!</h2>
            <div className="text-green-100 font-medium text-sm bg-white/10 px-3 py-1 rounded-full">{record.type}</div>
          </div>
        </div>
        <div className="p-6 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
              <div className="flex items-center text-slate-400 text-xs font-bold uppercase mb-1"><Clock size={12} className="mr-1"/> Dauer</div>
              <div className="text-xl font-bold text-slate-800">{record.notes?.match(/Dauer: (\d+) min/)?.[1] || 0} min</div>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
              <div className="flex items-center text-slate-400 text-xs font-bold uppercase mb-1"><Database size={12} className="mr-1"/> Menge</div>
              <div className="text-xl font-bold text-slate-800">{record.amount} {record.unit}</div>
            </div>
            {record.loadCount && <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
              <div className="flex items-center text-slate-400 text-xs font-bold uppercase mb-1"><Truck size={12} className="mr-1"/> Fuhren</div>
              <div className="text-xl font-bold text-slate-800">{record.loadCount}</div>
            </div>}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
              <div className="flex items-center text-slate-400 text-xs font-bold uppercase mb-1"><Square size={12} className="mr-1"/> Felder</div>
              <div className="text-xl font-bold text-slate-800">{record.fieldIds.length}</div>
            </div>
          </div>
          <button onClick={onClose} className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold shadow-lg flex items-center justify-center"><Home size={20} className="mr-2"/> Fertig</button>
        </div>
      </div>
    </div>
  );
};

