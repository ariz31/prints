# PRINTS follow-up audit: mobile recovery and PDF preflight parity
Date: 29 October 2026.

## Verified defects
1. `copyBlobBytes` allocated a full source-sized ArrayBuffer before converting a transient Android provider File to a durable Blob. A 100–200 MiB image could trigger an avoidable contiguous JavaScript allocation during import or recovery. Use 1 MiB byte-backed slices, verify each read length, preserve MIME and ownership, and retain the existing identical-byte deduplication in `copyProjectBlobBytes`.
2. `assessPrintJob` did not report sheet references to missing image IDs or duplicated input IDs, even though `exportToPdf` rejects them. Validate before export starts.
3. The preflight pixel-memory calculation counted *all* supplied assets while PDF export only creates rasters for IDs actually placed on the selected sheets. Count referenced IDs only, so selected-page exports are not blocked by unrelated images. Never claim nonexistent optical detail or permit oversized rendered variants.

## Automated evidence requirements
- `src/core/durableBlobs.test.ts` proves byte-identical chunked provider detachment while explicitly throwing if the original whole-file `arrayBuffer` is called, and verifies partial reads fail without claiming success.
- `src/core/printPreflight.test.ts` exercises missing IDs, duplicate IDs, and 600 DPI A3 source-memory parity against referenced sheet placements.
- Keep the normal Vercel release gate: all Node tests, strict TypeScript, production Vite build, offline/PWA smoke, and Chromium browser matrix across five viewports. Final branch and merged production commit must each be verified.
- Genuine high-capacity Android storage pressure, provider expiration, large A3 physical print, iOS, and color matching remain device/physical acceptance gates, not automated certifications.

No schema, source-image, crop, physical-size, PDF output, or external-API changes. GitHub Actions remain unused.
