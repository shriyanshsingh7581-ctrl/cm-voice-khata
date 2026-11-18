import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  X,
  Upload,
  Sparkles,
  Image as ImageIcon,
  Loader2,
  ScanBarcode,
  Check,
  RefreshCw,
} from 'lucide-react';
import { Party, VoiceParsedBillPayload } from '../types';
import { fileToBase64, uploadToCloudinary } from '../services/cloudinary';

interface DualModeCameraModalProps {
  isOpen: boolean;
  mode?: 'bill' | 'barcode';
  parties: Party[];
  onClose: () => void;
  onSaveNormalPhotoBill: (data: {
    imageUrl: string;
    partyId: string;
    partyName: string;
    billType: 'Sale' | 'Purchase' | 'Expense';
    amount: number;
    date: string;
    note: string;
  }) => Promise<void>;
  onAIScanComplete: (parsed: VoiceParsedBillPayload, attachmentUrl: string) => void;
  onBarcodeDetected?: (barcodeValue: string) => void;
}

export const DualModeCameraModal: React.FC<DualModeCameraModalProps> = ({
  isOpen,
  mode = 'bill',
  parties,
  onClose,
  onSaveNormalPhotoBill,
  onAIScanComplete,
  onBarcodeDetected,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [capturedDataUrl, setCapturedDataUrl] = useState('');
  const [capturedBase64, setCapturedBase64] = useState('');
  const [capturedMimeType, setCapturedMimeType] = useState('image/jpeg');
  const [capturedFile, setCapturedFile] = useState<Blob | File | null>(null);

  // Dual mode selection after capture
  const [selectedAction, setSelectedAction] = useState<'choice' | 'normal-form'>('choice');
  const [partyName, setPartyName] = useState('');
  const [partyId, setPartyId] = useState('');
  const [billType, setBillType] = useState<'Sale' | 'Purchase' | 'Expense'>('Sale');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');

  const [isUploading, setIsUploading] = useState(false);
  const [isScanningAI, setIsScanningAI] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [manualBarcode, setManualBarcode] = useState('');

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      });
      streamRef.current = stream;
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch {
      setCameraActive(false);
      setCameraError(
        'Live viewfinder is unavailable in this environment. Use "Open Phone Camera" or "Upload from Gallery" below.'
      );
    }
  };

  useEffect(() => {
    if (isOpen) {
      setCapturedDataUrl('');
      setCapturedBase64('');
      setCapturedFile(null);
      setSelectedAction('choice');
      setStatusError('');
      setManualBarcode('');
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Live BarcodeDetector loop when in barcode mode
  useEffect(() => {
    if (!isOpen || mode !== 'barcode' || !cameraActive) return;
    const win = window as unknown as {
      BarcodeDetector?: new (opts?: { formats: string[] }) => {
        detect: (src: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
      };
    };
    if (!win.BarcodeDetector) return;

    const detector = new win.BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'upc_a', 'code_128', 'qr_code'],
    });
    let active = true;
    const timer = window.setInterval(async () => {
      if (!active || !videoRef.current || videoRef.current.readyState < 2) return;
      try {
        const codes = await detector.detect(videoRef.current);
        if (codes.length > 0 && codes[0].rawValue) {
          active = false;
          stopCamera();
          onBarcodeDetected?.(codes[0].rawValue);
          onClose();
        }
      } catch {
        // ignore frame error
      }
    }, 500);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [isOpen, mode, cameraActive, onBarcodeDetected, onClose]);

  const handleCaptureFrame = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    const base64 = dataUrl.split(',')[1] || '';
    setCapturedDataUrl(dataUrl);
    setCapturedBase64(base64);
    setCapturedMimeType('image/jpeg');
    canvas.toBlob(
      (blob) => {
        if (blob) setCapturedFile(blob);
      },
      'image/jpeg',
      0.88
    );
    stopCamera();
  };

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatusError('');
    try {
      const { base64, dataUrl, mimeType } = await fileToBase64(file);
      setCapturedDataUrl(dataUrl);
      setCapturedBase64(base64);
      setCapturedMimeType(mimeType);
      setCapturedFile(file);
      stopCamera();
    } catch {
      setStatusError('Could not read the selected image.');
    }
  };

  const handleSaveNormalPhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!capturedFile && !capturedDataUrl) return;
    setIsUploading(true);
    setStatusError('');
    try {
      const uploadedUrl = await uploadToCloudinary(capturedFile || capturedDataUrl);
      const matchedParty = parties.find(
        (p) => p.name.toLowerCase() === partyName.trim().toLowerCase()
      );
      await onSaveNormalPhotoBill({
        imageUrl: uploadedUrl,
        partyId: partyId || matchedParty?.id || '',
        partyName: partyName.trim() || 'Walk-in Party',
        billType,
        amount: parseFloat(amount) || 0,
        date,
        note: note.trim(),
      });
      onClose();
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Failed to upload bill photo');
    } finally {
      setIsUploading(false);
    }
  };

  const handleAIScan = async () => {
    if (!capturedBase64) return;
    setIsScanningAI(true);
    setStatusError('');
    try {
      // Run Cloudinary upload + AI Vision extraction in parallel
      const [cloudinaryUrl, aiRes] = await Promise.all([
        uploadToCloudinary(capturedFile || capturedDataUrl),
        fetch('/api/ai/scan-bill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: capturedBase64,
            mimeType: capturedMimeType,
          }),
        }),
      ]);

      if (!aiRes.ok) {
        const errBody = (await aiRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error || 'AI scanning failed on this photo');
      }

      const data = (await aiRes.json()) as { parsed: VoiceParsedBillPayload };
      onAIScanComplete(data.parsed, cloudinaryUrl);
      onClose();
    } catch (err) {
      setStatusError(
        err instanceof Error
          ? err.message
          : 'AI scan failed. You can still save it as a Normal Bill Photo.'
      );
    } finally {
      setIsScanningAI(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col justify-between overflow-y-auto">
      {/* Hidden Android WebView-compatible Native Camera & Gallery Inputs */}
      <input
        ref={nativeCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFilePicked}
        className="hidden"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleFilePicked}
        className="hidden"
      />

      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3.5 bg-slate-900/90 border-b border-white/10 sticky top-0 z-10">
        <div className="flex items-center gap-2.5">
          {mode === 'barcode' ? (
            <ScanBarcode className="w-5 h-5 text-[#34D399]" />
          ) : (
            <Camera className="w-5 h-5 text-[#A78BFA]" />
          )}
          <span className="font-bold text-sm">
            {mode === 'barcode'
              ? 'Scan Item Barcode'
              : capturedDataUrl
              ? 'Choose Bill Photo Action'
              : 'Scan or Capture Bill Photo'}
          </span>
        </div>
        <button
          onClick={() => {
            stopCamera();
            onClose();
          }}
          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20"
          aria-label="Close camera"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 max-w-lg w-full mx-auto">
        {mode === 'barcode' ? (
          <div className="w-full space-y-4">
            <div className="relative rounded-3xl overflow-hidden bg-black aspect-[4/3] border border-white/15 flex items-center justify-center">
              {cameraActive ? (
                <>
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-8 border-2 border-[#34D399] rounded-2xl pointer-events-none" />
                </>
              ) : (
                <div className="p-6 text-center text-sm text-slate-300">
                  {cameraError || 'Starting barcode scanner...'}
                </div>
              )}
            </div>

            <div className="bg-slate-900 rounded-2xl p-4 border border-white/10">
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                Or Enter / Scan Barcode Manually
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualBarcode}
                  onChange={(e) => setManualBarcode(e.target.value)}
                  placeholder="e.g. 8901234567890"
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-800 border border-white/15 text-sm text-white focus:outline-none focus:border-[#34D399]"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (manualBarcode.trim()) {
                      onBarcodeDetected?.(manualBarcode.trim());
                      onClose();
                    }
                  }}
                  className="px-4 py-2.5 rounded-xl bg-[#1B9B62] font-bold text-sm"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        ) : !capturedDataUrl ? (
          /* Camera Viewfinder + Mandatory APK Native Fallbacks */
          <div className="w-full space-y-4">
            <div className="relative rounded-3xl overflow-hidden bg-slate-900 aspect-[3/4] max-h-[58vh] border border-white/15 flex items-center justify-center">
              {cameraActive ? (
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="p-6 text-center space-y-3">
                  <Camera className="w-12 h-12 text-slate-500 mx-auto" />
                  <p className="text-xs text-slate-300 max-w-xs mx-auto">
                    {cameraError || 'Camera preview inactive. Use the native camera button below.'}
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {cameraActive && (
                <button
                  onClick={handleCaptureFrame}
                  className="w-full py-3.5 rounded-2xl bg-[#6A4CFF] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg"
                >
                  <Camera className="w-5 h-5" />
                  Capture Bill Photo
                </button>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => nativeCameraInputRef.current?.click()}
                  className="py-3 px-3 rounded-2xl bg-[#1B9B62] text-white font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <Camera className="w-4 h-4" />
                  Open Phone Camera
                </button>
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="py-3 px-3 rounded-2xl bg-white/10 text-white font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-white/20"
                >
                  <Upload className="w-4 h-4" />
                  Upload from Gallery
                </button>
              </div>
            </div>
          </div>
        ) : selectedAction === 'choice' ? (
          /* DUAL-MODE PREVIEW CHOICE SCREEN */
          <div className="w-full space-y-4">
            <div className="relative rounded-3xl overflow-hidden bg-slate-900 border border-white/15 max-h-[42vh] flex items-center justify-center">
              <img
                src={capturedDataUrl}
                alt="Captured Bill Preview"
                className="max-h-[42vh] w-auto object-contain"
              />
              <button
                onClick={() => {
                  setCapturedDataUrl('');
                  setCapturedBase64('');
                  startCamera();
                }}
                className="absolute top-3 right-3 px-3 py-1.5 rounded-xl bg-black/70 text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retake
              </button>
            </div>

            {statusError && (
              <div className="p-3 rounded-2xl bg-rose-500/20 border border-rose-400/30 text-rose-200 text-xs">
                {statusError}
              </div>
            )}

            <div className="space-y-3">
              {/* OPTION 1: Save Normal Bill Photo Only */}
              <button
                type="button"
                disabled={isScanningAI}
                onClick={() => setSelectedAction('normal-form')}
                className="w-full p-4 rounded-2xl bg-[#1B9B62] hover:bg-[#168452] text-left text-white shadow-lg transition flex items-start gap-3.5"
              >
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0 mt-0.5">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-extrabold text-sm">
                    📸 Save Normal Bill Photo Only
                  </div>
                  <div className="text-xs text-emerald-100 mt-0.5">
                    सीधा बिल फोटो सेव करें (Without AI scanning — quick photo record)
                  </div>
                </div>
              </button>

              {/* OPTION 2: Scan with AI & Create Digital Bill */}
              <button
                type="button"
                disabled={isScanningAI}
                onClick={handleAIScan}
                className="w-full p-4 rounded-2xl bg-[#6A4CFF] hover:bg-[#5A3CE8] text-left text-white shadow-lg transition flex items-start gap-3.5 disabled:opacity-70"
              >
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0 mt-0.5">
                  {isScanningAI ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Sparkles className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <div className="font-extrabold text-sm">
                    {isScanningAI
                      ? 'Scanning Bill with AI...'
                      : '✨ Scan with AI & Create Digital Bill'}
                  </div>
                  <div className="text-xs text-purple-100 mt-0.5">
                    AI से बिल बनाएं (Auto-extract Party, Items, Rates &amp; GST)
                  </div>
                </div>
              </button>
            </div>
          </div>
        ) : (
          /* OPTION 1 FORM: Save Normal Bill Photo Only */
          <form onSubmit={handleSaveNormalPhoto} className="w-full space-y-3.5 bg-white text-slate-900 rounded-3xl p-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-base text-slate-900">
                  Save Normal Bill Photo
                </h3>
                <p className="text-xs text-slate-500">
                  Stores original photo in Cloudinary &amp; Firebase Bills feed
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAction('choice')}
                className="text-xs font-bold text-[#6A4CFF]"
              >
                Back
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Bill Type
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Sale', 'Purchase', 'Expense'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setBillType(t)}
                    className={`py-2 rounded-xl text-xs font-bold border transition ${
                      billType === t
                        ? 'bg-[#1B9B62] text-white border-[#1B9B62]'
                        : 'bg-[#FBF9F1] text-slate-700 border-slate-200'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Party Name (Optional)
              </label>
              <input
                type="text"
                list="camera-party-list"
                value={partyName}
                onChange={(e) => {
                  setPartyName(e.target.value);
                  const found = parties.find(
                    (p) => p.name.toLowerCase() === e.target.value.toLowerCase()
                  );
                  setPartyId(found?.id || '');
                }}
                placeholder="e.g. Sharma Traders or Walk-in"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FBF9F1] border border-slate-200 text-sm focus:outline-none focus:border-[#1B9B62]"
              />
              <datalist id="camera-party-list">
                {parties.map((p) => (
                  <option key={p.id} value={p.name} />
                ))}
              </datalist>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Amount ₹ (Optional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#FBF9F1] border border-slate-200 text-sm font-mono-num focus:outline-none focus:border-[#1B9B62]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#FBF9F1] border border-slate-200 text-sm focus:outline-none focus:border-[#1B9B62]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Note (Optional)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Paper bill from wholesale market"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FBF9F1] border border-slate-200 text-sm focus:outline-none focus:border-[#1B9B62]"
              />
            </div>

            {statusError && (
              <div className="p-2.5 rounded-xl bg-rose-50 text-rose-700 text-xs">
                {statusError}
              </div>
            )}

            <button
              type="submit"
              disabled={isUploading}
              className="w-full py-3.5 rounded-2xl bg-[#1B9B62] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md disabled:opacity-60"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading to Cloudinary...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Save Bill Photo
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
