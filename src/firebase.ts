import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  OperationType,
  BusinessProfile,
  ShopSettings,
  Party,
  Bill,
  SavedBillPhoto,
  CatalogItem,
  APP_OFFICIAL_NAME,
} from './types';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Mandatory startup connection check
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

// Blueprint volumetric truncation & ID guard helpers
export const ID_REGEX = /^[a-zA-Z0-9_-]+$/;

export function sanitizeId(raw?: string): string {
  const base = (raw || `id_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 120);
  return ID_REGEX.test(base) ? base : `id_${Date.now()}`;
}

export function trunc(str: string | undefined | null, maxLen: number): string {
  return String(str ?? '').trim().slice(0, maxLen);
}

export function getDefaultBusinessProfile(uid: string, email = ''): BusinessProfile {
  return {
    ownerId: uid,
    businessName: APP_OFFICIAL_NAME,
    industry: 'Retail & General Store',
    gstin: '',
    phone1: '',
    phone2: '',
    email: trunc(email, 120),
    address: '',
    state: 'Madhya Pradesh',
    businessType: 'Retailer / Shop',
    booksBeginningDate: new Date().toISOString().slice(0, 10),
    logoUrl: '',
    signatureUrl: '',
    updatedAt: new Date().toISOString(),
  };
}

export function getDefaultShopSettings(uid: string): ShopSettings {
  return {
    ownerId: uid,
    askWhichCustomer: true,
    roundOffBillTotal: true,
    whatsappBillToCustomer: true,
    saveNewItemsToCatalog: true,
    pricesIncludeGst: true,
    defaultInvoiceDesign: 'Modern A4',
    billLanguage: 'English',
    bluetoothPrinter: false,
    showPhoneOnInvoice: true,
    showPartyBalanceOnBills: true,
    showPaidStampOnBills: true,
    showBranding: true,
    nextInvoiceNumber: 1,
    updatedAt: new Date().toISOString(),
  };
}

// Firestore CRUD wrappers adhering strictly to firebase-blueprint.json & firestore.rules
export async function saveBusinessProfile(uid: string, profile: BusinessProfile) {
  const path = `users/${uid}/businessProfile/main`;
  const payload: BusinessProfile = {
    ownerId: uid,
    businessName: trunc(profile.businessName || APP_OFFICIAL_NAME, 120),
    industry: trunc(profile.industry, 80),
    gstin: trunc(profile.gstin, 30),
    phone1: trunc(profile.phone1, 25),
    phone2: trunc(profile.phone2, 25),
    email: trunc(profile.email, 120),
    address: trunc(profile.address, 300),
    state: trunc(profile.state, 60),
    businessType: trunc(profile.businessType, 60),
    booksBeginningDate: trunc(profile.booksBeginningDate, 40),
    logoUrl: trunc(profile.logoUrl, 500),
    signatureUrl: trunc(profile.signatureUrl, 2000),
    updatedAt: new Date().toISOString().slice(0, 40),
  };
  try {
    await setDoc(doc(db, 'users', uid, 'businessProfile', 'main'), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function saveShopSettings(uid: string, settings: ShopSettings) {
  const path = `users/${uid}/shopSettings/main`;
  const payload: ShopSettings = {
    ownerId: uid,
    askWhichCustomer: Boolean(settings.askWhichCustomer),
    roundOffBillTotal: Boolean(settings.roundOffBillTotal),
    whatsappBillToCustomer: Boolean(settings.whatsappBillToCustomer),
    saveNewItemsToCatalog: Boolean(settings.saveNewItemsToCatalog),
    pricesIncludeGst: Boolean(settings.pricesIncludeGst),
    defaultInvoiceDesign: settings.defaultInvoiceDesign || 'Modern A4',
    billLanguage: settings.billLanguage || 'English',
    bluetoothPrinter: Boolean(settings.bluetoothPrinter),
    showPhoneOnInvoice: Boolean(settings.showPhoneOnInvoice),
    showPartyBalanceOnBills: Boolean(settings.showPartyBalanceOnBills),
    showPaidStampOnBills: Boolean(settings.showPaidStampOnBills),
    showBranding: Boolean(settings.showBranding),
    nextInvoiceNumber: Number(settings.nextInvoiceNumber) || 1,
    updatedAt: new Date().toISOString().slice(0, 40),
  };
  try {
    await setDoc(doc(db, 'users', uid, 'shopSettings', 'main'), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function upsertParty(uid: string, party: Omit<Party, 'id'> & { id?: string }) {
  const partyId = sanitizeId(party.id);
  const path = `users/${uid}/parties/${partyId}`;
  const now = new Date().toISOString().slice(0, 40);
  const payload = {
    ownerId: uid,
    name: trunc(party.name || 'Customer', 120),
    phone: trunc(party.phone, 25),
    partyType: party.partyType === 'supplier' ? 'supplier' : 'customer',
    gstin: trunc(party.gstin, 30),
    address: trunc(party.address, 300),
    balance: Number(party.balance) || 0,
    createdAt: trunc(party.createdAt || now, 40),
    updatedAt: now,
  };
  try {
    await setDoc(doc(db, 'users', uid, 'parties', partyId), payload);
    return { ...payload, id: partyId } as Party;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function removeParty(uid: string, partyId: string) {
  const path = `users/${uid}/parties/${partyId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'parties', partyId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function upsertBill(uid: string, bill: Omit<Bill, 'id'> & { id?: string }) {
  const billId = sanitizeId(bill.id);
  const path = `users/${uid}/bills/${billId}`;
  const now = new Date().toISOString().slice(0, 40);
  const payload = {
    ownerId: uid,
    billNumber: trunc(bill.billNumber || 'INV-1', 40),
    supplierBillNo: trunc(bill.supplierBillNo, 60),
    txnType: trunc(bill.txnType || 'Sale', 40),
    partyId: trunc(bill.partyId, 128),
    partyName: trunc(bill.partyName || 'Cash Customer', 120),
    phone: trunc(bill.phone, 25),
    gstin: trunc(bill.gstin, 30),
    itemsSummary: trunc(JSON.stringify(bill.items || []), 4000),
    subtotal: Number(bill.subtotal) || 0,
    discount: Number(bill.discount) || 0,
    deliveryCharge: Number(bill.deliveryCharge) || 0,
    gstPercent: Number(bill.gstPercent) || 0,
    gstAmount: Number(bill.gstAmount) || 0,
    totalAmount: Number(bill.totalAmount) || 0,
    receivedAmount: Number(bill.receivedAmount) || 0,
    balanceDue: Number(bill.balanceDue) || 0,
    paymentMode: trunc(bill.paymentMode || 'Cash', 30),
    category: trunc(bill.category || 'General', 80),
    note: trunc(bill.note, 500),
    terms: trunc(bill.terms, 500),
    attachmentUrl: trunc(bill.attachmentUrl, 500),
    date: trunc(bill.date || now.slice(0, 10), 40),
    createdAt: trunc(bill.createdAt || now, 40),
    updatedAt: now,
  };
  try {
    await setDoc(doc(db, 'users', uid, 'bills', billId), payload);
    return { ...payload, id: billId, items: bill.items || [] } as Bill;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function removeBill(uid: string, billId: string) {
  const path = `users/${uid}/bills/${billId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'bills', billId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function upsertSavedBillPhoto(
  uid: string,
  photo: Omit<SavedBillPhoto, 'id'> & { id?: string }
) {
  const photoId = sanitizeId(photo.id);
  const path = `users/${uid}/savedBillPhotos/${photoId}`;
  const now = new Date().toISOString().slice(0, 40);
  const payload = {
    ownerId: uid,
    imageUrl: trunc(photo.imageUrl, 500),
    partyId: trunc(photo.partyId, 128),
    partyName: trunc(photo.partyName || 'Walk-in Party', 120),
    billType:
      photo.billType === 'Purchase' || photo.billType === 'Expense' ? photo.billType : 'Sale',
    amount: Number(photo.amount) || 0,
    date: trunc(photo.date || now.slice(0, 10), 40),
    note: trunc(photo.note, 500),
    createdAt: trunc(photo.createdAt || now, 40),
    updatedAt: now,
  };
  try {
    await setDoc(doc(db, 'users', uid, 'savedBillPhotos', photoId), payload);
    return { ...payload, id: photoId } as SavedBillPhoto;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function removeSavedBillPhoto(uid: string, photoId: string) {
  const path = `users/${uid}/savedBillPhotos/${photoId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'savedBillPhotos', photoId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function upsertCatalogItem(
  uid: string,
  item: Omit<CatalogItem, 'id'> & { id?: string }
) {
  const itemId = sanitizeId(item.id);
  const path = `users/${uid}/items/${itemId}`;
  const now = new Date().toISOString().slice(0, 40);
  const payload = {
    ownerId: uid,
    name: trunc(item.name || 'Product', 120),
    unit: trunc(item.unit || 'pcs', 30),
    salePrice: Number(item.salePrice) || 0,
    purchasePrice: Number(item.purchasePrice) || 0,
    stockQty: Number(item.stockQty) || 0,
    barcode: trunc(item.barcode, 80),
    hsn: trunc(item.hsn, 30),
    gstPercent: Number(item.gstPercent) || 0,
    createdAt: trunc(item.createdAt || now, 40),
    updatedAt: now,
  };
  try {
    await setDoc(doc(db, 'users', uid, 'items', itemId), payload);
    return { ...payload, id: itemId } as CatalogItem;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function removeCatalogItem(uid: string, itemId: string) {
  const path = `users/${uid}/items/${itemId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'items', itemId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  doc,
  collection,
  onSnapshot,
  query,
  where,
  updateDoc,
};
