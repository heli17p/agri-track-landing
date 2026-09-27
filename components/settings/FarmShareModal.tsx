import React, { useEffect, useRef, useState } from 'react';
import { X, QrCode, Copy, Check, Share2, Smartphone } from 'lucide-react';
import { CustomFirebaseConfig, generateFarmShareUrl } from '../../services/storage';
import { drawQrToCanvas } from '../../utils/qrGenerator';

interface Props {
  show: boolean;
  onClose: () => void;
  config: CustomFirebaseConfig;
  farmPin?: string;
}

export const FarmShareModal: React.FC<Props> = ({ show, onClose, config, farmPin }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [qrRenderFailed, setQrRenderFailed] = useState(false);

  useEffect(() => {
    if (show && config) {
      const url = generateFarmShareUrl(config, farmPin);
      setShareUrl(url);
      setQrRenderFailed(false);

      // Render QR-Code using zero-dependency pure TypeScript generator
      setTimeout(() => {
        if (canvasRef.current) {
          const success = drawQrToCanvas(canvasRef.current, url, {
            size: 240,
            margin: 2,
            darkColor: '#0f172a',
            lightColor: '#ffffff'
          });
          if (!success) {
            setQrRenderFailed(true);
          }
        }
      }, 50);
    }
  }, [show, config, farmPin]);

  if (!show) return null;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleNativeShare = async () => {
    const title = `AgriTrack Zugang: ${config.farmName || config.projectId}`;
    const text = `Servus! Hier ist der Direkt-Link zur Betriebs-Cloud für unsere AgriTrack-App:\n\nProjekt: ${config.projectId}\n${farmPin ? `PIN: ${farmPin}\n` : ''}\nEinfach diesen Link auf dem Smartphone öffnen:\n${shareUrl}`;

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url: shareUrl });
      } catch (e) {
        // User aborted or unsupported
      }
    } else {
      handleCopyLink();
    }
  };

  // Safe fallback image URL in case canvas is blocked in certain embedded webviews
  const fallbackQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(shareUrl)}`;

  return (
    <div className="fixed inset-0 z-[2600] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-slate-200">
        
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-blue-900 to-indigo-950 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-500/20 text-blue-300 rounded-xl border border-blue-500/30">
              <QrCode size={22} />
            </div>
            <div>
              <h2 className="text-base font-black">Betriebs-QR-Code</h2>
              <p className="text-[11px] text-blue-200">Zugang für Mitarbeiter & Familie</p>
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
        <div className="p-6 overflow-y-auto space-y-5 text-center">
          
          <div className="flex flex-col items-center justify-center">
            <div className="p-3 bg-white border-2 border-slate-200 rounded-2xl shadow-inner inline-block min-w-[240px] min-h-[240px] flex items-center justify-center">
              {!qrRenderFailed ? (
                <canvas ref={canvasRef} className="rounded-lg max-w-full" />
              ) : (
                <img 
                  src={fallbackQrUrl} 
                  alt="Betriebs-QR-Code" 
                  className="w-[240px] h-[240px] rounded-lg object-contain"
                />
              )}
            </div>
            <div className="mt-3 flex items-center justify-center space-x-2 text-xs font-bold text-slate-500">
              <Smartphone size={14} className="text-slate-400" />
              <span>Mit Smartphone-Kamera scannen</span>
            </div>
          </div>

          {/* Details Box */}
          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl text-left space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-bold uppercase text-[9px] tracking-wider">Betriebs-Name:</span>
              <span className="font-bold text-slate-800">{config.farmName || 'Standard-Betrieb'}</span>
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

          <div className="text-[11px] text-slate-500 leading-relaxed">
            Mitarbeiter scannen den Code oder öffnen den Link. Die App fragt automatisch, ob sie der Betriebs-Cloud beitreten möchten.
          </div>

          {/* Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={handleCopyLink}
              className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center justify-center transition-all active:scale-95"
            >
              {copiedLink ? <Check size={16} className="text-green-600 mr-2" /> : <Copy size={16} className="mr-2" />}
              {copiedLink ? 'Kopiert!' : 'Link kopieren'}
            </button>

            <button
              onClick={handleNativeShare}
              className="py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center justify-center shadow-md transition-all active:scale-95"
            >
              <Share2 size={16} className="mr-2" />
              Per WhatsApp teilen
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
