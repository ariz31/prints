# PRINTS — Vercel deployment and production verification

**Updated 24 October 2026.** [Release/current-state handbook](CURRENT_STATE_2026-10-24.md).

## Project configuration

- GitHub: `ariz31/prints`, default branch `main`.
- Vercel project: `prints`, team `arizs-projects-65ffe174`.
- Deployment URL: https://prints-rho.vercel.app .
- Framework: Vite, source: repository root, Node 22+, `npm install`, `npm run build`, output `dist`.
- `vercel.json` declares the static SPA fallback, SW/cache headers and output conventions. Use the existing Git-connected project; never create a duplicate.
- GitHub Actions are intentionally disabled; deployment validation belongs to Vercel builds.

## Required checks for every PR

1. Confirm the branch starts from the latest compatible main and inspect the complete diff, including archive, PDF, editor, local storage and offline consumers.
2. Open PR; record the exact **head SHA**.
3. Inspect the Vercel preview corresponding to that SHA. `npm run build` runs brand generation check → Node unit/integration tests → `tsc --noEmit` → Vite compilation → revisioned service-worker build → dist output verification → UI SSR smoke → SW/offline smoke.
4. If any code changes, repeat for the **new** head commit. A previous green deployment cannot approve a newer revision.
5. Check GitHub mergeability and branch protection; do not bypass an incompatible merge.
6. Merge the validated revision; confirm production Vercel deployment is **READY** and its Git commit SHA equals the merged `main` SHA. Verify the public alias independently; an authenticated preview may not be publicly accessible.

## Unresolved install reproducibility

**Issue #78 is open.** No root lockfile is committed, and the recorded Vercel install command remains `npm install`. This is **not a deterministic dependency install** even when the exact source commit's automated tests pass. A dedicated networked PR must generate and commit a genuine lockfile, run production/full development dependency audits and license review, then change install to `npm ci` and verify fresh preview/production builds. See [dependency reproducibility](DEPENDENCY_REPRODUCIBILITY.md). Do not switch to `npm ci` until the lock is generated and committed.

## Service worker and local privacy

`public/sw.js` is an offline template. `scripts/build-sw.mjs` fingerprints final HTML/hashed bundles to produce a versioned precache. Navigation uses a network-first strategy with cached shell fallback; static hashed assets are cache-first. The SW does **not** cache customer photos; these live in user-owned browser Blobs and IndexedDB.

New deployments may require refresh/close-and-reopen to replace an old controlled PWA shell. Origin isolation applies: a user opening a different Vercel alias has a different IndexedDB, not the main site's projects. Browser cache/site-data clearing can remove all local projects; export portable backups regularly.

Optional MediaPipe person segmentation is already present behind opt-in consent, unlike the original deployment scaffold. Its external runtime/model files may be cached where supported, but publisher-verified digest/license evidence and real offline-after-cache acceptance are not yet completed. The rest of the core editor should remain usable without AI.

## Production smoke and incident response

- Load the exact production origin over HTTPS and check assets, manifest and service-worker MIME.
- Import multiple JPG/PNG/WebP images; edit, crop, save, reopen, undo/redo, create a backup and export a small PDF. Exercise a corrupted source and a failed processed image; other thumbnails must remain usable and a fallback cannot silently change printable output.
- Measure PDF page boxes programmatically; physical output must separately be printed at **Actual Size / 100%** and checked with [calibration](PRINT_CALIBRATION.md).
- If a customer sees a blank image, capture filename/format/dimensions, failed editor/preview mode, reproduction steps, Retry behavior, whether the thumbnail also fails, browser version and errors. Do not infer that Vercel READY guarantees image decode.
- Review the [release acceptance ledger](RELEASE_ACCEPTANCE_2026-10-23.md) for mobile, high-DPI, typography, optional AI and print requirements.

No production secret, hosted photo backend or mandatory cloud account is required for the static application. CDN/model endpoints remain a separately disclosed optional dependency.
