# Receipt engine switch — 9 November 2026

## Starting status

- Repository `SpaceCowboy93/SeMa`, branch `preview/supabase-v2-isolated`, starting commit `3d923bfb6c381f25eb0406a16934fb702063ddce`.
- Source uses real Tesseract.js 6.0.1 on the device, not Gemini. The old scan route returned 410.
- GitHub's [mobile workflow on the starting commit](https://github.com/SpaceCowboy93/SeMa/actions/runs/42376647856) passed Android Chromium, iPhone WebKit and an optimized build. It did not run the full unit suite or standalone TypeScript/ESLint jobs.
- Vercel CLI verified a READY **Preview** deployment `dpl_G8d4JfzgRfnzFi13i82eJKMYSgSm`, serving exactly that commit. The connected Vercel plugin returned 404/403, but the CLI's existing credentials can access the dedicated project.
- Phone URL: https://sema-calendar-v2-preview-git-preview-217442-mateo-s-projects123.vercel.app/shopping . A green GitHub deployment check alone does not verify the currently served commit or an authenticated phone session.
- The IDE's outer `sema-calendar` checkout on `fix/iphone-pwa` is a different repository. Its uncommitted edits and old quantity-input evidence were left untouched. Work was done in an isolated clone.

## Behavior

- Every scanner opening defaults to **On-device · Tesseract**. **Cloud · Gemini** must be selected explicitly, followed by **Scan with Gemini**. Selection and photo preparation make no cloud request.
- The disclosure says selected photos go to Google when Scan is tapped, and explains free-tier product-improvement use. Tesseract keeps photos on-device.
- Both engines feed the same row parser, overlap assembler, source highlighting, missing-row review, financial reconciliation and existing save action. The save action, Shopping/Finance linkage, fingerprints and partner-sync merge logic are unchanged.
- Gemini transcribes physical rows separately for every photo. It is instructed to retain overlaps and repeated rows, never calculate a missing price from a total, and never invent a product name or price. Raw output, row ordering, photo count, coordinates and text lengths are validated before use.
- Local ink-band detection runs independently of Gemini text or the receipt total. Unread bands are flagged even if the money balances. Products without a single matching visible row are marked unverified and require review. Matching geometry is evidence of a row location, not a guarantee that a model transcribed every character correctly; all fields remain editable and reviewable.
- Retry opens the same in-memory photos while the review component retains its edited draft. Successful retry results become a candidate. **Keep my reviewed details** discards it; **Replace reviewed details with this scan** explicitly replaces details and resets acknowledgements. Failure, cancellation and engine selection do not save or create a purchase.
- Photos, scan evidence and timing remain transient. Only existing confirmed receipt details are saved/synchronized.

## Cloud boundary and free-only configuration

- Fixed model: `gemini-3.1-flash-lite` through Google's Developer API. No Vertex AI, gateway, paid fallback, alternate model or automatic retry.
- [Google's model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite) confirms image inputs and structured output. [Pricing](https://ai.google.dev/gemini-api/docs/pricing) lists free input/output for this model. This establishes general availability, not this project's entitlement. [Active quotas are project-specific](https://ai.google.dev/gemini-api/docs/rate-limits) and must be checked in AI Studio.
- `GEMINI_API_KEY` is server-only. Cloud scanning is disabled unless `GEMINI_FREE_TIER_CONFIRMED=true` is also set, and is always disabled in Vercel Production. The confirmation is an owner attestation, not an API check of billing. Keeping Google Cloud Billing **disabled** is the account-level protection against paid usage; an application flag cannot enforce a subsequent billing change.
- `/api/receipts/scan` validates Supabase V2 authentication and household membership using the existing auth wrapper. Request/response caching is disabled. Consent, engine, inline-image formats, eight-photo count, actual streamed byte size (4 MB) and provider output are bounded. Credentials and raw provider diagnostics never reach the client.
- A durable Postgres limiter reserves each request atomically before Google: per user 3/minute and 20/UTC day; whole project 5/minute and 50/UTC day. These are application caps, not a promise about Google's quota. Missing limiter infrastructure fails closed.
- Migration `20261109203641_receipt_cloud_rate_limit.sql` was applied only to isolated Supabase V2 `wwxdinkdjkjiqzynfbdk`. It stores counters only, not receipt content. The exposed wrapper is SECURITY INVOKER; privileged work is in the private schema, checks `auth.uid()` and membership, and serializes reservations with a transaction advisory lock.
- Rolled-back database verification: first three calls allowed, fourth denied; authenticated clients cannot read counters and anonymous clients cannot execute the RPC. The security advisor's informational no-policy finding on the private counter table is intentional deny-all; no client table grants or policies are needed. Existing unrelated advisory findings were left unchanged.
- Missing key, quota exhaustion, oversized uploads, provider failure and cancellation keep photos and provide an on-device choice. Key missing at verification time; user explicitly requested finishing available work and separating mock results from real API scans.

## Comparison and checks

The synthetic fixture is shared in `tests/fixtures/receiptComparison.ts`: 50 priced product rows across three images with two overlaps; includes three genuine adjacent MILK purchases, plus a visible FADED PRICE row. Expected total **€148.00**. The independent balanced-unreadable case has BEANS €2.00, a visible FADED PRICE row and printed total €2.00. The unreadable row must remain unresolved, not be filled from the total.

| Fixture / engine | Expected known items | Actual known items | Missed / duplicated known rows | Expected / actual total | Scan time |
| --- | ---: | ---: | --- | --- | --- |
| Three photos — real Tesseract, Android Chromium | 50 | 50 | 0 / 0 | €148 / €148 | 5.9 s |
| Three photos — real Tesseract, iPhone WebKit | 50 | 50 | 0 / 0 | €148 / €148 | 8.2 s |
| Three photos — mock Gemini transcription | 50 | 50 | 0 / 0 | €148 / €148 | Not an API timing |
| Balanced unreadable — real Tesseract, Android Chromium | 1 + 1 unresolved | 1 + 1 flagged | 0 / 0 | €2 / €2 | 4.1 s |
| Balanced unreadable — real Tesseract, iPhone WebKit | 1 + 1 unresolved | 1 + 1 flagged | 0 / 0 | €2 / €2 | 2.5 s |
| Balanced unreadable — mock Gemini transcription | 1 + 1 unresolved | 1 + 1 flagged | 0 / 0 known rows; omitted unreadable band flagged | €2 / €2 | Not an API timing |
| Either fixture — real Gemini API | As above | Not run | Not measured | Not measured | Not measured |

The extra FADED PRICE row is flagged in both three-photo Tesseract runs and in the mock, without inventing a price. Times come from the actual scanner UI, include worker/model loading when needed, and are rounded to 0.1 s. These are synthetic-image browser-emulation results on this Windows workstation, not physical-phone or real-supermarket accuracy benchmarks. The two engines share the source fixture text and image layout; the mock is a supplied transcription, not a measured cloud extraction.

Final local checks: TypeScript; ESLint (existing warnings outside the scanner); full Vitest suite **1,164 tests across 73 files**; production-optimized Next.js build; **8/8 Playwright tests**, four each for Android Chromium and iPhone WebKit; secret scan with no findings. The mobile suite covers local OCR, corrections, linked Shopping/Finances persistence, reload, duplicate prevention, 50 items/overlaps/repeated purchases, highlighting across all three photos, missing-row acknowledgement, a balanced unreadable price, signed-out Gemini retry/photo/draft recovery, weighted products, deposits/refunds/discounts and financial re-acknowledgement.

Browser timing evidence is also recorded in [receipt-engine-comparison.json](receipt-engine-comparison.json). The branch workflow now runs TypeScript, ESLint and the full unit suite as well as both browser projects and the optimized build.

During verification, a jsdom/Node abort-signal mismatch and a test-only Testing Library option were fixed. An initial simultaneous dev/build run collided in `.next`; final browser and build checks were run sequentially. A WebKit checkbox stability timeout was resolved by exercising keyboard focus/activation after the item edit; the final eight-test suite passed.

**Mock Gemini results:** shared transcription fixture produces 50/50 known items, zero missed known rows, zero duplicates, total €148.00 and an unresolved FADED PRICE warning. The balanced case produces one known item, €2.00 and a warning for the omitted physical band. Route tests mock only Supabase/Google boundaries; component tests mock the cloud scanner to verify successful replacement, quota failure and cancellation. These are not Gemini API accuracy or scan-time results.

**Real Gemini API results:** not run — no Preview key, Google project ID, project-specific quota evidence or billing-disabled verification available. No Gemini scan duration is claimed.

## Exact account steps still required

1. Open [Google AI Studio API keys](https://aistudio.google.com/api-keys), select/create a dedicated project, and confirm its plan is **Free**. In [Google Cloud Billing](https://console.cloud.google.com/billing), verify that this exact project has no billing account linked. Do not enable billing or start a trial.
2. Check the selected project's [active rate limits](https://aistudio.google.com/usage?tab=rate-limit) for **gemini-3.1-flash-lite**. Record the non-secret project ID and current quota. If unavailable or exhausted, keep using Tesseract.
3. Create a key for that free project. Add it directly as a secret named **GEMINI_API_KEY** in [the dedicated project's environment settings](https://vercel.com/mateo-s-projects123/sema-calendar-v2-preview/settings/environment-variables), scoped to **Preview only**, preferably branch `preview/supabase-v2-isolated`. Never paste it into chat or add `NEXT_PUBLIC_`.
4. After verifying steps 1–2, set **GEMINI_FREE_TIER_CONFIRMED=true**, also Preview only. Redeploy the verified branch to **Preview** so both settings take effect.
5. Repeat the same synthetic images through the signed-in cloud route, record item/row/total/timing results, and compare with the real Tesseract results. Mock passes do not complete that account-level verification.

No Production deployment, main-branch change, Production environment modification or live purchase was performed.
