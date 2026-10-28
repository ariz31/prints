# Contributing to PRINTS

## Development principles
- Keep editor and PDF/export logic separated from deterministic, unit-testable geometry.
- TypeScript strict mode; validate user-controlled numbers before constructing layouts.
- Prefer nondestructive operations and durable, versioned schema design.
- Support offline processing without customer-photo uploads.
- Clearly distinguish implemented features from roadmap-only concepts.
- Keep feature changes scoped, documented and covered by regression tests.
- Use physical millimeter measurements for print calculations.
- Use semantic workflow operations, never fragile event-coordinate recording.

## Local commands
Run npm ci, then npm run dev. The complete verification gate is `npm run build` (unit tests, TypeScript, Vite, generated service-worker assets, output check); Vercel executes it for previews and production. GitHub Actions has intentionally been removed; do not add workflow files without an explicit user request.

## Review checklist
- Does a feature meet the stated user's workflow?
- Are PDF dimensions and preview in agreement?
- Does it fail clearly on bad input?
- Is the original image preserved?
- Does the change avoid introducing an unannounced server dependency?
- Are necessary documentation and tests updated?


## Reproducible dependencies and browser tests

Commit npm-generated lock changes with their manifest; do not hand-author integrity values. Run `npm ci`, the complete build and `npm run test:browser:ci` on Vercel. Review screenshots before committing baselines. See [the dependency record](docs/DEPENDENCY_REPRODUCIBILITY.md) and [workspace acceptance](docs/WORKSPACE_REDESIGN_2026-10-28.md). Do not waive failed browser tests or treat real-device/print work as passed.

## Current-state documentation discipline (2026-10-24)

Use [the current implementation/audit handbook](docs/CURRENT_STATE_2026-10-24.md) as the maintained index. When features change, update the relevant Product/Requirements/Architecture/Quality/Privacy/Workflows/Deployment/Release acceptance pages and archive superseded assertions as historical. Do not claim a closed issue, real-device pass or exact printer fidelity without evidence.

## PR and release verification checklist

Before merge, review all source and downstream export/storage consumers, protect active/undo/pending image URLs, isolate individual image failures, cancel stale async tasks on source changes, and verify fallback crop/actual output consistency. Run the **exact PR commit** through Vercel `npm run build` and compare its head SHA with GitHub; then independently verify merged SHA and production READY. UI SSR smoke checks are not browser touch tests. Preserve manual release items for Android/iOS, storage quota, optional AI provenance and a measured physical print.
