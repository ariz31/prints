# Proposed architecture and implementation boundaries

## Technology direction
React + TypeScript + Vite for UI; pure TypeScript domain logic for geometry and workflow models. A browser canvas is suitable for raster preview/editing; an independent PDF exporter owns actual physical output. IndexedDB is the intended asset/project store; the initial scaffold may persist only small user preferences until full project storage is implemented. A service worker/PWA precaches a versioned shell. Offline AI models are a staged feature and require deliberate asset caching.

## Modules
1. UI shell: project selection; Edit, Compose and Preview modes; accessible controls.
2. Asset manager: local source bytes, metadata, object URLs, safe lifecycle and IndexedDB persistence.
3. Design engine: immutable edit graph, crop rectangles, masks, text/shapes and layer operations.
4. Workflow engine: typed steps, semantic action recorder, validator, sequential executor and review checkpoints.
5. Layout engine: mm-based, pure deterministic placements; separate strategies for repeat-grid, shelf/rectangle packing and future optimization.
6. Export engine: maps shared placement geometry to PDF points, composites raster content and preserves text/vector elements where possible.
7. Offline services: PWA precache, queued processing, model storage, migration and backup.

## Coordinate contract
- Asset cropping: source raster pixel coordinates or normalized fractions.
- Design: object coordinates in its own physical unit or normalized design space.
- Print layout: mm from top-left of sheet, independent of UI zoom.
- PDF: points, origin bottom-left. One inch = 25.4 mm = 72 PDF points.
- Preview: scaled rendering of the same print placement model. Never use browser CSS dimensions as export geometry.

## Stage gates
1. Validate values and protect memory before attempting export.
2. Expand print quantities to item instances; paginate within printable area.
3. Render previews and PDFs from the same placement objects.
4. Convert source imagery to correct destination crop/size at suitable effective DPI.
5. Verify generated PDF page sizes and content bounds programmatically.

## Workflow safety
Semantic steps are versioned and operate on immutable assets. Recorded pointer moves, zoom and screen position are not stable workflow actions. Review steps must be explicit. No source-specific crop coordinates are silently reused when a new portrait has different dimensions. A batch should isolate failures and permit item-level retry.

## Security and privacy
No required backend. Photos stay local by default. Avoid logging personal image content or EXIF. Use strict file type and size validation and revoke temporary object URLs. Show clear warnings if future cloud or external processing is introduced. Do not store copyrighted/proprietary AI model binaries in the repository without an appropriate license.

## Architecture decisions pending measurement
Evaluate canvas rendering libraries, image segmentation/model speed and memory, IndexedDB schema, export fidelity of vector text, font embedding, and optimal packing algorithms against actual tests before locking vendor-specific dependencies.
