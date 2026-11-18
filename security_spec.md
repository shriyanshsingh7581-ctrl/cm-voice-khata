# Security Specification (Phase 0 TDD) — CM Voice Khata

## 1. Data Invariants
1. **Strict Tenant Isolation**: Every document under `/users/{uid}/...` MUST only be readable, listable, creatable, updatable, or deletable when `request.auth != null && request.auth.uid == uid`.
2. **Owner Integrity**: Every document written under `/users/{uid}/...` MUST contain `ownerId == request.auth.uid` and `ownerId == uid`, and `ownerId` is immutable on update.
3. **Path Variable Hardening**: All path IDs (`uid`, `docId`, `partyId`, `billId`, `photoId`, `itemId`) on single-document operations must match `^[a-zA-Z0-9_\-]+$` and have `.size() <= 128`.
4. **Strict Keys & Volumetric Bounds**: All string fields enforce explicit `.size()` maximums and all create/update operations validate exact allowed keys via `hasAll` and `hasOnly`.

## 2. The "Dirty Dozen" Payloads
1. **Cross-Tenant Read/Write**: User `uid_A` attempts to read or write `/users/uid_B/bills/bill_1`.
2. **Identity Spoofing on Create**: User `uid_A` creates `/users/uid_A/parties/party_1` with `ownerId: "uid_B"`.
3. **Owner Mutation on Update**: User `uid_A` updates `/users/uid_A/parties/party_1` changing `ownerId` to `"uid_B"`.
4. **Shadow/Ghost Field Injection**: User `uid_A` creates a bill with extra unauthorized field `"isAdmin": true`.
5. **Oversized String DoS**: User `uid_A` injects a 10,000-char string into `partyName` (exceeds maxLength 120).
6. **ID Poisoning**: User `uid_A` uses a path ID with spaces or special chars or > 128 chars.
7. **Unauthenticated Access**: Null `request.auth` attempts to list `/users/uid_A/items`.
8. **Type Confusion**: User `uid_A` passes a string `"1000"` instead of a `number` for `totalAmount` in `bills`.
9. **Immutable Timestamp Tampering**: User `uid_A` modifies `createdAt` during an update on `parties`, `bills`, `savedBillPhotos`, or `items`.
10. **Invalid Enum Value**: User `uid_A` sets `partyType: "hacker"` on a Party document (must be `"customer"` or `"supplier"`).
11. **Missing Required Fields**: User `uid_A` creates a `SavedBillPhoto` omitting `imageUrl`.
12. **Blanket Collection Query**: User `uid_A` attempts `list` on `/users/uid_B/savedBillPhotos` where `resource.data.ownerId != request.auth.uid`.
