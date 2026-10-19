# Contributing to PRINTS

## Development principles
- Keep editor and PDF/export logic separated from deterministic, unit-testable geometry.
- TypeScript strict mode; validate user-controlled numbers before constructing layouts.
- Prefer nondestructive operations and durable, versioned schema design.
- Support offline processing without customer-photo uploads.
- Clearly distinguish implemented features from roadmap-only concepts.
- Keep feature changes scoped, documented and covered by regression tests.
- Use physical millimeter measurements for print calculations.
- Use semantic workflow operations, never fragile event-coordinate recording.

## Local commands
Run npm install, then npm run dev. The complete verification gate is `npm run build` (unit tests, TypeScript, Vite, generated service-worker assets, output check); Vercel executes it for previews and production. GitHub Actions has intentionally been removed; do not add workflow files without an explicit user request.

## Review checklist
- Does a feature meet the stated user's workflow?
- Are PDF dimensions and preview in agreement?
- Does it fail clearly on bad input?
- Is the original image preserved?
- Does the change avoid introducing an unannounced server dependency?
- Are necessary documentation and tests updated?
