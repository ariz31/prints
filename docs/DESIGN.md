# PRINTS — design and interaction system

## Intent
Quiet print-production utility, not a dashboard. The visual objective is calm precision: neutral canvas, clear previews, restrained accents, and few persistent controls. Preserve feature depth behind progressive disclosure.

## References
These principles were informed by the public MIT-licensed design-system/brand guidance in
[UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), specifically
`.claude/skills/design-system/SKILL.md` and `.claude/skills/brand/SKILL.md`.
No scripts, templates, third-party generated assets or font binaries were copied.

## Tokens
CSS variables in `src/styles.css` are authoritative:
- Primitive/surface: cream paper, warm off-white panels and aubergine ink
- Semantic: `--ink`, `--ink-muted`, `--surface`, `--canvas`, `--line`, `--accent`, `--danger`
- Components: rounded compact controls, quiet borders, consistent 38–40px minimum input/button height, accessible focus rings.

Avoid excessive gradients, decorative dashboards, repeated badges and tooltip-only essential instructions.

## Identity
- Identity: **Impression**, with bold lowercase lettering, a square i dot and cut-paper details in the p and t.
- Source geometry: `scripts/build-brand.mjs`; regenerate the SVG assets with `npm run brand`. The outlined wordmark has no font or network dependency.
- Primary colors: coral `#F05B40`, paper `#FFF4DF`, aubergine `#2A1830`. Use aubergine text on coral buttons; the darker terracotta `#A93621` serves text links, control accents and focus rings.
- `public/wordmark.svg` is the header logo. `public/wordmark-reverse.svg` is the light version for dark surfaces. `public/symbol.svg` is the standalone transparent p.
- `public/mark.svg` and `public/icon.svg` share an aubergine app tile with a larger cream p and coral paper-shaped counter, using the original wordmark geometry. `public/icon-maskable.svg` gives the p extra safe-area padding on a full-bleed aubergine background for operating-system masks.
- See [the brand guide](brand/README.md) for artwork, minimum sizes and usage.
- Keep aspect ratio and padding; no shadows, fine details or 3D effects in the icon. Favicon and PWA mark must be legible at 16–32px.
- Product controls use coherent line icons rather than miscellaneous emoji; all important actions have text labels.

## Desktop
A compact print inspector, a central sheet canvas, and an image inspector. Projects, workflows and advanced settings are disclosed on demand. Prefer brief labels and short tooltips to explanatory paragraphs.

## Mobile
At narrow viewports use three dedicated surfaces (Preview, Images, Print), chosen through a fixed bottom navigation. Avoid squeezed multi-column panels. Crop uses touch pan and two-pointer pinch, with an alternative zoom slider, reset and apply actions. Focus and click expose help content on touch devices.

## Crop contract
1. Fixed aspect window from item width/height, independent of zoom or viewport dimensions.
2. Drag the image underneath; pinch/wheel/slider controls zoom while the window stays fixed.
3. Persist normalized source rectangle. Exact rectangle must be used for raster preview and PDF export.
4. No second cover crop. An incompatible saved crop or ratio change must be visibly normalized to a matching frame or block export with an actionable error.
5. No stretching to satisfy a mismatched aspect ratio. Preserve original pixels and demonstrate pixel-to-print geometry with tests.

## Quality gates
Vercel build runs all unit tests, typecheck, bundling and postbuild precache validation. No GitHub Actions.
Manual: iOS/Android touch gestures, browser PDF download, offline reload, source preservation and real printer scaling remain separate acceptance tests.

## Photo and Design Layers editor contract (2026-10-24)

On mobile, a dedicated Photo Studio editor presents a **bounded, stationary photo preview** above an independently scrolling adjustment area. The image frame cannot be pushed out of view by slider controls, image intrinsic dimensions or error banners. Both original/full-photo and exact print-crop modes support zoom/pan, keyboard-reachable controls and meaningful loading/decode failures. If a processed source cannot be decoded, the editor may preview the immutable original but must require an explicit undoable Restore Original before changing printable metadata. Retry and Restore controls need 44px-class touch targets, visible feedback and no overlapping recovery buttons.

Design Layers also opens in a dedicated editor with constrained-width photo canvas and reachable Close action. No screen coordinate drives PDF print geometry; layer positions remain normalized.

Use separate, truthfully labeled user states: selected vs applied preset, modified vs saved workflow, neutral vs custom photo look, source loading vs unavailable vs original fallback. Maintain predictable touch behavior without hiding critical state in hover-only help.

## Quality review

Before approving visual changes, inspect 320–430px portrait phones, short landscape viewports and desktop; avoid horizontal overflow, illegible icons, floating actions outside the viewport or preview jumping during adjustment scroll. Static SSR/CSS tests are necessary but **not sufficient** for real Android/iOS interactions. Follow [Quality](QUALITY.md) and [current audit](CURRENT_STATE_2026-10-24.md).

## Unified workspace update — 28 October 2026

[Implementation and acceptance](WORKSPACE_REDESIGN_2026-10-28.md). Use `EditorWorkspace` for dedicated editors: persistent stage, independently scrolling inspector, and header-level Cancel/Apply/Undo/Redo. Portrait phone controls occupy a bounded bottom region; landscape and wider layouts place controls beside the image. Do not put a full editor back inside the sheet document scroll. Inline color fields use the common HEX/palette control. Touch targets are at least 44px on coarse-pointer devices. Physical dimensions remain independent of all screen transforms. New frame options must pass shared-geometry and legacy-default tests across SVG, Canvas and PDF.
