<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Goal
- Build a Walrus-native decentralized feedback/form platform for the Sui ecosystem as part of the Walrus Sessions Round 2 bounty.

## Constraints & Preferences
- Absolutely NO localStorage as primary storage; Walrus is the only data source of truth.
- Submissions stored on Walrus, organized per form via a shared manifest blob.
- No backend/server; fully client-side, Walrus-native.
- No wallet popup for submitters (silent Walrus upload only).
- Wallet gating for admin dashboard was removed due to address-matching bugs; now shows all forms.
- Sonner toasts replace all browser alert() calls.
- Bounty requires: Walrus-native storage, Seal encryption for private fields, admin dashboard with CSV export.

## Progress
### Done
- Fixed Walrus API endpoints from deprecated `/v1/store` to `/v1/blobs`.
- Fixed Walrus publisher response parsing (`newlyCreated.blobObject.blobId`).
- Removed all localStorage blob fallback; `uploadToWalrus` and `uploadMediaToWalrus` throw on failure.
- Moved Sui provider from devnet to testnet (contract published at `0x5e72b715b3f1ab0295d9a6d379f16a06117cf2210c2a0038081af3b216f3242c`).
- Deployed 1 SUI testnet gas to both deployer (`0xf467672287ebe971c118177380e4b2456f75c165e8375af3b5f0d1ea7c1bfd70`) and dApp wallet (`0x05a4f948eb87fff20b6bf732180226120b234c41b3b6583dec53491aca512fd4`).
- Added `manifestBlobId` to FormSchema and `ManifestEntry` type.
- FormBuilder now uploads an empty manifest blob alongside the schema blob on creation.
- `handleSubmit` implemented manifest-based submission with read-after-write verification loop (retries on race condition).
- Share URL includes `?form=<id>&blob=<schemaBlobId>&manifest=<manifestBlobId>`.
- Share screen shown after form creation (copy link, admin dashboard, back home buttons).
- Replaced `alert()` with `sonner` toasts in FormBuilder, added `<Toaster>` to layout.
- Wallet rejection no longer navigates to player; saves locally via `onStored` callback.
- Admin dashboard: removed wallet-gating; shows all forms and their submissions.
- AdminDashboard rewritten to load manifest from Walrus on form selection via `downloadFromWalrus`, merge with localStorage admin metadata keyed by `responseBlobId`, and download individual response blobs on entry click.
- CSV export now generated inline from manifest entries instead of using `exportSubmissionsCsv`.
- Notes textarea persists directly via `updateStoredSubmission` bypassing parent prop.
- **CRITICAL FIX**: Schema blob must include `manifestBlobId` — FormBuilder now uploads empty manifest FIRST, then uploads schema WITH `manifestBlobId` embedded. Without this, anyone opening a share URL fresh (not cached) would get a schema without `manifestBlobId`, causing silent submission failures.
- **CRITICAL FIX**: `handleSubmit` now receives `formSchema` directly via threaded prop from FormPlayer (`onSubmit(responses, schema)`) instead of relying on closure/localsStorage lookups. Three-way defense: direct prop → localStorage → closure fallback.
- **FIX**: `updateStoredSubmission` matches by `responseBlobId` OR `id` so AdminDashboard status/notes work.
- **FIX**: `blobId` → `schemaBlobId` (undefined variable bug in Sui transaction builder).
- **FIX**: `downloadFromWalrus` has 3 retries with 1s/2s/3s backoff for transient network/CORS issues.
- **FIX**: Error state UI when Walrus download fails — shows message + "Back to Home" button.

### In Progress
- (none)

### Blocked
- Walrus testnet aggregator/publisher sometimes unreachable from browser (`Failed to fetch`) even though curl works fine. CORS headers (`access-control-allow-origin: *`) are correct. Cloudflare may intermittently block browser requests. Retry loop helps but may not fully resolve.
- Manifest race condition: verified read-after-write, but if two concurrent submissions happen at the exact same millisecond, one may be lost. Acceptable for low-concurrency feedback tool.

## Key Decisions
- **Manifest blob over on-chain** for submission tracking: no wallet/gas friction for submitters. Trade-off: occasional race loss under concurrent submission.
- **Retry loop with read-after-write verification**: downloads manifest → appends → uploads → reads back to confirm. Retries with latest manifest if entry not found.
- **No ad-hoc Sui contract calls on submission**: keep submitter experience frictionless (no wallet popup, no gas).
- **localStorage only for admin metadata** (status, notes, priority) and form cache — never for blob storage.
- **Admin shows all forms** without wallet gating to avoid address-matching bugs; ownership displayed via `creator` field in sidebar.
- **AdminDashboard uses `responseBlobId` as primary key**: manifest entries merged with localStorage metadata by `responseBlobId` instead of submission UUID.
- **Schema blob on Walrus MUST include `manifestBlobId`**: old forms created before this fix need to be re-created, as the old schema blobs don't contain the manifest reference.

## Critical Context
- Walrus publisher: `PUT https://publisher.walrus-testnet.walrus.space/v1/blobs?epochs=N` (do NOT use `/v1/store`)
- Walrus aggregator: `GET https://aggregator.walrus-testnet.walrus.space/v1/blobs/{blobId}`
- Sui contract on testnet: `0x5e72b715b3f1ab0295d9a6d379f16a06117cf2210c2a0038081af3b216f3242c`
- dApp wallet (user): `0x05a4f948eb87fff20b6bf732180226120b234c41b3b6583dec53491aca512fd4`
- CLI deployer wallet: `0xf467672287ebe971c118177380e4b2456f75c165e8375af3b5f0d1ea7c1bfd70`
- `uploadToWalrus` now throws on failure (no local fallback). Submission fails visibly if Walrus is down.
- Manifest is JSON array of `ManifestEntry[]`. After each submit, `manifestBlobId` on the form is updated via `updateStoredForm`.
- `handleSubmit` in page.tsx is the only place manifest manipulation happens.
- FormPlayer catches errors from `handleSubmit` and shows "Submission failed. Try again." to the user.
- New AdminDashboard decrypts Seal-encrypted fields via `decryptWithSeal` when loading response blobs.
- `handleSubmit` receives `formSchema` as 2nd param from FormPlayer — always use this instead of closure `activeForm`.
- Share URL format: `?form=<id>&blob=<schemaBlobId>&manifest=<manifestBlobId>` — all 3 params needed for a new viewer to submit.

## Relevant Files
- `src/lib/walrus.ts`: Walrus upload/download, no local fallback, throws on failure. `downloadFromWalrus` has 3 retries with backoff.
- `src/types/form.ts`: `FormSchema`, `ManifestEntry`, `FormSubmission` types.
- `src/lib/storage.ts`: localStorage cache for forms and submission admin metadata.
- `src/components/FormBuilder/FormBuilder.tsx`: Form creation — manifest uploaded FIRST, then schema WITH `manifestBlobId` embedded.
- `src/app/page.tsx`: `handleSubmit` receives `formSchema` directly (2nd param), manifest loop, URL loading with error state.
- `src/components/AdminDashboard/AdminDashboard.tsx`: Reads manifest from Walrus, decrypts Seal fields, inline CSV export.
- `src/components/FormPlayer/FormPlayer.tsx`: `onSubmit` passes `schema` as 2nd argument.
- `src/app/providers.tsx`: Sui client configured to testnet.
- `.env.local`: `NEXT_PUBLIC_PACKAGE_ID`, Walrus publisher/aggregator URLs.
- `walrus_forms/sources/walrus_forms.move`: Move contract (create_form, submit_response, FormAdminCap).
