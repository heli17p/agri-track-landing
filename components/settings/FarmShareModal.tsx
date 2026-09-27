import React, { useEffect, useState } from 'react';
import { X, QrCode, Copy, Check, Share2, Smartphone, ZoomIn, ZoomOut, Sparkles, Download, CheckCircle2 } from 'lucide-react';
import { CustomFirebaseConfig, generateFarmShareUrl } from '../../services/storage';
import { generateQrSvg } from '../../utils/qrGenerator';

interface Props {
  show: boolean;
  onClose: () => void;
  config: CustomFirebaseConfig;
  farmPin?: string;
}

export const FarmShareModal: React.FC<Props> = ({ show, onClose, config, farmPin }) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [svgString, setSvgString] = useState<string>('');
  const [isLarge, setIsLarge] = useState(false);

  // Kompakter Kopplungscode: projectId~apiKey~appId~farmPin~farmName
  const pairingCode = [
    config.projectId || '',
    config.apiKey || '',
    config.appId || '',
    farmPin || '',
    encodeURIComponent(config.farmName || '')
  ].join('~');

  useEffect(() => {
    if (show && config) {
      const url = generateFarmShareUrl(config, farmPin);
      setShareUrl(url);

      try {
        const svg = generateQrSvg(url, {
          size: isLarge ? 340 : 260,
          margin: 4,
          darkColor: '#000000',
          lightColor: '#ffffff',
          ecc: 'M'
        });
        setSvgString(svg);
      } catch (err) {
        console.error('Fehler beim Generieren des QR-Codes:', err);
      }
    }
  }, [show, config, farmPin, isLarge]);

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
    if (!svgString) return;
    try {
      const canvas = document.createElement('canvas');
      const size = 640; // Gestochen scharfe 640x640 Auflösung für Druck & Scannen
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = new Image();
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      img.onload = () => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);
        URL.revokeObjectURL(url);

        const a = document.createElement('a');
        const cleanName = (config.farmName || config.projectId || 'betrieb')
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, '_');
        a.download = `agritrack-qr-${cleanName}.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
        setDownloaded(true);
        setTimeout(() => setDownloaded(false), 2500);
      };
      img.src = url;
    } catch (e) {
      console.error('Fehler beim PNG-Download:', e);
    }
  };

  const handleNativeShare = async () => {
    const title = `AgriTrack Zugang: ${config.farmName || config.projectId}`;
    const text = `Servus! Hier ist der Direkt-Link zur Betriebs-Cloud für unsere AgriTrack-App:\n\nBetrieb: ${config.farmName || config.projectId}\n${farmPin ? `PIN: ${farmPin}\n` : ''}\nEinfach diesen Link auf dem Smartphone öffnen:\n${shareUrl}`;

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url: shareUrl });
      } catch (e) {
        // User aborted
      }
    } else {
      // Fallback: Link kopieren und WhatsApp Web öffnen falls möglich
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
                  ISO/IEC 18004 Standard-QR
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
              {svgString ? (
                <div 
                  className="flex items-center justify-center transition-all duration-200"
                  dangerouslySetInnerHTML={{ __html: svgString }} 
                />
              ) : (
                <div className="w-[260px] h-[260px] flex items-center justify-center text-slate-400 text-xs">
                  Erstelle QR-Code...
                </div>
              )}

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
          </div>

          {/* Details Box */}
          <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl text-left space-y-1.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-bold uppercase text-[9px] tracking-wider">Betrieb:</span>
              <span className="font-extrabold text-slate-800">{config.farmName || config.projectId}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-bold uppercase text-[9px] tracking-wider">Cloud Projekt-ID:</span>
              <span className="font-mono font-bold text-blue-600">{config.projectId}</span>
            </div>
            {farmPin && (
              <div className="flex justify-between items-center pt-1 border-t border-slate-200">
                <span className="text-slate-500 font-bold uppercase text-[9px] tracking-wider">Betriebs-PIN:</span>
                <span className="font-mono font-black text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {farmPin}
                </span>
              </div>
            )}
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
