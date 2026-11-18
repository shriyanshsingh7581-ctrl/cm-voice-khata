import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Mic,
  Plus,
  Trash2,
  Paperclip,
  Loader2,
  Check,
  ChevronDown,
  Package,
  UserPlus,
  Volume2,
} from 'lucide-react';
import {
  ALL_TRANSACTION_TYPES,
  Bill,
  CatalogItem,
  LineItem,
  Party,
  ShopSettings,
  TransactionType,
  VoiceParsedBillPayload,
} from '../types';
import { uploadToCloudinary } from '../services/cloudinary';
import { speakText, stopSpeaking } from '../services/ttsService';

interface CreateBillPickerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectType: (txnType: TransactionType) => void;
}

export const CreateBillPickerSheet: React.FC<CreateBillPickerSheetProps> = ({
  isOpen,
  onClose,
  onSelectType,
}) => {
  if (!isOpen) return null;

  const sales = ALL_TRANSACTION_TYPES.filter((t) => t.category === 'SALES');
  const purchase = ALL_TRANSACTION_TYPES.filter((t) => t.category === 'PURCHASE');
  const other = ALL_TRANSACTION_TYPES.filter((t) => t.category === 'OTHER');

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#FBF9F1] rounded-t-3xl sm:rounded-3xl p-5 max-h-[88vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-4 sm:hidden" />
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">Create New Bill</h2>
            <p className="text-xs text-slate-500">Choose any of 11 voice &amp; manual transactions</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600"
            aria-label="Close transaction picker"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* SALES */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/70">
            <p className="text-[11px] font-extrabold tracking-wider text-[#1B9B62] uppercase mb-3">
              Sales (6)
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {sales.map((t) => (
                <button
                  key={t.type}
                  onClick={() => onSelectType(t.type)}
                  className="p-3 rounded-2xl bg-[#FBF9F1] hover:bg-emerald-50 border border-slate-200/70 text-left transition active:scale-[0.98]"
                >
                  <div className="text-sm font-bold text-slate-900">{t.label}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{t.hindiHint}</div>
                </button>
              ))}
            </div>
          </div>

          {/* PURCHASE */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/70">
            <p className="text-[11px] font-extrabold tracking-wider text-[#6A4CFF] uppercase mb-3">
              Purchase (4)
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {purchase.map((t) => (
                <button
                  key={t.type}
                  onClick={() => onSelectType(t.type)}
                  className="p-3 rounded-2xl bg-[#FBF9F1] hover:bg-purple-50 border border-slate-200/70 text-left transition active:scale-[0.98]"
                >
                  <div className="text-sm font-bold text-slate-900">{t.label}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{t.hindiHint}</div>
                </button>
              ))}
            </div>
          </div>

          {/* OTHER */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/70">
            <p className="text-[11px] font-extrabold tracking-wider text-rose-600 uppercase mb-3">
              Other (1)
            </p>
            {other.map((t) => (
              <button
                key={t.type}
                onClick={() => onSelectType(t.type)}
                className="w-full p-3 rounded-2xl bg-[#FBF9F1] hover:bg-rose-50 border border-slate-200/70 text-left transition active:scale-[0.98]"
              >
                <div className="text-sm font-bold text-slate-900">{t.label}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{t.hindiHint}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

interface TransactionFormSheetProps {
  isOpen: boolean;
  initialTxnType: TransactionType;
  initialParty?: Party | null;
  editingBill?: Bill | null;
  prefilledVoiceData?: { parsed: VoiceParsedBillPayload; attachmentUrl?: string } | null;
  parties: Party[];
  catalogItems: CatalogItem[];
  shopSettings: ShopSettings;
  onClose: () => void;
  onOpenVoiceMic: (currentTxnType: TransactionType) => void;
  onSaveBill: (bill: Omit<Bill, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
}

const EXPENSE_CATEGORIES = [
  'Shop Rent',
  'Electricity & Utility',
  'Staff Salary',
  'Transport & Freight',
  'Tea & Snacks',
  'Maintenance',
  'Packaging',
  'Other Expense',
];

export const TransactionFormSheet: React.FC<TransactionFormSheetProps> = ({
  isOpen,
  initialTxnType,
  initialParty,
  editingBill,
  prefilledVoiceData,
  parties,
  catalogItems,
  shopSettings,
  onClose,
  onOpenVoiceMic,
  onSaveBill,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [txnType, setTxnType] = useState<TransactionType>(initialTxnType);
  const [billNumber, setBillNumber] = useState('');
  const [supplierBillNo, setSupplierBillNo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [partyName, setPartyName] = useState('');
  const [partyId, setPartyId] = useState('');
  const [phone, setPhone] = useState('');
  const [gstin, setGstin] = useState('');
  const [items, setItems] = useState<LineItem[]>([]);
  const [directAmount, setDirectAmount] = useState('');
  const [discount, setDiscount] = useState('0');
  const [deliveryCharge, setDeliveryCharge] = useState('0');
  const [gstPercent, setGstPercent] = useState('0');
  const [receivedAmount, setReceivedAmount] = useState('');
  const [receivedEditedManually, setReceivedEditedManually] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'Online' | 'Credit'>('Cash');
  const [category, setCategory] = useState('General');
  const [note, setNote] = useState('');
  const [terms, setTerms] = useState('Thank you for your business!');
  const [attachmentUrl, setAttachmentUrl] = useState('');

  const [showItemCatalogPicker, setShowItemCatalogPicker] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);

  const isPaymentOrExpense =
    txnType === 'Payment In' || txnType === 'Payment Out' || txnType === 'Expense';
  const isPurchaseSide =
    txnType === 'Purchase Invoice' ||
    txnType === 'Payment Out' ||
    txnType === 'Purchase Return' ||
    txnType === 'Purchase Order';

  // Initialize form when opened
  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg('');

    if (editingBill) {
      setTxnType(editingBill.txnType);
      setBillNumber(editingBill.billNumber);
      setSupplierBillNo(editingBill.supplierBillNo || '');
      setDate(editingBill.date);
      setPartyName(editingBill.partyName);
      setPartyId(editingBill.partyId);
      setPhone(editingBill.phone || '');
      setGstin(editingBill.gstin || '');
      setItems(editingBill.items || []);
      setDirectAmount(
        editingBill.items.length === 0 ? String(editingBill.totalAmount || '') : ''
      );
      setDiscount(String(editingBill.discount || 0));
      setDeliveryCharge(String(editingBill.deliveryCharge || 0));
      setGstPercent(String(editingBill.gstPercent || 0));
      setReceivedAmount(String(editingBill.receivedAmount || 0));
      setReceivedEditedManually(true);
      setPaymentMode(editingBill.paymentMode || 'Cash');
      setCategory(editingBill.category || 'General');
      setNote(editingBill.note || '');
      setTerms(editingBill.terms || '');
      setAttachmentUrl(editingBill.attachmentUrl || '');
      return;
    }

    const prefixMap: Record<TransactionType, string> = {
      Sale: 'INV',
      'Payment In': 'REC',
      'Sale Return': 'SR',
      'Delivery Challan': 'DC',
      Estimate: 'EST',
      'Sale Order': 'SO',
      'Purchase Invoice': 'PUR',
      'Payment Out': 'PAY',
      'Purchase Return': 'PR',
      'Purchase Order': 'PO',
      Expense: 'EXP',
    };

    const nextNum = shopSettings.nextInvoiceNumber || 1;
    setTxnType(initialTxnType);
    setBillNumber(`${prefixMap[initialTxnType]}-${nextNum}`);
    setSupplierBillNo('');
    setDate(new Date().toISOString().slice(0, 10));
    setPartyId(initialParty?.id || '');
    setPartyName(
      initialParty?.name ||
        (initialTxnType === 'Expense'
          ? 'Shop Expense'
          : initialTxnType.includes('Purchase') || initialTxnType === 'Payment Out'
          ? ''
          : '')
    );
    setPhone(initialParty?.phone || '');
    setGstin(initialParty?.gstin || '');
    setItems([]);
    setDirectAmount('');
    setDiscount('0');
    setDeliveryCharge('0');
    setGstPercent('0');
    setReceivedAmount('');
    setReceivedEditedManually(false);
    setPaymentMode('Cash');
    setCategory(initialTxnType === 'Expense' ? 'Shop Rent' : 'General');
    setNote('');
    setTerms('Goods once sold will not be taken back without bill.');
    setAttachmentUrl('');
  }, [isOpen, initialTxnType, initialParty, editingBill, shopSettings.nextInvoiceNumber]);

  // Apply voice or AI-scan prefilled payload when passed in
  useEffect(() => {
    if (!isOpen || !prefilledVoiceData) return;
    const { parsed, attachmentUrl: attUrl } = prefilledVoiceData;
    if (parsed.txnType) setTxnType(parsed.txnType);
    if (parsed.partyName) {
      setPartyName(parsed.partyName);
      const match = parties.find(
        (p) => p.name.toLowerCase() === parsed.partyName?.toLowerCase()
      );
      if (match) {
        setPartyId(match.id);
        if (!parsed.phone && match.phone) setPhone(match.phone);
        if (!parsed.gstin && match.gstin) setGstin(match.gstin);
      }
    }
    if (parsed.phone) setPhone(parsed.phone);
    if (parsed.gstin) setGstin(parsed.gstin);
    if (parsed.supplierBillNo) setSupplierBillNo(parsed.supplierBillNo);
    if (parsed.items && parsed.items.length > 0) {
      setItems(
        parsed.items.map((it, idx) => ({
          id: `v_${Date.now()}_${idx}`,
          name: it.name || 'Item',
          qty: Number(it.qty) || 1,
          unit: it.unit || 'pcs',
          rate: Number(it.rate) || 0,
          total: Number(it.total) || (Number(it.qty) || 1) * (Number(it.rate) || 0),
        }))
      );
    } else if (parsed.totalAmount) {
      setDirectAmount(String(parsed.totalAmount));
    }
    if (typeof parsed.discount === 'number') setDiscount(String(parsed.discount));
    if (typeof parsed.deliveryCharge === 'number') setDeliveryCharge(String(parsed.deliveryCharge));
    if (typeof parsed.gst === 'number') setGstPercent(String(parsed.gst));
    if (typeof parsed.receivedAmount === 'number') {
      setReceivedAmount(String(parsed.receivedAmount));
      setReceivedEditedManually(true);
    }
    if (parsed.paymentType) setPaymentMode(parsed.paymentType);
    if (parsed.note) setNote(parsed.note);
    if (parsed.category) setCategory(parsed.category);
    if (attUrl) setAttachmentUrl(attUrl);
  }, [isOpen, prefilledVoiceData, parties]);

  // Dynamic Totals Computation
  const totals = useMemo(() => {
    const itemSubtotal = isPaymentOrExpense
      ? parseFloat(directAmount) || 0
      : items.reduce((s, it) => s + (Number(it.total) || 0), 0);
    const disc = parseFloat(discount) || 0;
    const deliv = parseFloat(deliveryCharge) || 0;
    const gstPct = parseFloat(gstPercent) || 0;
    const taxable = Math.max(0, itemSubtotal - disc + deliv);
    const gstAmt = shopSettings.pricesIncludeGst
      ? 0
      : Math.round(taxable * (gstPct / 100) * 100) / 100;
    let grandTotal = taxable + gstAmt;
    if (shopSettings.roundOffBillTotal) {
      grandTotal = Math.round(grandTotal);
    }
    const rec =
      paymentMode === 'Credit'
        ? 0
        : receivedEditedManually
        ? parseFloat(receivedAmount) || 0
        : grandTotal;
    const due = Math.max(0, Math.round((grandTotal - rec) * 100) / 100);
    return {
      subtotal: itemSubtotal,
      gstAmount: gstAmt,
      totalAmount: grandTotal,
      receivedAmount: rec,
      balanceDue: due,
    };
  }, [
    isPaymentOrExpense,
    directAmount,
    items,
    discount,
    deliveryCharge,
    gstPercent,
    shopSettings.pricesIncludeGst,
    shopSettings.roundOffBillTotal,
    paymentMode,
    receivedEditedManually,
    receivedAmount,
  ]);

  const handleAddBlankItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `it_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: '',
        qty: 1,
        unit: 'pcs',
        rate: 0,
        total: 0,
      },
    ]);
  };

  const handlePickCatalogItem = (cat: CatalogItem) => {
    const rate = isPurchaseSide ? cat.purchasePrice : cat.salePrice;
    setItems((prev) => [
      ...prev,
      {
        id: `it_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        itemId: cat.id,
        name: cat.name,
        qty: 1,
        unit: cat.unit || 'pcs',
        rate,
        gstPercent: cat.gstPercent || 0,
        total: rate,
      },
    ]);
    setShowItemCatalogPicker(false);
  };

  const updateLineItem = (idx: number, patch: Partial<LineItem>) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, ...patch };
        next.total = Math.round((Number(next.qty) || 0) * (Number(next.rate) || 0) * 100) / 100;
        return next;
      })
    );
  };

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingAttachment(true);
    setErrorMsg('');
    try {
      const url = await uploadToCloudinary(file);
      setAttachmentUrl(url);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Attachment upload failed');
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleToggleSpeakBill = async () => {
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
      return;
    }
    const party =
      partyName.trim() ||
      (txnType === 'Expense' ? category || 'Shop Expense' : 'Cash Customer');
    const itemsDesc = !isPaymentOrExpense
      ? items
          .filter((i) => i.name.trim())
          .slice(0, 4)
          .map((i) => `${i.qty} ${i.unit} ${i.name}`)
          .join(', ')
      : '';
    const dueMsg =
      totals.balanceDue > 0
        ? `Balance due ${totals.balanceDue} rupaye.`
        : `${paymentMode} payment settled.`;
    const summary = `${txnType} bill for ${party}. ${
      itemsDesc ? `Items: ${itemsDesc}. ` : ''
    }Total ${totals.totalAmount} rupaye. ${dueMsg}`;
    setIsSpeaking(true);
    try {
      await speakText(summary, { onEnd: () => setIsSpeaking(false) });
    } finally {
      setIsSpeaking(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const resolvedPartyName =
      partyName.trim() ||
      (txnType === 'Expense'
        ? category || 'Shop Expense'
        : isPurchaseSide
        ? 'Cash Supplier'
        : 'Cash Customer');

    if (totals.totalAmount <= 0) {
      setErrorMsg('Please enter at least one item or a valid amount greater than ₹0.');
      return;
    }

    setSaving(true);
    try {
      await onSaveBill({
        id: editingBill?.id,
        billNumber: billNumber.trim() || `INV-${Date.now()}`,
        supplierBillNo: supplierBillNo.trim(),
        txnType,
        partyId,
        partyName: resolvedPartyName,
        phone: phone.trim(),
        gstin: gstin.trim(),
        items: isPaymentOrExpense ? [] : items.filter((i) => i.name.trim().length > 0),
        itemsSummary: '',
        subtotal: totals.subtotal,
        discount: parseFloat(discount) || 0,
        deliveryCharge: parseFloat(deliveryCharge) || 0,
        gstPercent: parseFloat(gstPercent) || 0,
        gstAmount: totals.gstAmount,
        totalAmount: totals.totalAmount,
        receivedAmount: totals.receivedAmount,
        balanceDue: totals.balanceDue,
        paymentMode,
        category: category.trim() || 'General',
        note: note.trim(),
        terms: terms.trim(),
        attachmentUrl,
        date,
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save transaction');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 bg-[#FBF9F1] flex flex-col overflow-hidden">
      {/* Top App Bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shrink-0 gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => {
              stopSpeaking();
              setIsSpeaking(false);
              onClose();
            }}
            className="w-9 h-9 rounded-full bg-[#FBF9F1] flex items-center justify-center text-slate-700"
            aria-label="Close form"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="relative inline-flex items-center gap-1">
              <select
                value={txnType}
                onChange={(e) => setTxnType(e.target.value as TransactionType)}
                className="appearance-none bg-transparent font-extrabold text-base text-slate-900 pr-5 focus:outline-none cursor-pointer"
              >
                {ALL_TRANSACTION_TYPES.map((t) => (
                  <option key={t.type} value={t.type}>
                    {t.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-500 pointer-events-none -ml-4" />
            </div>
            <p className="text-[11px] text-slate-500 font-mono-num">
              #{billNumber} · {date}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleToggleSpeakBill}
            className={`px-3 py-2 rounded-full text-xs font-bold flex items-center gap-1 active:scale-95 transition ${
              isSpeaking
                ? 'bg-rose-100 text-rose-700'
                : 'bg-emerald-50 text-[#1B9B62] border border-[#1B9B62]/20'
            }`}
            title="Listen to bill details (Text-to-Speech)"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>{isSpeaking ? 'Stop' : 'सुनें'}</span>
          </button>

          {/* Embedded Voice Trigger */}
          <button
            type="button"
            onClick={() => {
              stopSpeaking();
              setIsSpeaking(false);
              onOpenVoiceMic(txnType);
            }}
            className="px-3.5 py-2 rounded-full voice-orb-glow text-white text-xs font-bold flex items-center gap-1.5 shrink-0 active:scale-95 transition"
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Voice Fill</span>
          </button>
        </div>
      </div>

      {/* Scrollable Receipt Form */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 py-4 pb-28 max-w-2xl w-full mx-auto">
        {errorMsg && (
          <div className="mb-3 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
            {errorMsg}
          </div>
        )}

        {/* Serrated Live Receipt Card */}
        <div className="drop-shadow-sm">
          <div className="h-4 serrated-top w-full" />
          <div className="bg-white px-4 py-3 space-y-4">
            {/* Bill Meta & Date */}
            <div className="grid grid-cols-2 gap-3 pb-3 border-b border-dashed border-slate-200">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">
                  Bill / Ref Number
                </label>
                <input
                  type="text"
                  value={billNumber}
                  onChange={(e) => setBillNumber(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs font-bold font-mono-num focus:outline-none focus:border-[#6A4CFF]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs font-semibold focus:outline-none focus:border-[#6A4CFF]"
                />
              </div>
            </div>

            {/* Supplier Bill No for Purchase transactions */}
            {isPurchaseSide && txnType !== 'Payment Out' && (
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">
                  Supplier Bill / Invoice No.
                </label>
                <input
                  type="text"
                  value={supplierBillNo}
                  onChange={(e) => setSupplierBillNo(e.target.value)}
                  placeholder="e.g. SUP-2026-881"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#FBF9F1] border border-slate-200 text-sm focus:outline-none focus:border-[#6A4CFF]"
                />
              </div>
            )}

            {/* Party Details */}
            {txnType !== 'Expense' ? (
              <div className="space-y-2.5 pb-3 border-b border-dashed border-slate-200">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                    {isPurchaseSide ? 'Supplier Name' : 'Customer / Party Name'}
                  </label>
                  <span className="text-[11px] text-[#1B9B62] font-semibold flex items-center gap-1">
                    <UserPlus className="w-3 h-3" /> Auto-creates if new
                  </span>
                </div>
                <input
                  type="text"
                  list="txn-parties-datalist"
                  value={partyName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPartyName(val);
                    const matched = parties.find(
                      (p) => p.name.toLowerCase() === val.trim().toLowerCase()
                    );
                    if (matched) {
                      setPartyId(matched.id);
                      if (matched.phone) setPhone(matched.phone);
                      if (matched.gstin) setGstin(matched.gstin);
                    } else {
                      setPartyId('');
                    }
                  }}
                  placeholder={isPurchaseSide ? 'e.g. Agarwal Wholesale' : 'e.g. Ramesh Kumar'}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#FBF9F1] border border-slate-200 text-sm font-semibold focus:outline-none focus:border-[#1B9B62]"
                />
                <datalist id="txn-parties-datalist">
                  {parties.map((p) => (
                    <option key={p.id} value={p.name} />
                  ))}
                </datalist>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      +91
                    </span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Phone number"
                      className="w-full pl-10 pr-3 py-2 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs font-mono-num focus:outline-none focus:border-[#1B9B62]"
                    />
                  </div>
                  <input
                    type="text"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value.toUpperCase())}
                    placeholder="Party GSTIN (Optional)"
                    className="w-full px-3 py-2 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs uppercase focus:outline-none focus:border-[#1B9B62]"
                  />
                </div>
              </div>
            ) : (
              /* Expense Category & Title */
              <div className="space-y-2.5 pb-3 border-b border-dashed border-slate-200">
                <label className="block text-[11px] font-bold text-slate-500 uppercase">
                  Expense Category
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setCategory(cat);
                        setPartyName(cat);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                        category === cat
                          ? 'bg-rose-600 text-white border-rose-600'
                          : 'bg-[#FBF9F1] text-slate-700 border-slate-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Line Items OR Direct Payment/Expense Amount */}
            {isPaymentOrExpense ? (
              <div className="py-2">
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  {txnType} Amount (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={directAmount}
                  onChange={(e) => setDirectAmount(e.target.value)}
                  placeholder="₹ 0.00"
                  className="w-full px-4 py-3.5 rounded-2xl bg-[#FBF9F1] border border-slate-200 text-2xl font-extrabold font-mono-num text-[#1B9B62] focus:outline-none focus:border-[#1B9B62]"
                />
              </div>
            ) : (
              <div className="space-y-3 pb-3 border-b border-dashed border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wide">
                    Items ({items.length})
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowItemCatalogPicker(!showItemCatalogPicker)}
                      className="px-2.5 py-1.5 rounded-xl bg-purple-50 text-[#6A4CFF] text-xs font-bold flex items-center gap-1"
                    >
                      <Package className="w-3.5 h-3.5" />
                      From Catalog
                    </button>
                    <button
                      type="button"
                      onClick={handleAddBlankItem}
                      className="px-2.5 py-1.5 rounded-xl bg-emerald-50 text-[#1B9B62] text-xs font-bold flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Item
                    </button>
                  </div>
                </div>

                {showItemCatalogPicker && (
                  <div className="p-3 rounded-2xl bg-[#FBF9F1] border border-slate-200 max-h-44 overflow-y-auto space-y-1.5">
                    {catalogItems.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-2">
                        No catalog items yet. Add items manually or in Items tab.
                      </p>
                    ) : (
                      catalogItems.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => handlePickCatalogItem(cat)}
                          className="w-full flex items-center justify-between p-2 rounded-xl bg-white hover:bg-emerald-50 border border-slate-200/70 text-left text-xs"
                        >
                          <div>
                            <div className="font-bold text-slate-900">{cat.name}</div>
                            <div className="text-[11px] text-slate-500">
                              Stock: {cat.stockQty} {cat.unit}
                            </div>
                          </div>
                          <span className="font-mono-num font-bold text-[#1B9B62]">
                            ₹{isPurchaseSide ? cat.purchasePrice : cat.salePrice}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}

                {items.length === 0 ? (
                  <div className="py-5 text-center rounded-2xl bg-[#FBF9F1] border border-dashed border-slate-200">
                    <p className="text-xs text-slate-500 mb-2">No items added yet</p>
                    <button
                      type="button"
                      onClick={handleAddBlankItem}
                      className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 shadow-xs"
                    >
                      + Add First Item
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {items.map((item, idx) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-2xl bg-[#FBF9F1] border border-slate-200/70 space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => updateLineItem(idx, { name: e.target.value })}
                            placeholder="Item name (e.g. Basmati Rice)"
                            className="flex-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setItems((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                            aria-label="Remove item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="grid grid-cols-4 gap-2 items-center">
                          <div>
                            <label className="block text-[10px] text-slate-500">Qty</label>
                            <input
                              type="number"
                              step="0.01"
                              value={item.qty}
                              onChange={(e) =>
                                updateLineItem(idx, { qty: parseFloat(e.target.value) || 0 })
                              }
                              className="w-full px-2 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-mono-num"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500">Unit</label>
                            <input
                              type="text"
                              value={item.unit}
                              onChange={(e) => updateLineItem(idx, { unit: e.target.value })}
                              className="w-full px-2 py-1.5 rounded-lg bg-white border border-slate-200 text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500">Rate ₹</label>
                            <input
                              type="number"
                              step="0.01"
                              value={item.rate}
                              onChange={(e) =>
                                updateLineItem(idx, { rate: parseFloat(e.target.value) || 0 })
                              }
                              className="w-full px-2 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-mono-num"
                            />
                          </div>
                          <div className="text-right">
                            <label className="block text-[10px] text-slate-500">Total</label>
                            <div className="text-xs font-extrabold font-mono-num text-slate-900 py-1.5">
                              ₹{item.total.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Discount, Delivery, GST */}
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">
                      Discount ₹
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">
                      Delivery ₹
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={deliveryCharge}
                      onChange={(e) => setDeliveryCharge(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">
                      GST %
                    </label>
                    <select
                      value={gstPercent}
                      onChange={(e) => setGstPercent(e.target.value)}
                      className="w-full px-2 py-2 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs font-mono-num"
                    >
                      <option value="0">0%</option>
                      <option value="5">5%</option>
                      <option value="12">12%</option>
                      <option value="18">18%</option>
                      <option value="28">28%</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Payment Mode & Received / Paid Summary */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">Grand Total</span>
                <span className="text-2xl font-extrabold font-mono-num text-slate-900">
                  ₹{totals.totalAmount.toFixed(2)}
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1.5">
                  Payment Mode
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Cash', 'Online', 'Credit'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setPaymentMode(mode);
                        if (mode === 'Credit') {
                          setReceivedAmount('0');
                          setReceivedEditedManually(true);
                        } else {
                          setReceivedEditedManually(false);
                        }
                      }}
                      className={`py-2 rounded-xl text-xs font-bold border transition ${
                        paymentMode === mode
                          ? mode === 'Credit'
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'bg-[#1B9B62] text-white border-[#1B9B62]'
                          : 'bg-[#FBF9F1] text-slate-700 border-slate-200'
                      }`}
                    >
                      {mode === 'Credit' ? 'Credit (Udhar)' : mode}
                    </button>
                  ))}
                </div>
              </div>

              {!isPaymentOrExpense && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      {isPurchaseSide ? 'Paid Amount ₹' : 'Received Amount ₹'}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={
                        receivedEditedManually ? receivedAmount : String(totals.receivedAmount)
                      }
                      onChange={(e) => {
                        setReceivedEditedManually(true);
                        setReceivedAmount(e.target.value);
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-[#FBF9F1] border border-slate-200 text-sm font-bold font-mono-num text-[#1B9B62]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      Balance Due ₹
                    </label>
                    <div className="w-full px-3 py-2 rounded-xl bg-rose-50 border border-rose-100 text-sm font-extrabold font-mono-num text-rose-600">
                      ₹{totals.balanceDue.toFixed(2)}
                    </div>
                  </div>
                </div>
              )}

              {/* Attachment / Normal Bill Photo */}
              <div className="pt-2 border-t border-dashed border-slate-200">
                <div className="flex items-center justify-between gap-2">
                  <label className="relative overflow-hidden flex-1 py-2.5 px-3 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs font-bold text-slate-700 flex items-center justify-center gap-2 hover:bg-slate-100 cursor-pointer">
                    {uploadingAttachment ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[#6A4CFF]" />
                    ) : (
                      <Paperclip className="w-4 h-4 text-[#6A4CFF]" />
                    )}
                    <span>
                      {attachmentUrl
                        ? 'Change Bill Photo Attachment'
                        : 'Add attachment / Normal Bill Photo'}
                    </span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,application/pdf"
                      disabled={uploadingAttachment}
                      onChange={handleAttachmentUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </label>
                  {attachmentUrl && (
                    <a
                      href={attachmentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-2.5 rounded-xl bg-emerald-50 text-[#1B9B62] text-xs font-bold"
                    >
                      View
                    </a>
                  )}
                </div>
              </div>

              {/* Note & Terms */}
              <div className="grid grid-cols-1 gap-2">
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add note or voice remark..."
                  className="w-full px-3 py-2 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs focus:outline-none"
                />
                {!isPaymentOrExpense && (
                  <input
                    type="text"
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                    placeholder="Terms & Conditions on invoice..."
                    className="w-full px-3 py-2 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs focus:outline-none"
                  />
                )}
              </div>
            </div>
          </div>
          <div className="h-4 serrated-bottom w-full" />
        </div>

        {/* Sticky Bottom Save Button */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#FBF9F1] via-[#FBF9F1] to-transparent z-30">
          <div className="max-w-2xl mx-auto">
            <button
              type="submit"
              disabled={saving}
              className="w-full py-4 rounded-2xl bg-[#1B9B62] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-xl shadow-[#1B9B62]/25 hover:bg-[#168452] active:scale-[0.99] transition disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  <span>
                    Save {txnType} · ₹{totals.totalAmount.toFixed(2)}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
