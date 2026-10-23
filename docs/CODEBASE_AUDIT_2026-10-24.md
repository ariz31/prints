# PRINTS production-critical codebase audit

**Audit date:** 2026-10-24 (Asia/Manila)  
**Repository:** `ariz31/prints`  
**Approach:** GitHub-connected source inspection, exact-commit Vercel builds, Node regression/property tests, TypeScript, Vite bundling, SSR/static UI smoke and PWA revision-integrity checks. No GitHub Actions.

## Audit coverage and evidence

Direct source inspection covered production-critical portions of:

- **Application state, interaction and UI:** `src/App.tsx`, `CropEditor`, `PhotoAdjustEditor`, `BackgroundEditor`, `IdPhotoStudio`, `LayerCanvas`, `LayerPanel`, `appNavigation.ts`, `previewCache.ts`, `referencedAssets.ts`.
- **Print geometry and exports:** `layout.ts`, `manualLayout.ts`, `crop.ts`, `pdfTileGeometry.ts`, `imageRaster.ts`, `highResRaster.ts`, `printPreflight.ts`, `exportPdf.ts`, `exportPng.ts`, `pngStream.ts`, `batchExport.ts`, `zip.ts`, `textLayout.ts`, `photoPixels.ts`, `photoAdjustments.ts`.
- **Local storage, portable projects and access boundaries:** `projectStore.ts`, `ProjectWriteCoordinator.ts`, `draftRecovery.ts`, `projectArchive.ts`, `projectZipArchive.ts`, `assetIntegrity.ts`, `imageSignatures.ts`.
- **Third-party and delivery boundaries:** `fontAssets.ts`, `segmentationModel.ts`, `package.json`, `vercel.json`, `vite.config.ts`, service-worker build and smoke scripts.

The independent Photo Studio/source recovery PR #79 also merged during finalization and must be retained alongside these findings. The audit assessed safety and correctness of these paths, not every browser/runtime state or every dependency in a resolved lockfile. **No live printer, physical device laboratory, or complete browser-based end-to-end test was available.** Build-readiness results must not be mistaken for empirical printer or AI-quality certification.

## Confirmed defects corrected

| Priority | Finding and failure mode | Fix PR | Regression evidence |
| --- | --- | --- | --- |
| P0 print fidelity | MaxRects placed items with less than the configured physical cutting gap when a later item approached from the left/top; reproducible collision in deterministic randomized seed 3 | [#76](https://github.com/ariz31/prints/pull/76) | Symmetric clearance and 36 mixed-size seeded geometry sets: unique copies, no overlap, safe rotation, margins/gaps, deterministic layout |
| P1 print fidelity | CSS background image positioning and saved PNG used opposing offset directions in Cover mode | [#73](https://github.com/ariz31/prints/pull/73) | Parameterized Cover/Contain horizontal/vertical preview-export coordinate parity and invalid-value tests |
| P1 data integrity | More than six untitled recovery snapshots persisted even though only six appeared in UI; old image blobs could silently consume IndexedDB quota | [#74](https://github.com/ariz31/prints/pull/74) | Same-transaction retention and deterministic tie/corruption cases |
| P1 data integrity | Legacy V1/V2 JSON backup import trusted declared JPEG/PNG/WebP MIME even if bytes had another file signature | [#75](https://github.com/ariz31/prints/pull/75) | Shared JSON/ZIP image-header validator and spoofed-MIME JSON tests, real signatures retain V1/V2 round-trip |
| P1 print identity | Composer, PDF lookup and manual placement keyed copies by design IDs that were not independently checked for duplicates | [#76](https://github.com/ariz31/prints/pull/76) | Composer, project save/load and PDF export now reject missing/ambiguous design IDs |
| P2 editor resilience | A failed `FontFace.load` was stored forever as a rejected promise, blocking another attempt for the same font until refresh | [#77](https://github.com/ariz31/prints/pull/77) | Mock browser load first fails then succeeds; successful font is cached only after recovery |

**Merge status:** All identified corrective PRs above merged to `main` after their respective exact-head Vercel validations.

## Automated verification

- Before this pass: **212/212** reported passing in the preceding release.
- After PR #77: **219/219** exact-head tests, plus strict TypeScript, Vite production bundle, static/SSR React UI smoke, icon/accessibility markers, service-worker revision and hashed-asset checks.
- UI smoke is based on SSR output and source assertions, **not equivalent** to Playwright, actual touch gestures or independent pixel-by-pixel browser image comparisons.
- Vercel has been used in place of GitHub Actions, consistent with project policy. All related change PRs were merged only after green exact-head previews.

## Open risks and validation gaps

| Severity | Risk | Status and required evidence |
| --- | --- | --- |
| P1 supply chain | No committed npm/pnpm/Yarn/Bun/shrinkwrap lockfile could be located; semver dependencies alone do not guarantee reproducible fresh installs | **Open [#78](https://github.com/ariz31/prints/issues/78)**. Generate genuine lock via selected package manager, enforce `npm ci` or equivalent, run locked-tree vulnerability/license review and test fresh clean build. Do not fabricate integrity hashes. |
| P1 high-DPI memory | PDF output retains embedded 300/600-DPI image tiles in pdf-lib until save; cancellation cannot preempt synchronous final save | **Open #48.** Benchmark repeat A3 600-DPI exports on constrained mobile devices and add independent PDF/PNG rendered golden-image checks |
| P1 source/backup resilience | IndexedDB site eviction, cross-tab conflict and interruption scenarios are not covered by browser/device load tests | **Open #52.** Real browser multi-tab/quota/restart + cross-device ZIP restore matrix; note six-draft cap and user-controlled portable backups |
| P1 opt-in AI provenance | AI media assets receive header sanity checks but no publisher-verified cryptographic hash pin; runtime/first-time CDN/cached-offline behavior unverified | **Open #53.** Verify actual released model/run-time digests and license, performance/privacy/CSP, hair/transparent edge quality and platform behavior |
| P1 typography | Complex-script shaping, automatic font fallback, full glyph coverage and physical/PDF rendering equivalence not certified | **Open #51.** Unicode/RTL/combining-mark fixtures and independent PDF render comparisons |
| P1 crop/ID quality | Unsupported-browser face landmarks, physical headroom constraints, mobile gestures, printer output and color proof remain unverified | **Open #32/#49.** Source-image/layer golden files, browser-device sessions, true-size physical print measurements |
| P2 browser hardening | `vercel.json` has `nosniff`, referrer, clickjacking and permissions headers, but no explicit Content-Security-Policy | Evaluate narrow CSP permitting required blob font/module behavior, MediaPipe opt-in asset access, and PWA resources. **No XSS was established by this audit.** |
| P2 maintainability | Large `src/App.tsx` combines state, import/export, draft recovery and navigation | Consider incremental feature-service extraction with existing regressions, not an ungated large rewrite |

## Release acceptance

Before closing outstanding feature issues, obtain physically measured printed sample outputs, browser rendered image/PDF comparisons, robust storage/quota and recoverability tests, and AI runtime/provenance evidence. A green Vercel build confirms source/build checks only.

## Final reviewer checklist

- [x] Audit production-critical print geometry, identity and cut-spacing paths
- [x] Audit local draft retention and portable media headers
- [x] Audit background preview/export transformations
- [x] Audit font-loader transient failure handling
- [x] Fix reproducible code defects with regression tests and merge verified PRs
- [x] Verify existing Vercel static UI/PWA smoke gates remain green
- [ ] Verify end-to-end live-browser editing and pixel render parity on real devices
- [ ] Verify printer geometry/color and 600-DPI mobile memory on actual target hardware
- [ ] Verify dependency lock, artifact digests and optional model provenance
