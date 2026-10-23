# PRINTS

**PRINTS** is a local-first web app for accurate, paper-efficient printing. It combines image cropping, reusable processing workflows, physical-size sheet composition and PDF export for individuals and print shop operators, without requiring an account or image uploads.

## Currently implemented (development release)

> **Status as of 24 October 2026:** The authoritative feature inventory, final code audit and remaining release gates are in [Current implementation and audit handbook](docs/CURRENT_STATE_2026-10-24.md). Vercel readiness confirms automated checks only; real-device, optional AI and measured printer acceptance remain pending.

- Import local JPEG, PNG and WebP images; retain source bytes.
- **Fixed-frame cropping:** a stationary aspect-locked print window. Drag the image underneath, pinch/scroll to zoom, or use the slider. What is visible in the frame is the exact PDF output, without an additional hidden crop.
- **Background cleanup:** sample a backdrop color, remove connected matching border areas, manually erase/restore transparency with brushes, and preserve the original photo. This is a solid-color heuristic, NOT AI subject segmentation; it may not cleanly handle hair or detailed backgrounds.
- Add editable text, rectangle and ellipse layers to a design. Configure names, text, color, visibility, order and normalized placement. Each duplicated print copy inherits its layers. Shapes and supported text remain vector elements in PDF export.
- Enter physical dimensions as `1"`, `1''`, `25.4mm`, `2.54cm` or numbers in your preferred unit. Set default paper, unit, orientation and spacing in Preferences.
- Pick ready-made sizes for 1×1 and 2×2 photos, ID-1/CR80 cards, business cards, 4×6 photos, or A6, while retaining full control of custom dimensions.
- Download a printer calibration PDF with a 100 mm horizontal/vertical ruler and a 50.8 mm square, then measure the printed result to identify driver scaling.
- Repeat/mix items and set quantities on A4, A3, Letter, Legal, Long Bond or custom pages; choose margins/gaps/orientation and trim outlines.
- Preview crops using the same rasterization algorithm used by PDF export.
- Export client-side multipage PDFs with exact paper/item geometry. Choose 300 or 600 DPI for full-resolution PDF/finished PNG output; large designs use bounded photo tiles and streaming PNG scanlines rather than silently downsampling. Source resolution still limits real detail, and large exports remain subject to explicit browser/memory and job-size limits. Preview rasters are lower resolution by design.
- **Save complete projects** in IndexedDB, including original image blobs, crop regions, quantities and paper settings. Open and delete existing projects.
- Save/reapply layout presets and **local workflows**. Manually add/edit/reorder steps, record semantic page/item setting changes, replay supported steps for a selected image or the whole batch, and prompt for manual review when a workflow requests it.
- Minimalist, mobile-specific Preview / Images / Print navigation, accessible hover/tap help and consistent vector branding.
- Versioned PWA app shell cache after the first successful online installation. Deploying new builds refreshes the cache revision and avoids indefinitely stale HTML. No backend or mandatory cloud account.

## New capabilities integrated in October 2026

- **Advanced Photo Studio:** nondestructive light/color/detail corrections, presets and adjustable Auto Enhance, rotation/flip/straighten, local retouch tools, image-source retry and explicit undoable original restoration, safe cropped recovery previews and source-safe editing history. Bounded spot healing now has pixel parity between the pure full-frame and tiled processors; large high-DPI brush radii fail explicitly rather than silently changing the image.
- **Smart ID Photo Studio:** 1×1 in, 2×2 in, 35×45 mm and validated custom 10–200 mm designs with independent crop/quantities. Native on-device FaceDetector alignment is optional where browsers support it; manual crop remains the default fallback. It is not a biometric identification or government-ID compliance system.
- **Sheet optimizer:** deterministic mixed-size packing with optional 90° rotation of eligible photo-only designs, safe baseline fallback and persisted paper/layout options.
- **Advanced text design:** local user-supplied TTF/OTF embedded into PDFs, alignment and line height, outlines/shadows and validated 0–100% layer opacity in editor, preview, PNG and PDF. Complex-script shaping and broad glyph fallback are not certified.
- **Resilient local projects:** IndexedDB saves, automatically saved untitled recovery snapshots (after a short idle period), Recently Deleted and 256 MiB-budget, ZIP-based portable project archives with deduplication, CRC/SHA-256, file-signature and ZIP-boundary validation. Legacy v1/v2 JSON backups remain importable; this is not a hosted backup.
- **Optional AI portrait segmentation:** explicit first-use consent, local processing with pinned-version MediaPipe runtime and cached external model files when supported; transparency, solid or user-selected local-photo background replacement (Cover/Contain and positioning), confidence/edge controls and manual mask brushes remain editable. Model formats are sanity-checked before execution; independently verified publisher SHA-256 locks, complex hair-edge performance and offline/browser acceptance remain open.
- **High-resolution exports:** physically sized 300/600 DPI PDF tiles and streamed PNG with pHYs metadata, plus PDF generation progress and cancellation at safe async checkpoints. A green automated build does not establish that a low-memory device can complete an A3 600 DPI job.

## Remaining limitations and release acceptance

- **Physical printing is not certified**: print at 100% / Actual Size, measure A3 and ID-photo geometry on each target printer, and check paper/ink/driver-dependent color variation.
- **Device/browser acceptance is pending**: real Android/iOS touch/Back, 600-DPI A3 memory, ZIP recovery after interrupted writes, native face-detection availability, and optional AI model load/offline behavior need controlled field testing.
- **Not yet supported fully**: cross-browser eye landmarks and automatic leveling, complex Unicode shaping and fallback, verified AI-model publisher provenance, printer-specific ICC soft proofing, super-resolution, and guaranteed browser-independent model distribution.
- **Resource limits remain intentional**: local browser quota eviction can delete unsaved/saved projects, ZIP and PDF jobs are bounded, and very large high-DPI spot-heal brushes may be refused. Download portable backups regularly.

See the linked acceptance ledgers and [implementation status](docs/IMPLEMENTATION_STATUS.md). The current merged code and Vercel tests establish a baseline for QA, not a physical or cross-browser certification.

## Run locally

Node.js 22 or newer.

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run build
```

Open the Vite URL printed by npm. Import photos, use **Crop** to drag/zoom a photo behind its fixed frame, choose dimensions/quantity, and export a PDF. Enter a name under **Saved projects** to save all source images and print settings. Under **Saved processing workflows**, save the current layout, record new semantic operations, edit steps, or apply to one image/all images. For accurate paper output, print PDFs at **100% / Actual Size**, not Fit to Page.

## Product and engineering docs

- [Current implementation, audit findings and release gates](docs/CURRENT_STATE_2026-10-24.md)
- [Release acceptance and pending field tests](docs/RELEASE_ACCEPTANCE_2026-10-23.md)
- [Product vision](docs/PRODUCT.md)
- [Requirements](docs/REQUIREMENTS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Workflows](docs/WORKFLOWS.md)
- [Roadmap](docs/ROADMAP.md)
- [Quality](docs/QUALITY.md)
- [Privacy](docs/PRIVACY.md)
- [Implementation status](docs/IMPLEMENTATION_STATUS.md)
- [Production-critical codebase audit (October 2026)](docs/CODEBASE_AUDIT_2026-10-24.md)
- [Deploying on Vercel](docs/VERCEL.md)
- [Design system and visual standards](docs/DESIGN.md)
- [Contributing](CONTRIBUTING.md)

## Design principles

Millimeters are authoritative for sheet geometry. Original photos are never overwritten. Workflow operations are typed and semantic, not mouse-event replays. Image processing stays on-device. Preserve honest implementation status; design proposals are not feature claims.

## Deployment verification policy
GitHub Actions is intentionally removed. The Vercel production/preview build calls `npm run build`, which executes Node unit tests, TypeScript checks, production bundling, service-worker generation and built-asset checks. The deployment fails if any stage fails.


## Incident and recovery guidance

If one image fails to display in Photo Studio, try **Retry image**. A failed processed image can preview the immutable original, but that alone does not change a print export; **Restore original for this design** is an explicit, undoable repair. A bad photo must not block generation of subsequent thumbnails. For persistent failures, check whether the image is visible under Images, reopen a saved job, or reimport the original JPG/PNG/WebP. Keep local backups and do not share personal source files in bug reports without authorization.

**Automated acceptance is not physical acceptance.** The [current audit](docs/CURRENT_STATE_2026-10-24.md) documents unresolved model provenance, complex typography, mobile/browser image decoding, large A3/600-DPI memory and physical printing requirements.
