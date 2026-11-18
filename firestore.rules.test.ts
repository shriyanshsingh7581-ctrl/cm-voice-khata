/**
 * Firestore Security Rules Test Specification (Dirty Dozen Verification)
 */
export interface DirtyDozenTestCase {
  id: number;
  name: string;
  authUid: string | null;
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const dirtyDozenTests: DirtyDozenTestCase[] = [
  {
    id: 1,
    name: 'Cross-Tenant Read/Write',
    authUid: 'uid_A',
    path: '/users/uid_B/bills/bill_1',
    operation: 'get',
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Identity Spoofing on Create',
    authUid: 'uid_A',
    path: '/users/uid_A/parties/party_1',
    operation: 'create',
    payload: { ownerId: 'uid_B', name: 'Ramesh', partyType: 'customer', balance: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Owner Mutation on Update',
    authUid: 'uid_A',
    path: '/users/uid_A/parties/party_1',
    operation: 'update',
    payload: { ownerId: 'uid_B', name: 'Ramesh', partyType: 'customer', balance: 100, createdAt: '2026-01-01', updatedAt: '2026-01-02' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Shadow/Ghost Field Injection',
    authUid: 'uid_A',
    path: '/users/uid_A/items/item_1',
    operation: 'create',
    payload: { ownerId: 'uid_A', name: 'Sugar', unit: 'kg', salePrice: 45, purchasePrice: 40, stockQty: 100, createdAt: '2026-01-01', updatedAt: '2026-01-01', isVerified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Oversized String DoS',
    authUid: 'uid_A',
    path: '/users/uid_A/parties/party_1',
    operation: 'create',
    payload: { ownerId: 'uid_A', name: 'A'.repeat(500), partyType: 'customer', balance: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'ID Poisoning',
    authUid: 'uid_A',
    path: `/users/uid_A/parties/${'x'.repeat(200)}`,
    operation: 'create',
    payload: { ownerId: 'uid_A', name: 'Valid', partyType: 'customer', balance: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Unauthenticated Access',
    authUid: null,
    path: '/users/uid_A/items/item_1',
    operation: 'get',
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Type Confusion on Bill Amount',
    authUid: 'uid_A',
    path: '/users/uid_A/bills/bill_1',
    operation: 'create',
    payload: { ownerId: 'uid_A', billNumber: 'INV-1', txnType: 'Sale', partyName: 'Raju', totalAmount: '1000', receivedAmount: 0, balanceDue: 1000, paymentMode: 'Cash', date: '2026-01-01', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Immutable Timestamp Tampering',
    authUid: 'uid_A',
    path: '/users/uid_A/items/item_1',
    operation: 'update',
    payload: { ownerId: 'uid_A', name: 'Sugar', unit: 'kg', salePrice: 45, purchasePrice: 40, stockQty: 90, createdAt: '2099-01-01', updatedAt: '2026-01-02' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Invalid Enum Value on Party',
    authUid: 'uid_A',
    path: '/users/uid_A/parties/party_1',
    operation: 'create',
    payload: { ownerId: 'uid_A', name: 'Ramesh', partyType: 'admin', balance: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Missing Required Field on SavedBillPhoto',
    authUid: 'uid_A',
    path: '/users/uid_A/savedBillPhotos/photo_1',
    operation: 'create',
    payload: { ownerId: 'uid_A', billType: 'Sale', amount: 500, date: '2026-01-01', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Blanket Cross-User List Query',
    authUid: 'uid_A',
    path: '/users/uid_B/savedBillPhotos',
    operation: 'list',
    expectedResult: 'PERMISSION_DENIED',
  },
];
