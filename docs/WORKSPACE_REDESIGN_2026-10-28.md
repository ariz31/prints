# PRINTS workspace redesign — implementation and acceptance

Repository: `ariz31/prints`. Baseline: `d4eaa3bf490419195889c0613f809c2a306c7905`.

## Implemented contracts

- Crop, Frames & text, Background and Smart ID use one bounded `100dvh` workspace with an independently scrolling inspector. Portrait phones split the available height; landscape phones use side-by-side regions. Safe-area insets, keyboard focus and browser accessibility zoom remain available. The sheet remains visible when mobile Print or Images properties are open.
- Metadata editors keep local, bounded draft histories. Apply records one workspace change; Cancel and browser Back discard the draft. Text input keeps native undo. Layer drags commit once on release; canceled pointer capture discards the drag. Background mask history is capped at 40 MiB, in addition to the source and current mask buffers.
- Crop pinch distances use actual CSS pixels, including rectangular viewports. Photo Studio pinch points are relative to its stage, and viewport resize clamps presentation pan. Ctrl/Cmd-wheel is left to browser zoom. Fit, reset, zoom and source-position fields do not change physical output dimensions.
- Crop and ID approval use the shared export rasterizer with bounded preview resolution, including orientation, pixel adjustments and alpha. Stale previews are fenced; Apply waits for the current raster to decode.
- All 30 frames remain available in five galleries, six at a time. Inline HEX, palettes, session/persisted saved colors and alpha avoid a blocking native color picker. Optional inset (0–20% of the shorter design side) and motif spacing (50–200%) use shared SVG/Canvas/PDF geometry. Defaults reproduce previous frames exactly. Spacing applies to repeated motifs; corner-only designs have no repeated edge motif.
- Layers support direct selection, multiple selection, temporary selection bounds, persistent edit groups, bounded group movement/proportional resizing, alignment and edge/center snapping. Alt bypasses snapping. A group changes editing behavior only; stored print-local coordinates remain authoritative.
- Arrange copies exposes the printable margin, live mm measurements, numerical positions and safe photo-only quarter-turns. Invalid overlaps and out-of-margin moves fail without modifying the saved arrangement. Rotation persists through later moves and backups. Adding visible overlays resets incompatible manual placement.
- One export dialog contains PDF/PNG/ZIP, quality, target design/pages, preflight, progress and cancellation. PNG streaming yields between stripes and checks cancellation within a large design. Canvas and source decoder resources are released on normal and exceptional paths. Active workspace changes cancel output work.
- Editors load on demand. No photo processing service, paid API, runtime browser dependency or GitHub Actions was added. Chromium and Playwright are development/build QA dependencies only.

## Compatibility and reproducibility

Original bytes, normalized crops, mm print geometry, legacy project schemas and v1/v2 JSON plus v3 ZIP import remain in use. New frame options, layer grouping and placement rotation are optional fields; legacy records retain their previous defaults. Persistence/round-trip tests include the new frame fields and group metadata.

A real npm v3 lockfile was generated with Node 24.22.1 and npm 11.9.0. `packageManager` records npm 11.9.0. Vercel installs with `npm ci --ignore-scripts`. A build check rejects missing locks, direct manifest drift, missing integrity values and unexpected registry sources. `docs/DEPENDENCY_INVENTORY.json` records versions and declared licenses. The full and production-only npm audits reported zero known advisories at the recorded resolution. This is not a warranty against undisclosed vulnerabilities or a legal opinion on licensing.

## Verification record

- Baseline full build passed before editing (264 tests).
- Candidate pure/unit/integration suite: 274 passing before the final review; rerun and exact-head results belong in the PR.
- Strict application TypeScript, browser-test TypeScript, Vite, branding, built assets, SSR UI and offline/service-worker checks are required.
- Browser tests cover 390×844 portrait, 844×390 landscape, 768×1024 tablet, 1440×900 desktop and 320×568 narrow screens, draft transactions, 30-frame navigation, overflow, independent scrolling, accessibility, and actual PDF/PNG dimensions. Chromium execution failed in this restricted local executor before a page launched. It is **not recorded as a browser pass**. The Vercel build runs the browser suite; failed tests must block merge.
- Initial screenshots are evidence captures. They become regression baselines only after review and committing the approved images. A capture alone is not a visual comparison pass.
- Initial JavaScript decreased from approximately 480 KB to 424 KB before compression. Fonts/PDF resources remain separately loaded and cached for offline use.

## Release gate and scoring

Keep the PR unmerged until the exact final head has successful Vercel build and browser evidence, clean mergeability, no unresolved critical findings and reviewed screenshots. Verify production on the resulting merged SHA separately. A numerical ≥97/100 score is **not assigned while required evidence is missing**. Passing source tests alone does not establish that score.

Real Android Chrome/iOS Safari input, orientation, backgrounding and accessibility-zoom behavior; representative-device A3/600-DPI peak memory; quota/eviction and interrupted recovery; optional AI model provenance/quality/offline behavior; complex font shaping; and measured physical printer/color proofs remain independent acceptance work. No real-device or physical-print pass is claimed. Existing acceptance issues remain open until their evidence is supplied.
