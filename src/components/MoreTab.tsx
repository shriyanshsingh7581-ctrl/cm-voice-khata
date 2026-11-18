import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Store,
  Settings,
  ShieldCheck,
  LogOut,
  ChevronRight,
  ArrowLeft,
  Camera,
  Loader2,
  PenTool,
  RotateCcw,
  Check,
  Download,
  Printer,
  FileText,
  X,
} from 'lucide-react';
import {
  APP_OFFICIAL_NAME,
  BusinessProfile,
  CM_LOGO_PATH,
  ShopSettings,
} from '../types';
import { uploadToCloudinary } from '../services/cloudinary';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface MoreTabProps {
  userEmail: string;
  businessProfile: BusinessProfile;
  shopSettings: ShopSettings;
  onSaveProfile: (profile: BusinessProfile) => Promise<void>;
  onSaveSettings: (settings: ShopSettings) => Promise<void>;
  onLogout: () => Promise<void>;
}

export const MoreTab: React.FC<MoreTabProps> = ({
  userEmail,
  businessProfile,
  shopSettings,
  onSaveProfile,
  onSaveSettings,
  onLogout,
}) => {
  const [section, setSection] = useState<'menu' | 'profile' | 'settings' | 'about'>('menu');
  const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | null>(null);

  // Profile Editor State
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const sigCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawnSig, setHasDrawnSig] = useState(false);

  const [profileForm, setProfileForm] = useState<BusinessProfile>(businessProfile);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSavedToast, setProfileSavedToast] = useState(false);
  const [resetSuccessMsg, setResetSuccessMsg] = useState('');

  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    setProfileForm(businessProfile);
  }, [businessProfile]);

  const completionPct = useMemo(() => {
    const fields = [
      profileForm.businessName,
      profileForm.industry,
      profileForm.gstin,
      profileForm.phone1,
      profileForm.email,
      profileForm.address,
      profileForm.state,
      profileForm.businessType,
      profileForm.logoUrl,
      profileForm.signatureUrl,
    ];
    const filled = fields.filter((f) => String(f || '').trim().length > 0).length;
    return Math.round((filled / fields.length) * 100);
  }, [profileForm]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingLogo(true);
    try {
      const url = await uploadToCloudinary(file);
      const updated = { ...profileForm, logoUrl: url };
      setProfileForm(updated);
      await onSaveProfile(updated);
    } finally {
      setUploadingLogo(false);
    }
  };

  // HTML5 Canvas Signature Pad handlers
  const getCanvasPos = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const startSig = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getCanvasPos(e);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
    setHasDrawnSig(true);
  };

  const moveSig = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawing) return;
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getCanvasPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const endSig = () => {
    setIsDrawing(false);
  };

  const clearSignatureCanvas = () => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawnSig(false);
  };

  const handleSaveProfileForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      let sigUrl = profileForm.signatureUrl;
      if (hasDrawnSig && sigCanvasRef.current) {
        const blob: Blob | null = await new Promise((resolve) =>
          sigCanvasRef.current?.toBlob((b) => resolve(b), 'image/png')
        );
        if (blob) {
          sigUrl = await uploadToCloudinary(blob);
        }
      }
      const nextProfile = { ...profileForm, signatureUrl: sigUrl };
      setProfileForm(nextProfile);
      await onSaveProfile(nextProfile);
      setHasDrawnSig(false);
      setProfileSavedToast(true);
      setTimeout(() => setProfileSavedToast(false), 2500);
    } finally {
      setSavingProfile(false);
    }
  };

  const toggleSetting = async (key: keyof ShopSettings) => {
    const currentVal = Boolean(shopSettings[key]);
    const nextSettings = { ...shopSettings, [key]: !currentVal };
    await onSaveSettings(nextSettings);
    if (key === 'bluetoothPrinter' && !currentVal) {
      window.print();
    }
  };

  if (section === 'profile') {
    return (
      <div className="space-y-4 pb-28">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setSection('menu')}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600"
          >
            <ArrowLeft className="w-4 h-4" /> Back to More
          </button>
          <span className="text-xs font-extrabold text-[#1B9B62] font-mono-num">
            {completionPct}% Complete
          </span>
        </div>

        {/* Logo & Completion Card */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 flex items-center gap-4">
          <label className="relative w-20 h-20 rounded-2xl bg-[#FBF9F1] border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden shrink-0 cursor-pointer">
            <img
              src={profileForm.logoUrl || CM_LOGO_PATH}
              alt="Business Logo"
              className="w-full h-full object-contain p-1"
            />
            <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] font-bold py-0.5 text-center flex items-center justify-center gap-1">
              {uploadingLogo ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Camera className="w-3 h-3" />
              )}
              + Logo
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              disabled={uploadingLogo}
              onChange={handleLogoUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </label>

          <div className="flex-1 min-w-0">
            <h2 className="font-extrabold text-base text-slate-900 truncate">
              {profileForm.businessName || APP_OFFICIAL_NAME}
            </h2>
            <p className="text-xs text-slate-500 truncate">{userEmail}</p>
            <div className="mt-2.5 w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#1B9B62] rounded-full transition-all"
                style={{ width: `${completionPct}%` }}
              />
            </div>
          </div>
        </div>

        <form onSubmit={handleSaveProfileForm} className="space-y-4">
          {/* Basic Details */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200/80 space-y-3">
            <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
              Basic Details
            </h3>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Business Name</label>
              <input
                type="text"
                required
                value={profileForm.businessName}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, businessName: e.target.value })
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FBF9F1] border border-slate-200 text-sm font-semibold"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Industry</label>
                <input
                  type="text"
                  value={profileForm.industry}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, industry: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">GSTIN</label>
                <input
                  type="text"
                  value={profileForm.gstin}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, gstin: e.target.value.toUpperCase() })
                  }
                  placeholder="23AAAAA0000A1Z5"
                  className="w-full px-3 py-2 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs uppercase font-mono-num"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Phone 1</label>
                <input
                  type="tel"
                  value={profileForm.phone1}
                  onChange={(e) => setProfileForm({ ...profileForm, phone1: e.target.value })}
                  placeholder="+91 98..."
                  className="w-full px-3 py-2 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Phone 2</label>
                <input
                  type="tel"
                  value={profileForm.phone2}
                  onChange={(e) => setProfileForm({ ...profileForm, phone2: e.target.value })}
                  placeholder="Optional"
                  className="w-full px-3 py-2 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs font-mono-num"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Business Email</label>
              <input
                type="email"
                value={profileForm.email}
                onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Shop Address</label>
              <input
                type="text"
                value={profileForm.address}
                onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                placeholder="Market road, city, PIN"
                className="w-full px-3.5 py-2 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs"
              />
            </div>
          </div>

          {/* Business Details */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200/80 space-y-3">
            <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
              Business Details
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">State</label>
                <input
                  type="text"
                  value={profileForm.state}
                  onChange={(e) => setProfileForm({ ...profileForm, state: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Business Type
                </label>
                <select
                  value={profileForm.businessType}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, businessType: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs"
                >
                  <option value="Retailer / Shop">Retailer / Shop</option>
                  <option value="Wholesaler">Wholesaler</option>
                  <option value="Distributor">Distributor</option>
                  <option value="Manufacturer">Manufacturer</option>
                  <option value="Services">Services</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                Books Beginning Date
              </label>
              <input
                type="date"
                value={profileForm.booksBeginningDate}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, booksBeginningDate: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs"
              />
            </div>
          </div>

          {/* Digital Signature Pad */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <PenTool className="w-4 h-4 text-[#6A4CFF]" />
                <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                  Signature Pad (For Invoices)
                </h3>
              </div>
              <button
                type="button"
                onClick={clearSignatureCanvas}
                className="text-xs font-bold text-rose-600 flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Clear
              </button>
            </div>

            {profileForm.signatureUrl && !hasDrawnSig && (
              <div className="p-2 rounded-xl bg-[#FBF9F1] border border-slate-200 text-center">
                <img
                  src={profileForm.signatureUrl}
                  alt="Saved Signature"
                  className="h-14 mx-auto object-contain"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Saved Signature (draw below to replace)
                </p>
              </div>
            )}

            <canvas
              ref={sigCanvasRef}
              width={360}
              height={130}
              onMouseDown={startSig}
              onMouseMove={moveSig}
              onMouseUp={endSig}
              onMouseLeave={endSig}
              onTouchStart={startSig}
              onTouchMove={moveSig}
              onTouchEnd={endSig}
              className="w-full h-32 rounded-2xl bg-[#FBF9F1] border-2 border-dashed border-slate-300 touch-none cursor-crosshair"
            />
            <p className="text-[11px] text-slate-400 text-center">
              Create your signature here — automatically embeds on PDF invoices
            </p>
          </div>

          {profileSavedToast && (
            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-[#1B9B62] text-xs font-bold text-center">
              ✓ Business Profile &amp; Signature saved to Cloud!
            </div>
          )}

          <button
            type="submit"
            disabled={savingProfile}
            className="w-full py-3.5 rounded-2xl bg-[#1B9B62] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md"
          >
            {savingProfile ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Save Business Profile
          </button>
        </form>
      </div>
    );
  }

  if (section === 'settings') {
    const toggleRows: Array<{ key: keyof ShopSettings; label: string; desc: string }> = [
      {
        key: 'askWhichCustomer',
        label: 'Ask which customer',
        desc: 'Prompt customer selection when creating bills',
      },
      {
        key: 'roundOffBillTotal',
        label: 'Round off bill total',
        desc: 'Automatically round invoice total to nearest ₹1',
      },
      {
        key: 'whatsappBillToCustomer',
        label: 'WhatsApp bill to customer',
        desc: 'Enable instant WhatsApp bill sharing',
      },
      {
        key: 'saveNewItemsToCatalog',
        label: 'Save new items to catalog',
        desc: 'Auto-add spoken or manual items to Items inventory',
      },
      {
        key: 'pricesIncludeGst',
        label: 'Prices include GST',
        desc: 'Treat item rates as GST-inclusive',
      },
      {
        key: 'bluetoothPrinter',
        label: 'Bluetooth printer',
        desc: 'Enable thermal / direct print preview support',
      },
      {
        key: 'showPhoneOnInvoice',
        label: 'Show phone number on invoice',
        desc: 'Print shop phone number in PDF header',
      },
      {
        key: 'showPartyBalanceOnBills',
        label: 'Show party balance on bills',
        desc: 'Include running ledger balance on PDFs',
      },
      {
        key: 'showPaidStampOnBills',
        label: 'Show paid stamp on bills',
        desc: 'Stamp "PAID IN FULL" when balance due is ₹0',
      },
      {
        key: 'showBranding',
        label: `Show ${APP_OFFICIAL_NAME} branding`,
        desc: `Display "Powered by ${APP_OFFICIAL_NAME}" in invoice footer`,
      },
    ];

    return (
      <div className="space-y-4 pb-28">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setSection('menu')}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600"
          >
            <ArrowLeft className="w-4 h-4" /> Back to More
          </button>
          <span className="text-xs font-bold text-slate-500">13 Shop Settings</span>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200/80 divide-y divide-slate-100">
          {toggleRows.map((row) => {
            const active = Boolean(shopSettings[row.key]);
            return (
              <div
                key={row.key}
                className="p-4 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="font-bold text-sm text-slate-900">{row.label}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{row.desc}</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={active}
                  onClick={() => toggleSetting(row.key)}
                  className={`w-12 h-7 rounded-full p-1 transition-colors shrink-0 ${
                    active ? 'bg-[#1B9B62]' : 'bg-slate-200'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                      active ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            );
          })}

          {/* 11. Default Invoice Design */}
          <div className="p-4 flex items-center justify-between gap-3">
            <div>
              <div className="font-bold text-sm text-slate-900">Default invoice design</div>
              <div className="text-xs text-slate-500">PDF export format</div>
            </div>
            <select
              value={shopSettings.defaultInvoiceDesign}
              onChange={(e) =>
                onSaveSettings({
                  ...shopSettings,
                  defaultInvoiceDesign: e.target.value as ShopSettings['defaultInvoiceDesign'],
                })
              }
              className="px-3 py-2 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs font-bold"
            >
              <option value="Modern A4">Modern A4</option>
              <option value="Thermal 80mm">Thermal 80mm</option>
              <option value="Classic GST">Classic GST</option>
            </select>
          </div>

          {/* 12. Bill Language */}
          <div className="p-4 flex items-center justify-between gap-3">
            <div>
              <div className="font-bold text-sm text-slate-900">Bill language</div>
              <div className="text-xs text-slate-500">Preferred bill &amp; voice locale</div>
            </div>
            <select
              value={shopSettings.billLanguage}
              onChange={(e) =>
                onSaveSettings({
                  ...shopSettings,
                  billLanguage: e.target.value as ShopSettings['billLanguage'],
                })
              }
              className="px-3 py-2 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs font-bold"
            >
              <option value="English">English</option>
              <option value="Hinglish">Hinglish</option>
              <option value="Hindi (हिंदी)">Hindi (हिंदी)</option>
            </select>
          </div>

          {/* 13. Reset Invoice Numbers */}
          <div className="p-4 flex items-center justify-between gap-3">
            <div>
              <div className="font-bold text-sm text-slate-900">Reset numbers</div>
              <div className="text-xs text-slate-500">
                Next bill counter: #{shopSettings.nextInvoiceNumber}
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                await onSaveSettings({ ...shopSettings, nextInvoiceNumber: 1 });
                setResetSuccessMsg('Bill numbering reset to #1');
                setTimeout(() => setResetSuccessMsg(''), 2500);
              }}
              className="px-3.5 py-2 rounded-xl bg-rose-50 text-rose-700 text-xs font-bold"
            >
              Reset to #1
            </button>
          </div>
        </div>

        {resetSuccessMsg && (
          <div className="p-3 rounded-2xl bg-emerald-50 text-[#1B9B62] text-xs font-bold text-center">
            {resetSuccessMsg}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-28">
      {/* Branded Profile Summary Banner */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-[#FBF9F1] border border-slate-200 p-1 shrink-0">
          <img
            src={businessProfile.logoUrl || CM_LOGO_PATH}
            alt={APP_OFFICIAL_NAME}
            className="w-full h-full object-contain rounded-xl"
          />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-extrabold text-base text-slate-900 truncate">
            {businessProfile.businessName || APP_OFFICIAL_NAME}
          </h2>
          <p className="text-xs text-slate-500 truncate">{userEmail}</p>
        </div>
        <button
          onClick={() => setSection('profile')}
          className="px-3 py-1.5 rounded-xl bg-[#6A4CFF]/10 text-[#6A4CFF] text-xs font-bold shrink-0"
        >
          Edit
        </button>
      </div>

      {/* In-App PWA Install Prompt Banner */}
      {!isInstalled && (isInstallable || isIOS) && (
        <div className="bg-gradient-to-r from-[#6A4CFF] to-[#5134E0] rounded-3xl p-4 text-white flex items-center justify-between gap-3 shadow-md">
          <div>
            <div className="font-extrabold text-sm">Install {APP_OFFICIAL_NAME} App</div>
            <div className="text-xs text-purple-100 mt-0.5">
              Use offline &amp; launch directly from home screen
            </div>
          </div>
          {isInstallable ? (
            <button
              onClick={install}
              className="px-3.5 py-2 rounded-xl bg-white text-[#6A4CFF] text-xs font-extrabold flex items-center gap-1.5 shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Install
            </button>
          ) : (
            <button
              onClick={() => setShowIOSGuide(true)}
              className="px-3.5 py-2 rounded-xl bg-white text-[#6A4CFF] text-xs font-extrabold shrink-0"
            >
              Install iOS
            </button>
          )}
        </div>
      )}

      {/* Navigation Menu List */}
      <div className="bg-white rounded-3xl border border-slate-200/80 divide-y divide-slate-100">
        <button
          onClick={() => setSection('profile')}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 rounded-t-3xl transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#1B9B62] flex items-center justify-center">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm text-slate-900">Business Profile</div>
              <div className="text-xs text-slate-500">
                Logo, GSTIN, Address &amp; Signature Pad ({completionPct}%)
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>

        <button
          onClick={() => setSection('settings')}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-[#6A4CFF] flex items-center justify-center">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm text-slate-900">Shop Settings</div>
              <div className="text-xs text-slate-500">
                Invoice design, GST, WhatsApp, Branding &amp; 13 toggles
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>

        <button
          onClick={() => window.print()}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm text-slate-900">Printer Setup</div>
              <div className="text-xs text-slate-500">
                Test thermal / Bluetooth / A4 print dialog
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* About & Legal + Logout */}
      <div className="bg-white rounded-3xl border border-slate-200/80 divide-y divide-slate-100">
        <div className="p-4 flex items-center gap-3">
          <img
            src={CM_LOGO_PATH}
            alt={APP_OFFICIAL_NAME}
            className="w-10 h-10 rounded-xl object-contain border border-slate-100"
          />
          <div>
            <div className="font-extrabold text-sm text-slate-900">{APP_OFFICIAL_NAME}</div>
            <div className="text-xs text-slate-500">🇮🇳 Made in India · Digital Voice Khata</div>
          </div>
        </div>

        <button
          onClick={() => setLegalModal('terms')}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50"
        >
          <div className="flex items-center gap-3">
            <FileText className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-bold text-slate-800">Terms &amp; Conditions</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>

        <button
          onClick={() => setLegalModal('privacy')}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50"
        >
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-bold text-slate-800">Privacy Policy</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>

        <button
          onClick={onLogout}
          className="w-full p-4 flex items-center justify-center gap-2 text-rose-600 font-extrabold text-sm hover:bg-rose-50 rounded-b-3xl transition"
        >
          <LogOut className="w-4 h-4" />
          Logout from {APP_OFFICIAL_NAME}
        </button>
      </div>

      {/* Legal Modal */}
      {legalModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLegalModal(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-3xl p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-base text-slate-900">
                {legalModal === 'terms' ? 'Terms & Conditions' : 'Privacy Policy'}
              </h3>
              <button
                onClick={() => setLegalModal(null)}
                className="p-1.5 rounded-full bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {legalModal === 'terms'
                ? `${APP_OFFICIAL_NAME} provides voice-assisted digital khata, inventory, and GST billing tools for Indian merchants. Always verify tax rates and invoice totals before filing statutory GST returns.`
                : `${APP_OFFICIAL_NAME} isolates every account strictly under your authenticated Firebase user ID (/users/{uid}/). Bill photos, logos, and signatures are stored securely via Cloudinary and never shared across accounts.`}
            </p>
          </div>
        </div>
      )}

      {/* iOS PWA Install Modal */}
      {showIOSGuide && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowIOSGuide(false)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-3xl p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-extrabold text-base text-slate-900">
              Install {APP_OFFICIAL_NAME} on iOS
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              1. Tap the <strong>Share</strong> button in Safari.
              <br />
              2. Scroll down and tap <strong>Add to Home Screen</strong>.
            </p>
            <button
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2.5 rounded-xl bg-slate-100 text-xs font-bold text-slate-800"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
