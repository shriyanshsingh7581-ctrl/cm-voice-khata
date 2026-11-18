import React, { useState } from 'react';
import { X, Download, MessageCircle, ZoomIn, ZoomOut, Camera } from 'lucide-react';
import { SavedBillPhoto } from '../types';
import {
  buildSavedPhotoWhatsAppMessage,
  formatINR,
  getWhatsAppShareUrl,
} from '../services/exportService';

interface PhotoViewerModalProps {
  photo: SavedBillPhoto | null;
  businessName: string;
  showBranding: boolean;
  onClose: () => void;
}

export const PhotoViewerModal: React.FC<PhotoViewerModalProps> = ({
  photo,
  businessName,
  showBranding,
  onClose,
}) => {
  const [zoomed, setZoomed] = useState(false);

  if (!photo) return null;

  const waHref = getWhatsAppShareUrl(
    '',
    buildSavedPhotoWhatsAppMessage(photo, businessName, showBranding)
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 text-white flex flex-col justify-between"
      onClick={onClose}
    >
      <div
        className="flex items-center justify-between px-4 py-3.5 bg-black/60 border-b border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-extrabold">{photo.partyName}</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 flex items-center gap-1">
              <Camera className="w-3 h-3" /> {photo.billType} Photo Bill
            </span>
          </div>
          <p className="text-xs text-slate-300 font-mono-num">
            {photo.date} {photo.amount > 0 ? `· ${formatINR(photo.amount)}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoomed(!zoomed)}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"
            aria-label="Toggle zoom"
          >
            {zoomed ? <ZoomOut className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"
            aria-label="Close photo viewer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div
        className="flex-1 overflow-auto flex items-center justify-center p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={photo.imageUrl}
          alt={photo.partyName}
          onClick={() => setZoomed(!zoomed)}
          className={`transition-transform duration-200 rounded-xl shadow-2xl cursor-pointer ${
            zoomed ? 'scale-150' : 'max-h-[72vh] w-auto object-contain'
          }`}
        />
      </div>

      <div
        className="px-4 py-4 bg-black/80 border-t border-white/10 space-y-2"
        onClick={(e) => e.stopPropagation()}
      >
        {photo.note && <p className="text-xs text-slate-300 text-center">{photo.note}</p>}
        <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
          <a
            href={photo.imageUrl}
            download={`cm-bill-photo-${photo.date}.jpg`}
            target="_blank"
            rel="noreferrer"
            className="py-3 rounded-2xl bg-white/15 text-white text-xs font-bold flex items-center justify-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            Download Photo
          </a>
          <a
            href={waHref}
            target="_blank"
            rel="noreferrer"
            className="py-3 rounded-2xl bg-[#1B9B62] text-white text-xs font-bold flex items-center justify-center gap-1.5"
          >
            <MessageCircle className="w-4 h-4" />
            Share WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
};
