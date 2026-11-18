import React, { useMemo, useState } from 'react';
import {
  Search,
  RefreshCw,
  FileDown,
  FileSpreadsheet,
  MessageCircle,
  Edit3,
  Trash2,
  Camera,
  Receipt,
  Printer,
  ZoomIn,
  X,
  Download,
  Volume2,
} from 'lucide-react';
import {
  ALL_TRANSACTION_TYPES,
  Bill,
  BusinessProfile,
  Party,
  SavedBillPhoto,
  ShopSettings,
} from '../types';
import {
  buildBillWhatsAppMessage,
  buildSavedPhotoWhatsAppMessage,
  downloadBillInvoicePDF,
  exportReportToPDF,
  exportToExcel,
  formatINR,
  getWhatsAppShareUrl,
} from '../services/exportService';
import { buildBillSpeech, speakText, stopSpeaking } from '../services/ttsService';

interface BillsTabProps {
  bills: Bill[];
  savedPhotos: SavedBillPhoto[];
  parties: Party[];
  businessProfile: BusinessProfile;
  shopSettings: ShopSettings;
  onRefresh: () => Promise<void>;
  onEditBill: (bill: Bill) => void;
  onDeleteBill: (billId: string) => Promise<void>;
  onDeletePhoto: (photoId: string) => Promise<void>;
  onOpenCamera: () => void;
  onViewPhoto: (photo: SavedBillPhoto) => void;
}

export const BillsTab: React.FC<BillsTabProps> = ({
  bills,
  savedPhotos,
  parties,
  businessProfile,
  shopSettings,
  onRefresh,
  onEditBill,
  onDeleteBill,
  onDeletePhoto,
  onOpenCamera,
  onViewPhoto,
}) => {
  const [filterKind, setFilterKind] = useState<'all' | 'digital' | 'photos'>('all');
  const [txnFilter, setTxnFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBillDetail, setSelectedBillDetail] = useState<Bill | null>(null);
  const [speakingBillId, setSpeakingBillId] = useState<string | null>(null);

  const handleToggleSpeakBill = async (bill: Bill) => {
    if (speakingBillId === bill.id) {
      stopSpeaking();
      setSpeakingBillId(null);
      return;
    }
    setSpeakingBillId(bill.id);
    try {
      await speakText(buildBillSpeech(bill), {
        onEnd: () => setSpeakingBillId(null),
      });
    } finally {
      setSpeakingBillId(null);
    }
  };

  const filteredBills = useMemo(() => {
    if (filterKind === 'photos') return [];
    const q = search.trim().toLowerCase();
    return bills
      .filter((b) => txnFilter === 'ALL' || b.txnType === txnFilter)
      .filter((b) => (!fromDate || b.date >= fromDate) && (!toDate || b.date <= toDate))
      .filter(
        (b) =>
          !q ||
          b.partyName.toLowerCase().includes(q) ||
          b.billNumber.toLowerCase().includes(q) ||
          b.txnType.toLowerCase().includes(q)
      )
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [bills, filterKind, txnFilter, fromDate, toDate, search]);

  const filteredPhotos = useMemo(() => {
    if (filterKind === 'digital') return [];
    const q = search.trim().toLowerCase();
    return savedPhotos
      .filter((p) => txnFilter === 'ALL' || p.billType === txnFilter)
      .filter((p) => (!fromDate || p.date >= fromDate) && (!toDate || p.date <= toDate))
      .filter(
        (p) =>
          !q ||
          p.partyName.toLowerCase().includes(q) ||
          p.note.toLowerCase().includes(q) ||
          p.billType.toLowerCase().includes(q)
      )
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [savedPhotos, filterKind, txnFilter, fromDate, toDate, search]);

  const handlePullRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setRefreshing(false), 350);
    }
  };

  const handleDownloadPDF = (bill: Bill) => {
    const p = parties.find(
      (party) =>
        party.id === bill.partyId ||
        party.name.toLowerCase() === bill.partyName.toLowerCase()
    );
    downloadBillInvoicePDF(bill, businessProfile, shopSettings, p?.balance);
  };

  const handlePrint = (bill: Bill) => {
    setSelectedBillDetail(bill);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  return (
    <div className="space-y-4 pb-28">
      {/* Filter Pills + Refresh */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 p-1 bg-white rounded-2xl border border-slate-200/80 overflow-x-auto">
          {(
            [
              { id: 'all', label: `All (${bills.length + savedPhotos.length})` },
              { id: 'digital', label: `Digital Bills (${bills.length})` },
              { id: 'photos', label: `Saved Bill Photos (${savedPhotos.length})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterKind(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                filterKind === tab.id
                  ? 'bg-[#6A4CFF] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          onClick={handlePullRefresh}
          className="p-2.5 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 shrink-0"
          aria-label="Refresh bills"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-[#6A4CFF]' : ''}`} />
        </button>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-2xl p-3 border border-slate-200/80 space-y-2.5">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search party, bill #, or note..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs focus:outline-none focus:border-[#6A4CFF]"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <select
            value={txnFilter}
            onChange={(e) => setTxnFilter(e.target.value)}
            className="px-2.5 py-2 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs font-semibold"
          >
            <option value="ALL">All Types</option>
            {ALL_TRANSACTION_TYPES.map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            aria-label="From date"
            className="px-2 py-2 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            aria-label="To date"
            className="px-2 py-2 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs"
          />
        </div>

        {/* Export All Bar */}
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={onOpenCamera}
            className="text-xs font-bold text-[#1B9B62] flex items-center gap-1"
          >
            <Camera className="w-3.5 h-3.5" />
            Save Bill Photo / AI Scan
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                exportReportToPDF(
                  'All Bills Register',
                  `Total Entries: ${filteredBills.length + filteredPhotos.length}`,
                  ['Date', 'Type', 'Party', 'Ref', 'Amount', 'Due'],
                  [
                    ...filteredBills.map((b) => [
                      b.date,
                      b.txnType,
                      b.partyName,
                      b.billNumber,
                      `Rs.${b.totalAmount}`,
                      `Rs.${b.balanceDue}`,
                    ]),
                    ...filteredPhotos.map((p) => [
                      p.date,
                      `Photo-${p.billType}`,
                      p.partyName,
                      'PHOTO',
                      `Rs.${p.amount}`,
                      '0',
                    ]),
                  ],
                  shopSettings.showBranding
                )
              }
              className="px-2.5 py-1.5 rounded-xl bg-rose-50 text-rose-700 text-xs font-bold flex items-center gap-1"
            >
              <FileDown className="w-3.5 h-3.5" />
              PDF
            </button>
            <button
              onClick={() =>
                exportToExcel('Bills_Register', [
                  ...filteredBills.map((b) => ({
                    Date: b.date,
                    Type: b.txnType,
                    Party: b.partyName,
                    BillNo: b.billNumber,
                    Total: b.totalAmount,
                    ReceivedOrPaid: b.receivedAmount,
                    Due: b.balanceDue,
                  })),
                  ...filteredPhotos.map((p) => ({
                    Date: p.date,
                    Type: `Photo (${p.billType})`,
                    Party: p.partyName,
                    BillNo: 'PHOTO',
                    Total: p.amount,
                    ReceivedOrPaid: p.amount,
                    Due: 0,
                  })),
                ])
              }
              className="px-2.5 py-1.5 rounded-xl bg-emerald-50 text-[#1B9B62] text-xs font-bold flex items-center gap-1"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Excel
            </button>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {filteredBills.length === 0 && filteredPhotos.length === 0 ? (
        <div className="bg-white rounded-3xl p-10 text-center border border-slate-200/70">
          <div className="w-14 h-14 rounded-2xl bg-[#FBF9F1] text-slate-400 flex items-center justify-center mx-auto mb-3">
            <Receipt className="w-7 h-7" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">No bills yet</h3>
          <p className="text-xs text-slate-500 mt-1">
            Tap &ldquo;Add New Sale&rdquo; or &ldquo;Scan Bill&rdquo; to create a digital invoice or save a bill photo.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Digital Bills */}
          {filteredBills.map((bill) => {
            const waHref = getWhatsAppShareUrl(
              bill.phone,
              buildBillWhatsAppMessage(
                bill,
                businessProfile.businessName,
                shopSettings.showBranding
              )
            );
            return (
              <div
                key={bill.id}
                className="bg-white rounded-2xl p-4 border border-slate-200/80 space-y-3"
              >
                <div
                  className="flex items-start justify-between cursor-pointer"
                  onClick={() => setSelectedBillDetail(bill)}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-slate-900">
                        {bill.partyName}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-50 text-[#6A4CFF]">
                        {bill.txnType}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 font-mono-num">
                      #{bill.billNumber} · {bill.date} · {bill.paymentMode}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="font-extrabold text-base font-mono-num text-slate-900">
                      {formatINR(bill.totalAmount)}
                    </div>
                    {bill.balanceDue > 0 ? (
                      <div className="text-[11px] font-bold text-rose-600 font-mono-num">
                        Due {formatINR(bill.balanceDue)}
                      </div>
                    ) : (
                      <div className="text-[11px] font-bold text-[#1B9B62]">Paid</div>
                    )}
                  </div>
                </div>

                {/* Action Strip */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleDownloadPDF(bill)}
                      className="px-2.5 py-1.5 rounded-xl bg-[#FBF9F1] text-slate-700 text-xs font-bold flex items-center gap-1 hover:bg-slate-100"
                    >
                      <FileDown className="w-3.5 h-3.5 text-[#6A4CFF]" />
                      PDF
                    </button>
                    <a
                      href={waHref}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1.5 rounded-xl bg-emerald-50 text-[#1B9B62] text-xs font-bold flex items-center gap-1"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      WhatsApp
                    </a>
                    <button
                      onClick={() => handlePrint(bill)}
                      className="px-2.5 py-1.5 rounded-xl bg-[#FBF9F1] text-slate-700 text-xs font-bold flex items-center gap-1"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Print
                    </button>
                    <button
                      onClick={() => handleToggleSpeakBill(bill)}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 ${
                        speakingBillId === bill.id
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-purple-50 text-[#6A4CFF]'
                      }`}
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      {speakingBillId === bill.id ? 'Stop' : 'सुनें'}
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onEditBill(bill)}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                      aria-label="Edit bill"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDeleteBill(bill.id)}
                      className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50"
                      aria-label="Delete bill"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Saved Normal Bill Photos */}
          {filteredPhotos.map((photo) => {
            const waHref = getWhatsAppShareUrl(
              '',
              buildSavedPhotoWhatsAppMessage(
                photo,
                businessProfile.businessName,
                shopSettings.showBranding
              )
            );
            return (
              <div
                key={photo.id}
                className="bg-white rounded-2xl p-4 border border-slate-200/80 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    onClick={() => onViewPhoto(photo)}
                    className="flex items-center gap-3 text-left flex-1 min-w-0"
                  >
                    <div className="relative w-14 h-14 rounded-2xl overflow-hidden border border-slate-200 shrink-0">
                      <img
                        src={photo.imageUrl}
                        alt={photo.partyName}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute bottom-0.5 right-0.5 bg-black/60 text-white p-0.5 rounded">
                        <ZoomIn className="w-3 h-3" />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-sm text-slate-900 truncate">
                          {photo.partyName}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-[#1B9B62] flex items-center gap-1 shrink-0">
                          <Camera className="w-3 h-3" /> Photo Bill
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {photo.billType} · {photo.date}
                      </p>
                      {photo.note && (
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">{photo.note}</p>
                      )}
                    </div>
                  </button>
                  <div className="text-right shrink-0">
                    <div className="font-extrabold text-base font-mono-num text-slate-900">
                      {photo.amount > 0 ? formatINR(photo.amount) : 'Saved'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onViewPhoto(photo)}
                      className="px-2.5 py-1.5 rounded-xl bg-[#FBF9F1] text-slate-700 text-xs font-bold flex items-center gap-1"
                    >
                      <ZoomIn className="w-3.5 h-3.5 text-[#6A4CFF]" />
                      Zoom Photo
                    </button>
                    <a
                      href={photo.imageUrl}
                      download={`bill-photo-${photo.date}.jpg`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1.5 rounded-xl bg-[#FBF9F1] text-slate-700 text-xs font-bold flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download
                    </a>
                    <a
                      href={waHref}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1.5 rounded-xl bg-emerald-50 text-[#1B9B62] text-xs font-bold flex items-center gap-1"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      Share
                    </a>
                  </div>
                  <button
                    onClick={() => onDeletePhoto(photo.id)}
                    className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50"
                    aria-label="Delete saved photo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Digital Bill Detail Modal */}
      {selectedBillDetail && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedBillDetail(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-3xl p-5 space-y-4 max-h-[88vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <p className="text-[11px] font-bold text-[#6A4CFF] uppercase">
                  {selectedBillDetail.txnType}
                </p>
                <h3 className="text-lg font-extrabold text-slate-900">
                  {selectedBillDetail.partyName}
                </h3>
                <p className="text-xs text-slate-500 font-mono-num">
                  #{selectedBillDetail.billNumber} · {selectedBillDetail.date}
                </p>
              </div>
              <button
                onClick={() => setSelectedBillDetail(null)}
                className="p-2 rounded-full bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {selectedBillDetail.items.length > 0 && (
              <div className="space-y-2">
                {selectedBillDetail.items.map((it, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">
                      {it.name} ({it.qty} {it.unit} × ₹{it.rate})
                    </span>
                    <span className="font-mono-num font-bold">{formatINR(it.total)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-[#FBF9F1] rounded-2xl p-3.5 space-y-1.5 text-xs">
              <div className="flex justify-between font-bold text-sm text-slate-900">
                <span>Grand Total</span>
                <span className="font-mono-num">{formatINR(selectedBillDetail.totalAmount)}</span>
              </div>
              <div className="flex justify-between text-[#1B9B62] font-semibold">
                <span>Paid ({selectedBillDetail.paymentMode})</span>
                <span className="font-mono-num">
                  {formatINR(selectedBillDetail.receivedAmount)}
                </span>
              </div>
              <div className="flex justify-between text-rose-600 font-semibold">
                <span>Balance Due</span>
                <span className="font-mono-num">{formatINR(selectedBillDetail.balanceDue)}</span>
              </div>
            </div>

            {selectedBillDetail.attachmentUrl && (
              <a
                href={selectedBillDetail.attachmentUrl}
                target="_blank"
                rel="noreferrer"
                className="block rounded-2xl overflow-hidden border border-slate-200"
              >
                <img
                  src={selectedBillDetail.attachmentUrl}
                  alt="Bill attachment"
                  className="w-full max-h-48 object-cover"
                />
              </a>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => handleDownloadPDF(selectedBillDetail)}
                className="py-3 rounded-2xl bg-[#6A4CFF] text-white font-bold text-xs flex items-center justify-center gap-1.5"
              >
                <FileDown className="w-4 h-4" />
                Download PDF
              </button>
              <a
                href={getWhatsAppShareUrl(
                  selectedBillDetail.phone,
                  buildBillWhatsAppMessage(
                    selectedBillDetail,
                    businessProfile.businessName,
                    shopSettings.showBranding
                  )
                )}
                target="_blank"
                rel="noreferrer"
                className="py-3 rounded-2xl bg-[#1B9B62] text-white font-bold text-xs flex items-center justify-center gap-1.5"
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp Share
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
