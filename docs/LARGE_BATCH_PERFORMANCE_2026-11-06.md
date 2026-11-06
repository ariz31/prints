# PRINTS — large-batch performance remediation

Baseline: `main` at `040ff49258d35ed8428871f9f4daaa318c8d61e2`. Reported symptom: noticeably degraded responsiveness above approximately 60 copies. **The 60-copy number is a reported reproduction threshold, not an application limit.**

## Implemented in this PR (first safe increment)

- Replaced full-page polygon-collision scans with the existing `UniformSpatialGrid2D` broad-phase lookup. Final collision decisions still use the same exact polygon geometry and clearance logic.
- Cached placed contour polygons and running sheet contour area for each layout job. Entries are scoped to a computation and released after its completion.
- For a job containing a single repeated shaped design with at least 60 copies, generate a deterministic first-sheet template and reuse physical positions on later sheets, assigning new sequential copy indices.
- Reduced repeated per-copy preview lookups and layer filtering, and computed CSS clip-paths once per unique design on each render.
- Corrected the sheet-preview memo comparator to notice changed notepad-cut coordinates even when the line count is unchanged.
- Added deterministic 61/100-copy shaped-layout and multi-sheet copy-index regression tests.

## Third-pass measured verification (2026-11-06)

Controlled, two-vCPU Vercel sandbox, Node 24.22.1, identical benchmark inputs
and hardware; median of five warm executions. Values are geometry computation
only and **not** claims about Android frame rate, PDF speed, or system memory.

| Layout workload | Base main `040ff492` | PR `066ac4da` | Reduction |
| --- | ---: | ---: | ---: |
| 100 identical hexagonal copies | 890.370 ms | 36.870 ms | 95.9% |
| 200 identical hexagonal copies | 5777.268 ms | 47.144 ms | 99.2% |
| 100 mixed star/triangle copies | 1278.915 ms | 51.541 ms | 96.0% |
| 100 identical fixed-orientation rectangular copies | 0.548 ms | 0.023 ms | 95.8% |

A separate **exact-equivalence** exercise compared JSON placement records from the
same 13 fixtures (871 total copies) against original main. Full page groupings,
coordinates, rotations, source IDs, and copy indices were byte-for-byte identical.
The new per-design/per-orientation candidate cursor safely skips search positions
that cannot become valid in an insertion-only packing process. Frame-bounded drag
updates also reduce unneeded React work for dense previews.

Run `npm run benchmark:large-batches` to repeat the CPU-only performance profile.

## Not yet implemented

- Measurement on representative physical Android devices and desktop browser.
- Worker-based sheet composition and interruptible layout work.
- High-density composited preview with fully accessible and accurate copy hit-testing.
- Background PDF export with quantified memory budgets and safe cancellation.
- Physical-device interaction/painting and export profiling remain outstanding; the Vercel production build and automated tests have passed for earlier PR heads, and must be repeated at the final head.

These are separate high-risk architectural changes; they must not be represented as completed by the first increment.

## Benchmark and acceptance matrix

Run equivalent test assets and exact settings at copy counts 1, 30, 60, 61, 100, 200, and (where supported) 500/1000. Distinguish total job copies from visible copies on a single sheet. Compare rectangle versus shaped layouts, one versus multiple designs, PDF export at 300/600 DPI, and cold/warm caches. Record median and p95 timing, interaction blocking time, memory use, export duration, device specification, and browser version.

Before claiming a performance improvement, compare baseline main and this branch on identical inputs and hardware. A useful proposed target is a >=50% improvement in the dominant measured bottleneck and p95 UI responsiveness <100 ms on a defined reference device. These are targets, **not measured outcomes**.

## Correctness and release gates

- Unit and integration tests: `npm run test`.
- Type correctness: `npm run typecheck`.
- Production build: `npm run build`.
- No E2E or newly required GitHub Actions workflow.
- Assert exact copy count, stable `itemId`/`copyIndex`, deterministic order, no geometry overlap, physical page bounds, expected margin and cut-line clearance, and serial numbering.
- Compare baseline/branch PDF page count, physical media sizes, image fidelity, export DPI, lettering, and cut marks.
- Inspect cache lifetime, source-image URL ownership, and regressions after mode switching or project reload.
- Independent reviewer must resolve P0/P1 findings before merge.

**Status:** geometry benchmarks and exact-placement equivalence verified in a sandbox. Final-head build, independent code review, and Android device responsiveness must be checked before release.
