# Implementation status

## Delivered across foundation and this milestone
- Browser-based React and TypeScript application with production bundling.
- Local JPEG/PNG/WebP import, physical print sizing, quantities, mixed rectangular placement, pagination, visual preview, low-DPI warnings, client-side PDF output.
- Interactive nondestructive rectangular crop selection with normalized source coordinates. Shared crop algorithm for preview and PDF.
- Local solid-color border background cleanup with sampled color, configurable tolerance, manual erase/restore brushes, and transparent edited PNG; source photos preserved in projects. This is not AI subject detection or complex edge matting.
- Saved full projects in IndexedDB, including original Blob assets and print settings; list, reopen and delete.
- Saved local layout presets.
- Saved semantic workflow definitions with manual step creation/editing/reordering, step enable/disable, on-session recording of supported sheet/sizing/quantity/framing actions, and replay for one or all images. A review prompt is shown when workflow review notes exist.
- Versioned project and workflow types, pure geometry and operation tests, CI typecheck/unit/build.

## Deliberate limitations
- Workflow runner supports sheet.configure, crop.to-size, crop.center, copies.set, sheet.compose and review.manual. Unsupported image/AI/design/export steps **fail explicitly**. Workflow review currently happens before applying changes; there is no per-step pause/resume checkpoint engine.
- Crop currently supports one rectangle per source image and output framing, not multiple separate crops per source or advanced mask selections.
- Advanced text/vector/shape layer editor and undo/redo command system are not yet implemented.
- AI background segmentation, complex hair-edge matting, face analysis, AI enhancement, large batch engine, optimized rectangle/shape nesting, duplex registration and PDF calibration are not yet implemented.
- Saved workflow definitions use localStorage; full project assets use IndexedDB. There is not yet a portable project archive/export.
- Preview and PDF share crop rasterization, but actual printer/driver sizing requires device-level verification.
- First-use PWA precache and offline behavior need browser-host testing; no AI assets are packaged.
- Image preview rasterization is resource-limited and may degrade on low-memory devices.

## Next milestone
1. Validate saved projects across browsers with quota, crash-recovery and version-migration tests; implement portable backups.
2. Implement true layered text/shape/photo design objects and undo/redo.
3. Add structured manual review checkpoints and robust batch execution progress/error handling.
4. Evaluate/licence offline model assets and integrate segmentation and mask edge editing.
5. Enhance sheet packing, cut marks/bleed and printer calibration.
