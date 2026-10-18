# PRINTS

**PRINTS** is a local-first web app for accurate, paper-efficient printing. It combines image cropping, reusable processing workflows, physical-size sheet composition and PDF export for individuals and print shop operators, without requiring an account or image uploads.

## Currently implemented (development release)

- Import local JPEG, PNG and WebP images; retain source bytes.
- Select a nondestructive crop region by dragging on the source photo. Fine-tune output size and focal positioning independently.
- **Background cleanup:** sample a backdrop color, remove connected matching border areas, manually erase/restore transparency with brushes, and preserve the original photo. This is a solid-color heuristic, NOT AI subject segmentation; it may not cleanly handle hair or detailed backgrounds.
- Repeat/mix items and set quantities on A4, A3, Letter, Legal, Long Bond or custom pages; choose margins/gaps/orientation and trim outlines.
- Preview crops using the same rasterization algorithm used by PDF export.
- Export client-side multipage PDFs with physical page and item geometry; warn for low DPI.
- **Save complete projects** in IndexedDB, including original image blobs, crop regions, quantities and paper settings. Open and delete existing projects.
- Save/reapply layout presets and **local workflows**. Manually add/edit/reorder steps, record semantic page/item setting changes, replay supported steps for a selected image or the whole batch, and prompt for manual review when a workflow requests it.
- Baseline PWA app shell cache after first successful online installation. No backend or mandatory cloud account.

## Not yet implemented

AI semantic background segmentation, automatic portrait detection, sophisticated layer-based design/text/shapes, recorded AI operation playback, ZIP batch exports, optimal packing, complete project import/export backup, guaranteed offline AI model distribution, and printer calibration.

**Offline caution:** IndexedDB and browser caches may be cleared by the user or browser. Use explicit PDF exports; full portable project backups are next. Initial model files for AI functionality do not exist yet. Browser smoke testing, print-hardware calibration and offline cache verification are still release gates. A green build alone is not proof of all device-level behavior.

## Run locally

Node.js 22 or newer.

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run build
```

Open the Vite URL printed by npm. Import photos, use **Edit crop selection**, choose dimensions/quantity, and export a PDF. Enter a name under **Saved projects** to save all source images and print settings. Under **Saved processing workflows**, save the current layout, record new semantic operations, edit steps, or apply to one image/all images. For accurate paper output, print PDFs at **100% / Actual Size**, not Fit to Page.

## Product and engineering docs

- [Product vision](docs/PRODUCT.md)
- [Requirements](docs/REQUIREMENTS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Workflows](docs/WORKFLOWS.md)
- [Roadmap](docs/ROADMAP.md)
- [Quality](docs/QUALITY.md)
- [Privacy](docs/PRIVACY.md)
- [Implementation status](docs/IMPLEMENTATION_STATUS.md)
- [Contributing](CONTRIBUTING.md)

## Design principles

Millimeters are authoritative for sheet geometry. Original photos are never overwritten. Workflow operations are typed and semantic, not mouse-event replays. Image processing stays on-device. Preserve honest implementation status; design proposals are not feature claims.
