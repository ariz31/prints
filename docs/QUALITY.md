# PRINTS — quality policy, test matrix and release criteria

**Updated 24 October 2026.** See [current audit handbook](CURRENT_STATE_2026-10-24.md) for implementation status and [acceptance ledger](RELEASE_ACCEPTANCE_2026-10-23.md) for manual proof requirements.

## Non-negotiable invariants

1. **Physical coordinates:** all printable items fit validated paper bounds/margins without unintended overlap; quantities are conserved and paper positions use mm → 72-point/in PDF transforms consistently.
2. **Image integrity:** original bytes remain intact; processed assets use explicit metadata; crop framing and rotation match output, including processed-to-original restoration.
3. **Object URL ownership:** current assets, undo/redo history and in-flight imports retain their referenced URLs. Never revoke live sources, silently change export inputs or leak generated preview URLs.
4. **Preview readiness:** disable applying photo edits until the current visible source (and any required computed edit preview) has decoded. Treat original fallback as preview-only until explicit repair.
5. **Failure isolation:** one corrupt photo/failed thumbnail must not prevent other assets from being previewed, saved or exported when independently valid.
6. **Async invalidation:** source replacement, undo/redo and project navigation cancel or fence stale Auto Enhance, preview, save and recovery operations.
7. **Data safety:** validate archive formats, MIME signatures, filename boundaries, dimensions, quotas and checksums. A ZIP or IndexedDB entry is not a cloud backup.
8. **Privacy:** no mandatory account or customer photo uploads; optional external AI assets require consent and accurate disclosure.
9. **Accessibility and interaction:** reachable keyboard controls, visible selection state, readable error/recovery flows and independent scrolling for mobile editors.
10. **Truthfulness:** field acceptance is not inferred from passing Node or Vercel tests.

## Automated gate

Run `npm install`, `npm test`, `npm run typecheck` and `npm run build` using Node 22+. Vercel uses `npm run build`, which checks branding, all `src/core/*.test.ts` tests, strict TS, Vite build, generated offline cache, assets and UI/offline smoke tests. No GitHub Actions should be added without an explicit product decision.

Tests cover: print geometry and pagination; rotations and PDF tile mapping; PNG physical resolution metadata; sparse/large ZIP and signature checks; recovery and revisions; image URL history and pending imports; thumbnail queue error isolation; Photo Studio neutral/bounded edits, preview source restoration and source-invalidation guards; local font/opacity output; safe zero/empty inputs.

SSR smoke tests check structure and state exposure. They do **not** exercise image decoding, Web APIs, actual pointer events or printed outcomes.

## Manual field matrix (still pending independent certification)

| Test | Required evidence |
| --- | --- |
| Android Chrome and iOS Safari | 1×1 and 2×2 input/edit/reopen, fixed photo preview, independent scroll, crop gestures, local retouch, browser Back, saved recovery, failure/Retry |
| Representative images | JPG/PNG/WebP, transparent/opaque, large portrait/landscape, processed source unavailable, corrupted image in a mixed batch, output pixel/alpha comparison |
| A3/600 DPI | Per-device peak RAM, elapsed time, user-facing cancel/progress, ZIP and PDF correct output after multiple runs |
| Storage recovery | IndexedDB quota, private mode, site-data deletion, tab crash, duplicate saves, ZIP import/export on a second device |
| Typography | Licensed local TTF/OTF, accented/non-Latin/unsupported characters, PDF extraction and glyph raster comparison |
| Optional AI | Consent and provider telemetry, model checksum/license proof, cold/warm/offline after cache, CSP and difficult hair/multiple-person masks |
| Physical printers | 100% scale, measured 100 mm ruler / 50.8 mm square, ID and A3 rotated designs, margins/trim, printer/ink/media color variability |

Keep evidence for failures in an issue or PR with browser/device, fixture dimensions, selected editor mode, expected/actual pixels and precise reproduction steps. Do not upload personal source photographs without permission.

## Merge policy

Review changed-file diffs and adjacent consumers, remediate correctness bugs, run exact-head Vercel gates and verify clean GitHub mergeability. Merge only when automated checks succeed, then confirm production READY for the actual merged SHA. Open remaining manual-acceptance issues until the operator records physical/browser evidence; do not assign a numerical quality score as a substitute for tests.
