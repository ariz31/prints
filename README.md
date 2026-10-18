# PRINTS

**PRINTS** is a local-first web app for preparing accurate, paper-efficient print jobs: import images, crop/frame them, compose repeated or mixed designs on standard or custom paper, and export in physical print dimensions.

Its long-term product vision combines **Design Studio** (nondestructive image/layer editing), **Workflow Studio** (saved and recorded repeatable processing), and **Print Studio** (universal sheet composition and print export). PRINTS serves both individuals and print-shop operators without requiring accounts, checkout or customer-upload services.

## What works in the foundation

- Import multiple local JPEG/PNG/WebP images with file type and 25 MB/item safeguards.
- Set each item's dimensions in mm, copy count and focal framing position.
- Choose A4, A3, Letter, Legal, Long Bond, or custom paper; select orientation, margins and gaps.
- Compose mixed-size rectangular items in input order, repeat copies and paginate without overflow. The initial deterministic shelf layout is **not** an optimal packing algorithm.
- Preview up to six pages, see sheet/item counts and detect very low effective DPI.
- Generate/download a client-side multipage PDF at physical size with optional trim outlines.
- Save and apply an on-device layout **preset** (paper, item size and copy count only; not image assets).
- Offer an installable app shell with an offline cache after successful first installation; no image uploads or backend.

**Not yet implemented:** interactive crop handles, full layer/text/shape editor, project persistence of source assets, saved workflow execution or recording, automatic AI background removal, manual mask brushes, batch AI processing, printer calibration, or optimized irregular nesting. These are product requirements in the roadmap, **not completed features**.

## Quick start

Requirements: Node.js 22+ and npm.

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run build
```

Open the local Vite URL displayed by npm run dev. Upload a JPG/PNG/WebP, edit its copy count and dimensions, choose paper settings, preview sheets, and select Export PDF.

The initial application does not permanently store uploaded images; re-import them when restarting. Layout presets use localStorage only. Browsers may clear local data; do not rely on it as a production backup.

To print to physical dimensions, use **Actual Size / 100%**, disable Fit-to-Page, and verify hardware printable margins with a calibration print. Resolution and output fidelity depend on source images and installed printer/driver settings.

## Documentation

- [Product purpose](docs/PRODUCT.md)
- [Feature requirements](docs/REQUIREMENTS.md)
- [Architecture and coordinate system](docs/ARCHITECTURE.md)
- [Saved-workflow specification](docs/WORKFLOWS.md)
- [Delivery roadmap](docs/ROADMAP.md)
- [Quality gates](docs/QUALITY.md)
- [Privacy](docs/PRIVACY.md)
- [Contributing](CONTRIBUTING.md)

## Core rules

- Millimeters are the source of truth for paper/item layout; PDF uses 72 points/inch.
- Preview and export share the same placement geometry.
- Preserve original image files and do not upload private photos by default.
- Workflows must record semantic operations, not arbitrary mouse gestures.
- Clearly label proposed functionality separately from tested, working functionality.

Repository: https://github.com/ariz31/prints
