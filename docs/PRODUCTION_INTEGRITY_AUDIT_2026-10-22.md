# PRINTS production integrity audit — 2026-10-22

## Scope and baseline
Repository `ariz31/prints`, inspected against `main` at `cc21252bfef8097610de0331ec65cab9c9239ee6` and the recovery PR head. The reviewed risk surfaces include `src/App.tsx`, photo raster/retouch, PDF/PNG/ZIP export, physical geometry and preflight, crop and layers, IndexedDB stores and revision coordination, portable project archives, workflows, Vite/PWA build and offline caching, and Vercel deployment configuration. The codebase is a client-only, local-first app without server-side user-photo processing or React Server Components.

## Findings and mitigations

| Finding | Severity | Remediation | Evidence |
| --- | --- | --- | --- |
| Async image import, deletion, and restore could publish after an unrelated edit or project switch | Critical — possible workspace state loss | Generation fencing; stale operations abort, imported image limits are checked at commit, undo/redo advances generation | PR #37; `workspaceEpoch.test.ts` |
| Simultaneous deletion/import work could replace edits from another async operation | Critical — possible resurrection/loss in workspace | Commit from live state after fence checks; serialize outcomes with monotonic workspace generation | PR #37 |
| Trash IDs could be reused and overwrite an older recovery snapshot | High — recovery data loss | Unique immutable deletion IDs; regression coverage | PR #37; `recovery.test.ts` |
| Stale manual Save completion could incorrectly rebind a different active workspace | High — incorrect project association | Check editor generation again after asynchronous save and before UI binding | PR #37 |
| Deletion restore could accept incomplete blob metadata, and transaction errors/DB upgrades had narrow handling | High — recovery/open failures | Validate recovery Blob/dimension fields; handle synchronous IndexedDB transaction failures and `versionchange` | PR #37; `recoveryMigration.test.ts` |
| Large print products could be downsampled below 300 DPI without an explicit warning | High — print quality/fidelity | Preflight compares actual output pixel dimensions and informs users of effective output DPI | PR #39 |
| Vite 6 dependency floor allowed versions with recently patched dev-server filesystem advisories | High for network-exposed development servers; not established as a production exploit | Minimum Vite 6.4.5 and installed-version build check | PR #40 |

## Controls retained
- Browser-only image data handling; no mandatory cloud user-photo storage.
- Original-source preservation, source dimension caps and bounded PNG/PDF/ZIP allocations.
- Atomic, revision-aware IndexedDB project saves and project deletion; preservation of original Blobs.
- Exact-mm layout, overlap/margin validation, deterministic crop rasterization for previews and output.
- 50-step bounded history, typed workflows, portable project archive validation, offline hashed-asset caches.
- Vercel `npm run build` executes Node regression tests, typecheck, bundling, SSR UI checks and offline/service-worker smoke checks; no GitHub Actions.

## Verification caveats and remaining follow-ups
- Vercel builds and fake-IndexedDB tests validate repository logic, not full real-browser interaction. Touch devices, persistent storage quota behavior on actual browsers, cross-browser restore-after-restart, and physical printer/color checks still require manual testing.
- Newly created unsaved drafts are not automatically persisted until initially saved; this remains an explicit product limitation, not silently presented as a fixed bug.
- A3 rendering retains conservative memory limits. PR #39 reports the resulting quality honestly; full 300-DPI large-sheet exports would require a separately engineered tiled/streamed renderer and memory-budget validation.
- Browser-local recovery is not a durable off-device backup and cannot survive site data clearing or browser eviction.
- Review Vercel exact-head build and GitHub mergeability again if `main` advances. No universal claim that all undiscovered defects are absent is made.

## Audit disposition
Known, reproducible high-consequence issues above have focused remediation with regression coverage. Passing builds establish code-level readiness; physical print and device-specific acceptance remain distinct release gates.
