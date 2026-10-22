# PRINTS — Product brief

## Vision
PRINTS is a quiet, approachable print studio that makes precise output effortless. The interface should feel like a focused native utility rather than a dense design dashboard: import, frame, arrange and print in as few steps as practical. Editing and workflows remain powerful but stay out of the way until requested. Images stay on-device by default; offline operation remains a goal and core supported flow.

## Who it serves
- Print-shop operators preparing repeated photographs, business cards, cards, stickers, labels and school materials.
- Individuals preparing personal photographs, learning materials and small-batch printable assets.

## Product promise
Import → Edit / Crop → Save or Reuse Workflow → Compose → Preview → Export / Print. The same design can be duplicated or combined with other print products on a standard or custom-sized sheet, with physical-size fidelity and cutting guidance.

## Three product studios
### Design Studio
Crop precisely, select multiple regions, adjust image appearance, work with editable image/text/shape layers, align portrait framing and refine local background-removal masks. Preserve source images for reversible adjustments.

### Workflow Studio
Build workflows by explicitly adding steps or recording supported semantic actions, edit/reorder/disable steps, run on a single image or batch, optionally pause for visual review, repeat the last job, and export/import workflow definitions.

### Print Studio
Produce repeated and mixed-item layouts, configure quantities and physical dimensions, choose paper sizes and margins, arrange or manually reposition objects, preview guides, export PDF or image files, and print at actual size.

## Explicit decisions
- Web application; desktop first with responsive UI.
- Both individuals and commercial print operators.
- Core processes local to the user's device; no image upload by default.
- Local-first/offline, with cached model assets required for AI features.
- Advanced editor with layers/text/shapes, not an unrestricted Canva clone.
- Universal composer rather than a dedicated photo-only tool.
- No customer submissions, ordering, payments or compulsory accounts in early releases.
- Workflow creation: action recording and manual steps.
- Workflow execution: single input and batch input.
- Background removal: automatic with manual restore/erase edge refinement.
- Workflow steps: sequential, editable; review gates where a human decision is needed.

## Data model distinction
- Asset: original uploaded bytes and metadata.
- Design: edit instructions, crops, mask and layered objects referencing assets.
- Template: reusable design with parameters/placeholders.
- Workflow: versioned semantic processing steps and review gates.
- Print job: printable design instances, quantities, exact geometry and export settings.
The above objects must never be confused with one another.

## Success indicators
Time to prepare a repeat print job, percentage of usable sheet area, dimensionally accurate PDFs, reproducible workflow steps, recovery from incomplete sessions, and offline editing without private-data transmission.

## Initial implementation status
Only features explicitly listed as delivered in the README or CHANGELOG are implemented. This brief is the target specification, not an assertion that advanced editing or AI models are already present.

## Minimalist experience rules
- Show paper size, orientation, photos and export first. Projects, workflows, calibration and advanced spacing live under succinct disclosure controls.
- The crop interaction is smartphone-style: **stationary output frame; drag/pinch/scroll to move and zoom the photo underneath.** The resulting crop is the only source rectangle used by preview and PDF. Never crop again invisibly.
- Inputs accept explicit dimensions such as `1"`, `1''`, `2.54cm`, `25.4mm`, and convert automatically to user-preferred display units. The geometry model always stores mm.
- Saved preferences: unit, default paper/orientation/margin/gap/cut lines. Existing print jobs retain their settings.
- Tooltip/help copy appears on pointer hover, focus or tap rather than taking permanent sidebar space.
- Desktop emphasizes sheet preview; mobile gets separately navigable Preview / Images / Print surfaces with touch-sized controls.
- Brand: Impression identity with custom lowercase PRINTS lettering, cut-paper p symbol, vector SVG icons, warm cream surfaces, aubergine ink and coral accents. Avoid gratuitous gradients, decorative metric cards, and fake graphics.
- Builds run tests, TypeScript, bundling and artifact validation **on Vercel**, not GitHub Actions. GitHub remains source control and review.
