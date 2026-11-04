# Free shopping receipt scanner — 4 November 2026

## Architecture and implementation

Source: `SpaceCowboy93/SeMa`, based on `preview/supabase-v2-isolated` at `ba70ea8`. `main` contains only the isolated-preview placeholder. This change does not target `SpaceCowboy93/sema-calendar` or Production.

- Replaces the mock receipt scanner with lazy-loaded Tesseract.js 6.0.1. The pinned English model, WASM cores and worker are copied from dependencies into same-origin `/receipt-ocr` assets before dev/build. No paid APIs, external OCR service or image uploads.
- Camera capture and gallery upload, up to four non-overlapping photos of one receipt. Images are resized sequentially to a maximum 2200px edge to limit memory. Decode errors, unsupported images, progress, cancellation, timeout and manual entry are handled.
- Conservative text parsing for Lidl, Aldi, Tesco, Dunnes Stores, SuperValu, Centra, Spar and unknown merchants. Handles day-first dates, comma/dot decimals, quantity lines, weighted quantities, discounts and printed totals. Parsing does not establish perfect merchant-format coverage; all fields require review.
- Editable shop, date, products, quantity, unit price, line total and final EUR total. Missing dates/totals are not invented. Irish VAT is treated as included; item-sum differences are shown. Final confirmed total is the Finance amount.
- One Zustand action creates a completed Shopping list (history), purchased items, receipt details and the linked Shopping finance item in the purchase month. Existing `shoppingLists` and `financeMonths` remain the synchronized collections in the existing Supabase V2 `couple_state` architecture. No migrations or live data writes were performed.
- SHA-256 fingerprints of normalized reviewed shop/date/total/items provide deterministic purchase/finance IDs. Repeat confirmations and identical reviewed receipt imports are rejected. Concurrent same-receipt imports retain one linked entry through existing conflict review. Receipts and their Finance month are grouped for conflict resolution; independently added receipt contributions merge without losing equal-price spending.
- Fingerprints are not a universal receipt identity: a new scan with materially different OCR/corrections can appear different; two genuinely separate identical baskets at the same shop on the same day can appear identical. Review history before saving uncertain rescans.
- Photos are available for review only and are not retained or synchronized. Existing stored photos/data are untouched.
- Reuses C2Sheet with an opt-in visual viewport adjustment for receipt forms, 16px inputs and safe-area footer. Unrelated sheets retain their existing behavior.
- Retires the old mock API with HTTP 410, avoiding fabricated purchases from stale clients.

## Verification

- TypeScript, ESLint and optimized Next.js build checked. ESLint has existing image/component warnings outside the new receipt implementation.
- Full Vitest suite: 1,136 tests across 70 files. Receipt coverage: 23 tests (parser 10, purchase/sync 7, review 3, scanner error/cancel 3).
- Tests cover merchant labels, quantities, weighted goods, discounts, date validation, tax handling, confirmed total versus item sum, invalid input, duplicate saves after hydration, missing Shopping category, preservation of existing spending, deleting a linked purchase, simultaneous receipt imports, error recovery and double-submit prevention.
- Actual Tesseract engine test (Node worker using the pinned local English model) read a synthetic Lidl image: shop, date, Milk €2.00, Bread €3.00, total €5.00, confidence 95. This is not a browser or real supermarket receipt accuracy test.
- Added `playwright.receipts.config.ts` and `tests/e2e/receipt-scanner.spec.ts` for a complete OCR → correction → save → reload → finance linkage → duplicate rejection flow on Android Chromium and iPhone WebKit. Tests use isolated dev fixtures and never authenticate or write shared live data.
- Browser execution blocked by the environment: Chromium aborts on a prohibited socket operation; WebKit's downloaded runtime lacks system libraries and installing them requires unavailable privileges. No browser pass is claimed.

## Deployment status

Vercel team: `mateo-s-projects123` (`team_IaAKmshtFLyokMGFvqm2oeAP`). The dedicated `sema-calendar-v2-preview` project is absent. The available connection can read the production-associated `sema-calendar` project but returns 403 when asked to create the dedicated V2 preview project. CLI fallback has no credentials. No Preview URL was created, and no Production deployment/settings were changed.

To finish deployment, grant the connection access to create the dedicated V2 preview project or create it in that team and make it accessible. Configure only its Preview environment with the V2 endpoint `https://wwxdinkdjkjiqzynfbdk.supabase.co` and that project's public client key. Deploy the reviewed preview branch with target Preview. Do not use Production database secrets or domains.

## Still needs verification

1. Run the browser suite in a browser-capable environment: `npx playwright test --config playwright.receipts.config.ts` (optional `CHROMIUM_EXECUTABLE_PATH` for a locally installed Chromium).
2. Test actual Lidl, Aldi, Tesco and Dunnes photos, especially multi-buy promotions, deposit returns, faded text, split photos and long receipts.
3. Physical iPhone Safari/Home Screen PWA and Android: camera permission/cancel, orientation, image formats, keyboard scrolling, background/resume and slow first-load OCR.
4. After Preview deployment, use both authorized profiles to verify confirm → partner update → reload, offline recovery and simultaneous saves. Automated tests verify the existing merge/serialization path, not live Supabase delivery.
5. Confirm duplicate-rescan behavior using the same photo and separate photos of the same paper receipt.
