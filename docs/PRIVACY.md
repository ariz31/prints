# Privacy and local processing

PRINTS is designed for local-first processing: uploaded photographs and designs should remain in the user's browser/device unless the user explicitly chooses an export or a future opt-in service. V0.1 has no required account, orders, payment integration or hosted photo storage.

Temporary in-memory file URLs are not equivalent to persistent projects. Clearing browser data can remove locally stored content. A future complete project store must provide backup/export, migration and storage quota warnings.

Background-removal and portrait tools are planned to use downloaded on-device models. A model download may need an initial internet connection; after successful caching and if the device supports the model, processing should be offline. The app must disclose this instead of claiming universally offline AI.

PDFs or exported images are saved only to the destination selected by the user. Browsers and installed printer drivers may handle those exported files under their own policies.

Do not log original photo bytes, crop pixels, embedded metadata or sensitive image contents to telemetry.
