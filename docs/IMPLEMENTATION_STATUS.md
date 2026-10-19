# Implementation status

## Delivered across foundation and this milestone
- Browser-based React and TypeScript application with production bundling.
- Standard one-click print-size presets (1×1, 2×2, ID-1/CR80, business cards, 4×6, A6) and downloadable physical-size printer calibration sheets.
- Local JPEG/PNG/WebP import, physical print sizing, quantities, mixed rectangular placement, pagination, visual preview, low-DPI warnings, client-side PDF output.
- Smartphone-style fixed-frame crop with drag, wheel/pinch zoom, keyboard access and visible aspect locking; the exact normalized visible rectangle is shared by the preview and PDF (no hidden second cover crop).
- Unit-aware measurement inputs and locally saved default print preferences (paper/orientation/margins/gaps/cut lines); responsive mobile Preview/Images/Print layout and streamlined sidebar.
- Vector brand assets, accessible contextual help and design-token-driven visual system.
- Local solid-color border background cleanup with sampled color, configurable tolerance, manual erase/restore brushes, and transparent edited PNG; source photos preserved in projects. This is not AI subject detection or complex edge matting.
- Per-design text/rectangle/ellipse layers: add, rename, color, reorder, hide, duplicate, remove, and numerically position. Repeat copies share the layers; PDF exports use vector text/shapes. Original assets and layers are persisted in projects.
- Saved full projects in IndexedDB, including original Blob assets and print settings; list, reopen and delete.
- Portable JSON backup export/import with embedded original and processed images, layers and physical layout; validation, size cap and new project IDs on import.
- Saved local layout presets.
- Saved semantic workflow definitions with manual step creation/editing/reordering, step enable/disable, on-session recording of supported sheet/sizing/quantity/framing actions, and replay for one or all images. A review prompt is shown when workflow review notes exist.
- Versioned project and workflow types, pure geometry and operation tests; Vercel builds run all unit tests, TypeScript, bundling and output checks.

## Deliberate limitations
- Workflow runner supports sheet.configure, crop.to-size, crop.center, copies.set, sheet.compose and review.manual. Unsupported image/AI/design/export steps **fail explicitly**. Workflow review currently happens before applying changes; there is no per-step pause/resume checkpoint engine.
- Crop uses one movable fixed-aspect window per source image; multiple independent crops per source and advanced mask selections are not implemented.
- This is a foundational numeric-input layer editor; direct canvas dragging, rich font embedding, grouping, robust typography, general-purpose design features and undo/redo history are not yet implemented.
- AI background segmentation, complex hair-edge matting, face analysis, AI enhancement, large batch engine, optimized rectangle/shape nesting, duplex registration and PDF calibration are not yet implemented.
- Saved workflow definitions use localStorage; full project assets use IndexedDB. Portable project JSON backups are available up to 48 MiB source images; streaming ZIP and separate workflow-library backups are not yet implemented.
- Preview and PDF share crop rasterization; an exported calibration PDF helps the user check real paper output, but manual measurement and printer-driver adjustment are still necessary.
- Vercel Vite deployment config and revisioned asset precache generator are included; offline behavior still needs production browser-host testing. No AI model assets are packaged.
- Image preview rasterization is resource-limited and may degrade on low-memory devices.

## Next milestone
1. Validate saved projects across browsers with quota, crash-recovery and version-migration tests; improve backup formats.
2. Implement true layered text/shape/photo design objects and undo/redo.
3. Add structured manual review checkpoints and robust batch execution progress/error handling.
4. Evaluate/licence offline model assets and integrate segmentation and mask edge editing.
5. Enhance sheet packing, cut marks/bleed and printer calibration.

## New editing milestones

- Direct manipulation of editable text/rectangle/ellipse overlays: drag on the actual cropped photo, resize via corner grip, and nudge with arrow keys. Numeric inputs remain available for precision. Original design geometry is stored relative to the physical print product.
- Undo/redo up to 50 steps for print settings, crop, size, quantity, layers, and workflow/preset application. Source-image imports, removals and replacement background PNGs intentionally reset editor history; they are not undoable, because old temporary image object URLs may have been revoked.
- Workflow replay now recalculates exact crop shape when the requested output size changes. No hidden secondary crop is applied.
- Verification remains Vercel-only, with no GitHub Actions.

## Additional print-production milestone
- Multiple named local layout presets (up to 40), including migration of the legacy one-preset key when available. Names, physical paper settings, quantities and image dimensions can be recalled for new jobs.
- Optional compact shelf arrangement sorts mixed print items by height and uses the result only if it does not increase sheet count. Source order remains available and preserved for users who need it.
- The selected arrangement persists with complete projects and is supported during workflow replay.
- This is deterministic rectangular shelf packing, not unrestricted geometric nesting or arbitrary rotations.

## Nondestructive photo adjustments
- Brightness, contrast and saturation per image with quick reset, kept as metadata (original and manually edited PNG bytes remain untouched).
- The crop preview and PDF share canvas image filter parameters. The stationary-frame crop editor shows the same filter.
- Adjustment metadata is included in saved projects and portable backups, validated on import, and available as a repeatable workflow step for one or all images.
- This is browser-level tonal adjustment, not color-managed ICC proofing or AI retouching; physical print fidelity needs printer tests.

## Portable workflow libraries
- Local workflow definitions can be exported to a versioned JSON archive and imported on another device. Imports enforce operation validation, a 1 MiB limit and 100-recipe cap; fresh IDs avoid overwriting saved recipes.
- Workflow portability is separate from full projects: recipes do not embed customer images, and they intentionally do not silently replay a photo-specific selection.

## Individual finished-design PNG exports
- Download one cropped and adjusted print design as transparent PNG at 300 DPI (capped by the existing raster memory limits).
- Text, rectangle and ellipse layers are composited at their physical positions; output is not restricted to the photo alone.
- PDF remains preferred for multipage imposition, cut guides and page geometry.
- Colors/fonts are not ICC-profile-managed; physical color proofing remains a device-level release criterion.

## Multiple print products from one photo
- Duplicate any design without reimporting image bytes. Every duplicate has its own ID, crop, print size, copy quantity, adjustments and independent layer IDs.
- Shared original/processed browser image URLs are reference-counted on removal and mask replacement, preventing one design's deletion from breaking another design's preview/PDF.
- Complete project saving retains both items and their independent design settings. This workflow supports producing 1×1 and 2×2 photos from the same imported source.

## Saved-project autosave
- Projects that have first been explicitly saved are updated automatically after 10 seconds without changes. New/untitled jobs are not autosaved until the user chooses an initial Save.
- Autosave is a local-only preference, enabled by default, and can be disabled. A discreet Projects-panel status reports saving/saved/failure.
- A generation fence cancels pending autosaves when the project, image list or settings change so stale asynchronous snapshot work cannot overwrite newly opened projects.
- An autosave is not a substitute for a portable backup: browser site-data clearing may erase both local drafts and saved files.

## Print preflight checks
- Before PDF generation, a compact expandable print check identifies malformed crop-to-physical-size geometry, invalid layer bounds, unsupported built-in PDF font glyphs, large batches and low effective crop DPI.
- Blocking errors disable PDF export; quality-only warnings (for example low DPI) allow the user to decide. Resolution is calculated from the exact crop window, not the source image's full dimensions.
- This is deterministic browser-side preflight, not a real printer-driver, ICC profile or physical print proof.

## Precision cutting guides
- Advanced print setup now offers physical product outlines or external corner cutting marks.
- Corner marks are eight short vector line segments per printed item, placed in reserved white space outside the product image; sheet preview and PDF share the same millimeter geometry.
- Mark clearance is validated before export: at least 1.5 mm page margin and 3 mm item spacing. Insufficient settings show an actionable preflight error instead of drawing over photos.
- Cut style is optional saved project/workflow metadata, maintaining backward compatibility with older project backups.

## Long print-job navigation and PDF ranges
- The sheet composer now navigates all generated pages individually, rather than previewing only the first six.
- Users can export all pages or validated 1-based ranges such as `1-3,5`, with deduplication and ascending output order; each range generates a correctly sized PDF containing only those sheets.
- A one-click action sets export scope to the currently previewed sheet. Print preflight applies to the chosen pages and their designs rather than unrelated items elsewhere in the job.
- Page selection is transient and never changes the stored project, its quantities, or the underlying complete imposition.

## Manual sheet arrangement
- **Arrange copies** allows per-copy drag or arrow-key adjustment (Shift for 0.1 mm) without altering the source crop itself.
- Each manual override stores physical x/y positions, source asset/copy IDs and page assignment. Preview and PDF share these coordinates.
- All drops are collision- and margin-checked; Reset restores automatic packing. Positions persist in saved projects and portable backups, and can be undone/redone.
- Paper, image-size and copy-count changes clear old positions to prevent stale print layouts. Saved presets and workflow replay intentionally discard source-specific positions.
- Initial scope is **within-sheet positioning only**; inter-page movement and irregular bin packing remain future work.

## Deduplicated portable project backups
- Export now produces versioned **PRINTS_PROJECT v2** portable JSON with one table of unique original/processed images and design references to that table. Multiple 1×1/2×2 variants no longer replicate image bytes in backup downloads.
- Each image entry includes an SHA-256 digest checked on import, providing corruption detection (not authentication). Import preserves all independent crops, layers, page settings and manual placement overrides.
- V1 backups from existing installations remain importable. The internal saved-project schema remains unchanged.
- Local project snapshots reuse the same image Blob for copied designs sharing an object URL, reducing redundant decoding/writes. Runtime materialization also shares object URLs for the same saved Blob.
- Maximum 48 MiB of **unique** embedded image data and 70 MiB total JSON; large uncompressed projects still need future streamed/ZIP backup support.

## Batch finished-design exports
- Images panel offers **Export all designs (ZIP)**: one independent 300-DPI finished PNG per design, including selected crop, adjustments, text and shape overlays. Copies on a sheet are not duplicated in this archive.
- PNG rasterization is sequential, reports progress and supports cancel between designs, avoiding concurrent large canvas allocations.
- ZIP32 uses standard STORE entries because PNG payloads are already compressed. Names are unique, sanitized and prefixed by design index; CRC-32 checksums allow ordinary ZIP readers to detect corruption. No external ZIP dependency or network transfer.
- Limit: 25 designs and 96 MiB ZIP output. This is a whole-batch ZIP assembled in browser memory, not an unbounded streaming archive.

## Revision-safe project saving
- All IndexedDB writes for one project are serialized; save revisions are allocated before image snapshot decoding. Out-of-order earlier snapshots are discarded instead of overwriting newer edits.
- Manual Save and autosave share the same coordinator. Different project IDs have independent revision sequences, and a failed browser-storage write does not block subsequent saves.
- The saved indicator only reports success for the matching revision. Portable backups remain important because clearing browser site data also removes locally saved projects.

## Layer manipulation reliability
- Layer dragging and corner resizing now track the initiating pointer ID. A second finger or mouse contact cannot hijack the active gesture.
- Pointer cancellation and lost capture roll back the in-progress visual draft instead of accidentally persisting it.
- Arrow keys move; Shift + arrows resize; Alt + arrows enable 0.1% fine adjustments. All movement uses the same bounded normalized geometry as PDF and PNG export.
- Existing text and shape controls remain accessible without adding more permanent editor panels.

## Offline shell completeness
- The service worker serves all declared shell resources from the cache, including the geometric logo mark and vector wordmark; previously only favicon and manifest were intercepted despite the others being precached.
- Vercel post-build verification checks that every shell file exists, has nonzero content and is included in the cache fetch allowlist. No arbitrary project images, user files or network APIs are cached.
- Full cross-device offline/PWA lifecycle acceptance tests remain separate from build-time validation.

## Text-layer output consistency
- PNG and PDF now validate text using a shared physical bounding-box model (typographic points rather than screen pixels). Multiline overflow is calculated against the actual text layer height, not the full photograph.
- PDF measures lines with its embedded Helvetica font; PNG measures lines using the canvas font after consistent physical point-to-pixel conversion. Font metrics can differ slightly across browser engines, so printer proofing remains necessary.
- Print preflight flags text boxes that cannot fit their lines before the user starts PDF generation. Invalid output fails clearly instead of silently clipping or overflowing.

## Immediate autosave invalidation
- Any new edit invalidates older pending snapshot revisions immediately, including edits made while the 10-second autosave delay has not elapsed. The coordinator also fences manual writes when automatic saving is disabled.
- A write that began before a newer edit is no longer reported as the current saved revision, even if the browser transaction already started.
- Regression tests explicitly cover pending image snapshots, write-completion races, and newer queued saves.

## Incremental crop preview rendering
- Image preview PNGs are retained per asset and keyed to only the visible source crop, image dimensions and tonal adjustments. Changing quantity, moving a copy on a sheet or editing vector layers does not reload unchanged image rasters.
- Newly imported or re-cropped images render sequentially, leaving unrelated photos visible; no parallel mass canvas decoding on memory-constrained phones.
- Changed/deleted assets revoke obsolete object URLs, and component unmount clears the cache. An interrupted older render cannot overwrite a later crop preview.
