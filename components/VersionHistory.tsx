import React from 'react';
import { GitCommit, CheckCircle, Clock } from 'lucide-react';
import { Version } from '../types';

const VERSIONS: Version[] = [
  {
    version: '2.4.0',
    date: '12. Mai 2024',
    status: 'stable',
    changes: [
      'Unraid API V2 Integration für schnellere Syncs',
      'Offline-Modus für Feldarbeit ohne Empfang',
      'Dunkelmodus Optimierung für Nachtarbeit'
    ]
  },
  {
    version: '2.3.5',
    date: '20. April 2024',
    status: 'stable',
    changes: [
      'Performance Verbesserungen bei großen Datensätzen',
      'Neues Dashboard Widget: Wettervorhersage'
    ]
  },
  {
    version: '2.5.0-beta',
    date: 'Heute',
    status: 'beta',
    changes: [
      'Experimentelle KI-Fruchtfolge-Planung',
      'Community Feature: Direktnachrichten'
    ]
  }
];

export const VersionHistory: React.FC = () => {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Release Notes</h2>
        <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded border border-blue-400">
          Live Updates
        </span>
      </div>
      
      <div className="relative border-l-2 border-gray-200 ml-3">
        {VERSIONS.map((ver, idx) => (
          <div key={idx} className="mb-10 ml-6">
            <span className={`absolute flex items-center justify-center w-8 h-8 rounded-full -left-4 ring-4 ring-white ${
              ver.status === 'stable' ? 'bg-green-100' : 'bg-yellow-100'
            }`}>
              {ver.status === 'stable' ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <Clock className="w-5 h-5 text-yellow-600" />
              )}
            </span>
            <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold text-gray-900 flex items-center">
                  v{ver.version}
                  {ver.status === 'beta' && (
                    <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">
                      Beta / Testing
                    </span>
                  )}
                </h3>
                <time className="block mb-1 text-sm font-normal text-gray-400">{ver.date}</time>
              </div>
              <ul className="space-y-2 text-gray-600 list-disc list-inside">
                {ver.changes.map((change, i) => (
                  <li key={i} className="text-sm">{change}</li>
                ))}
              </ul>
              <div className="mt-4 flex items-center text-xs text-gray-400 font-mono">
                <GitCommit className="w-3 h-3 mr-1" />
                {Math.random().toString(16).substring(2, 10)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};