# Smart ID Photo Studio — acceptance status (2026-10-23)

> **24 October 2026 recheck:** The user-reviewed Smart ID Studio and independent source-preserving variants are implemented. Cropping via native FaceDetector is optional/browser-dependent, never an identity-compliance determination. Physical dimensions, third-party document rules, cross-browser eye landmarks and mobile/print acceptance still require operator evidence. The Photo Studio source-recovery/crop audit is recorded in [Current state](CURRENT_STATE_2026-10-24.md) and applies to ID workflows as well. This dated acceptance document is not itself a certificate of regulatory passport/ID compliance.


Tracks [#49](https://github.com/ariz31/prints/issues/49).

## Delivered
- Focused ID Studio UI with independent physically sized 1×1 in, 2×2 in, 35×45 mm and validated 10–200 mm custom-size variants from one immutable source; each has independent crop, settings and quantities.
- Optional local native FaceDetector API. Frame selected subject using conservative proportions and adjustable headroom; select a person when multiple are detected.
- Interactive preview at the exact intended crop, manual Crop and Background Editor paths, supported local edits and optional solid white/blue/gray composition for transparent source pixels.
- Local-only data processing; no photo uploads, remote API, account requirement, or universal regulatory-compliance claims.
- Source sharing remains compatible with existing undo/redo, project save, backups and print exports.
- Size/edge/invalid-face-bound regression tests and Vercel's full build pipeline.

## Deliberate restrictions
- Native FaceDetector is unavailable in numerous browsers. The manual crop is reliable, but truly cross-platform offline face + eye landmarks and automatic leveling need an appropriately licensed, performance-validated local model. This is **not yet delivered**.
- Background color composition replaces transparent pixels only; it does not remove an opaque backdrop. Automatic semantic subject removal is separately tracked by issue #53.
- 35 × 45 mm is a generic physical size, not proof of compliance with any particular passport agency. The operator must review head proportions, background color and current rules.
- Preview CSS approximates already-saved photo adjustments. Visual parity for pixel-level advanced local retouches still requires real-browser checks.

## Remaining physical and browser acceptance
- [ ] Android Chrome, iOS Safari, Firefox and desktop Chrome tests for detection and manual fallbacks.
- [ ] Real printed 1×1, 2×2, 35×45 mm and custom-size crop geometry and color samples at 100% print scale.
- [ ] On-device face/eye landmark model, stable unsupported-browser behavior and tested performance.
- [ ] Approval UI and normative agency-specific preset validation only when based on authoritative requirements.

Merge of the optional studio need not close #49 until these remaining checks are met.
