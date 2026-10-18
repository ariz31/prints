# Privacy and local processing

PRINTS is a local-first web application. No account, cloud photo storage, payment, or customer-order integration is required. Source image data is loaded and processed in the browser by default. A color-aware background-cleanup tool performs pixel operations locally, and manual mask brush changes are also local.

Current project saving stores original and optionally processed transparent-PNG photo blobs and metadata in this browser's IndexedDB. Saved workflow definitions and lightweight layout presets are in browser localStorage. Closing the browser does not necessarily remove saved projects, but clearing site data or automatic quota eviction **can destroy them**; portable project backup is still planned.

AI semantic background removal and portrait AI are **not yet implemented**. The local solid-color cleanup tool is a heuristic, not a trained subject-segmentation model. The intended design uses downloaded on-device model files with explicit first-use availability warnings, not an undisclosed remote API.

Exports download PDFs to a location chosen by the browser/user. Connected printers and external software apply their own policies. PRINTS does not log or transmit customer photographs for analytics.
