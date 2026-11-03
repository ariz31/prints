# PRINTS — Print Modes

A dedicated, client-only print-production workflow accessible at **Print Modes** in the app header, or directly at \`/modes\`.

## Workflow

1. **Modes** — Choose Normal Print, Notepad Cut, Ticket Cut, Rush ID Cut, Sticker & Label Cut, or Business Card Cut. Set paper size, orientation, count, cutting grid, serials, and saved mode presets here.
2. **Preview** — Review the rendered physical sheet with the selected mode settings. Changes to paper dimensions propagate immediately to Preview, Images and Print.
3. **Images** — Import JPG/PNG/WebP or reuse existing non-destructive edited designs. Select one design, cycle all designs, or map ticket images to individual cut positions.
4. **Print** — Review preflight, choose a standard or custom DPI within the device-safe export limits, then download a measured print-ready PDF or open it in a PDF viewer for printing.

All selectors (paper, orientation, print modes, cutting grids, image selection, saved presets/projects, workflows, editor options, and export) now share a single component using the original compact Paper Size picker as the canonical visual reference. Long lists are searchable and grouped; short lists omit unnecessary search boxes. The picker follows mobile viewport changes and stays within native modal dialogs.

**DPI:** Built-in values are 72, 96, 150, 200, 300, 450, 600 and 1200, with custom whole-number values from 72 to 1200. DPI controls embedded raster sampling, not the PDF's vector page size. Existing project and print-mode configurations keep their saved resolution. PNG and ZIP export use the active mode's DPI and derived artwork dimensions, matching PDF mode settings. Above-safe image allocations, batches, and device memory needs are rejected by preflight and export; higher DPI cannot recover missing source detail.

All image processing, layout composition, numbering, and PDF generation run locally in the browser. No server processing or API routes are added. The existing classic editor is retained for crop/background/advanced layers and original designs are never modified by generating a print-mode job.

## Cut-and-stack numbering

For 100 tickets arranged 10-up (2 columns × 5 rows), the application produces 10 physical A4 sheets. When **Cut-and-stack** is selected:

| Cut position | Sheet 1 | Sheet 2 | ... | Sheet 10 |
|---|---:|---:|---:|---:|
| 1 | 001 | 002 | ... | 010 |
| 2 | 011 | 012 | ... | 020 |
| 3 | 021 | 022 | ... | 030 |
| ... | ... | ... | ... | ... |
| 10 | 091 | 092 | ... | 100 |

Print the PDF in sheet order, maintain sheet alignment, cut at shared grid guides, and stack cut-position bundles in position order. This yields 001 through 100 without interleaving tickets one by one.

For a partially filled final sheet the sequence offset for each cut position accounts for that position's actual bundle height:

\`positionStart = position * floor(quantity / positionsPerSheet) + min(position, quantity % positionsPerSheet)\`

This ensures uninterrupted serials even for 101, 113, etc. Copies in an incomplete last sheet are left blank in the unused positions.

The ticket serial is **real vector text in the PDF**, not an on-screen-only label. Starting number, increment, prefix/suffix, digit padding, font size, and X/Y placement are configurable. The export engine rejects serial labels that cannot physically fit within the cut piece.

## Physical geometry and cutting

- Built-in sheets: ISO A0–A7, B4–B6, US Letter/Legal/Statement/Executive, Long Bond/F4/Foolscap, A3+/SRA3/Tabloid, and 3R–8R photo paper
- Common sheets: **A4 210 × 297 mm**, **A3 297 × 420 mm**, **Long Bond 215.9 × 330.2 mm**
- Settings → **Custom paper sizes**: create, rename/edit, delete, and save up to 40 distinct dimensions in mm or inches
- The compact paper picker groups sizes, searches dimensions/names, and supports touch and keyboard navigation
- Custom paper dimensions are embedded in saved jobs/presets: deleting a library entry never changes existing print geometry
- Rush ID presets: **25.4 × 25.4**, **50.8 × 50.8**, and **35 × 45 mm**, or custom **10–200 mm**
- Notepad and ticket modes: equal cutting cells on the **selected** paper, with safe artwork insets
- Stickers and business cards: physical product dimensions, configurable spacing and light crop outlines

Cutting lines are lightweight vector markings, not dark artwork. Printing at **100% / Actual Size** (without “Fit to Page”) is required to preserve measurements. Presets describe page geometry, **not printer feed support**. Verify printer media range, unprintable margins, calibration, and custom-size driver support before batch production. Full-page large-format photos may exceed the client-side raster budget at high DPI; preflight provides an error rather than allowing an unbounded export. Custom sizes are device-local and do not sync to other browsers.

## Safety and limits

- Maximum **1,000 finished pieces** and **200 sheets** per batch, enforced before rendering
- Maximum **25 source designs** per project
- Existing source-pixel, crop, layer, and memory preflight checks remain active
- Cancelable exports with per-sheet progress
- Local project snapshot and backup support for the current mode configuration
- Reusable mode presets and custom paper definitions stored on the current browser/device
- Additional unit/integration tests for custom-paper PDF geometry, safe mobile picker positioning, preservation of existing artwork, and legacy mode settings
- No E2E runner or cloud image-processing dependency introduced

## Verification

\`npm run test\` includes \`printModes.test.ts\`: cut-stack ordering (including incomplete sheets), duplicate-safe image placement keys, normal/ID/card dimensions, selected-sheet cutting geometry, page-count constraints, and PDF integration checking exact point dimensions and vector serial labels.

\`npm run typecheck\` and \`npm run build\` remain the production safety gates. Physical print alignment still requires operator confirmation on the target printer.
