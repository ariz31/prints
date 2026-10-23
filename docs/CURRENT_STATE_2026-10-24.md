# PRINTS — current implementation, audit and release handbook

**Snapshot:** 24 October 2026 (Asia/Manila). **Repository:** `ariz31/prints`. **Release branch:** `main`. This file is the authoritative current-state index; older dated audits and roadmap sections remain for historical context. Source files, tests and deployed commit are authoritative if anything here becomes stale.

## Verified architecture

| Layer | Implemented modules and behavior | Boundaries |
| --- | --- | --- |
| Interface | React 19 / TypeScript / Vite; mobile Preview, Images, Print views; dedicated Photo, Crop, Background, Design Layers and Smart ID editors | DOM CSS viewport sizing is never print geometry |
| Images | Local JPG/PNG/WebP; original/processed Blob references, reversible edits, history-aware URL lifetimes, pending-import roots | The browser owns Blob URL and decoded-memory lifetimes; browser storage is not a guaranteed backup |
| Studio | Fixed-frame normalized crop, bounded background mask, optional local MediaPipe person segmentation, nondestructive tone/detail adjustment, indexed masks, custom photo looks and conservative ID alignment | Native FaceDetector varies by browser; external MediaPipe assets need consent, publisher/license evidence and offline QA |
| Typography | Editable vector text/shapes, user-supplied fonts, text alignment, line height, outlines/shadows and opacity across supported preview/export paths | Complex shaping, wide Unicode fallback and measured PDF glyph parity are not yet certified |
| Sheet engine | mm-based deterministic mixed-size MaxRects with fallback, eligible quarter-turn rotation, independent quantities and optional manual placement | Rotation and trim accuracy require printed proofs; no algorithm guarantees zero waste |
| Export | Bounded local PDF generation, 300/600-DPI tiled raster for larger designs, streamed PNG where necessary, batch ZIP, PDF progress/cancel; PDF vector overlays and print marks | High-DPI large jobs may exceed browser memory; `pdf-lib` can retain tile resources |
| Persistence | IndexedDB named projects, bounded untitled draft recovery, Recently Deleted, versioned portable JSON and ZIP with CRC/SHA-256 and file-signature checks | Private mode, quota, site-data clearing, device loss and eviction can destroy local records |
| Workflows | Typed semantic steps, local saved definitions, explicit review, version validation, batch parameter application | Unsupported image/AI/export steps fail explicitly; no unattended scripting engine |
| Offline | Versioned Vite hashed static assets, service worker precache, cache-aware update path | First online load required; external AI models require separate consent/download and may not work offline |
| Delivery | Vercel project `prints` (Git-connected), `npm run build` runs Node tests, strict TypeScript, Vite, SW generation/output, UI and offline smoke checks | GitHub Actions are intentionally unused; Vercel READY does not establish touch or printer acceptance |

## Final audit, scope and remediations

A source-and-test inspection reviewed Photo Studio, image source ownership, thumbnail generation, saved projects/recovery, ZIP integrity controls, high-resolution raster/output, background segmentation, print geometry, mobile CSS and deployment/docs. This is **not** a claim of exhaustive model checking or physical hardware qualification.

Defects addressed in the accompanying audit PR:

1. **Source replacement race:** Photo Studio could retain an in-flight Auto Enhance result and draft from the previous processed image when the same design's source changed. Source identity changes now invalidate outstanding enhancement work, reset preview state and rehydrate the corresponding saved adjustments.
2. **Incorrect fallback framing:** A processed photo can have different pixel dimensions from its original. Original-image recovery preview now uses the very same `withProcessedImage(..., null)` crop normalization as the explicit Restore Original action, preventing a mismatch between fallback framing and the eventual printable design.
3. **One corrupt thumbnail blocking all following images:** The previous sequential thumbnail queue caught failures outside its `for` loop. It now isolates each failed image while processing subsequent images, and suppresses stale reports after a workspace switch.
4. Tests cover preview failure continuation and cancellation, fallback-crop immutability/normalization and source-epoch guard assertions. Existing Blob URL lifetime tests, the snapshot/import suite, export geometry tests and the full Vercel release gate continue to apply.

## Newly identified dependency supply-chain risk — open P1

[Issue #78 — deterministic npm installs](https://github.com/ariz31/prints/issues/78) was opened after this audit began. The repository has semver ranges but no committed root package lock; builds currently use `npm install`. Consequently, the Vercel tests/READY SHA establish code/build readiness **for that resolution**, not reproducibility or a complete dependency vulnerability/license audit. Correct remediation needs a real networked npm lockfile generation, `npm ci`, audit and license review—**not fabricated hash entries**. Until that evidence exists, #78 remains **open**. Follow the [dependency reproducibility runbook](DEPENDENCY_REPRODUCIBILITY.md).

## What remains unverified

- Real Android Chrome/iOS Safari pointer input, touch scrolling, backgrounding/restarting and mid-range device memory usage. The reported failure for a specific customer image is not independently reproducible from a GitHub code audit.
- Precise measured 1×1, 2×2, custom ID and A3 layouts, rotation/cutting margins, and color under each actual printer, ink, media and driver configuration.
- Representative real-browser PNG/JPG/WebP alpha/color/crop exports and independent image/PDF renderer parity, including TIFF or HEIC only if added as supported input.
- A3 600-DPI worst-case long-running export memory and cancellation; large ZIP import/export with interruption, browser quota exhaustion and IndexedDB eviction.
- Optional MediaPipe executable/model integrity pinned to approved publisher SHA-256 and complete licensing evidence, CSP/CDN/offline-after-cache tests and difficult hair-edge examples.
- Complex-script Unicode shaping, fallback fonts and extracted PDF text/glyph comparison, native face/eye landmark coverage across browsers.

The following GitHub feature issues remain open pending their acceptance evidence: [#32 Photo Studio](https://github.com/ariz31/prints/issues/32), [#48 High-resolution output](https://github.com/ariz31/prints/issues/48), [#49 Smart ID](https://github.com/ariz31/prints/issues/49), [#51 Typography](https://github.com/ariz31/prints/issues/51), [#52 Project recovery](https://github.com/ariz31/prints/issues/52) and [#53 Background AI](https://github.com/ariz31/prints/issues/53). [#50 Packing](https://github.com/ariz31/prints/issues/50) is closed after implementation, but printer proof remains relevant.

## Release and change-control procedure

1. Start from the current `main` commit; inspect open PRs/issues and compare patches with latest files, including adjacent export, storage and UI consumers.
2. For source changes, add deterministic regression tests for invalid inputs, async cancellation, recovered state and export parity. Never mark a test as passed without tool evidence.
3. Execute `npm run build` on a **specific commit** through Vercel: tests → `tsc --noEmit` → Vite production bundle → generated SW and artifact checks → UI/offline smoke. Recheck every changed head SHA.
4. Merge only with a clean GitHub merge state and successful exact-head validation. After merging, verify that Vercel production is READY **for the merged commit**; a green preview is not production evidence.
5. Do not close device/print/AI-license acceptance issues solely because a code PR merged. Preserve a dated manual-results record with device, browser, image fixture, paper/driver settings and observed output.
6. For browser-only failures, capture the error text, source format/dimensions, editor mode, recovery response and reproduction steps; do not upload personal photos without explicit consent.

## Documentation map

- [README](../README.md): overview and operator quick start
- [Product](PRODUCT.md), [Requirements](REQUIREMENTS.md), [Roadmap](ROADMAP.md): goals, gap register, staged work
- [Architecture](ARCHITECTURE.md), [Design](DESIGN.md), [Workflows](WORKFLOWS.md), [Quality](QUALITY.md): implementation contracts
- [Privacy](PRIVACY.md), [Vercel](VERCEL.md), [Print calibration](PRINT_CALIBRATION.md): operations and trust boundaries
- [Implementation history](IMPLEMENTATION_STATUS.md), [production audits](PRODUCTION_AUDIT.md) and [earlier integrity audit](PRODUCTION_INTEGRITY_AUDIT_2026-10-22.md): dated historical evidence
- [Release acceptance ledger](RELEASE_ACCEPTANCE_2026-10-23.md), [Photo Studio acceptance](PHOTO_STUDIO_ACCEPTANCE_2026-10-23.md), [Smart ID acceptance](ID_PHOTO_ACCEPTANCE_2026-10-23.md), [High-res acceptance](HIGH_RES_EXPORT_ACCEPTANCE_2026-10-23.md): scoped signoff requirements
- [AI feasibility](ADVANCED_PHOTO_STUDIO.md), [brand](brand/README.md), [Contributing](../CONTRIBUTING.md)

**Status convention:** `Implemented` means code exists and the automated verification passed at a recorded commit; `Field acceptance pending` means behavior cannot be certified without device, provider, or physical print evidence; `Experimental` means model provenance, reliability or rollout gates remain unfulfilled; `Not implemented` means deliberately absent. Never conflate those states.
