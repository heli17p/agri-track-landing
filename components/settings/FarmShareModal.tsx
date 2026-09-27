import React, { useEffect, useState, useRef } from 'react';
import { X, QrCode, Copy, Check, Share2, Smartphone, ZoomIn, ZoomOut, Sparkles, Download, CheckCircle2, Sliders, ExternalLink } from 'lucide-react';
import { CustomFirebaseConfig, generateFarmShareUrl } from '../../services/storage';
import { drawQrToCanvas, generateQrCanvasDataUrl } from '../../utils/qrGenerator';

interface Props {
  show: boolean;
  onClose: () => void;
  config: CustomFirebaseConfig;
  farmPin?: string;
  farmId?: string;
  farmName?: string;
}

export const FarmShareModal: React.FC<Props> = ({ show, onClose, config, farmPin, farmId, farmName }) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [isLarge, setIsLarge] = useState(false);
  const [eccLevel, setEccLevel] = useState<'L' | 'M'>('L'); // 'L' hat größere Punkte und scannt am schnellsten
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const effectiveFarmId = farmId || config.projectId;
  const effectiveFarmName = farmName || config.farmName || config.projectId;
  const effectiveFarmPin = farmPin || '';

  // Kompakter Kopplungscode: projectId~apiKey~appId~farmPin~farmName~farmId
  const pairingCode = [
    config.projectId || '',
    config.apiKey || '',
    config.appId || '',
    effectiveFarmPin,
    encodeURIComponent(effectiveFarmName),
    effectiveFarmId
  ].join('~');

  useEffect(() => {
    if (show && config) {
      const url = generateFarmShareUrl(config, effectiveFarmPin, effectiveFarmId);
      setShareUrl(url);

      const render = () => {
        if (canvasRef.current) {
          drawQrToCanvas(canvasRef.current, url, {
            size: isLarge ? 360 : 280,
            margin: 4,
            darkColor: '#000000',
            lightColor: '#ffffff',
            ecc: eccLevel,
            boostEcl: false
          });
        }
      };

      render();
      const timer = setTimeout(render, 60);
      return () => clearTimeout(timer);
    }
  }, [show, config, effectiveFarmPin, effectiveFarmId, isLarge, eccLevel]);

  if (!show) return null;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(pairingCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleDownloadPng = () => {
    if (!shareUrl) return;
    try {
      // Erzeugt ein gestochen scharfes, unkomprimiertes High-Res PNG (640x640px)
      const dataUrl = generateQrCanvasDataUrl(shareUrl, {
        size: 640,
        margin: 4,
        darkColor: '#000000',
        lightColor: '#ffffff',
        ecc: eccLevel,
        boostEcl: false
      });

      if (!dataUrl) return;

      const a = document.createElement('a');
      const cleanName = (effectiveFarmName || 'betrieb')
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_');
      a.download = `agritrack-qr-${cleanName}.png`;
      a.href = dataUrl;
      a.click();
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 2500);
    } catch (e) {
      console.error('Fehler beim PNG-Download:', e);
    }
  };

  const handleNativeShare = async () => {
    const title = `AgriTrack Zugang: ${effectiveFarmName}`;
    const text = `Servus! Hier ist der Direkt-Zugang für unseren Hof in der AgriTrack-App:\n\nBetrieb: ${effectiveFarmName}\nFarm-ID: ${effectiveFarmId}\n${effectiveFarmPin ? `Hof-PIN: ${effectiveFarmPin}\n` : ''}\nEinfach diesen Link auf dem Smartphone öffnen:\n${shareUrl}`;

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url: shareUrl });
      } catch (e) {
        // User aborted
      }
    } else {
      // Fallback: Link kopieren und WhatsApp Web öffnen
      handleCopyLink();
      const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
      window.open(waUrl, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-[2600] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-slate-200">
        
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-500/20 text-blue-300 rounded-xl border border-blue-500/30">
              <QrCode size={22} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-300 bg-emerald-950/70 px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center">
                  <Sparkles size={10} className="mr-1" />
                  ISO/IEC 18004 Pixel-Canvas
                </span>
              </div>
              <h2 className="text-base font-black mt-0.5">Betriebs-Zugang teilen</h2>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 text-blue-300 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-center">
          
          {/* QR Code Container */}
          <div className="flex flex-col items-center justify-center">
            <div className="relative p-3.5 bg-white border-2 border-slate-200 rounded-3xl shadow-md inline-block">
              {/* Gestochen scharfes Canvas mit pixel-genauer Ausrichtung */}
              <canvas
                ref={canvasRef}
                className="rounded-xl transition-all duration-200 mx-auto"
                style={{
                  imageRendering: 'pixelated',
                  width: isLarge ? '340px' : '260px',
                  height: isLarge ? '340px' : '260px',
                  display: 'block'
                }}
              />

              {/* Action Tools over QR */}
              <div className="absolute top-2 right-2 flex space-x-1">
                <button
                  type="button"
                  onClick={handleDownloadPng}
                  title="Als Bild herunterladen (PNG)"
                  className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all shadow-sm"
                >
                  {downloaded ? <Check size={14} className="text-green-600" /> : <Download size={14} />}
                </button>
                <button
                  type="button"
                  onClick={() => setIsLarge(prev => !prev)}
                  title={isLarge ? "Verkleinern" : "Vergrößern"}
                  className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all shadow-sm"
                >
                  {isLarge ? <ZoomOut size={14} /> : <ZoomIn size={14} />}
                </button>
              </div>
            </div>

            <div className="mt-2.5 flex items-center justify-center space-x-1.5 text-xs font-bold text-slate-600">
              <Smartphone size={14} className="text-blue-600" />
              <span>Mit Smartphone-Kamera scannen</span>
            </div>

            {/* Punktgröße / Modus Umschalter für maximale Kompatibilität */}
            <div className="mt-2 inline-flex items-center p-0.5 bg-slate-100 rounded-lg text-[11px] font-semibold text-slate-600 border border-slate-200">
              <button
                type="button"
                onClick={() => setEccLevel('L')}
                className={`px-2.5 py-1 rounded-md transition-all ${eccLevel === 'L' ? 'bg-white shadow text-blue-700 font-bold' : 'hover:text-slate-900'}`}
              >
                Große Punkte (Standard)
              </button>
              <button
                type="button"
                onClick={() => setEccLevel('M')}
                className={`px-2.5 py-1 rounded-md transition-all ${eccLevel === 'M' ? 'bg-white shadow text-blue-700 font-bold' : 'hover:text-slate-900'}`}
              >
                Dichter (Level M)
              </button>
            </div>
          </div>

          {/* Details Box */}
          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl text-left space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-bold uppercase text-[9px] tracking-wider">Betrieb:</span>
              <span className="font-extrabold text-slate-800">{effectiveFarmName}</span>
            </div>
            <div className="flex justify-between items-center pt-1.5 border-t border-slate-200">
              <span className="text-slate-500 font-bold uppercase text-[9px] tracking-wider">Farm-ID:</span>
              <span className="font-mono font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                {effectiveFarmId}
              </span>
            </div>
            <div className="flex justify-between items-center pt-1.5 border-t border-slate-200">
              <span className="text-slate-500 font-bold uppercase text-[9px] tracking-wider">Hof-PIN:</span>
              <span className="font-mono font-black text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                {effectiveFarmPin || 'Keine PIN (offen)'}
              </span>
            </div>
            <div className="flex justify-between items-center pt-1.5 border-t border-slate-200 text-slate-400">
              <span className="text-slate-400 font-bold uppercase text-[9px] tracking-wider">Cloud Projekt:</span>
              <span className="font-mono text-[10px] text-slate-500">{config.projectId}</span>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 leading-snug">
            Mitarbeiter richten ihre Smartphone-Kamera auf den Code. Die App öffnet sich direkt und verbindet sich automatisch mit der Betriebs-Cloud.
          </p>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={handleCopyLink}
              className="py-3 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center justify-center transition-all active:scale-95"
            >
              {copiedLink ? <Check size={16} className="text-green-600 mr-1.5" /> : <Copy size={16} className="mr-1.5" />}
              {copiedLink ? 'Link kopiert!' : 'Link kopieren'}
            </button>

            <button
              onClick={handleNativeShare}
              className="py-3 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center justify-center shadow-md transition-all active:scale-95"
            >
              <Share2 size={16} className="mr-1.5" />
              Per WhatsApp
            </button>
          </div>

          {/* Download & Pairing Code Actions */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <button
              onClick={handleDownloadPng}
              className="font-semibold text-slate-600 hover:text-slate-900 flex items-center"
            >
              <Download size={13} className="mr-1 text-slate-400" />
              <span>{downloaded ? 'QR-Code gespeichert!' : 'QR-Code als Bild speichern'}</span>
            </button>

            <button
              onClick={handleCopyCode}
              className="font-bold text-blue-600 hover:text-blue-800 flex items-center ml-2"
            >
              {copiedCode ? <Check size={13} className="mr-1 text-green-600" /> : <Copy size={13} className="mr-1" />}
              <span>Code kopieren</span>
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
