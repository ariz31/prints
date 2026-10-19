# PRINTS production-hardening audit

## Scope of this pass
Current `main` is Git-connected to the existing Vercel `prints` project. All previous PRs (#1–#7) were merged; no open PRs were found at audit start. The repository contains no GitHub Actions workflow. All automated checks run through Vercel's build script.

## Audited production risks
1. **Mobile editing visibility:** Crop, Background and Layers launch from the Images tab, while their panels are rendered inside Preview. Switching tabs when invoking editors is required to show editing UI.
2. **Crop wheel behavior:** React's delegated wheel listener can be passive; the old handler called `preventDefault`, which may fail to suppress page scrolling. Use an explicit non-passive listener on the crop stage.
3. **Mask source-size changes:** Background refinement uses a downscaled PNG. The original normalized crop might not match the processed aspect ratio after pixel rounding; reframe nondestructively on processed image application and reset.
4. **Invalid image dimensions:** Compressed files can decode to enormous dimensions. Reject empty, too-large, nonfinite and >40 MP sources; validate loaded project metadata too.
5. **Corrupted crop during render:** A wrong saved crop previously triggered an exception while computing DPI, which crashed the full React workspace. Recover gracefully in card rendering; export still validates exact crop.
6. **Accidental project loss:** Starting a new job with assets should warn before discarding the current workspace.
7. **Preview failure invisibility:** Surface canvas/image processing errors to the user rather than silently rendering missing previews.

## Tests
Pure domain regression tests for background source reframe and decompression guards are included. Existing crop, layout, PDF geometry, storage format, workflow and print dimension tests remain in the Vercel release gate.

## Remaining conditions for full commercial production qualification
- Device/browser interaction smoke tests for Android/iOS pinch-pan, export, project persistence, offline-first PWA updates and quota recovery.
- At least one physical output test for image/overlay placement, crop, margins and absolute dimensions using a real printer.
- Security, accessibility and performance evaluation under production-sized image sets.
- Trained-model AI background removal, advanced multi-image batching and undo history remain roadmap items; do not imply they are delivered.
