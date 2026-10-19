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
- Primitive/surface: warm off-white paper and restrained gray-neutral panels
- Semantic: `--ink`, `--ink-muted`, `--surface`, `--canvas`, `--line`, `--accent`, `--danger`
- Components: rounded compact controls, quiet borders, consistent 38–40px minimum input/button height, accessible focus rings.

Avoid excessive gradients, decorative dashboards, repeated badges and tooltip-only essential instructions.

## Identity
- Source symbols: `public/mark.svg`, `public/wordmark.svg`, `public/icon.svg`.
- The mark depicts a simplified print area with a crop/focus cue; colors: evergreen `#19594D`, light paper `#F5F7F2`, soft mint `#9CD8B9`.
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
