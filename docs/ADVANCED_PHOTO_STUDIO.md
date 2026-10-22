# Advanced Photo Studio — Phase 3 feasibility decision
Date: 2026-10-22 · Repository: ariz31/prints · Tracking: #32

## Product contract
PRINTS stays **local-first, no account, no required server processing**. No portrait photo or model inference payload may be uploaded automatically. The original image and the exact physical crop remain unchanged by default.

Phases 1–2 provide real local enhancement and brush controls in the editor. The following are research / conditional release candidates; **none is claimed as shipped** merely by including this feasibility document.

## On-device semantic background segmentation — CONDITIONAL GO
**Reference candidate:** Google MediaPipe Tasks Vision Image Segmenter, SelfieSegmenter (square, 256×256, float16). The documented API supports image-mode inference and returns category/confidence masks for subject/background separation.

Official reference: https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter/web_js
Model reference: https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter

Before integrating:
1. Verify the **specific binary model license**, package license, attribution obligations and provenance; pin exact model checksum and NPM package version. Do not assume the model has the same license as the code.
2. Prefer locally bundled or explicitly user-cached assets; never insert an unannounced runtime fetch or CDN dependency. If models are optional downloads, get affirmative user consent, show bytes, cache verification and deletion capability, and work offline after install.
3. The documented synchronous `segment()` API blocks its calling thread. Prototype execution in a worker (if supported), with bounded resizing, cancel/timeouts and no silent WebGPU requirement.
4. Calibrate mask alpha/feathering, disconnected flyaway hair, translucent edges and foreground objects. Restore/erase manual correction must always remain available. **Never equate segmentation with perfect background removal.**
5. Verify Android Chrome, Safari/iOS support, constrained memory, 1x1/2x2 prints, PNG alpha, PDF output and portable project backups. Preserve original bytes and exact crop mapping.
6. Only enable a production UI after licensing, load, performance, memory and privacy tests are demonstrated on the exact deployed commit.

**Decision:** capability is suitable for a separately gated experiment; the current repository cannot certify the model distribution/license/device matrix. Do not claim this phase is implemented or merge a fake AI button.

## Super-resolution — HOLD
Browser inference is technically possible with ONNX Runtime Web, but model weights and browser execution vary materially by device. WASM has browser memory/performance limits, and GPU availability is not guaranteed. PRINTS currently caps per-product output rasters at 9MP and requires honest effective-DPI preflight warnings.

Official performance/limits: https://onnxruntime.ai/docs/tutorials/web/performance-diagnosis.html
Official browser model constraints: https://onnxruntime.ai/docs/tutorials/web/large-models.html

Before rollout: select a legally distributable small super-resolution model, prove **meaningful** detail improvement on representative photo/ID/sticker prints, benchmark low-memory phones, guard against invented text/faces, and require explicit preview/review. Ordinary interpolation must not be marketed as AI super-resolution.

**Decision:** no production rollout until a qualified and tested model exists.

## ICC soft-proof and printer profiles — HOLD
Reliable physical output depends on the **actual printer, ink, paper, driver, ambient light and device-specific ICC output profile**. Browser previews cannot guarantee print matching. PRINTS already provides measured-size calibration and a warning to print at 100%.

Before rollout: allow user-supplied profiled printer/paper combinations, verify legal/robust ICC conversion implementation and profile parsing, add independent RGB test targets and Delta E measurements, check black-point behavior, and distinguish proof preview from profile conversion. Fail closed when profile or browser support is absent.

**Decision:** do not advertise ICC proofing without proof of measured correctness on real print hardware.

## Performance/privacy acceptance for any future experimental model
- Local processing only; no analytics or photo contents in network requests or logs
- Explicit disclosure before model download, with opt-out and graceful heuristic/manual fallback
- Strict image/raster bounds, no uncontrolled GPU/heap allocations, worker isolation where supported
- Representative mobile benchmarks and recovery/cancellation tests on low-memory hardware
- Source images immutable; backups include only the chosen edit metadata/mask, not unlicensed model weights
- Screenshot/PNG/PDF pixel parity, alpha edge tests and measured print geometry checks
- Pin hash and vulnerability review of all runtime/model assets
- Vercel exact-head tests + TypeScript + PWA smoke, followed by physical device validation

## Tracking
- Phase 1: Photo Studio light/color/detail, presets and local Auto Enhance (merged via PR #34).
- Phase 2: localized retouches, backdrop replacement and controlled batch propagation (PR #35).
- Phase 3: **feasibility assessed, feature release gated**. Semantic AI, actual super-resolution and calibrated ICC are not shipped.
- Maintain issue #32 for remaining implementation and device signoff rather than representing research-only work as completion.
