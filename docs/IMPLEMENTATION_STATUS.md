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
