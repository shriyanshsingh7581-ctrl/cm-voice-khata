import React, { useMemo, useRef, useState } from 'react';
import {
  Search,
  CloudUpload,
  FileDown,
  FileSpreadsheet,
  ScanBarcode,
  Mic,
  Plus,
  Package,
  Edit3,
  Trash2,
  X,
  Loader2,
  Volume2,
} from 'lucide-react';
import { CatalogItem, ShopSettings } from '../types';
import {
  exportReportToPDF,
  exportToExcel,
  formatINR,
  parseCatalogExcelFile,
} from '../services/exportService';
import { speakText } from '../services/ttsService';

interface ItemsTabProps {
  items: CatalogItem[];
  shopSettings: ShopSettings;
  onSaveItem: (item: Omit<CatalogItem, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onOpenBarcodeScanner: (callback: (code: string) => void) => void;
}

export const ItemsTab: React.FC<ItemsTabProps> = ({
  items,
  shopSettings,
  onSaveItem,
  onDeleteItem,
  onOpenBarcodeScanner,
}) => {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState('');
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);

  const [name, setName] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [salePrice, setSalePrice] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [stockQty, setStockQty] = useState('0');
  const [barcode, setBarcode] = useState('');
  const [hsn, setHsn] = useState('');
  const [gstPercent, setGstPercent] = useState('0');

  const [voiceInput, setVoiceInput] = useState('');
  const [voiceParsing, setVoiceParsing] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter(
        (i) =>
          !q ||
          i.name.toLowerCase().includes(q) ||
          (i.barcode && i.barcode.toLowerCase().includes(q))
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, search]);

  const totalStockValue = useMemo(
    () => items.reduce((s, i) => s + (i.stockQty || 0) * (i.purchasePrice || 0), 0),
    [items]
  );

  const openNewItemModal = (prefillBarcode = '') => {
    setEditingItem(null);
    setName('');
    setUnit('pcs');
    setSalePrice('');
    setPurchasePrice('');
    setStockQty('0');
    setBarcode(prefillBarcode);
    setHsn('');
    setGstPercent('0');
    setVoiceInput('');
    setShowAddEditModal(true);
  };

  const openEditItemModal = (it: CatalogItem) => {
    setEditingItem(it);
    setName(it.name);
    setUnit(it.unit);
    setSalePrice(String(it.salePrice));
    setPurchasePrice(String(it.purchasePrice));
    setStockQty(String(it.stockQty));
    setBarcode(it.barcode || '');
    setHsn(it.hsn || '');
    setGstPercent(String(it.gstPercent || 0));
    setVoiceInput('');
    setShowAddEditModal(true);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const parsed = await parseCatalogExcelFile(file);
      for (const item of parsed) {
        await onSaveItem(item);
      }
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const handleVoiceParseItem = async () => {
    if (!voiceInput.trim()) return;
    setVoiceParsing(true);
    setVoiceError('');
    try {
      const res = await fetch('/api/ai/parse-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: voiceInput }),
      });
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || 'Could not parse item text');
      }
      const data = (await res.json()) as {
        parsed?: Partial<CatalogItem>;
      };
      const p = data.parsed || {};
      if (p.name) setName(p.name);
      if (p.unit) setUnit(p.unit);
      if (typeof p.salePrice === 'number') setSalePrice(String(p.salePrice));
      if (typeof p.purchasePrice === 'number') setPurchasePrice(String(p.purchasePrice));
      if (typeof p.stockQty === 'number') setStockQty(String(p.stockQty));
      if (typeof p.gstPercent === 'number') setGstPercent(String(p.gstPercent));
      if (p.hsn) setHsn(p.hsn);
      if (p.barcode) setBarcode(p.barcode);
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : 'AI item fill failed');
    } finally {
      setVoiceParsing(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSaveItem({
        id: editingItem?.id,
        name: name.trim(),
        unit: unit.trim() || 'pcs',
        salePrice: parseFloat(salePrice) || 0,
        purchasePrice: parseFloat(purchasePrice) || 0,
        stockQty: parseFloat(stockQty) || 0,
        barcode: barcode.trim(),
        hsn: hsn.trim(),
        gstPercent: parseFloat(gstPercent) || 0,
      });
      setShowAddEditModal(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-28">
      {/* Top Inventory KPI Card */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold text-slate-500">Total Products</p>
          <p className="text-xl font-extrabold font-mono-num text-slate-900">{items.length}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold text-slate-500">Stock Value (Cost)</p>
          <p className="text-xl font-extrabold font-mono-num text-[#1B9B62]">
            {formatINR(totalStockValue)}
          </p>
        </div>
      </div>

      {/* Action Toolbar: Import, PDF, Excel, Barcode, Voice Add */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <label className="relative overflow-hidden px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer">
          {importing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <CloudUpload className="w-3.5 h-3.5 text-[#6A4CFF]" />
          )}
          <span>Import</span>
          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            disabled={importing}
            onChange={handleImportFile}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </label>
        <button
          onClick={() =>
            exportReportToPDF(
              'Inventory Catalog',
              `Total Products: ${items.length}`,
              ['Name', 'Unit', 'Sale Price', 'Purchase', 'Stock'],
              items.map((i) => [
                i.name,
                i.unit,
                `Rs.${i.salePrice}`,
                `Rs.${i.purchasePrice}`,
                `${i.stockQty}`,
              ]),
              shopSettings.showBranding
            )
          }
          className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-rose-700 flex items-center gap-1 whitespace-nowrap shrink-0"
        >
          <FileDown className="w-3.5 h-3.5" />
          PDF
        </button>
        <button
          onClick={() =>
            exportToExcel(
              'Items_Catalog',
              items.map((i) => ({
                Name: i.name,
                Unit: i.unit,
                SalePrice: i.salePrice,
                PurchasePrice: i.purchasePrice,
                Stock: i.stockQty,
                Barcode: i.barcode,
                HSN: i.hsn,
                GST: i.gstPercent,
              }))
            )
          }
          className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-[#1B9B62] flex items-center gap-1 whitespace-nowrap shrink-0"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          Excel
        </button>
        <button
          onClick={() =>
            onOpenBarcodeScanner((code) => {
              const existing = items.find((i) => i.barcode === code);
              if (existing) {
                setSearch(code);
              } else {
                openNewItemModal(code);
              }
            })
          }
          className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <ScanBarcode className="w-3.5 h-3.5 text-[#6A4CFF]" />
          [||||] Scan
        </button>
      </div>

      {/* Search + Add Item */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items or barcode..."
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white border border-slate-200 text-sm focus:outline-none focus:border-[#6A4CFF]"
          />
        </div>
        <button
          onClick={() => openNewItemModal()}
          className="px-3.5 py-2.5 rounded-2xl bg-[#6A4CFF] text-white text-xs font-bold flex items-center gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Item
        </button>
      </div>

      {/* Items List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-3xl p-10 text-center border border-slate-200/70">
          <div className="w-14 h-14 rounded-2xl bg-[#FBF9F1] text-slate-400 flex items-center justify-center mx-auto mb-3">
            <Package className="w-7 h-7" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">No items in catalog yet</h3>
          <p className="text-xs text-slate-500 mt-1">
            Add products manually, import from Excel/CSV, or scan a barcode.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-2xl p-4 border border-slate-200/80 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-50 text-[#1B9B62] tracking-wide">
                    PRODUCT
                  </span>
                  <h4 className="font-bold text-sm text-slate-900 truncate">{item.name}</h4>
                </div>
                <div className="mt-1.5 flex items-center gap-4 text-xs text-slate-500">
                  <span>
                    Sale:{' '}
                    <strong className="font-mono-num text-slate-900">
                      ₹{item.salePrice}
                    </strong>
                  </span>
                  <span>
                    Purchase:{' '}
                    <strong className="font-mono-num text-slate-700">
                      ₹{item.purchasePrice}
                    </strong>
                  </span>
                  <span>
                    Stock:{' '}
                    <strong
                      className={`font-mono-num ${
                        item.stockQty > 0 ? 'text-[#1B9B62]' : 'text-rose-600'
                      }`}
                    >
                      {item.stockQty} {item.unit}
                    </strong>
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => openEditItemModal(item)}
                  className="p-2 rounded-xl text-slate-500 hover:bg-slate-100"
                  aria-label="Edit item"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDeleteItem(item.id)}
                  className="p-2 rounded-xl text-rose-500 hover:bg-rose-50"
                  aria-label="Delete item"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Item Modal (with Voice AI Quick Fill) */}
      {showAddEditModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowAddEditModal(false)}
        >
          <form
            onSubmit={handleSave}
            className="w-full max-w-md bg-white rounded-3xl p-5 space-y-3.5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-base text-slate-900">
                {editingItem ? 'Edit Product' : 'Add New Item'}
              </h3>
              <div className="flex items-center gap-1.5">
                {name.trim() && (
                  <button
                    type="button"
                    onClick={() =>
                      speakText(
                        `${name}, sale price ${salePrice || 0} rupaye per ${unit || 'piece'}, stock ${stockQty || 0} ${unit || 'piece'}.`
                      )
                    }
                    className="px-2.5 py-1 rounded-full bg-emerald-50 text-[#1B9B62] text-[11px] font-bold flex items-center gap-1"
                  >
                    <Volume2 className="w-3 h-3" />
                    सुनें
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowAddEditModal(false)}
                  className="p-1.5 rounded-full bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* AI Voice / Hinglish Quick Fill */}
            <div className="p-3 rounded-2xl bg-purple-50 border border-purple-100 space-y-2">
              <label className="block text-[11px] font-bold text-[#6A4CFF]">
                Quick AI Fill (Speak/Type Hinglish)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={voiceInput}
                  onChange={(e) => setVoiceInput(e.target.value)}
                  placeholder="e.g. Chini 1 kg sale 48 purchase 42 stock 50"
                  className="flex-1 px-3 py-2 rounded-xl bg-white border border-purple-200 text-xs"
                />
                <button
                  type="button"
                  disabled={voiceParsing}
                  onClick={handleVoiceParseItem}
                  className="px-3 py-2 rounded-xl bg-[#6A4CFF] text-white text-xs font-bold flex items-center gap-1"
                >
                  {voiceParsing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Mic className="w-3.5 h-3.5" />
                  )}
                  Fill
                </button>
              </div>
              {voiceError && (
                <p className="text-[11px] font-semibold text-rose-600">{voiceError}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Item Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Tata Salt 1kg"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FBF9F1] border border-slate-200 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Sale Price ₹ *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#FBF9F1] border border-slate-200 text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Purchase Price ₹
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#FBF9F1] border border-slate-200 text-sm font-mono-num"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Stock Qty</label>
                <input
                  type="number"
                  step="0.01"
                  value={stockQty}
                  onChange={(e) => setStockQty(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Unit</label>
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="pcs / kg"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">GST %</label>
                <input
                  type="number"
                  value={gstPercent}
                  onChange={(e) => setGstPercent(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs font-mono-num"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Barcode</label>
                <input
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="Scan or type"
                  className="w-full px-3 py-2 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">HSN Code</label>
                <input
                  type="text"
                  value={hsn}
                  onChange={(e) => setHsn(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-3 py-2 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs font-mono-num"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-3.5 rounded-2xl bg-[#1B9B62] text-white font-bold text-sm"
            >
              {saving ? 'Saving...' : 'Save Item to Catalog'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
