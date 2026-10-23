# PRINTS — production acceptance ledger (October 23, 2026)

Repository: `ariz31/prints`. The code in `main` contains implementations for the six feature issues and Advanced Photo Studio, with supplementary remediation PRs. **Automated readiness is not equivalent to complete manual acceptance.**

| Issue | Merged functional scope | Outstanding / acceptance |
| --- | --- | --- |
| [#32 Advanced Photo Studio](https://github.com/ariz31/prints/issues/32) | Nondestructive light/color/detail, color presets, retouch, save/undo, fixed crop, source-lifetime recovery, #69 tile spot-heal parity | Real-browser JPEG/PNG/WebP color/crop golden-pixel suite; Android/iOS/desktop gestures and memory tests; printed proof |
| [#48 High-resolution export](https://github.com/ariz31/prints/issues/48) | Exact 300/600 DPI A3 image tiles; streamed PNG pHYs; rotated PDF alignment; PDF progress and safe cancellation (#65); bounded high-DPI spot-heal support (#69) | Per-device A3 600-DPI memory and time; PDF tile peak heap remains limited by pdf-lib retaining embedded resources; print proof and independent rendered PDF/PNG golden images |
| [#49 Smart ID Studio](https://github.com/ariz31/prints/issues/49) | User-reviewed 1×1, 2×2, 35×45 mm and custom 10–200 mm sizes (#67); independent variants, native local FaceDetector if available, manual fallback, headroom and transparent-area backgrounds | Cross-browser eye landmarks and leveling; source-aware manual adjustment within Studio; standards-specific presets only with authority; user/device tests and measured prints |
| [#50 Optimized packing](https://github.com/ariz31/prints/issues/50) | Deterministic bounded MaxRects mixed sizes, safe 90° photo rotation, shelf fallback, exact PDF orientation (#62), project persistence | Real-paper rotation, margin and cut guide proof; issue already closed in GitHub |
| [#51 Advanced text](https://github.com/ariz31/prints/issues/51) | Local TTF/OTF embedding, alignment, line height, vector PDF, outlines/shadows and preview/PNG/PDF layer opacity (#66) | Complex Unicode shaping/bidi and fallback; letter spacing/font styles and weight; independent PDF renderer/font-glyph golden tests |
| [#52 Project recovery](https://github.com/ariz31/prints/issues/52) | Named projects, untitled draft recovery, portable ZIP up to documented budget, SHA-256/CRC, media signature and local ZIP structure validation (#64) | Real interrupted/cross-tab/quota/crash testing and high-volume cross-device import; do not claim cloud backup or guaranteed eviction resistance |
| [#53 Optional AI background](https://github.com/ariz31/prints/issues/53) | Consent-gated MediaPipe local person masks, threshold/softness, manual brush correction, transparent/solid colors, cache asset format checks (#68) | Publisher-approved SHA-256 pins & license evidence, actual CDN/browser/CSP success, user-image background replacement, hair-edge output and offline-after-cache quality/performance |

## Automated verification

The exact-head Vercel preview on merged PR #69 passed **210/210 unit/integration tests**, strict TypeScript, production bundling, UI/SSR and PWA/offline-asset smoke checks. Final `main` must independently report READY following this documentation PR. GitHub Actions intentionally remain disabled.

## Required operator field tests before closing open issues

- **Printing:** 100% Actual Size, measured 1×1/2×2/custom ID dimensions and A3 paper margins, repeated layout including rotation, physical color differences with real ink/paper/driver configuration.
- **Mobile:** Android Chrome / iOS Safari; fixed crop, touch/Back, memory use for repeated 600-DPI A3 exports, PDF cancel, source-photo restoration, offline cache warm-up and update.
- **Recovery:** >48 MiB ZIP round-trip from Android to desktop and back; simulate interrupted import, blocked storage, quota exhaustion, tab races, browser restart and site-data eviction.
- **Typography:** user-supplied licensed TTF/OTF, accented Latin names, symbols, non-Latin samples and unsupported glyph fallback; PDF extraction and independent glyph raster comparison.
- **AI:** document precise executable/model license and SHA-256 pins; consent/telemetry/CSP checks; cached/offline model startup, multiple/no subjects, glasses, hair and transparency halos on several devices; assess main-thread CPU stalls.

Keep remaining issues **open** until their required tests are documented. Do not represent code merge or Vercel readiness as physical acceptance.
