# Dependency reproducibility and supply-chain acceptance

**Status:** P1 OPEN as of 24 October 2026 · [GitHub issue #78](https://github.com/ariz31/prints/issues/78). This is an explicitly recorded **unresolved release risk**, not a claim that dependencies have been locked, audited or certified.

## Verified current state

- The root `package.json` contains semver dependency ranges (including React, Lucide, TypeScript and Vite).
- The repository currently has **no committed `package-lock.json`**, `npm-shrinkwrap.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock` or other reproducible resolved dependency tree.
- The Vercel project currently uses `npm install` rather than a lock-enforced `npm ci`. A READY build validates the dependency tree resolved for that build, **not** that a later clone or build will select identical transitive versions.
- There is no evidence in this audit of a full dependency-license review, complete npm vulnerability audit or cryptographic integrity verification for the installed tree.
- **Do not invent a lockfile or its `integrity` hashes.** They must come from a real package manager/registry resolution.

## Required remediation procedure (networked Node 22+ machine)

1. Check out the intended `main` SHA in a networked development/build environment. Use one approved npm version, record `node --version`, `npm --version`, architecture and date in the remediation PR.
2. From the repository root, run `npm install --package-lock-only --ignore-scripts` (or a regular reviewed `npm install` when post-install scripts are required and trusted). Inspect the real generated lockfile; it must record the complete version/resolution/integrity graph. Commit **only the actual generated file**, do not copy checksums from unrelated packages.
3. Clean the workspace and run `npm ci`. Check `git diff --exit-code -- package-lock.json package.json` after the install. If npm scripts run, audit their necessity and security.
4. Run `npm audit --omit=dev --json` and `npm audit --json`; document findings and triage production and build-chain advisories separately. Review license/provenance for high-risk packages and any CDN/WASM/model resources, which are **not covered** by an npm lockfile.
5. Introduce `npm ci` for the Vercel install command **only after** the committed lockfile exists, is validated and rebuilds succeed. Add a release check that fails on lockfile absence or manifest/lockfile drift.
6. Run the exact-head Vercel preview `npm run build`, confirm a clean PR merge, then verify **production READY on the merged SHA** and record dependency-tree evidence for that same deployment.
7. Update this page, [Quality](QUALITY.md), [Vercel](VERCEL.md), [Current state](CURRENT_STATE_2026-10-24.md), [README](../README.md) and [release acceptance](RELEASE_ACCEPTANCE_2026-10-23.md), then close issue #78 **only after** required evidence is present.

## Acceptance criteria

A clean clone on the documented Node/npm pair yields the same dependency tree with `npm ci`, without regenerating the committed lock. Both dependency audits and license checks have recorded outcomes and remediation rationale. The source commit matches Vercel's installed tree and passes all existing 300/600-DPI, source recovery, storage/ZIP, PWA and UI tests. Optional model download CDN/license integrity is a separate external-asset concern and remains unverified until that evidence is documented.

**Responsible boundary:** If no networked package-manager/registry execution is available, leave issue #78 open. No synthetic lockfile should be submitted merely to turn a badge green.
