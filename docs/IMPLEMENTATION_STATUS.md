# Implementation status

## Foundation branch (first repository update)
Intended working slice:
- image imports in browser
- configurable item sizes and quantities
- deterministic mm-based mixed-item shelf composition and pagination
- previews, client-side PDF export and trim outlines
- local layout preset settings
- baseline PWA cache shell
- unit tests for geometry and workflow schema validation

## Caveats
- Full project save/reopen and original image persistence are NOT present.
- Workflow schema validation is an architectural foundation; workflow execution and recording are NOT present.
- Advanced crop handles, layers, text/shapes, automatic background removal, mask refinement, batch AI and optimal packing are NOT present.
- Background models are not packaged.
- Printer drivers can rescale PDF pages; users must select Actual Size.
- Native file import and PDF export remain browser-dependent and need real-device QA.
- Cached shell offline behavior needs production-host testing.
- Tests and builds must be run in GitHub CI or a local environment with installed dependencies before release.

## Proposed next work sequence
1. Stabilize this foundation with tests, typechecking and PDF geometry integration tests.
2. Introduce versioned local asset/project persistence with durable backup.
3. Implement interactive nondestructive crop and layer editor.
4. Implement workflow builder and semantic recorder; repeat-last-job; manual review gates.
5. Add batch executor with failure isolation.
6. Integrate on-device segmentation/background-mask editing after evaluating supported devices and model licensing.
7. Improve mixed-size packing and print calibration.
