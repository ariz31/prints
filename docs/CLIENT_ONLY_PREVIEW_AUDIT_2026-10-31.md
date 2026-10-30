# PRINTS instant photo adjustments / client-only cost audit

## Implemented

- A dedicated Vite module Worker runs advanced photo adjustments using
  OffscreenCanvas and the existing shared pixel operations. Original photos
  remain local Blob URLs and are never uploaded.
- A single cached ImageBitmap is reused for edits of the same photo.
  Only one running render and one latest queued render are permitted.
- Interaction preview (680px maximum dimension) is replaced by the normal
  full preview after 220ms idle. Apply remains disabled until that final raster
  has decoded, protecting print-preview agreement.
- The last preview for the same image/crop is retained while the new one
  renders. Old-source images never cross a crop/source/scope boundary.
- Unsupported workers fall back to the unchanged local raster path.
- Existing PDF, PNG, ZIP and IndexedDB paths are unchanged.

## Cost boundary

No Functions, API routes, server image processing, paid AI inference, hosted
database, or server-backed file storage were introduced. The configuration
remains a static Vite SPA. Optional MediaPipe runtime/model assets are
downloaded from external sources after opt-in, and inference is local.

Vercel Pro subscription, static CDN data transfer and deployment/build
usage are not made zero by client-only processing. Actual charges require
dashboard billing verification; billing API was unavailable at audit time.

## Acceptance and remaining limits

Node test/type/build gates, the five-viewport Playwright acceptance matrix,
and the exact-head PR Vercel deployment must pass before merge.
Synthetic browser tests do not certify real Android/iOS performance, browser
storage availability, output color, physical print geometry, or zero billing.
