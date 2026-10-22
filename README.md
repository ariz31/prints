# PRINTS

**PRINTS** is a local-first web app for accurate, paper-efficient printing. It combines image cropping, reusable processing workflows, physical-size sheet composition and PDF export for individuals and print shop operators, without requiring an account or image uploads.

## Currently implemented (development release)

- Import local JPEG, PNG and WebP images; retain source bytes.
- **Fixed-frame cropping:** a stationary aspect-locked print window. Drag the image underneath, pinch/scroll to zoom, or use the slider. What is visible in the frame is the exact PDF output, without an additional hidden crop.
- **Background cleanup:** sample a backdrop color, remove connected matching border areas, manually erase/restore transparency with brushes, and preserve the original photo. This is a solid-color heuristic, NOT AI subject segmentation; it may not cleanly handle hair or detailed backgrounds.
- Add editable text, rectangle and ellipse layers to a design. Configure names, text, color, visibility, order and normalized placement. Each duplicated print copy inherits its layers. Shapes and supported text remain vector elements in PDF export.
- Enter physical dimensions as `1"`, `1''`, `25.4mm`, `2.54cm` or numbers in your preferred unit. Set default paper, unit, orientation and spacing in Preferences.
- Pick ready-made sizes for 1×1 and 2×2 photos, ID-1/CR80 cards, business cards, 4×6 photos, or A6, while retaining full control of custom dimensions.
- Download a printer calibration PDF with a 100 mm horizontal/vertical ruler and a 50.8 mm square, then measure the printed result to identify driver scaling.
- Repeat/mix items and set quantities on A4, A3, Letter, Legal, Long Bond or custom pages; choose margins/gaps/orientation and trim outlines.
- Preview crops using the same rasterization algorithm used by PDF export.
- Export client-side multipage PDFs with physical page and item geometry; warn for low source DPI **and when memory-safe rasterization reduces the effective output DPI**. Full-page A3 can be downsampled below 300 DPI.
- **Save complete projects** in IndexedDB, including original image blobs, crop regions, quantities and paper settings. Open and delete existing projects.
- Save/reapply layout presets and **local workflows**. Manually add/edit/reorder steps, record semantic page/item setting changes, replay supported steps for a selected image or the whole batch, and prompt for manual review when a workflow requests it.
- Minimalist, mobile-specific Preview / Images / Print navigation, accessible hover/tap help and consistent vector branding.
- Versioned PWA app shell cache after the first successful online installation. Deploying new builds refreshes the cache revision and avoids indefinitely stale HTML. No backend or mandatory cloud account.

## Not yet implemented

AI semantic background segmentation, automatic portrait detection, drag-and-drop/WYSIWYG layer transforms, custom embedded fonts and full typography, recorded AI operation playback, ZIP batch exports, optimal packing, streaming ZIP backups for projects larger than 48 MiB, guaranteed offline AI model distribution, and automatic printer profile calibration.

**Offline caution:** IndexedDB and browser caches may be cleared by the user or browser. Download portable project backups regularly. Initial model files for AI functionality do not exist yet. Browser smoke testing, print-hardware calibration and offline cache verification are still release gates. A green build alone is not proof of all device-level behavior.

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

- [Product vision](docs/PRODUCT.md)
- [Requirements](docs/REQUIREMENTS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Workflows](docs/WORKFLOWS.md)
- [Roadmap](docs/ROADMAP.md)
- [Quality](docs/QUALITY.md)
- [Privacy](docs/PRIVACY.md)
- [Implementation status](docs/IMPLEMENTATION_STATUS.md)
- [Deploying on Vercel](docs/VERCEL.md)
- [Design system and visual standards](docs/DESIGN.md)
- [Contributing](CONTRIBUTING.md)

## Design principles

Millimeters are authoritative for sheet geometry. Original photos are never overwritten. Workflow operations are typed and semantic, not mouse-event replays. Image processing stays on-device. Preserve honest implementation status; design proposals are not feature claims.

## Deployment verification policy
GitHub Actions is intentionally removed. The Vercel production/preview build calls `npm run build`, which executes Node unit tests, TypeScript checks, production bundling, service-worker generation and built-asset checks. The deployment fails if any stage fails.
