# RPL Firestore Query List

Derived by grep from `src/lib/rpl/` and `src/app/api/rpl/`.
Generated: 2026-10-10.

## Conclusion

**All RPL Firestore queries are single-field (equality, range, or orderBy on one field) or direct document-get operations. No composite index is needed for any RPL query.**

## Queries — server-side (Admin SDK via `getAdminDb`)

| File:line | Query | Fields used | Composite index needed? |
|---|---|---|---|
| `admin/overview/route.ts:91` | `db.collection('rpl_workers').count()` | none | No |
| `admin/overview/route.ts:92` | `db.collection('rpl_assessments').where('status','==','draft').get()` | `status` (single-field equality) | No |
| `admin/overview/route.ts:93` | `db.collection('rpl_assessments').where('status','==','submitted').get()` | `status` (single-field equality) | No |
| `admin/overview/route.ts:94` | `db.collection('rpl_consistency').get()` | none | No |
| `admin/overview/route.ts:95` | `db.collection('rpl_certifications').where('signedAt','>=',firstOfMonth).get()` | `signedAt` (single-field range) | No |
| `admin/overview/route.ts:155` | `db.collection('rpl_workers').orderBy('declarationSubmittedAt','desc').limit(10).get()` | `declarationSubmittedAt` (single-field orderBy) | No |
| `admin/overview/route.ts:156` | `db.collection('rpl_assessments').orderBy('submittedAt','desc').limit(10).get()` | `submittedAt` (single-field orderBy) | No |
| `admin/overview/route.ts:157` | `db.collection('rpl_certifications').orderBy('signedAt','desc').limit(10).get()` | `signedAt` (single-field orderBy) | No |
| `assess/route.ts:45` | `db.collection('rpl_assessments').where('assessorId','==',uid).get()` | `assessorId` (single-field equality) | No |
| `assess/route.ts:46` | `db.collection('rpl_assessments').get()` | none | No |
| `assess/route.ts:151` | `db.collection('rpl_assessments').doc(id)` | document-get / write | No |
| `assess/[assessmentId]/route.ts:36` | `db.collection('rpl_assessments').doc(id)` | document-get / write | No |
| `assess/[assessmentId]/route.ts:63` | `db.collection('rpl_workers').doc(data.workerId).get()` | document-get | No |
| `alerts/route.ts` | reads `rpl_consistency` docs | document-get (via kappa-monitor) | No |
| `consistency/[packId]/route.ts` | triggers `recomputeConsistency()` | see recompute-consistency below | No |
| `evidence/route.ts:96,153` | `db.collection('rpl_assessments').doc(id)` | document-get / write | No |
| `profile/[workerId]/route.ts:48` | `db.collection('users').doc(caller.uid).get()` | document-get | No |
| `profile/[workerId]/route.ts:60` | `db.collection('rpl_assessments').where('workerId','==',workerId).get()` | `workerId` (single-field equality) | No |
| `status/[workerId]/route.ts:54` | `db.collection('rpl_workers').doc(id).get()` | document-get | No |
| `status/[workerId]/route.ts:58` | `db.collection('users').where('assessmentReferenceCode','==',param).get()` | `assessmentReferenceCode` (single-field equality) | No |
| `status/[workerId]/route.ts:127` | `db.collection('rpl_assessments').where('workerId','==',docId).get()` | `workerId` (single-field equality) | No |
| `status/[workerId]/route.ts:152` | `db.collection('rpl_certifications').doc(docId).get()` | document-get | No |
| `certify/route.ts:79` | `db.collection('rpl_assessments').where('workerId','==',workerId).get()` | `workerId` (single-field equality) | No |
| `certify/route.ts:138` | `db.collection('rpl_certifications').doc(workerId).set(...)` | document write | No |
| `declare/route.ts:167` | `db.collection('rpl_workers').doc(uid)` | document write | No |
| `forge/route.ts:210` | `db.collection('rpl_assessments').doc(templateId)` | document-get | No |
| `match/route.ts` | reads `rpl_ns qf_packs` / keyword index in-memory | no Firestore query | No |
| `assess/my-consistency/route.ts:76` | `db.collection('rpl_assessments').where('assessorId','==',target).get()` | `assessorId` (single-field equality) | No |
| `assess/my-consistency/route.ts:94` | `db.collection('rpl_consistency').doc(packId).get()` | document-get | No |
| `assess/my-consistency/route.ts:126` | `db.collection('rpl_assessments').where('packId','==',packId).get()` | `packId` (single-field equality) | No |

## Queries — shared library (`src/lib/rpl`)

| File:line | Query | Fields used | Composite index needed? |
|---|---|---|---|
| `recompute-consistency.ts:60` | `db.collection('rpl_assessments').where('packId','==',packId).get()` | `packId` (single-field equality) | No |
| `recompute-consistency.ts:78` | `db.collection('rpl_assessments').doc(d.id).collection('items').get()` | subcollection, no filter | No |
| `recompute-consistency.ts:228` | `db.collection('rpl_consistency').doc(packId).get()` | document-get | No |
| `recompute-consistency.ts:262` | `db.collection('rpl_consistency').doc(packId).set(...)` | document write | No |
| `kappa-monitor.ts:34` | `db.collection('rpl_consistency').doc(packId).get()` | document-get | No |

## Client-side (Firestore client SDK)

No RPL page under `src/app/(rpl)/` uses the Firestore client SDK directly. All data flows through the `/api/rpl/*` routes above.

## Why no composite index is needed

Firestore auto-indexes every single field. A composite index is only required when a query combines:
- multiple equality filters (e.g. `where('a','==',x).where('b','==',y)`),
- an equality filter plus an orderBy on a different field,
- or a range/orderBy on a field that is not the first index field.

Every RPL query listed above uses **at most one** filter field and **no** compound ordering, so the single-field automatic index is sufficient.
