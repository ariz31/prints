# Privacy and local processing

PRINTS is **local-first**. It does not require an account, hosted customer-photo storage, payment processing or an image upload. Original customer photographs, crops, masks and print jobs are processed locally in the browser. Generated PDF/PNG/ZIP files are downloaded through the browser.

**Local persistence:** Named projects, source image Blobs and recoverable untitled drafts are kept in IndexedDB. Personal layout presets and workflow definitions use browser localStorage. Browser storage is not a durable backup: user clearing, eviction, private mode and device loss can destroy it. Portable ZIP/legacy JSON project downloads enable user-managed transfer and backup; no automatic remote sync exists.

**Optional AI background removal:** The Background Editor offers local person segmentation with a MediaPipe browser runtime. The user must explicitly opt in before downloading executable runtime, WebAssembly and model files from pinned-version external CDN/Google-hosted URLs. Some runtime performance/usage metrics may reach the MediaPipe provider, as disclosed in its privacy notice; source photo/mask pixels are not intentionally sent by PRINTS to the provider. The AI assets may be cached for offline reuse when supported, but caching is subject to browser storage and network policies. File-format checks reject obvious corrupted/substituted assets; they do **not** authenticate the publisher through a pinned content digest. Users can continue to use manual/heuristic cleanup without AI consent.

**Optional native face alignment:** Smart ID Photo Studio uses the browser's local FaceDetector API where available. Detected face rectangles are transient and are not uploaded or stored as identity records. When unavailable, manual crop is used. No face recognition or identity matching is performed.

**Printing and security boundaries:** Connected printers, external PDF/graphics programs, browser extensions, and operating systems follow their own privacy and device policies. PRINTS does not claim to control these systems or guarantee color matching. The source images never intentionally leave the browser unless users explicitly download/share them or an external environment acts on their files.

Reference: https://developers.google.com/edge/mediapipe/solutions/tasks (MediaPipe Tasks privacy notice). No mandatory Google account or cloud image processing is required.
