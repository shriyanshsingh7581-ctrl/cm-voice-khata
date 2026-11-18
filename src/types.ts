export const CM_LOGO_PATH = '/assets/aistudio/file_0000000017c88211a5067c9ce61a64c7_5767da52.png';
export const APP_OFFICIAL_NAME = 'CM Voice Khata';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export type TransactionType =
  | 'Sale'
  | 'Payment In'
  | 'Sale Return'
  | 'Delivery Challan'
  | 'Estimate'
  | 'Sale Order'
  | 'Purchase Invoice'
  | 'Payment Out'
  | 'Purchase Return'
  | 'Purchase Order'
  | 'Expense';

export const ALL_TRANSACTION_TYPES: {
  category: 'SALES' | 'PURCHASE' | 'OTHER';
  type: TransactionType;
  label: string;
  hindiHint: string;
  badgeColor: string;
}[] = [
  { category: 'SALES', type: 'Sale', label: 'Sale', hindiHint: 'बिक्री बिल', badgeColor: '#1B9B62' },
  { category: 'SALES', type: 'Payment In', label: 'Payment In', hindiHint: 'पेमेंट आया', badgeColor: '#1B9B62' },
  { category: 'SALES', type: 'Sale Return', label: 'Sale Return', hindiHint: 'बिक्री वापसी', badgeColor: '#E11D48' },
  { category: 'SALES', type: 'Delivery Challan', label: 'Delivery Challan', hindiHint: 'डिलीवरी चालान', badgeColor: '#6A4CFF' },
  { category: 'SALES', type: 'Estimate', label: 'Estimate', hindiHint: 'कच्चा बिल / कोटेशन', badgeColor: '#D97706' },
  { category: 'SALES', type: 'Sale Order', label: 'Sale Order', hindiHint: 'बिक्री ऑर्डर', badgeColor: '#2563EB' },
  { category: 'PURCHASE', type: 'Purchase Invoice', label: 'Purchase Invoice', hindiHint: 'खरीद बिल', badgeColor: '#7C3AED' },
  { category: 'PURCHASE', type: 'Payment Out', label: 'Payment Out', hindiHint: 'पेमेंट दिया', badgeColor: '#EA580C' },
  { category: 'PURCHASE', type: 'Purchase Return', label: 'Purchase Return', hindiHint: 'खरीद वापसी', badgeColor: '#BE123C' },
  { category: 'PURCHASE', type: 'Purchase Order', label: 'Purchase Order', hindiHint: 'खरीद ऑर्डर', badgeColor: '#0284C7' },
  { category: 'OTHER', type: 'Expense', label: 'Expense', hindiHint: 'दुकान खर्च', badgeColor: '#DC2626' },
];

export interface LineItem {
  id: string;
  itemId?: string;
  name: string;
  qty: number;
  unit: string;
  rate: number;
  gstPercent?: number;
  total: number;
}

export interface BusinessProfile {
  ownerId: string;
  businessName: string;
  industry: string;
  gstin: string;
  phone1: string;
  phone2: string;
  email: string;
  address: string;
  state: string;
  businessType: string;
  booksBeginningDate: string;
  logoUrl: string;
  signatureUrl: string;
  updatedAt: string;
}

export interface ShopSettings {
  ownerId: string;
  askWhichCustomer: boolean;
  roundOffBillTotal: boolean;
  whatsappBillToCustomer: boolean;
  saveNewItemsToCatalog: boolean;
  pricesIncludeGst: boolean;
  defaultInvoiceDesign: 'Modern A4' | 'Thermal 80mm' | 'Classic GST';
  billLanguage: 'English' | 'Hinglish' | 'Hindi (हिंदी)';
  bluetoothPrinter: boolean;
  showPhoneOnInvoice: boolean;
  showPartyBalanceOnBills: boolean;
  showPaidStampOnBills: boolean;
  showBranding: boolean;
  nextInvoiceNumber: number;
  updatedAt: string;
}

export interface Party {
  id: string;
  ownerId: string;
  name: string;
  phone: string;
  partyType: 'customer' | 'supplier';
  gstin: string;
  address: string;
  /**
   * Positive balance = You will get (आपको मिलेंगे)
   * Negative balance = You will give (आपको देने हैं)
   */
  balance: number;
  createdAt: string;
  updatedAt: string;
}

export interface Bill {
  id: string;
  ownerId: string;
  billNumber: string;
  supplierBillNo: string;
  txnType: TransactionType;
  partyId: string;
  partyName: string;
  phone: string;
  gstin: string;
  items: LineItem[];
  itemsSummary: string;
  subtotal: number;
  discount: number;
  deliveryCharge: number;
  gstPercent: number;
  gstAmount: number;
  totalAmount: number;
  receivedAmount: number;
  balanceDue: number;
  paymentMode: 'Cash' | 'Online' | 'Credit';
  category: string;
  note: string;
  terms: string;
  attachmentUrl: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavedBillPhoto {
  id: string;
  ownerId: string;
  imageUrl: string;
  partyId: string;
  partyName: string;
  billType: 'Sale' | 'Purchase' | 'Expense';
  amount: number;
  date: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogItem {
  id: string;
  ownerId: string;
  name: string;
  unit: string;
  salePrice: number;
  purchasePrice: number;
  stockQty: number;
  barcode: string;
  hsn: string;
  gstPercent: number;
  createdAt: string;
  updatedAt: string;
}

export interface VoiceParsedBillPayload {
  partyName?: string;
  phone?: string;
  gstin?: string;
  supplierBillNo?: string;
  txnType?: TransactionType;
  items?: Array<{
    name: string;
    qty: number;
    unit: string;
    rate: number;
    total: number;
  }>;
  discount?: number;
  deliveryCharge?: number;
  gst?: number;
  totalAmount?: number;
  receivedAmount?: number;
  balanceDue?: number;
  paymentType?: 'Cash' | 'Online' | 'Credit';
  note?: string;
  category?: string;
}
