# PRINTS — production acceptance ledger (opened October 23; reviewed October 24, 2026)

Repository: `ariz31/prints`. The code in `main` includes the feature implementations and audit hardening, including pending-import Blob ownership and Source Retry/Restore Original in Photo Studio. **Automated readiness is not equivalent to complete manual acceptance.** The live, maintained [current-state audit handbook](CURRENT_STATE_2026-10-24.md) records source-level remediations, remaining issues and release procedure. This dated issue ledger is a release acceptance record, not a proof of field certification.

| Issue | Merged functional scope | Outstanding / acceptance |
| --- | --- | --- |
| [#32 Advanced Photo Studio](https://github.com/ariz31/prints/issues/32) | Nondestructive light/color/detail, color presets, retouch, save/undo, fixed crop, source-lifetime recovery, #69 tile spot-heal parity | Real-browser JPEG/PNG/WebP color/crop golden-pixel suite; Android/iOS/desktop gestures and memory tests; printed proof |
| [#48 High-resolution export](https://github.com/ariz31/prints/issues/48) | Exact 300/600 DPI A3 image tiles; streamed PNG pHYs; rotated PDF alignment; PDF progress and safe cancellation (#65); bounded high-DPI spot-heal support (#69) | Per-device A3 600-DPI memory and time; PDF tile peak heap remains limited by pdf-lib retaining embedded resources; print proof and independent rendered PDF/PNG golden images |
| [#49 Smart ID Studio](https://github.com/ariz31/prints/issues/49) | User-reviewed 1×1, 2×2, 35×45 mm and custom 10–200 mm sizes (#67); independent variants, native local FaceDetector if available, manual fallback, headroom and transparent-area backgrounds | Cross-browser eye landmarks and leveling; source-aware manual adjustment within Studio; standards-specific presets only with authority; user/device tests and measured prints |
| [#50 Optimized packing](https://github.com/ariz31/prints/issues/50) | Deterministic bounded MaxRects mixed sizes, safe 90° photo rotation, shelf fallback, exact PDF orientation (#62), project persistence | Real-paper rotation, margin and cut guide proof; issue already closed in GitHub |
| [#51 Advanced text](https://github.com/ariz31/prints/issues/51) | Local TTF/OTF embedding, alignment, line height, vector PDF, outlines/shadows and preview/PNG/PDF layer opacity (#66) | Complex Unicode shaping/bidi and fallback; letter spacing/font styles and weight; independent PDF renderer/font-glyph golden tests |
| [#52 Project recovery](https://github.com/ariz31/prints/issues/52) | Named projects, untitled draft recovery, portable ZIP up to documented budget, SHA-256/CRC, media signature and local ZIP structure validation (#64) | Real interrupted/cross-tab/quota/crash testing and high-volume cross-device import; do not claim cloud backup or guaranteed eviction resistance |
| [#53 Optional AI background](https://github.com/ariz31/prints/issues/53) | Consent-gated MediaPipe local person masks, threshold/softness, manual brush correction, transparent/solid colors, user-supplied local image backgrounds with Cover/Contain and position (#72), cache asset format checks (#68) | Publisher-approved SHA-256 pins & license evidence, actual CDN/browser/CSP success, hair-edge output and offline-after-cache quality/performance |

## Build supply-chain acceptance — new P1 issue #78

The October 24 review identified that PRINTS still uses semver ranges with no root committed npm lockfile. Green Vercel deploys do not prove dependency-tree reproducibility. Record the npm version, a real generated lock, clean `npm ci` rebuild, production/full development `npm audit` results and license review before closing [#78](https://github.com/ariz31/prints/issues/78). [Detailed remediation runbook](DEPENDENCY_REPRODUCIBILITY.md). The absence of this proof must be distinguished from the already passing code/geometry tests.

## Automated verification

Historic evidence: the exact-head Vercel preview for PR #69 passed 210/210 unit/integration tests. **Do not reuse that count for the latest commit.** Every changed PR head and the final merge must be checked independently on Vercel (Node tests, TypeScript, bundle, UI/SSR and offline integrity), with the actual SHA and results recorded in the PR. GitHub Actions remain intentionally disabled.

## Required operator field tests before closing open issues

- **Printing:** 100% Actual Size, measured 1×1/2×2/custom ID dimensions and A3 paper margins, repeated layout including rotation, physical color differences with real ink/paper/driver configuration.
- **Mobile:** Android Chrome / iOS Safari; fixed crop, touch/Back, memory use for repeated 600-DPI A3 exports, PDF cancel, source-photo restoration, offline cache warm-up and update.
- **Recovery:** >48 MiB ZIP round-trip from Android to desktop and back; simulate interrupted import, blocked storage, quota exhaustion, tab races, browser restart and site-data eviction.
- **Typography:** user-supplied licensed TTF/OTF, accented Latin names, symbols, non-Latin samples and unsupported glyph fallback; PDF extraction and independent glyph raster comparison.
- **AI:** document precise executable/model license and SHA-256 pins; consent/telemetry/CSP checks; cached/offline model startup, multiple/no subjects, glasses, hair and transparency halos on several devices; assess main-thread CPU stalls.

Keep remaining issues **open** until their required tests are documented. Do not represent code merge or Vercel readiness as physical acceptance.


## Final 24 October integrity audit additions

- Photo Studio invalidates pending Auto Enhance, stale preview and unsaved draft when the selected source changes, including processed-to-original restoration on a still-mounted editor.
- An original fallback's normalized crop must match the exact geometry persisted by explicit Restore Original; it cannot reuse an incompatible processed-image crop.
- Image previews are fault-isolated: one corrupt/undecodable source should not prevent later photos from generating thumbnails; canceled workspace generations must not publish stale errors.
- Pending-import URLs, history-owned images, preview Blob URLs and processed/original state must remain consistent. SSR and Node tests verify logical contracts, but do not decode the reported customer photo in Android Chrome.
- Before closing issue #32, record device/real-browser proof for this image error and recovered print/crop parity. Other issue-specific physical, quota, AI and typography gates above remain pending.

For operator signoff use the documentation and exact revision requirements in [Current state](CURRENT_STATE_2026-10-24.md).


## Production-critical codebase audit (2026-10-24)

See [the codebase audit](CODEBASE_AUDIT_2026-10-24.md) for reproducible fixes PRs #73–#77, the separately merged PR #79 and open dependency reproducibility issue #78. Independent browser and printer release gates are not closed.

## Continued edge-case audit evidence — October 24

Code regressions were added for retention ordering by save time across distinct untitled drafts, workflow aggregate copy and printable geometry validation, and processed-image attachment consistency in portable JSON/ZIP backup formats. These checks are automated. **Field acceptance remains open:** verify recovery after crash/eviction and cross-tab races, real Android/iOS photo editing, printed copy counts/layout, and backup transfer on a second device. Refer to [codebase audit](CODEBASE_AUDIT_2026-10-24.md) for precise scope and keep #78 and relevant feature acceptance issues open without unsupported closure.
