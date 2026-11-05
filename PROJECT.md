# Project: PRINTS Architecture Refactoring & Performance Optimization (Issue #118)

## Architecture Overview

PRINTS is a high-performance, 100% client-side web application for precision photo print layout, biometric ID photo creation, non-destructive photo editing, vector layers, and millimeter-accurate PDF/PNG export.

### Layered Architecture & Module Boundaries

The target architecture enforces a strict Directed Acyclic Graph (DAG) with zero circular dependencies:

```
                  ┌───────────────────────────────┐
                  │            src/app/           │  (Shell, Navigation, Controllers)
                  └───────────────┬───────────────┘
                                  │ imports
                                  ▼
                  ┌───────────────────────────────┐
                  │         src/features/         │  (12 Encapsulated Feature Modules)
                  └───────┬───────────────┬───────┘
                          │ imports       │ imports
                          ▼               ▼
           ┌─────────────────────┐ ┌─────────────────────┐
           │     src/domain/     │ │    src/platform/    │  (Storage, Rendering, Workers)
           │ (Models, Geometry,  │ └──────────┬──────────┘
           │     Validation)     │            │ imports
           └──────────▲──────────┘            │
                      │ imports               │
                      └───────────┬───────────┘
                                  │
                                  ▼
                  ┌───────────────────────────────┐
                  │          src/shared/          │  (Components, Hooks, Utils, Styles)
                  └───────────────────────────────┘
```

1. **`src/domain/`**: Pure domain entities, types, immutable mathematical calculation functions, and input validation guards. ZERO dependencies on UI components, React, DOM, or platform adapters.
2. **`src/platform/`**: Browser runtime adapters, IndexedDB storage, Web Workers, canvas rendering pipelines, and font loaders. Depends only on `src/domain/` and `src/shared/`.
3. **`src/shared/`**: Generic reusable UI components (`StudioSelect`, `BoundedNumberField`), custom hooks (`useEditorHistory`), and foundational utility functions. ZERO dependencies on features or application shell.
4. **`src/features/`**: 12 self-contained feature modules combining feature-specific UI, hooks, and logic. Features communicate through domain models or callbacks; no cross-feature private imports.
5. **`src/app/`**: Lightweight application shell (<100 lines for `App.tsx`), routing, layout shell, and top-level workspace controllers.

---

## Baseline Verification State

- **Git HEAD SHA**: `973e852c5a6010db04672cdc05a0be04f71f2010` (clean working tree on `main`)
- **Unit/Integration Test Baseline**: 91 test files, 424 passing tests (~5.2s, 0 failures, 0 skips)
- **Type Safety**: `npm run typecheck` (`tsc --noEmit`) passes with 0 errors. Zero instances of `: any`, `as any`, or `<any>` in the entire codebase.
- **Build Pipeline**: `npm run build` succeeds cleanly in ~18.9s across all 9 verification stages.
- **Bundle Metrics**: 1.79 MB uncompressed JS (~720 kB gzip), 19 precached hashed assets.

---

## Feature Inventory

Every feature identified in the Survey phase is enumerated below with an assigned milestone:

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Core PhotoAsset Entity | Non-destructive image model with crop, adjustment, and blob properties | M1 | Survey |
| 2 | Sheet & Placement Models | SheetPage, Placement, PrintItemSpec, Orientation, and PaperName models | M1 | Survey |
| 3 | Print Mode & Job Contracts | PrintModeId, PrintModeConfig, PrintModeJob, CutGeometry, NumberingOrder contracts | M1 | Survey |
| 4 | Project & Storage Models | StoredProject, ProjectSettings, ProjectSummary, TrashSummary contracts | M1 | Survey |
| 5 | Layer & Frame Models | DesignLayer, TextLayer, ShapeLayer, FrameLayer, FramePreset contracts | M1 | Survey |
| 6 | Physical Geometry & Units | Millimeter/inch/pixel conversions, safe math, and dimensions library | M1 | Survey |
| 7 | Cut Marks Geometry | Line segments, trim styles, and corner mark clearance validation | M1 | Survey |
| 8 | PDF Tile Geometry | Tiled PDF bounding boxes and coordinate transforms | M1 | Survey |
| 9 | Asset & Number Validation | Decompression bomb protection, integer clamping, and preflight validation | M1 | Survey |
| 10 | Durable Blobs & IndexedDB | IndexedDB project store (`prints-projects-v1`), optimistic CAS tokens, blob cloning | M1 | Survey |
| 11 | Object URL Registry | Bounded Blob URL tracking and automatic revocation | M1 | Survey |
| 12 | Worker & Rendering Core | ImageRaster, highResRaster, pixel transforms, DPI conversion, and worker scaffolding | M1 | Survey |
| 13 | Font Assets & Loading | Bundled offline fonts, TTF/OTF loader, and fontkit integration | M1 | Survey |
| 14 | Client-side ZIP Engine | Pure client-side ZIP32 reader/writer with CRC32 verification | M1 | Survey |
| 15 | Shared Primitives & Styles | StudioSelect, StudioIcon, BoundedNumberField, DimensionField, tokens.css, controls.css | M2 | Survey |
| 16 | Normal Print Mode | Standard grid layout with multi-image assignment and DPI controls | M2 | Survey |
| 17 | Notepad Cut Mode | Equal cutting cells, safe artwork insets, shared straight-line cut guides | M2 | Survey |
| 18 | Ticket Cut Mode | Equal-cell grid layout with vector cut-and-stack serial numbering | M2 | Survey |
| 19 | Rush ID Cut Mode | Pre-sized portrait grids (1x1", 2x2", 35x45mm, custom 10-200mm) | M2 | Survey |
| 20 | Sticker & Card Cut Modes | Physical sticker contours and business card layouts | M2 | Survey |
| 21 | Multi-Image Assignment | Assignment rules (`cycle`, `selected`, `first`, `slots`) and quantity bases (`total`, `per-design`) | M2 | Survey |
| 22 | Sheet Layout Packing | Compact shelf, Source order, and Optimized MaxRects packing engines | M2 | Survey |
| 23 | Shape Polygon Nesting | Irregular polygon nesting and intersection collision detection | M2 | Survey |
| 24 | Manual Sheet Placement | Drag-and-drop, arrow-key nudge, quarter-turn rotation overrides | M2 | Survey |
| 25 | Paper Sizes & Custom Manager | 27 standard paper sizes, custom paper library, viewport geometry | M2 | Survey |
| 26 | Smart ID Studio Framing | Interactive pan/zoom framing, biometric guides, aspect lock | M2 | Survey |
| 27 | Smart ID Face Alignment | Native FaceDetector integration, multi-face selection, headroom control | M2 | Survey |
| 28 | Smart ID Backdrops & Variants | Solid backdrops (white, blue, grey) and multi-size batch generation | M2 | Survey |
| 29 | Photo Editor Light & Color | Exposure, contrast, highlights, shadows, brightness, temperature, tint, saturation | M2 | Survey |
| 30 | Photo Editor Detail & Geometry | Sharpness, clarity, denoise, vignette, rotation, straighten, flip | M2 | Survey |
| 31 | Photo Editor Retouch & Styles | Spot healing, dodge/burn, red-eye brushes, preset styles, batch propagation | M2 | Survey |
| 32 | Background Color Removal | Eyedropper sampling, tolerance flood-fill, and alpha feathering | M2 | Survey |
| 33 | Background Alpha Brushes | Manual erase/restore transparency brushes with dirty-rect optimization | M2 | Survey |
| 34 | Background AI Segmentation | Local MediaPipe portrait segmentation model loader | M2 | Survey |
| 35 | Vector & Text Layers | Text, Rectangles, Ellipses, magnetic snapping, and typographic styling | M2 | Survey |
| 36 | Decorative Frames System | 30 decorative vector frames across 5 categories in SVG, Canvas, and PDF | M2 | Survey |
| 37 | High-Res PDF Export | Vector & tiled 300-600 DPI PDF generation with font embedding | M2 | Survey |
| 38 | Streaming PNG & Batch Export | Scanline PNG export with CompressionStream, pHYs tagging, batch ZIP | M2 | Survey |
| 39 | Projects & Draft Recovery | Autosave, draft recovery (`prints-untitled-recovery-v1`), 30-day recycle bin | M2 | Survey |
| 40 | Tab Collision & Backups | BroadcastChannel tab lease election and portable `.prints.zip` backups | M2 | Survey |
| 41 | App Shell & Header | Decoupled AppShell, AppHeader, AppSidebar, and AppNavigation | M3 | Survey |
| 42 | Workspace State Slicing | State decoupled into Project, Layout, and Editor controllers; eliminate god-file App.tsx | M3 | Survey |
| 43 | View Component Memoization | `React.memo` on SheetPreview, AssetCard, and sidebar panels to eliminate rerenders | M3 | Survey |
| 44 | Fast Slider Visual Feedback | CSS transform stage updates during interaction before worker rasterization | M3 | Survey |
| 45 | Transferable Worker Pipeline | Worker ImageBitmap transfer and AbortController cancellation (Bottleneck B1) | M4 | Survey |
| 46 | Worker LRU ImageBitmap Cache | 4-6 entry LRU cache in worker thread (Bottleneck B5) | M4 | Survey |
| 47 | Canvas Tile Pooling | Reusable scratch & tile canvases in highResRaster (Bottleneck B4) | M4 | Survey |
| 48 | Shape Nesting Spatial Index | Polygon contour caching and bounding-box spatial indexing (Bottleneck B3) | M4 | Survey |
| 49 | Bounded History URL Retain | Generation-scoped history Blob URL retention (Bottleneck B6) | M4 | Survey |
| 50 | 100% E2E Test Suite Pass | Complete validation across all Tiers 1-4 opaque-box tests | M5 | Survey |
| 51 | Tier 5 Adversarial Hardening | Challenger-driven white-box adversarial stress tests and gap closure | M5 | Survey |

---

## Milestones Decomposition

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Domain & Platform Foundations | Extract pure models (`src/domain/models/`), geometry, validation, and platform adapters (`src/platform/`). Break all 7 circular cycles. Update test discovery to `src/**/*.test.ts` while maintaining facade compatibility so all 424 tests pass. | None | DONE (All models, geometry, platform extracted; 0 cycles; 0 any; 1,029 tests pass; production build succeeds) |
| M2 | Feature Modularization & Shared Layer | Reorganize 12 features into `src/features/` and reusable UI into `src/shared/`. Split `src/styles.css` into modular feature stylesheets with an aggregated root entry point. Maintain 100% test and build gate pass. | M1 | DONE (12 feature modules in `src/features/`, shared layer in `src/shared/`, 17 modular stylesheets, 0 cycles, 0 any, 434 unit + 595 E2E tests pass, full 9-stage build pass) |
| M3 | App Shell Decoupling & State Slicing | Decompose monolithic `App.tsx` (2,372 lines) into `src/app/shell/`, `src/app/navigation/`, and isolated controllers (`WorkspaceController`, `ProjectController`). Implement `React.memo` and eliminate global rerenders. | M2 | DONE (App.tsx reduced to 98 lines; 4 controllers in `src/app/controllers/`; 7 shell components in `src/app/shell/`; SheetPreview & AssetCard memoized; GPU translate3d drag acceleration; 0 any; 434 unit + 595 E2E tests pass; full 9-stage build pass) |
| M4 | Performance, Concurrency & Resource Optimization | Implement Bottlenecks B1-B6: transferable `ImageBitmap` worker pipeline, worker job cancellation via `AbortController`, LRU worker cache, scratch canvas pooling in `highResRaster`, shape nesting spatial indexing, and bounded history Blob URLs. Demonstrate ≥30% benchmark improvement. | M3 | DONE (Bottlenecks B1–B6 implemented; transferable ImageBitmap & AbortController pipeline; CanvasPool scratch & tile reuse; LruCache worker & workspace; UniformSpatialGrid2D & contour caching; generational history retention; 0 any; 453 unit + 595 E2E tests pass; full 9-stage build pass) |
| M5 | Final Milestone: E2E Verification & Adversarial Hardening | Phase 1: Pass 100% of E2E test suite (Tiers 1-4) published in `TEST_READY.md`. Phase 2: Tier 5 Adversarial Coverage Hardening via Challenger loop. Complete two independent audit passes (score ≥97/100). | M4 | PLANNED |

---

## Interface Contracts

### 1. `src/domain/models/asset.ts`
```typescript
export interface PhotoAsset {
  id: string;
  name: string;
  blobUrl: string;
  sourceBlobUrl: string;
  widthPx: number;
  heightPx: number;
  widthMm: number;
  heightMm: number;
  copies: number;
  crop?: CropRegion;
  adjustments?: PhotoAdjustments;
  layers?: DesignLayer[];
  frame?: FramePreset;
  rotation?: number;
  backdropColor?: string;
  backdropUrl?: string;
}
```

### 2. `src/domain/models/sheet.ts`
```typescript
export interface SheetPage {
  pageNumber: number;
  placements: Placement[];
  cutLines?: CutLine[];
  notepadCutLines?: NotepadCutLine[];
}

export interface Placement {
  assetId: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotationDeg: number;
  slotIndex?: number;
  itemNumber?: string;
}
```

### 3. `src/domain/models/project.ts`
```typescript
export interface StoredProject {
  id: string;
  name: string;
  revisionToken: string;
  updatedAt: number;
  assets: StoredAsset[];
  settings: ProjectSettings;
}
```

### 4. `src/domain/models/printMode.ts`
```typescript
export type PrintModeId = "normal" | "notepad" | "ticket" | "rush-id" | "sticker" | "card";

export interface PrintModeConfig {
  mode: PrintModeId;
  assignmentRule: "cycle" | "selected" | "first" | "slots";
  quantityBasis: "total" | "per-design";
  selectedAssetIds: string[];
  slotAssignments: Record<number, string>;
  ticketNumbering?: TicketNumberingOptions;
  notepadPreset?: string;
}
```

---

## Code Layout

```
src/
├── main.tsx
├── App.tsx
├── styles.css
├── app/
│   ├── shell/ (AppShell, AppHeader, AppSidebar)
│   ├── navigation/ (appNavigation)
│   └── controllers/ (WorkspaceController, useActiveSession)
├── domain/
│   ├── models/ (asset, sheet, crop, layers, frames, printMode, project, workflow, preferences)
│   ├── geometry/ (dimensions, units, cutMarks, pdfTileGeometry, paperPickerGeometry, brushDirtyRect, textLayout)
│   └── validation/ (assetIntegrity, safeNumbers, printPreflight, calibration)
├── features/
│   ├── photo-editor/ (components, hooks, logic)
│   ├── id-photo-studio/ (components, logic)
│   ├── crop/ (components, hooks, logic)
│   ├── background-removal/ (components, logic)
│   ├── frames/ (components, logic)
│   ├── layers/ (components, logic)
│   ├── sheet-composer/ (components, logic)
│   ├── print-modes/ (components, logic)
│   ├── paper-sizes/ (components, logic)
│   ├── exports/ (components, logic)
│   ├── projects/ (components, storage, recovery, workflows)
│   └── preferences/ (components, logic)
├── platform/
│   ├── storage/ (durableBlobs, photoBlobRegistry, referencedAssets, zip)
│   ├── rendering/ (imageRaster, highResRaster, photoPixels, previewCache, dpi)
│   ├── workers/ (photoPreview.worker.ts)
│   ├── fonts/ (fontAssets, bundledFonts, bundledFontCoverage)
│   └── offline/ (service worker client)
└── shared/
    ├── components/ (StudioSelect, StudioIcon, BoundedNumberField, DimensionField, etc.)
    ├── hooks/ (useEditorHistory, usePreviewViewport)
    ├── utils/ (history, editorHistory, workspaceEpoch, latestRequest)
    └── styles/ (tokens.css, controls.css)
```
