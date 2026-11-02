# PRINTS — Print Modes

A dedicated, client-only print-production workflow accessible at **Print Modes** in the app header, or directly at \`/modes\`.

## Workflow

1. **Mode** — Choose Normal Print, Notepad Cut, Ticket Cut, Rush ID Cut, Sticker & Label Cut, or Business Card Cut. Save or apply reusable print-mode presets.
2. **Preview** — Adjust sheet dimensions, product size, orientation, count, margins/inset, cutting grids, and ticket numbering. Review every physical sheet before printing.
3. **Images** — Import JPG/PNG/WebP or reuse existing non-destructive edited designs. Select one design, cycle all designs, or map ticket images to individual cut positions.
4. **Print** — Review preflight, choose 300/600 DPI, download a print-ready PDF or open it in a PDF viewer for printing.

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

- A4: **210 × 297 mm**
- A3: **297 × 420 mm**
- Rush ID presets: **25.4 × 25.4**, **50.8 × 50.8**, and **35 × 45 mm**, or custom **10–200 mm**
- Notepad mode: equal A4 cells, with artwork inset from physical cuts
- Ticket mode: fixed equal cutting cells on selected paper, with safe artwork insets
- Stickers and business cards: physical product dimensions, configurable spacing and light crop outlines

Cutting lines are lightweight vector markings, not dark artwork. Printing at **100% / Actual Size** (without “Fit to Page”) is required to preserve measurements. Printer unprintable margins are hardware-dependent; use calibration and inspect the output before cutting a batch.

## Safety and limits

- Maximum **1,000 finished pieces** and **200 sheets** per batch, enforced before rendering
- Maximum **25 source designs** per project
- Existing source-pixel, crop, layer, and memory preflight checks remain active
- Cancelable exports with per-sheet progress
- Local project snapshot and backup support for the current mode configuration
- Reusable mode presets stored on the current browser/device
- No E2E runner or cloud image-processing dependency introduced

## Verification

\`npm run test\` includes \`printModes.test.ts\`: cut-stack ordering (including incomplete sheets), duplicate-safe image placement keys, normal/ID/card dimensions, A4 cut geometry, page-count constraints, and PDF integration that checks vector serial labels and exact A4 point dimensions.

\`npm run typecheck\` and \`npm run build\` remain the production safety gates. Physical print alignment still requires operator confirmation on the target printer.
