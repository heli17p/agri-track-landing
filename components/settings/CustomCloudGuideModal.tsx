import React, { useState } from 'react';
import { X, ExternalLink, Copy, Check, Shield, Database, Sparkles, CheckCircle2, ChevronRight, HelpCircle } from 'lucide-react';

interface Props {
  show: boolean;
  onClose: () => void;
  onApplySampleRules?: () => void;
}

export const CustomCloudGuideModal: React.FC<Props> = ({ show, onClose }) => {
  const [activeStep, setActiveStep] = useState(1);
  const [copiedRule, setCopiedRule] = useState(false);

  if (!show) return null;

  const sampleRules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedRule(true);
    setTimeout(() => setCopiedRule(false), 2000);
  };

  const steps = [
    { num: 1, title: 'Google & Firebase Konsole' },
    { num: 2, title: 'Projekt anlegen' },
    { num: 3, title: 'Firestore Datenbank' },
    { num: 4, title: 'Sicherheitsregeln' },
    { num: 5, title: 'Zugangsdaten kopieren' },
    { num: 6, title: 'In AgriTrack aktivieren' }
  ];

  return (
    <div className="fixed inset-0 z-[2500] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-green-500/20 text-green-400 rounded-xl border border-green-500/30">
              <Database size={22} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-green-400 bg-green-950/60 px-2 py-0.5 rounded-full border border-green-800/60">
                  100% Kostenlos & DSGVO-Sicher
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-black mt-1">Eigene Betriebs-Cloud einrichten</h2>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <X size={22}/>
          </button>
        </div>

        {/* Step Indicator */}
        <div className="bg-slate-100 p-2 sm:p-3 border-b border-slate-200 overflow-x-auto hide-scrollbar shrink-0">
          <div className="flex space-x-2 min-w-max">
            {steps.map(s => (
              <button
                key={s.num}
                onClick={() => setActiveStep(s.num)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center transition-all ${
                  activeStep === s.num
                    ? 'bg-slate-900 text-white shadow-md'
                    : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] mr-1.5 font-black ${
                  activeStep === s.num ? 'bg-green-500 text-slate-950' : 'bg-slate-200 text-slate-700'
                }`}>
                  {s.num}
                </span>
                {s.title}
              </button>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-slate-700 text-sm">
          
          {/* Step 1 */}
          {activeStep === 1 && (
            <div className="space-y-4 animate-in fade-in">
              <div className="bg-green-50 border border-green-200 p-4 rounded-2xl flex items-start space-x-3">
                <Sparkles className="text-green-600 shrink-0 mt-0.5" size={20} />
                <div className="text-xs text-green-900 space-y-1">
                  <span className="font-bold block text-sm">Dauerhaft 0 € (Google Spark Plan)</span>
                  <p>Google stellt jedem Google-Konto 1 GB Speicherplatz und täglich 50.000 Lese- und 20.000 Schreibzugriffe kostenlos zur Verfügung. Für einen landwirtschaftlichen Betrieb ist das ein Leben lang völlig kostenfrei.</p>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-extrabold text-slate-900 text-base">Schritt 1: Firebase Konsole aufrufen</h3>
                <p>Öffne die offizielle Google Firebase-Konsole in deinem Browser:</p>
                
                <a 
                  href="https://console.firebase.google.com" 
                  target="_blank" 
                  rel="noreferrer"
                  className="inline-flex items-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95 text-xs"
                >
                  <ExternalLink size={15} className="mr-2" />
                  console.firebase.google.com öffnen
                </a>

                <p className="text-xs text-slate-500">
                  Melde dich einfach mit dem Google-Konto deines Betriebs an (oder einem privaten Gmail-Konto).
                </p>
              </div>
            </div>
          )}

          {/* Step 2 */}
          {activeStep === 2 && (
            <div className="space-y-4 animate-in fade-in">
              <h3 className="font-extrabold text-slate-900 text-base">Schritt 2: Projekt erstellen</h3>
              
              <ol className="list-decimal list-inside space-y-2 text-xs sm:text-sm text-slate-600">
                <li>Klicke in der Firebase-Konsole auf die Schaltfläche <strong className="text-slate-900">"Projekt hinzufügen"</strong> (oder "+").</li>
                <li>Vergib einen Namen für dein Betriebs-Projekt, z. B. <strong className="text-blue-600 font-mono">Hof-Huber-AgriTrack</strong> oder <strong className="text-blue-600 font-mono">Biohof-Mustermann</strong>.</li>
                <li>Bei der Frage nach <em>Google Analytics</em> kannst du den Schalter einfach <strong className="text-slate-900">deaktivieren</strong> (Analytics wird für AgriTrack nicht benötigt).</li>
                <li>Klicke auf <strong className="text-slate-900">"Projekt erstellen"</strong> und warte ca. 15 Sekunden.</li>
              </ol>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
                💡 <strong>Tipp:</strong> Firebase generiert automatisch eine eindeutige Projekt-ID (z. B. <span className="font-mono text-slate-800">hof-huber-agritrack-12345</span>). Diese ID ist deine persönliche Cloud-Kennung.
              </div>
            </div>
          )}

          {/* Step 3 */}
          {activeStep === 3 && (
            <div className="space-y-4 animate-in fade-in">
              <h3 className="font-extrabold text-slate-900 text-base">Schritt 3: Cloud Firestore Datenbank aktivieren</h3>
              
              <ol className="list-decimal list-inside space-y-2 text-xs sm:text-sm text-slate-600">
                <li>Klicke im linken Menü auf <strong className="text-slate-900">"Build"</strong> und wähle <strong className="text-slate-900">"Firestore-Datenbank"</strong> (Firestore Database).</li>
                <li>Klicke auf die blaue Schaltfläche <strong className="text-slate-900">"Datenbank erstellen"</strong>.</li>
                <li>
                  <strong>Standort wählen:</strong> Wähle einen europäischen Standort für beste DSGVO-Konformität:
                  <div className="mt-1.5 p-2 bg-blue-50 text-blue-800 rounded-lg font-mono text-xs font-bold inline-block">
                    europe-west3 (Frankfurt) oder europe-west1 (Belgien)
                  </div>
                </li>
                <li>
                  Wähle bei den Sicherheitsregeln <strong className="text-slate-900">"Im Testmodus starten"</strong> aus (damit AgriTrack sofort Daten speichern darf).
                </li>
                <li>Klicke auf <strong className="text-slate-900">"Aktivieren"</strong>.</li>
              </ol>
            </div>
          )}

          {/* Step 4 */}
          {activeStep === 4 && (
            <div className="space-y-4 animate-in fade-in">
              <h3 className="font-extrabold text-slate-900 text-base">Schritt 4: Sicherheitsregeln prüfen</h3>
              <p className="text-xs text-slate-600">
                Damit deine Geräte und Mitarbeiter ohne Berechtigungsfehler Daten synchronisieren können, trage in Firestore unter dem Reiter <strong className="text-slate-900">"Regeln" (Rules)</strong> folgendes ein:
              </p>

              <div className="relative">
                <pre className="bg-slate-900 text-slate-200 p-4 rounded-2xl font-mono text-xs overflow-x-auto border border-slate-800">
                  {sampleRules}
                </pre>
                <button
                  onClick={() => copyToClipboard(sampleRules)}
                  className="absolute top-3 right-3 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-bold flex items-center backdrop-blur transition-all active:scale-95"
                >
                  {copiedRule ? <Check size={14} className="mr-1.5 text-green-400" /> : <Copy size={14} className="mr-1.5" />}
                  {copiedRule ? 'Kopiert!' : 'Kopieren'}
                </button>
              </div>

              <p className="text-xs text-slate-500">
                Klicke nach dem Einfügen in der Firebase-Konsole oben rechts auf <strong className="text-slate-800">"Veröffentlichen" (Publish)</strong>.
              </p>
            </div>
          )}

          {/* Step 5 */}
          {activeStep === 5 && (
            <div className="space-y-4 animate-in fade-in">
              <h3 className="font-extrabold text-slate-900 text-base">Schritt 5: Zugangsdaten (Web-App) kopieren</h3>
              
              <ol className="list-decimal list-inside space-y-2 text-xs sm:text-sm text-slate-600">
                <li>Klicke ganz oben links auf das Zahnrad-Symbol ⚙ (<strong className="text-slate-900">"Projekteinstellungen"</strong>).</li>
                <li>Scrolle ganz nach unten zum Bereich <strong className="text-slate-900">"Meine Apps"</strong>.</li>
                <li>Klicke auf das Web-Symbol <span className="font-mono font-bold bg-slate-100 px-2 py-0.5 rounded">&lt;/&gt;</span>.</li>
                <li>Gib einen Spitznamen ein (z. B. <span className="font-bold">AgriTrack</span>) und klicke auf "App registrieren".</li>
                <li>Du siehst nun einen Code-Block, der ungefähr so aussieht:</li>
              </ol>

              <div className="bg-slate-900 text-slate-200 p-4 rounded-2xl font-mono text-xs overflow-x-auto border border-slate-800">
                <span className="text-slate-400">// Kopiere diesen Block oder das JSON-Objekt:</span><br/>
                const firebaseConfig = &#123;<br/>
                &nbsp;&nbsp;apiKey: <span className="text-green-400">"AIzaSy..."</span>,<br/>
                &nbsp;&nbsp;authDomain: <span className="text-green-400">"hof-huber.firebaseapp.com"</span>,<br/>
                &nbsp;&nbsp;projectId: <span className="text-green-400">"hof-huber"</span>,<br/>
                &nbsp;&nbsp;storageBucket: <span className="text-green-400">"hof-huber.firebasestorage.app"</span>,<br/>
                &nbsp;&nbsp;messagingSenderId: <span className="text-green-400">"12345678"</span>,<br/>
                &nbsp;&nbsp;appId: <span className="text-green-400">"1:12345678:web:abcdef..."</span><br/>
                &#125;;
              </div>

              <p className="text-xs text-slate-500">
                Markiere diesen gesamten Block und drücke <strong className="text-slate-800">Strg+C (Kopieren)</strong>.
              </p>
            </div>
          )}

          {/* Step 6 */}
          {activeStep === 6 && (
            <div className="space-y-4 animate-in fade-in">
              <h3 className="font-extrabold text-slate-900 text-base">Schritt 6: In AgriTrack aktivieren & Teilen</h3>
              
              <ol className="list-decimal list-inside space-y-2 text-xs sm:text-sm text-slate-600">
                <li>Füge den kopierten Text einfach in AgriTrack in das Feld <strong className="text-slate-900">"Firebase-Konfiguration einfügen"</strong> ein.</li>
                <li>Klicke auf <strong className="text-blue-600">"Auto-Erkennen"</strong> – alle Werte werden automatisch ausgefüllt!</li>
                <li>Klicke auf <strong className="text-slate-900">"Verbindung testen"</strong>. Wenn ein grünes Häkchen erscheint, klicke auf <strong className="text-green-600 font-bold">"Betriebs-Cloud aktivieren & speichern"</strong>.</li>
              </ol>

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl space-y-2">
                <div className="font-bold text-xs text-blue-900 flex items-center">
                  <CheckCircle2 size={16} className="text-blue-600 mr-2"/>
                  Mitarbeiter & Familie anbinden
                </div>
                <p className="text-xs text-blue-800">
                  Sobald deine Cloud aktiv ist, kannst du mit einem Klick auf <strong>"Betriebs-QR-Code anzeigen"</strong> einen QR-Code auf deinem Bildschirm anzeigen. Mitarbeiter scannen diesen mit ihrem Smartphone und sind sofort synchronisiert – ohne jemals etwas abtippen zu müssen!
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center shrink-0">
          <button
            onClick={() => setActiveStep(prev => Math.max(1, prev - 1))}
            disabled={activeStep === 1}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeStep === 1 ? 'opacity-30 cursor-not-allowed text-slate-400' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
          >
            Zurück
          </button>

          <span className="text-xs font-bold text-slate-400">
            Schritt {activeStep} von {steps.length}
          </span>

          {activeStep < steps.length ? (
            <button
              onClick={() => setActiveStep(prev => Math.min(steps.length, prev + 1))}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center shadow-md transition-all active:scale-95"
            >
              Weiter
              <ChevronRight size={16} className="ml-1" />
            </button>
          ) : (
            <button
              onClick={onClose}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold flex items-center shadow-md transition-all active:scale-95"
            >
              Verstanden & Einrichten
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
