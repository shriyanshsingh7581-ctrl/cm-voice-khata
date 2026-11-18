import React, { useMemo, useState } from 'react';
import {
  Search,
  UserPlus,
  Phone,
  ArrowLeft,
  MessageCircle,
  FileDown,
  FileSpreadsheet,
  Plus,
  Edit3,
  Trash2,
  Camera,
  Users,
  X,
} from 'lucide-react';
import {
  Bill,
  BusinessProfile,
  Party,
  SavedBillPhoto,
  ShopSettings,
  TransactionType,
} from '../types';
import {
  buildPartyReminderWhatsAppMessage,
  exportReportToPDF,
  exportToExcel,
  formatINR,
  getWhatsAppShareUrl,
} from '../services/exportService';

interface PartiesTabProps {
  parties: Party[];
  bills: Bill[];
  savedPhotos: SavedBillPhoto[];
  businessProfile: BusinessProfile;
  shopSettings: ShopSettings;
  onSaveParty: (party: Omit<Party, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  onDeleteParty: (partyId: string) => Promise<void>;
  onStartTransactionForParty: (txnType: TransactionType, party: Party) => void;
  onViewPhoto: (photo: SavedBillPhoto) => void;
}

export const PartiesTab: React.FC<PartiesTabProps> = ({
  parties,
  bills,
  savedPhotos,
  businessProfile,
  shopSettings,
  onSaveParty,
  onDeleteParty,
  onStartTransactionForParty,
  onViewPhoto,
}) => {
  const [partyTab, setPartyTab] = useState<'customer' | 'supplier'>('customer');
  const [search, setSearch] = useState('');
  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(null);
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);

  // Add/Edit form fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [partyType, setPartyType] = useState<'customer' | 'supplier'>('customer');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [saving, setSaving] = useState(false);

  const selectedParty = useMemo(
    () => parties.find((p) => p.id === selectedPartyId) || null,
    [parties, selectedPartyId]
  );

  const filteredParties = useMemo(() => {
    const q = search.trim().toLowerCase();
    return parties
      .filter((p) => p.partyType === partyTab)
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          (p.phone && p.phone.includes(q))
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [parties, partyTab, search]);

  const totals = useMemo(() => {
    const customers = parties.filter((p) => p.partyType === 'customer');
    const suppliers = parties.filter((p) => p.partyType === 'supplier');
    const youWillGet = customers.reduce((s, p) => s + (p.balance > 0 ? p.balance : 0), 0);
    const youWillGive =
      suppliers.reduce((s, p) => s + (p.balance < 0 ? Math.abs(p.balance) : 0), 0) +
      customers.reduce((s, p) => s + (p.balance < 0 ? Math.abs(p.balance) : 0), 0);
    return { youWillGet, youWillGive };
  }, [parties]);

  const partyBills = useMemo(() => {
    if (!selectedParty) return [];
    return bills.filter(
      (b) =>
        b.partyId === selectedParty.id ||
        b.partyName.toLowerCase() === selectedParty.name.toLowerCase()
    );
  }, [bills, selectedParty]);

  const partyPhotos = useMemo(() => {
    if (!selectedParty) return [];
    return savedPhotos.filter(
      (p) =>
        p.partyId === selectedParty.id ||
        p.partyName.toLowerCase() === selectedParty.name.toLowerCase()
    );
  }, [savedPhotos, selectedParty]);

  const openNewPartyModal = () => {
    setEditingParty(null);
    setName('');
    setPhone('');
    setPartyType(partyTab);
    setGstin('');
    setAddress('');
    setOpeningBalance('0');
    setShowAddEditModal(true);
  };

  const openEditPartyModal = (p: Party) => {
    setEditingParty(p);
    setName(p.name);
    setPhone(p.phone);
    setPartyType(p.partyType);
    setGstin(p.gstin);
    setAddress(p.address);
    setOpeningBalance(String(p.balance));
    setShowAddEditModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSaveParty({
        id: editingParty?.id,
        name: name.trim(),
        phone: phone.trim(),
        partyType,
        gstin: gstin.trim().toUpperCase(),
        address: address.trim(),
        balance: parseFloat(openingBalance) || 0,
      });
      setShowAddEditModal(false);
    } finally {
      setSaving(false);
    }
  };

  // Party Detail Ledger View
  if (selectedParty) {
    const reminderMsg = buildPartyReminderWhatsAppMessage(
      selectedParty,
      businessProfile.businessName,
      shopSettings.showBranding
    );
    const whatsappHref = getWhatsAppShareUrl(selectedParty.phone, reminderMsg);

    return (
      <div className="space-y-4 pb-28">
        <div className="bg-white rounded-3xl p-4 border border-slate-200/80">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setSelectedPartyId(null)}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Parties
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => openEditPartyModal(selectedParty)}
                className="p-2 rounded-xl bg-[#FBF9F1] text-slate-700"
                aria-label="Edit party"
              >
                <Edit3 className="w-4 h-4" />
              </button>
              <button
                onClick={async () => {
                  await onDeleteParty(selectedParty.id);
                  setSelectedPartyId(null);
                }}
                className="p-2 rounded-xl bg-rose-50 text-rose-600"
                aria-label="Delete party"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">{selectedParty.name}</h2>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" />
                {selectedParty.phone ? `+91 ${selectedParty.phone}` : 'No phone added'}
              </p>
              {selectedParty.gstin && (
                <p className="text-[11px] text-slate-400 mt-0.5 font-mono-num">
                  GSTIN: {selectedParty.gstin}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-[11px] font-semibold text-slate-500">
                {selectedParty.balance >= 0 ? 'You will get' : 'You will give'}
              </p>
              <p
                className={`text-xl font-extrabold font-mono-num ${
                  selectedParty.balance >= 0 ? 'text-[#1B9B62]' : 'text-rose-600'
                }`}
              >
                {formatINR(Math.abs(selectedParty.balance))}
              </p>
            </div>
          </div>

          {/* Quick Party Ledger Actions */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              className="py-2.5 px-2 rounded-2xl bg-[#1B9B62] text-white text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Reminder
            </a>
            <button
              onClick={() =>
                onStartTransactionForParty(
                  selectedParty.partyType === 'supplier' ? 'Payment Out' : 'Payment In',
                  selectedParty
                )
              }
              className="py-2.5 px-2 rounded-2xl bg-emerald-50 text-[#1B9B62] text-xs font-bold"
            >
              {selectedParty.partyType === 'supplier' ? 'Pay Out' : 'Take Payment'}
            </button>
            <button
              onClick={() =>
                onStartTransactionForParty(
                  selectedParty.partyType === 'supplier' ? 'Purchase Invoice' : 'Sale',
                  selectedParty
                )
              }
              className="py-2.5 px-2 rounded-2xl bg-[#6A4CFF] text-white text-xs font-bold flex items-center justify-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              {selectedParty.partyType === 'supplier' ? 'Purchase' : 'Add Sale'}
            </button>
          </div>

          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
            <button
              onClick={() =>
                exportReportToPDF(
                  `Ledger - ${selectedParty.name}`,
                  `Current Balance: ${formatINR(selectedParty.balance)}`,
                  ['Date', 'Type', 'Bill #', 'Total', 'Paid/Rec', 'Due'],
                  partyBills.map((b) => [
                    b.date,
                    b.txnType,
                    b.billNumber,
                    `Rs.${b.totalAmount}`,
                    `Rs.${b.receivedAmount}`,
                    `Rs.${b.balanceDue}`,
                  ]),
                  shopSettings.showBranding
                )
              }
              className="flex-1 py-2 rounded-xl bg-[#FBF9F1] text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 border border-slate-200"
            >
              <FileDown className="w-3.5 h-3.5 text-rose-600" />
              Ledger PDF
            </button>
            <button
              onClick={() =>
                exportToExcel(
                  `Ledger_${selectedParty.name}`,
                  partyBills.map((b) => ({
                    Date: b.date,
                    Type: b.txnType,
                    BillNo: b.billNumber,
                    Total: b.totalAmount,
                    ReceivedOrPaid: b.receivedAmount,
                    BalanceDue: b.balanceDue,
                  }))
                )
              }
              className="flex-1 py-2 rounded-xl bg-[#FBF9F1] text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 border border-slate-200"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#1B9B62]" />
              Ledger Excel
            </button>
          </div>
        </div>

        {/* Party Transactions & Photo Bills History */}
        <div className="space-y-2.5">
          <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider px-1">
            Transactions &amp; Saved Photo Bills ({partyBills.length + partyPhotos.length})
          </h3>
          {partyBills.length === 0 && partyPhotos.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center border border-slate-200/70">
              <p className="text-sm font-bold text-slate-700">No transactions yet</p>
              <p className="text-xs text-slate-500 mt-1">
                Tap Add Sale or Take Payment above to record the first entry.
              </p>
            </div>
          ) : (
            <>
              {partyBills.map((b) => (
                <div
                  key={b.id}
                  className="bg-white rounded-2xl p-3.5 border border-slate-200/70 flex items-center justify-between"
                >
                  <div>
                    <div className="font-bold text-sm text-slate-900">
                      {b.txnType} · #{b.billNumber}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {b.date} · {b.paymentMode}
                    </div>
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
                </div>
              ))}
              {partyPhotos.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onViewPhoto(p)}
                  className="w-full bg-white rounded-2xl p-3.5 border border-slate-200/70 flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={p.imageUrl}
                      alt={p.partyName}
                      className="w-10 h-10 rounded-xl object-cover"
                    />
                    <div>
                      <span className="text-xs font-bold text-[#1B9B62] flex items-center gap-1">
                        <Camera className="w-3 h-3" /> Photo Bill ({p.billType})
                      </span>
                      <div className="text-xs text-slate-500">{p.date}</div>
                    </div>
                  </div>
                  <div className="font-extrabold text-sm font-mono-num text-slate-900">
                    {p.amount > 0 ? formatINR(p.amount) : 'View'}
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-28">
      {/* Top Receivable / Payable Banner */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200/70">
          <p className="text-[11px] font-semibold text-slate-500">You will get</p>
          <p className="mt-1 text-lg font-extrabold font-mono-num text-[#1B9B62]">
            {formatINR(totals.youWillGet)}
          </p>
        </div>
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200/70">
          <p className="text-[11px] font-semibold text-slate-500">You will give</p>
          <p className="mt-1 text-lg font-extrabold font-mono-num text-rose-600">
            {formatINR(totals.youWillGive)}
          </p>
        </div>
      </div>

      {/* Customers / Suppliers Segmented Control */}
      <div className="grid grid-cols-2 gap-1 p-1 bg-white rounded-2xl border border-slate-200/80">
        <button
          onClick={() => setPartyTab('customer')}
          className={`py-2.5 text-xs font-extrabold rounded-xl transition ${
            partyTab === 'customer'
              ? 'bg-[#1B9B62] text-white shadow-sm'
              : 'text-slate-600'
          }`}
        >
          Customers ({parties.filter((p) => p.partyType === 'customer').length})
        </button>
        <button
          onClick={() => setPartyTab('supplier')}
          className={`py-2.5 text-xs font-extrabold rounded-xl transition ${
            partyTab === 'supplier'
              ? 'bg-[#6A4CFF] text-white shadow-sm'
              : 'text-slate-600'
          }`}
        >
          Suppliers ({parties.filter((p) => p.partyType === 'supplier').length})
        </button>
      </div>

      {/* Search + Add Party */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${partyTab}s by name or phone...`}
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white border border-slate-200 text-sm focus:outline-none focus:border-[#6A4CFF]"
          />
        </div>
        <button
          onClick={openNewPartyModal}
          className="px-4 py-2.5 rounded-2xl bg-[#6A4CFF] text-white text-xs font-bold flex items-center gap-1.5 shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          Add
        </button>
      </div>

      {/* Parties List */}
      {filteredParties.length === 0 ? (
        <div className="bg-white rounded-3xl p-10 text-center border border-slate-200/70">
          <div className="w-14 h-14 rounded-2xl bg-[#FBF9F1] text-slate-400 flex items-center justify-center mx-auto mb-3">
            <Users className="w-7 h-7" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">
            No {partyTab}s added yet
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Add a {partyTab} manually or record a voice bill to create one automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredParties.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedPartyId(p.id)}
              className="w-full bg-white rounded-2xl p-3.5 border border-slate-200/70 flex items-center justify-between text-left hover:border-[#6A4CFF]/40 transition"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-extrabold text-sm shrink-0 ${
                    p.partyType === 'customer'
                      ? 'bg-emerald-50 text-[#1B9B62]'
                      : 'bg-purple-50 text-[#6A4CFF]'
                  }`}
                >
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm text-slate-900 truncate">{p.name}</div>
                  <div className="text-xs text-slate-500 font-mono-num">
                    {p.phone ? `+91 ${p.phone}` : 'No phone'}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0 ml-2">
                <div
                  className={`font-extrabold text-sm font-mono-num ${
                    p.balance >= 0 ? 'text-[#1B9B62]' : 'text-rose-600'
                  }`}
                >
                  {formatINR(Math.abs(p.balance))}
                </div>
                <div className="text-[10px] font-semibold text-slate-400">
                  {p.balance === 0 ? 'Settled' : p.balance > 0 ? 'You get' : 'You give'}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Add / Edit Party Modal (+91 Phone Modal) */}
      {showAddEditModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowAddEditModal(false)}
        >
          <form
            onSubmit={handleSave}
            className="w-full max-w-md bg-white rounded-3xl p-5 space-y-3.5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-base text-slate-900">
                {editingParty ? 'Edit Party' : `Add New ${partyType === 'customer' ? 'Customer' : 'Supplier'}`}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddEditModal(false)}
                className="p-1.5 rounded-full bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(['customer', 'supplier'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPartyType(t)}
                  className={`py-2 rounded-xl text-xs font-bold capitalize border ${
                    partyType === t
                      ? 'bg-[#6A4CFF] text-white border-[#6A4CFF]'
                      : 'bg-[#FBF9F1] text-slate-700 border-slate-200'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Party Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Suresh Kirana"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FBF9F1] border border-slate-200 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Phone Number</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">
                  +91
                </span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="9876543210"
                  className="w-full pl-11 pr-3.5 py-2.5 rounded-xl bg-[#FBF9F1] border border-slate-200 text-sm font-mono-num"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">GSTIN</label>
                <input
                  type="text"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  placeholder="Optional"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Opening Balance ₹
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#FBF9F1] border border-slate-200 text-xs font-mono-num"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Shop / City address"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FBF9F1] border border-slate-200 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-3.5 rounded-2xl bg-[#1B9B62] text-white font-bold text-sm"
            >
              {saving ? 'Saving...' : 'Save Party'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
