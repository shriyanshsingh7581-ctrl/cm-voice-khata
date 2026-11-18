import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  Home,
  Users,
  Receipt,
  Package,
  Menu,
  Plus,
  Camera,
  BarChart3,
  BookOpen,
  ArrowDownLeft,
  ArrowUpRight,
  Mic,
  FileDown,
  MessageCircle,
  ZoomIn,
  WifiOff,
  CheckCircle2,
} from 'lucide-react';
import {
  auth,
  collection,
  db,
  doc,
  getDefaultBusinessProfile,
  getDefaultShopSettings,
  handleFirestoreError,
  onSnapshot,
  query,
  removeBill,
  removeCatalogItem,
  removeParty,
  removeSavedBillPhoto,
  saveBusinessProfile,
  saveShopSettings,
  signOut,
  upsertBill,
  upsertCatalogItem,
  upsertParty,
  upsertSavedBillPhoto,
  where,
} from './firebase';
import {
  APP_OFFICIAL_NAME,
  Bill,
  BusinessProfile,
  CatalogItem,
  CM_LOGO_PATH,
  LineItem,
  OperationType,
  Party,
  SavedBillPhoto,
  ShopSettings,
  TransactionType,
  VoiceParsedBillPayload,
} from './types';
import { AuthScreen, SplashScreen } from './components/SplashAndAuth';
import { VoiceListeningModal } from './components/VoiceListeningModal';
import { DualModeCameraModal } from './components/DualModeCameraModal';
import {
  CreateBillPickerSheet,
  TransactionFormSheet,
} from './components/TransactionFormSheet';
import { ReportsModal } from './components/ReportsModals';
import { PartiesTab } from './components/PartiesTab';
import { BillsTab } from './components/BillsTab';
import { ItemsTab } from './components/ItemsTab';
import { MoreTab } from './components/MoreTab';
import { PhotoViewerModal } from './components/PhotoViewerModal';
import {
  buildBillWhatsAppMessage,
  buildSavedPhotoWhatsAppMessage,
  downloadBillInvoicePDF,
  formatINR,
  getWhatsAppShareUrl,
} from './services/exportService';
import { useOnlineStatus } from './hooks/usePWAInstall';

type NavTab = 'home' | 'parties' | 'bills' | 'items' | 'more';

export default function App() {
  const isOnline = useOnlineStatus();

  const [showSplash, setShowSplash] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // Per-user Firestore state (clean empty states by default)
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile>(() =>
    getDefaultBusinessProfile('')
  );
  const [shopSettings, setShopSettings] = useState<ShopSettings>(() =>
    getDefaultShopSettings('')
  );
  const [parties, setParties] = useState<Party[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [savedPhotos, setSavedPhotos] = useState<SavedBillPhoto[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);

  // Navigation & Home Feed Filter
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [homeFeedFilter, setHomeFeedFilter] = useState<'all' | 'digital' | 'photos'>('all');

  // Modals & Workflows
  const [showCreatePicker, setShowCreatePicker] = useState(false);
  const [txnFormOpen, setTxnFormOpen] = useState(false);
  const [txnFormType, setTxnFormType] = useState<TransactionType>('Sale');
  const [txnFormParty, setTxnFormParty] = useState<Party | null>(null);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [prefilledVoiceData, setPrefilledVoiceData] = useState<{
    parsed: VoiceParsedBillPayload;
    attachmentUrl?: string;
  } | null>(null);

  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [voiceTxnType, setVoiceTxnType] = useState<TransactionType>('Sale');

  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<'bill' | 'barcode'>('bill');
  const [barcodeCallback, setBarcodeCallback] = useState<((code: string) => void) | null>(null);

  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportType, setReportType] = useState<'sale' | 'daybook'>('sale');

  const [viewingPhoto, setViewingPhoto] = useState<SavedBillPhoto | null>(null);
  const [toastMsg, setToastMsg] = useState<string>('');

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3200);
  }, []);

  // Splash timer (1.4s)
  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 1400);
    return () => clearTimeout(t);
  }, []);

  // Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Strict per-user Firestore listeners under /users/{uid}/
  useEffect(() => {
    if (!user) {
      setParties([]);
      setBills([]);
      setSavedPhotos([]);
      setCatalogItems([]);
      return;
    }

    const uid = user.uid;
    const pendingBiz = localStorage.getItem(`cm_pending_biz_${uid}`);

    const unsubProfile = onSnapshot(
      doc(db, 'users', uid, 'businessProfile', 'main'),
      (snap) => {
        if (snap.exists()) {
          setBusinessProfile(snap.data() as BusinessProfile);
        } else {
          const def = getDefaultBusinessProfile(uid, user.email || '');
          if (pendingBiz) {
            def.businessName = pendingBiz;
            localStorage.removeItem(`cm_pending_biz_${uid}`);
          } else if (user.displayName) {
            def.businessName = user.displayName;
          }
          setBusinessProfile(def);
          saveBusinessProfile(uid, def).catch(() => {});
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${uid}/businessProfile/main`)
    );

    const unsubSettings = onSnapshot(
      doc(db, 'users', uid, 'shopSettings', 'main'),
      (snap) => {
        if (snap.exists()) {
          setShopSettings(snap.data() as ShopSettings);
        } else {
          const def = getDefaultShopSettings(uid);
          setShopSettings(def);
          saveShopSettings(uid, def).catch(() => {});
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${uid}/shopSettings/main`)
    );

    const unsubParties = onSnapshot(
      query(collection(db, 'users', uid, 'parties'), where('ownerId', '==', uid)),
      (snap) => {
        setParties(
          snap.docs.map((d) => ({ ...(d.data() as Omit<Party, 'id'>), id: d.id }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/parties`)
    );

    const unsubBills = onSnapshot(
      query(collection(db, 'users', uid, 'bills'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs.map((d) => {
          const raw = d.data() as Omit<Bill, 'id' | 'items'> & { itemsSummary?: string };
          let parsedItems: LineItem[] = [];
          try {
            parsedItems = raw.itemsSummary ? JSON.parse(raw.itemsSummary) : [];
          } catch {
            parsedItems = [];
          }
          return { ...raw, id: d.id, items: parsedItems } as Bill;
        });
        list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        setBills(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/bills`)
    );

    const unsubPhotos = onSnapshot(
      query(collection(db, 'users', uid, 'savedBillPhotos'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs.map(
          (d) => ({ ...(d.data() as Omit<SavedBillPhoto, 'id'>), id: d.id }) as SavedBillPhoto
        );
        list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        setSavedPhotos(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/savedBillPhotos`)
    );

    const unsubItems = onSnapshot(
      query(collection(db, 'users', uid, 'items'), where('ownerId', '==', uid)),
      (snap) => {
        setCatalogItems(
          snap.docs.map((d) => ({ ...(d.data() as Omit<CatalogItem, 'id'>), id: d.id }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/items`)
    );

    return () => {
      unsubProfile();
      unsubSettings();
      unsubParties();
      unsubBills();
      unsubPhotos();
      unsubItems();
    };
  }, [user]);

  // Helper to compute party ledger delta for a given bill
  const getPartyBalanceDelta = (
    txnType: TransactionType,
    totalAmount: number,
    balanceDue: number
  ): number => {
    switch (txnType) {
      case 'Sale':
      case 'Delivery Challan':
        return balanceDue; // Customer owes more
      case 'Payment In':
        return -totalAmount; // Customer paid off balance
      case 'Sale Return':
        return -balanceDue;
      case 'Purchase Invoice':
        return -balanceDue; // You owe Supplier more
      case 'Payment Out':
        return totalAmount; // You paid Supplier
      case 'Purchase Return':
        return balanceDue;
      default:
        return 0; // Estimate, Sale Order, Purchase Order, Expense don't alter ledger udhari
    }
  };

  // Save Transaction with Live Automatic Accounting (Party Ledger + Stock + Invoice Counter)
  const handleSaveBill = async (
    billInput: Omit<Bill, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => {
    if (!user) return;
    const uid = user.uid;

    const isPurchaseSide =
      billInput.txnType === 'Purchase Invoice' ||
      billInput.txnType === 'Payment Out' ||
      billInput.txnType === 'Purchase Return' ||
      billInput.txnType === 'Purchase Order';

    // 1. Resolve or Auto-create Party (except Expense)
    let resolvedPartyId = billInput.partyId;
    if (billInput.txnType !== 'Expense') {
      let existingParty = parties.find(
        (p) =>
          (resolvedPartyId && p.id === resolvedPartyId) ||
          p.name.toLowerCase() === billInput.partyName.trim().toLowerCase()
      );

      let oldDelta = 0;
      if (billInput.id) {
        const prevBill = bills.find((b) => b.id === billInput.id);
        if (prevBill) {
          oldDelta = getPartyBalanceDelta(
            prevBill.txnType,
            prevBill.totalAmount,
            prevBill.balanceDue
          );
        }
      }

      const newDelta = getPartyBalanceDelta(
        billInput.txnType,
        billInput.totalAmount,
        billInput.balanceDue
      );
      const netDelta = newDelta - oldDelta;

      if (existingParty) {
        resolvedPartyId = existingParty.id;
        if (netDelta !== 0 || (billInput.phone && !existingParty.phone)) {
          await upsertParty(uid, {
            ...existingParty,
            phone: billInput.phone || existingParty.phone,
            gstin: billInput.gstin || existingParty.gstin,
            balance: Math.round((existingParty.balance + netDelta) * 100) / 100,
          });
        }
      } else {
        const created = await upsertParty(uid, {
          ownerId: uid,
          name: billInput.partyName,
          phone: billInput.phone,
          partyType: isPurchaseSide ? 'supplier' : 'customer',
          gstin: billInput.gstin,
          address: '',
          balance: Math.round(newDelta * 100) / 100,
          createdAt: new Date().toISOString().slice(0, 40),
          updatedAt: new Date().toISOString().slice(0, 40),
        });
        if (created) resolvedPartyId = created.id;
      }
    }

    // 2. Adjust Item Stock & Auto-save New Items to Catalog (on new bills)
    if (!billInput.id && billInput.items.length > 0) {
      const stockMultiplier =
        billInput.txnType === 'Sale' ||
        billInput.txnType === 'Delivery Challan' ||
        billInput.txnType === 'Purchase Return'
          ? -1
          : billInput.txnType === 'Purchase Invoice' || billInput.txnType === 'Sale Return'
          ? 1
          : 0;

      for (const line of billInput.items) {
        const catMatch = catalogItems.find(
          (c) =>
            (line.itemId && c.id === line.itemId) ||
            c.name.toLowerCase() === line.name.trim().toLowerCase()
        );
        if (catMatch) {
          if (stockMultiplier !== 0) {
            await upsertCatalogItem(uid, {
              ...catMatch,
              stockQty: Math.max(0, catMatch.stockQty + stockMultiplier * line.qty),
            });
          }
        } else if (shopSettings.saveNewItemsToCatalog && line.name.trim()) {
          await upsertCatalogItem(uid, {
            ownerId: uid,
            name: line.name.trim(),
            unit: line.unit || 'pcs',
            salePrice: isPurchaseSide ? Math.round(line.rate * 1.15) : line.rate,
            purchasePrice: isPurchaseSide ? line.rate : Math.round(line.rate * 0.85),
            stockQty: stockMultiplier > 0 ? line.qty : 0,
            barcode: '',
            hsn: '',
            gstPercent: line.gstPercent || 0,
            createdAt: new Date().toISOString().slice(0, 40),
            updatedAt: new Date().toISOString().slice(0, 40),
          });
        }
      }
    }

    // 3. Save Bill Document
    await upsertBill(uid, {
      ...billInput,
      ownerId: uid,
      partyId: resolvedPartyId,
      createdAt:
        editingBill?.createdAt || new Date().toISOString().slice(0, 40),
      updatedAt: new Date().toISOString().slice(0, 40),
    });

    // 4. Increment Next Invoice Number for new transactions
    if (!billInput.id) {
      await saveShopSettings(uid, {
        ...shopSettings,
        nextInvoiceNumber: (shopSettings.nextInvoiceNumber || 1) + 1,
      });
    }

    setEditingBill(null);
    setPrefilledVoiceData(null);
    showToast(`${billInput.txnType} saved!`);
  };

  // Save Normal Bill Photo (Option 1)
  const handleSaveNormalPhotoBill = async (data: {
    imageUrl: string;
    partyId: string;
    partyName: string;
    billType: 'Sale' | 'Purchase' | 'Expense';
    amount: number;
    date: string;
    note: string;
  }) => {
    if (!user) return;
    await upsertSavedBillPhoto(user.uid, {
      ownerId: user.uid,
      imageUrl: data.imageUrl,
      partyId: data.partyId,
      partyName: data.partyName,
      billType: data.billType,
      amount: data.amount,
      date: data.date,
      note: data.note,
      createdAt: new Date().toISOString().slice(0, 40),
      updatedAt: new Date().toISOString().slice(0, 40),
    });
    showToast('📸 Normal Bill Photo saved!');
  };

  // Home Screen Live Summary Computations
  const homeStats = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const todaySales =
      bills
        .filter((b) => b.date === todayStr && b.txnType === 'Sale')
        .reduce((s, b) => s + b.totalAmount, 0) +
      savedPhotos
        .filter((p) => p.date === todayStr && p.billType === 'Sale')
        .reduce((s, p) => s + p.amount, 0);

    const youWillGet = parties.reduce((s, p) => s + (p.balance > 0 ? p.balance : 0), 0);
    const youWillGive = parties.reduce(
      (s, p) => s + (p.balance < 0 ? Math.abs(p.balance) : 0),
      0
    );

    return { todaySales, youWillGet, youWillGive };
  }, [bills, savedPhotos, parties]);

  // Unified chronological feed for Home Screen
  const recentFeed = useMemo(() => {
    type FeedItem =
      | { kind: 'digital'; createdAt: string; bill: Bill }
      | { kind: 'photo'; createdAt: string; photo: SavedBillPhoto };

    const items: FeedItem[] = [];
    if (homeFeedFilter !== 'photos') {
      bills.forEach((bill) => items.push({ kind: 'digital', createdAt: bill.createdAt, bill }));
    }
    if (homeFeedFilter !== 'digital') {
      savedPhotos.forEach((photo) =>
        items.push({ kind: 'photo', createdAt: photo.createdAt, photo })
      );
    }
    return items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 20);
  }, [bills, savedPhotos, homeFeedFilter]);

  if (showSplash || !authReady) {
    return <SplashScreen />;
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <div className="min-h-screen bg-[#FBF9F1] text-slate-900">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="bg-amber-500 text-white text-xs font-bold py-1.5 px-4 flex items-center justify-center gap-2 sticky top-0 z-50">
          <WifiOff className="w-3.5 h-3.5" />
          Offline Mode — Changes sync automatically when reconnected
        </div>
      )}

      {/* Toast Feedback */}
      {toastMsg && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-slate-900 text-white text-xs font-bold flex items-center gap-2 shadow-xl">
          <CheckCircle2 className="w-4 h-4 text-[#34D399]" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Top App Bar */}
      <header className="sticky top-0 z-30 bg-[#FBF9F1]/90 backdrop-blur-md border-b border-slate-200/70">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 p-0.5 shadow-xs shrink-0 overflow-hidden">
              <img
                src={businessProfile.logoUrl || CM_LOGO_PATH}
                alt={APP_OFFICIAL_NAME}
                className="w-full h-full object-contain rounded-lg"
              />
            </div>
            <h1 className="font-extrabold text-base text-slate-900 truncate">
              {businessProfile.businessName || APP_OFFICIAL_NAME}
            </h1>
          </div>

          <button
            onClick={() => setActiveTab('more')}
            className="text-xs font-bold text-[#6A4CFF] px-3 py-1.5 rounded-xl bg-white border border-slate-200/80 whitespace-nowrap shrink-0"
          >
            {shopSettings.billLanguage === 'Hindi (हिंदी)' ? 'हिंदी' : shopSettings.billLanguage}
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-3xl mx-auto px-4 pt-4">
        {activeTab === 'home' && (
          <div className="space-y-4 pb-36">
            {/* Quick Summary Strip */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="bg-white rounded-2xl p-3 border border-slate-200/70">
                <p className="text-[11px] font-semibold text-slate-500">Today&apos;s Sale</p>
                <p className="mt-1 text-base font-extrabold font-mono-num text-slate-900 truncate">
                  {formatINR(homeStats.todaySales)}
                </p>
              </div>
              <button
                onClick={() => setActiveTab('parties')}
                className="bg-white rounded-2xl p-3 border border-slate-200/70 text-left"
              >
                <p className="text-[11px] font-semibold text-[#1B9B62]">To Collect</p>
                <p className="mt-1 text-base font-extrabold font-mono-num text-[#1B9B62] truncate">
                  {formatINR(homeStats.youWillGet)}
                </p>
              </button>
              <button
                onClick={() => setActiveTab('parties')}
                className="bg-white rounded-2xl p-3 border border-slate-200/70 text-left"
              >
                <p className="text-[11px] font-semibold text-rose-600">To Pay</p>
                <p className="mt-1 text-base font-extrabold font-mono-num text-rose-600 truncate">
                  {formatINR(homeStats.youWillGive)}
                </p>
              </button>
            </div>

            {/* Quick Links Card (Exact 4 Pastel Tiles + 2 Payment Pill Buttons) */}
            <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs space-y-3.5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-extrabold text-slate-900">Quick Links</h2>
                <span className="text-[11px] font-semibold text-slate-400">
                  Voice &amp; Manual Khata
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2.5">
                <button
                  onClick={() => setShowCreatePicker(true)}
                  className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl bg-[#ECFDF5] hover:bg-emerald-100/70 transition active:scale-95"
                >
                  <div className="w-10 h-10 rounded-xl bg-white text-[#1B9B62] flex items-center justify-center shadow-xs">
                    <Plus className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-800 whitespace-nowrap">
                    Add Txn
                  </span>
                </button>

                <button
                  onClick={() => {
                    setCameraMode('bill');
                    setCameraModalOpen(true);
                  }}
                  className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl bg-[#F3E8FF] hover:bg-purple-100/70 transition active:scale-95"
                >
                  <div className="w-10 h-10 rounded-xl bg-white text-[#6A4CFF] flex items-center justify-center shadow-xs">
                    <Camera className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-800 whitespace-nowrap">
                    Scan Bill
                  </span>
                </button>

                <button
                  onClick={() => {
                    setReportType('sale');
                    setReportModalOpen(true);
                  }}
                  className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl bg-[#FEF3C7] hover:bg-amber-100/70 transition active:scale-95"
                >
                  <div className="w-10 h-10 rounded-xl bg-white text-amber-600 flex items-center justify-center shadow-xs">
                    <BarChart3 className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-800 whitespace-nowrap">
                    Sale Report
                  </span>
                </button>

                <button
                  onClick={() => {
                    setReportType('daybook');
                    setReportModalOpen(true);
                  }}
                  className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl bg-[#E0F2FE] hover:bg-sky-100/70 transition active:scale-95"
                >
                  <div className="w-10 h-10 rounded-xl bg-white text-sky-600 flex items-center justify-center shadow-xs">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-800 whitespace-nowrap">
                    Daybook
                  </span>
                </button>
              </div>

              {/* 2 Pill Buttons: Payment In (Green) & Payment Out (Peach) */}
              <div className="grid grid-cols-2 gap-2.5 pt-0.5">
                <button
                  onClick={() => {
                    setEditingBill(null);
                    setPrefilledVoiceData(null);
                    setTxnFormParty(null);
                    setTxnFormType('Payment In');
                    setTxnFormOpen(true);
                  }}
                  className="py-3 px-4 rounded-2xl bg-[#E8F8F0] hover:bg-[#D4F3E4] text-[#1B9B62] font-extrabold text-xs flex items-center justify-center gap-1.5 border border-[#1B9B62]/15 active:scale-[0.98] transition"
                >
                  <ArrowDownLeft className="w-4 h-4" />
                  <span>↙ Payment In</span>
                </button>

                <button
                  onClick={() => {
                    setEditingBill(null);
                    setPrefilledVoiceData(null);
                    setTxnFormParty(null);
                    setTxnFormType('Payment Out');
                    setTxnFormOpen(true);
                  }}
                  className="py-3 px-4 rounded-2xl bg-[#FFF0E6] hover:bg-[#FFE3D1] text-[#D95D24] font-extrabold text-xs flex items-center justify-center gap-1.5 border border-[#D95D24]/15 active:scale-[0.98] transition"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  <span>↗ Payment Out</span>
                </button>
              </div>
            </div>

            {/* Recent Bills & Saved Photo Bills Feed */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-extrabold text-slate-900">Recent Bills</h2>
                <div className="flex items-center gap-1 p-1 bg-white rounded-xl border border-slate-200/80">
                  {(
                    [
                      { id: 'all', label: 'All' },
                      { id: 'digital', label: 'Digital Bills' },
                      { id: 'photos', label: 'Saved Bill Photos' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setHomeFeedFilter(f.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition whitespace-nowrap ${
                        homeFeedFilter === f.id
                          ? 'bg-[#6A4CFF] text-white'
                          : 'text-slate-600'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {recentFeed.length === 0 ? (
                <div className="bg-white rounded-3xl p-10 text-center border border-slate-200/70">
                  <div className="w-16 h-16 rounded-2xl bg-[#FBF9F1] text-slate-400 flex items-center justify-center mx-auto mb-3">
                    <Receipt className="w-8 h-8" />
                  </div>
                  <h3 className="text-sm font-extrabold text-slate-800">No bills yet</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                    Tap the purple <strong>Add New Sale</strong> voice orb below or tap{' '}
                    <strong>Scan Bill</strong> to save a bill photo.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {recentFeed.map((entry) =>
                    entry.kind === 'digital' ? (
                      <div
                        key={`bill_${entry.bill.id}`}
                        className="bg-white rounded-2xl p-3.5 border border-slate-200/80 space-y-2.5"
                      >
                        <div
                          className="flex items-start justify-between cursor-pointer"
                          onClick={() => {
                            setEditingBill(entry.bill);
                            setTxnFormType(entry.bill.txnType);
                            setTxnFormOpen(true);
                          }}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-sm text-slate-900">
                                {entry.bill.partyName}
                              </span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-50 text-[#6A4CFF]">
                                {entry.bill.txnType}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5 font-mono-num">
                              #{entry.bill.billNumber} · {entry.bill.date} · {entry.bill.paymentMode}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="font-extrabold text-sm font-mono-num text-slate-900">
                              {formatINR(entry.bill.totalAmount)}
                            </div>
                            {entry.bill.balanceDue > 0 && (
                              <div className="text-[11px] font-bold text-rose-600 font-mono-num">
                                Due {formatINR(entry.bill.balanceDue)}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                          <button
                            onClick={() =>
                              downloadBillInvoicePDF(
                                entry.bill,
                                businessProfile,
                                shopSettings
                              )
                            }
                            className="px-2.5 py-1.5 rounded-xl bg-[#FBF9F1] text-slate-700 text-[11px] font-bold flex items-center gap-1"
                          >
                            <FileDown className="w-3.5 h-3.5 text-[#6A4CFF]" />
                            PDF
                          </button>
                          <a
                            href={getWhatsAppShareUrl(
                              entry.bill.phone,
                              buildBillWhatsAppMessage(
                                entry.bill,
                                businessProfile.businessName,
                                shopSettings.showBranding
                              )
                            )}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2.5 py-1.5 rounded-xl bg-emerald-50 text-[#1B9B62] text-[11px] font-bold flex items-center gap-1"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            WhatsApp
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={`photo_${entry.photo.id}`}
                        className="bg-white rounded-2xl p-3.5 border border-slate-200/80 flex items-center justify-between gap-3"
                      >
                        <button
                          onClick={() => setViewingPhoto(entry.photo)}
                          className="flex items-center gap-3 text-left flex-1 min-w-0"
                        >
                          <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-slate-200 shrink-0">
                            <img
                              src={entry.photo.imageUrl}
                              alt={entry.photo.partyName}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute bottom-0.5 right-0.5 bg-black/60 text-white p-0.5 rounded">
                              <ZoomIn className="w-2.5 h-2.5" />
                            </div>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-extrabold text-sm text-slate-900 truncate">
                                {entry.photo.partyName}
                              </span>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-[#1B9B62] shrink-0">
                                📷 Photo Bill
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {entry.photo.billType} · {entry.photo.date}
                            </p>
                          </div>
                        </button>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-extrabold text-sm font-mono-num text-slate-900">
                            {entry.photo.amount > 0 ? formatINR(entry.photo.amount) : 'View'}
                          </span>
                          <a
                            href={getWhatsAppShareUrl(
                              '',
                              buildSavedPhotoWhatsAppMessage(
                                entry.photo,
                                businessProfile.businessName,
                                shopSettings.showBranding
                              )
                            )}
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 rounded-xl bg-emerald-50 text-[#1B9B62]"
                            aria-label="Share photo on WhatsApp"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'parties' && (
          <PartiesTab
            parties={parties}
            bills={bills}
            savedPhotos={savedPhotos}
            businessProfile={businessProfile}
            shopSettings={shopSettings}
            onSaveParty={async (p) => {
              await upsertParty(user.uid, {
                ...p,
                ownerId: user.uid,
                createdAt: new Date().toISOString().slice(0, 40),
                updatedAt: new Date().toISOString().slice(0, 40),
              });
              showToast('Party saved!');
            }}
            onDeleteParty={async (id) => {
              await removeParty(user.uid, id);
              showToast('Party deleted');
            }}
            onStartTransactionForParty={(type, party) => {
              setEditingBill(null);
              setPrefilledVoiceData(null);
              setTxnFormParty(party);
              setTxnFormType(type);
              setTxnFormOpen(true);
            }}
            onViewPhoto={(p) => setViewingPhoto(p)}
          />
        )}

        {activeTab === 'bills' && (
          <BillsTab
            bills={bills}
            savedPhotos={savedPhotos}
            parties={parties}
            businessProfile={businessProfile}
            shopSettings={shopSettings}
            onRefresh={async () => {
              showToast('Bills synced');
            }}
            onEditBill={(bill) => {
              setEditingBill(bill);
              setPrefilledVoiceData(null);
              setTxnFormParty(null);
              setTxnFormType(bill.txnType);
              setTxnFormOpen(true);
            }}
            onDeleteBill={async (id) => {
              await removeBill(user.uid, id);
              showToast('Bill deleted');
            }}
            onDeletePhoto={async (id) => {
              await removeSavedBillPhoto(user.uid, id);
              showToast('Photo bill deleted');
            }}
            onOpenCamera={() => {
              setCameraMode('bill');
              setCameraModalOpen(true);
            }}
            onViewPhoto={(p) => setViewingPhoto(p)}
          />
        )}

        {activeTab === 'items' && (
          <ItemsTab
            items={catalogItems}
            shopSettings={shopSettings}
            onSaveItem={async (it) => {
              await upsertCatalogItem(user.uid, {
                ...it,
                ownerId: user.uid,
                createdAt: new Date().toISOString().slice(0, 40),
                updatedAt: new Date().toISOString().slice(0, 40),
              });
              showToast('Item saved to catalog!');
            }}
            onDeleteItem={async (id) => {
              await removeCatalogItem(user.uid, id);
              showToast('Item deleted');
            }}
            onOpenBarcodeScanner={(cb) => {
              setBarcodeCallback(() => cb);
              setCameraMode('barcode');
              setCameraModalOpen(true);
            }}
          />
        )}

        {activeTab === 'more' && (
          <MoreTab
            userEmail={user.email || ''}
            businessProfile={businessProfile}
            shopSettings={shopSettings}
            onSaveProfile={async (prof) => {
              await saveBusinessProfile(user.uid, prof);
            }}
            onSaveSettings={async (settings) => {
              await saveShopSettings(user.uid, settings);
            }}
            onLogout={async () => {
              await signOut(auth);
            }}
          />
        )}
      </main>

      {/* Floating Bottom Action Bar (Camera + Add New Sale Voice Pill) */}
      {activeTab === 'home' && !txnFormOpen && (
        <div className="fixed bottom-20 left-0 right-0 z-30 pointer-events-none px-4">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
            <button
              onClick={() => {
                setCameraMode('bill');
                setCameraModalOpen(true);
              }}
              className="pointer-events-auto w-13 h-13 rounded-full bg-white border border-slate-200 shadow-lg flex items-center justify-center text-slate-800 hover:bg-slate-50 active:scale-95 transition"
              aria-label="Open Camera to Scan or Save Bill Photo"
            >
              <Camera className="w-6 h-6 text-[#6A4CFF]" />
            </button>

            <button
              onClick={() => {
                setVoiceTxnType('Sale');
                setVoiceModalOpen(true);
              }}
              className="pointer-events-auto flex-1 max-w-xs py-3.5 px-6 rounded-full voice-orb-glow text-white font-extrabold text-sm flex items-center justify-center gap-2.5 active:scale-95 transition"
            >
              <Mic className="w-5 h-5" />
              <span>Add New Sale</span>
            </button>
          </div>
        </div>
      )}

      {/* Fixed Bottom 5-Tab Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200">
        <div className="max-w-3xl mx-auto grid grid-cols-5 h-16 items-center">
          {(
            [
              { id: 'home', label: 'Home', Icon: Home },
              { id: 'parties', label: 'Parties', Icon: Users },
              { id: 'bills', label: 'Bills', Icon: Receipt },
              { id: 'items', label: 'Items', Icon: Package },
              { id: 'more', label: 'More', Icon: Menu },
            ] as const
          ).map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex flex-col items-center justify-center h-full transition ${
                  active ? 'text-[#6A4CFF]' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? 'stroke-[2.5]' : 'stroke-[1.9]'}`} />
                <span className={`text-[10px] mt-1 ${active ? 'font-extrabold' : 'font-semibold'}`}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Modals & Sheets */}
      <CreateBillPickerSheet
        isOpen={showCreatePicker}
        onClose={() => setShowCreatePicker(false)}
        onSelectType={(selectedType) => {
          setShowCreatePicker(false);
          setEditingBill(null);
          setPrefilledVoiceData(null);
          setTxnFormParty(null);
          setTxnFormType(selectedType);
          setTxnFormOpen(true);
        }}
      />

      <TransactionFormSheet
        isOpen={txnFormOpen}
        initialTxnType={txnFormType}
        initialParty={txnFormParty}
        editingBill={editingBill}
        prefilledVoiceData={prefilledVoiceData}
        parties={parties}
        catalogItems={catalogItems}
        shopSettings={shopSettings}
        onClose={() => {
          setTxnFormOpen(false);
          setEditingBill(null);
          setPrefilledVoiceData(null);
        }}
        onOpenVoiceMic={(currentType) => {
          setVoiceTxnType(currentType);
          setVoiceModalOpen(true);
        }}
        onSaveBill={handleSaveBill}
      />

      <VoiceListeningModal
        isOpen={voiceModalOpen}
        txnType={voiceTxnType}
        parties={parties}
        items={catalogItems}
        onClose={() => setVoiceModalOpen(false)}
        onParsedResult={(parsed) => {
          setVoiceModalOpen(false);
          setEditingBill(null);
          setTxnFormParty(null);
          setTxnFormType(parsed.txnType || voiceTxnType);
          setPrefilledVoiceData({ parsed });
          setTxnFormOpen(true);
        }}
      />

      <DualModeCameraModal
        isOpen={cameraModalOpen}
        mode={cameraMode}
        parties={parties}
        onClose={() => setCameraModalOpen(false)}
        onSaveNormalPhotoBill={handleSaveNormalPhotoBill}
        onAIScanComplete={(parsed, attachmentUrl) => {
          setEditingBill(null);
          setTxnFormParty(null);
          setTxnFormType(parsed.txnType || 'Sale');
          setPrefilledVoiceData({ parsed, attachmentUrl });
          setTxnFormOpen(true);
        }}
        onBarcodeDetected={(code) => {
          barcodeCallback?.(code);
        }}
      />

      <ReportsModal
        isOpen={reportModalOpen}
        reportType={reportType}
        bills={bills}
        savedPhotos={savedPhotos}
        shopSettings={shopSettings}
        onClose={() => setReportModalOpen(false)}
        onSelectBill={(bill) => {
          setReportModalOpen(false);
          setEditingBill(bill);
          setTxnFormType(bill.txnType);
          setTxnFormOpen(true);
        }}
        onSelectPhoto={(photo) => {
          setViewingPhoto(photo);
        }}
      />

      <PhotoViewerModal
        photo={viewingPhoto}
        businessName={businessProfile.businessName}
        showBranding={shopSettings.showBranding}
        onClose={() => setViewingPhoto(null)}
      />
    </div>
  );
}
