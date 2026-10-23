# PRINTS — implemented architecture and invariants

**Updated 24 October 2026.** [Current-state and final-audit handbook](CURRENT_STATE_2026-10-24.md) is authoritative for feature status and outstanding field acceptance.

## Stack and boundaries

React 19 + TypeScript + Vite renders a local-first browser application. `src/App.tsx` coordinates routes, live assets, workspace history, object URL ownership, thumbnail previews, save/reopen and exports. Editors in `src/components/` manage local draft interactions. Pure deterministic modules in `src/core/` implement geometry, workflows, image operations, project validation and output generation. The browser's IndexedDB stores image Blobs and projects; localStorage keeps preferences, presets and workflow definitions. A generated service worker versions a local app shell, not private uploaded photos.

There is no mandatory backend, customer account or photo upload endpoint. Optional AI segmentation downloads consent-gated executable/model resources from external hosts, executes inference locally and caches eligible resources in the browser. These assets are not represented as cryptographically publisher-verified. See [Privacy](PRIVACY.md).

## Domain ownership

| Concern | Source of truth | Contract |
| --- | --- | --- |
| Original image | `PhotoAsset.url`, corresponding local Blob | Never overwrite; protect across active projects, history and pending imports |
| Processed background | `processedUrl` plus processed dimensions | A broken processed image must not silently replace printable output with its original; explicit Restore Original is undoable |
| Photo preview | `imageRaster.ts`, `photoSourceRecovery.ts`, `previewCache.ts` | Asynchronous preview failure affects its image only; generated and original fallbacks are distinguished |
| Crop | `crop.ts`, normalized source fractions | Original fallback uses `withProcessedImage(...,null)` geometry before displaying the crop |
| Print layout | `layout.ts`, `manualLayout.ts` | Authoritative millimeters, validated margins/rotation, deterministic item placement |
| Export | `exportPdf.ts`, `highResRaster.ts`, `pngStream.ts` | Physical PDF points, bounded 300/600-DPI image tiles, separate vector overlays |
| Persistent projects | `projectStore.ts`, `draftRecovery.ts` | Versioned IndexedDB snapshots and bounded recoverable drafts; storage can be evicted |
| Portable backups | `projectArchive.ts`, `projectZipArchive.ts` | Input format/signature/size/CRC/SHA checks; no cloud durability guarantee |
| Layer typography | `layers.ts`, `fontAssets.ts`, `textLayout.ts` | Local font embedding and validation; complex shaping remains unverified |
| Workflows | `workflow.ts`, `workflowEngine.ts` | Typed semantic operations, explicit unsupported-step failure, human review |
| Optional AI | `segmentationModel.ts`, `BackgroundEditor.tsx` | Consent, bounded masks, offline caching where possible; third-party license/integrity gates outstanding |

## Coordinate and transform contract

- Crops are normalized rectangles relative to the selected source raster, not arbitrary screen bounds.
- Sheet positions and item dimensions are millimeters, top-left origin; CSS zoom is presentation only.
- PDFs use points (72/in), bottom-left origin. One inch = 25.4 mm. Transform and rotation must agree with preview and cut marks.
- Bounded preview rasters deliberately have less resolution than export; source resolution and large-job device limits remain explicit.
- Masks in the print crop use normalized print-local coordinates, not blindly scaled full-source pixel coordinates.
- For processed-to-original recovery, recompute the normalized crop against original dimensions before showing the fallback so the preview and explicit restoration produce the same geometry.

## Async and error isolation

- Image import places decoded `blob:` URLs under pending ownership until committed or aborted; history-aware cleanup must never revoke live references.
- Image-source identity changes invalidate pending Auto Enhance, old preview generation and draft state. Generated object URLs are revoked by their own lifecycle.
- Thumbnail rasterization continues past an individual broken source, stops on workspace cancellation and must not publish stale results.
- An edit's Apply action is blocked until the current selected source and advanced preview have actually decoded. Fallback is preview-only until explicit correction of stored printable metadata.
- Project saves, history, draft recovery and deletion must enforce workspace revisions and avoid stale writes after navigation.

## Build and release

`npm run build` gates brand consistency → tests → TypeScript → Vite → service-worker generation → dist integrity → UI and offline smoke checks. GitHub Actions are intentionally absent. Require Vercel exact-commit READY and clean PR merge state; independently verify production deployment on the merged SHA. Follow [Quality](QUALITY.md), [Vercel](VERCEL.md) and [release acceptance](RELEASE_ACCEPTANCE_2026-10-23.md).

**Not guaranteed by automation:** physical printer calibration, mobile resource pressure, native FaceDetector availability, complete Unicode shaping, model origin/license assertions or printer-specific color accuracy.
