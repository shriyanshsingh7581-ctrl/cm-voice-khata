import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Calendar,
  FileDown,
  FileSpreadsheet,
  Inbox,
  Camera,
} from 'lucide-react';
import { Bill, SavedBillPhoto, ShopSettings } from '../types';
import { exportReportToPDF, exportToExcel, formatINR } from '../services/exportService';

type DatePreset = 'All time' | 'Today' | 'This week' | 'This month' | 'Last month' | 'Custom';

interface ReportsModalProps {
  isOpen: boolean;
  reportType: 'sale' | 'daybook';
  bills: Bill[];
  savedPhotos: SavedBillPhoto[];
  shopSettings: ShopSettings;
  onClose: () => void;
  onSelectBill: (bill: Bill) => void;
  onSelectPhoto: (photo: SavedBillPhoto) => void;
}

function getDateRangeForPreset(
  preset: DatePreset,
  selectedDate: string,
  customStart: string,
  customEnd: string
): { start: string; end: string } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  if (preset === 'All time') return { start: '1900-01-01', end: '2999-12-31' };
  if (preset === 'Today') return { start: selectedDate, end: selectedDate };
  if (preset === 'This week') {
    const base = new Date(selectedDate + 'T00:00:00');
    const day = base.getDay();
    const start = new Date(base);
    start.setDate(base.getDate() - day);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: fmt(start), end: fmt(end) };
  }
  if (preset === 'This month') {
    const [y, m] = selectedDate.split('-').map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);
    return { start: fmt(start), end: fmt(end) };
  }
  if (preset === 'Last month') {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    return { start: fmt(start), end: fmt(end) };
  }
  return { start: customStart || selectedDate, end: customEnd || selectedDate };
}

export const ReportsModal: React.FC<ReportsModalProps> = ({
  isOpen,
  reportType,
  bills,
  savedPhotos,
  shopSettings,
  onClose,
  onSelectBill,
  onSelectPhoto,
}) => {
  const [preset, setPreset] = useState<DatePreset>(reportType === 'daybook' ? 'Today' : 'This month');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [customStart, setCustomStart] = useState(new Date().toISOString().slice(0, 10));
  const [customEnd, setCustomEnd] = useState(new Date().toISOString().slice(0, 10));
  const [showCalendarModal, setShowCalendarModal] = useState(false);

  const range = useMemo(
    () => getDateRangeForPreset(preset, selectedDate, customStart, customEnd),
    [preset, selectedDate, customStart, customEnd]
  );

  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      const inRange = b.date >= range.start && b.date <= range.end;
      if (!inRange) return false;
      if (reportType === 'sale') {
        return b.txnType === 'Sale' || b.txnType === 'Sale Return' || b.txnType === 'Payment In';
      }
      return true;
    });
  }, [bills, range, reportType]);

  const filteredPhotos = useMemo(() => {
    return savedPhotos.filter((p) => {
      const inRange = p.date >= range.start && p.date <= range.end;
      if (!inRange) return false;
      if (reportType === 'sale') return p.billType === 'Sale';
      return true;
    });
  }, [savedPhotos, range, reportType]);

  const summary = useMemo(() => {
    let total = 0;
    let moneyIn = 0;
    let moneyOut = 0;

    for (const b of filteredBills) {
      if (b.txnType === 'Sale') {
        total += b.totalAmount;
        moneyIn += b.receivedAmount;
      } else if (b.txnType === 'Payment In') {
        moneyIn += b.totalAmount;
        total += b.totalAmount;
      } else if (b.txnType === 'Sale Return') {
        total -= b.totalAmount;
        moneyOut += b.receivedAmount;
      } else if (b.txnType === 'Purchase Invoice') {
        moneyOut += b.receivedAmount;
      } else if (b.txnType === 'Payment Out' || b.txnType === 'Expense') {
        moneyOut += b.totalAmount;
      } else if (b.txnType === 'Purchase Return') {
        moneyIn += b.receivedAmount;
      }
    }

    for (const p of filteredPhotos) {
      if (p.billType === 'Sale') {
        total += p.amount;
        moneyIn += p.amount;
      } else {
        moneyOut += p.amount;
      }
    }

    return { total, moneyIn, moneyOut };
  }, [filteredBills, filteredPhotos]);

  const stepDay = (delta: number) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    setSelectedDate(d.toISOString().slice(0, 10));
    if (preset !== 'Today') setPreset('Today');
  };

  const handleExportPDF = () => {
    const title = reportType === 'sale' ? 'Sale Report' : 'Daybook Report';
    const headers = ['Date', 'Type', 'Party', 'Bill #', 'Total', 'Paid/Rec'];
    const rows = [
      ...filteredBills.map((b) => [
        b.date,
        b.txnType,
        b.partyName,
        b.billNumber,
        `Rs.${b.totalAmount.toFixed(2)}`,
        `Rs.${b.receivedAmount.toFixed(2)}`,
      ]),
      ...filteredPhotos.map((p) => [
        p.date,
        `Photo (${p.billType})`,
        p.partyName,
        'PHOTO',
        `Rs.${p.amount.toFixed(2)}`,
        `Rs.${p.amount.toFixed(2)}`,
      ]),
    ];
    exportReportToPDF(
      title,
      `Period: ${preset} (${range.start} to ${range.end})`,
      headers,
      rows,
      shopSettings.showBranding
    );
  };

  const handleExportExcel = () => {
    const rows = [
      ...filteredBills.map((b) => ({
        Date: b.date,
        Type: b.txnType,
        Party: b.partyName,
        BillNo: b.billNumber,
        Total: b.totalAmount,
        ReceivedOrPaid: b.receivedAmount,
        BalanceDue: b.balanceDue,
        Mode: b.paymentMode,
      })),
      ...filteredPhotos.map((p) => ({
        Date: p.date,
        Type: `Saved Photo (${p.billType})`,
        Party: p.partyName,
        BillNo: 'PHOTO',
        Total: p.amount,
        ReceivedOrPaid: p.amount,
        BalanceDue: 0,
        Mode: 'Photo',
      })),
    ];
    exportToExcel(reportType === 'sale' ? 'Sale_Report' : 'Daybook', rows);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 bg-[#FBF9F1] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-[#FBF9F1] flex items-center justify-center text-slate-700"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="font-extrabold text-base text-slate-900">
              {reportType === 'sale' ? 'Sale Report' : 'Daybook'}
            </h2>
            <p className="text-[11px] text-slate-500">
              {preset} · {range.start === range.end ? range.start : `${range.start} to ${range.end}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportPDF}
            className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 text-xs font-bold flex items-center gap-1"
          >
            <FileDown className="w-3.5 h-3.5" />
            PDF
          </button>
          <button
            onClick={handleExportExcel}
            className="px-3 py-1.5 rounded-xl bg-emerald-50 text-[#1B9B62] text-xs font-bold flex items-center gap-1"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excel
          </button>
        </div>
      </div>

      {/* Date Stepper & Calendar Modal Trigger */}
      <div className="bg-white border-b border-slate-200/70 px-4 py-2.5 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => stepDay(-1)}
            className="w-8 h-8 rounded-xl bg-[#FBF9F1] border border-slate-200 flex items-center justify-center"
            aria-label="Previous day"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowCalendarModal(true)}
            className="px-3 py-1.5 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs font-bold text-slate-800 flex items-center gap-1.5"
          >
            <Calendar className="w-3.5 h-3.5 text-[#6A4CFF]" />
            <span>{preset === 'Today' ? selectedDate : preset}</span>
          </button>
          <button
            onClick={() => stepDay(1)}
            className="w-8 h-8 rounded-xl bg-[#FBF9F1] border border-slate-200 flex items-center justify-center"
            aria-label="Next day"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={() => setShowCalendarModal(true)}
          className="text-xs font-bold text-[#6A4CFF] px-2.5 py-1.5 rounded-xl bg-purple-50"
        >
          Change Filter
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-4 max-w-2xl w-full mx-auto space-y-4">
        {/* Summary Cards: Total, Money In, Money Out */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="bg-white rounded-2xl p-3.5 border border-slate-200/70">
            <p className="text-[11px] font-semibold text-slate-500">
              {reportType === 'sale' ? 'Net Sales' : 'Total Volume'}
            </p>
            <p className="mt-1 text-base font-extrabold font-mono-num text-slate-900 truncate">
              {formatINR(summary.total)}
            </p>
          </div>
          <div className="bg-white rounded-2xl p-3.5 border border-slate-200/70">
            <p className="text-[11px] font-semibold text-[#1B9B62]">Money In</p>
            <p className="mt-1 text-base font-extrabold font-mono-num text-[#1B9B62] truncate">
              {formatINR(summary.moneyIn)}
            </p>
          </div>
          <div className="bg-white rounded-2xl p-3.5 border border-slate-200/70">
            <p className="text-[11px] font-semibold text-rose-600">Money Out</p>
            <p className="mt-1 text-base font-extrabold font-mono-num text-rose-600 truncate">
              {formatINR(summary.moneyOut)}
            </p>
          </div>
        </div>

        {/* Entries Feed */}
        {filteredBills.length === 0 && filteredPhotos.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 text-center border border-slate-200/70">
            <div className="w-14 h-14 rounded-2xl bg-[#FBF9F1] flex items-center justify-center mx-auto mb-3 text-slate-400">
              <Inbox className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">No entries on this day</h3>
            <p className="text-xs text-slate-500 mt-1">
              Recorded sales, payments, purchases, expenses, and saved bill photos appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredBills.map((b) => (
              <button
                key={b.id}
                onClick={() => onSelectBill(b)}
                className="w-full bg-white rounded-2xl p-3.5 border border-slate-200/70 flex items-center justify-between text-left hover:border-[#6A4CFF]/40 transition"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900">{b.partyName}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                      {b.txnType}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 font-mono-num">
                    #{b.billNumber} · {b.date} · {b.paymentMode}
                  </p>
                </div>
                <div className="text-right">
                  <div className="font-extrabold text-sm font-mono-num text-slate-900">
                    {formatINR(b.totalAmount)}
                  </div>
                  {b.balanceDue > 0 && (
                    <div className="text-[11px] font-bold text-rose-600 font-mono-num">
                      Due {formatINR(b.balanceDue)}
                    </div>
                  )}
                </div>
              </button>
            ))}

            {filteredPhotos.map((p) => (
              <button
                key={p.id}
                onClick={() => onSelectPhoto(p)}
                className="w-full bg-white rounded-2xl p-3.5 border border-slate-200/70 flex items-center justify-between text-left hover:border-[#1B9B62]/40 transition"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={p.imageUrl}
                    alt={p.partyName}
                    className="w-11 h-11 rounded-xl object-cover border border-slate-200"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm text-slate-900">{p.partyName}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-[#1B9B62] flex items-center gap-1">
                        <Camera className="w-3 h-3" /> Photo Bill
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {p.billType} · {p.date}
                    </p>
                  </div>
                </div>
                <div className="font-extrabold text-sm font-mono-num text-slate-900">
                  {p.amount > 0 ? formatINR(p.amount) : 'Photo'}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Custom Calendar Filter Modal */}
      {showCalendarModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowCalendarModal(false)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-3xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-extrabold text-base text-slate-900">Select Report Period</h3>
            <div className="grid grid-cols-2 gap-2">
              {(
                ['All time', 'Today', 'This week', 'This month', 'Last month', 'Custom'] as DatePreset[]
              ).map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setPreset(p);
                    if (p !== 'Custom') setShowCalendarModal(false);
                  }}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition ${
                    preset === p
                      ? 'bg-[#6A4CFF] text-white border-[#6A4CFF]'
                      : 'bg-[#FBF9F1] text-slate-700 border-slate-200'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            {preset === 'Custom' && (
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      From
                    </label>
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      To
                    </label>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs"
                    />
                  </div>
                </div>
                <button
                  onClick={() => setShowCalendarModal(false)}
                  className="w-full py-3 rounded-2xl bg-[#1B9B62] text-white font-bold text-sm"
                >
                  Apply Custom Range
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
