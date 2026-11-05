# TEST_INFRA: PRINTS Comprehensive Opaque-Box Testing Infrastructure

## 1. Architectural Philosophy & Principles

The PRINTS testing infrastructure enforces an **opaque-box, requirement-driven, client-only validation paradigm** designed to verify correctness, millimeter precision, performance, and memory safety across all 51 features documented in `PROJECT.md § Feature Inventory`.

### Core Invariants & Testing Principles:
1. **Opaque-Box & Requirement-Driven**: Tests interact exclusively with public contracts, domain models, mathematical geometry, and user-observable outputs (sheet layouts, PDF/PNG raster streams, serialization formats). Tests never couple to transient internal private state.
2. **Deterministic Millimeter Accuracy**: Print dimensions, cut marks, margins, and layouts are verified to within 0.001 mm tolerance. Physical sheet points in PDF exports strictly honor `72 / 25.4` points per millimeter.
3. **100% Client-Side Processing**: Zero external APIs, zero server-side rendering, and zero network data leaks. All tests execute in a hermetic local environment using Node.js native test runner (`node:test`) and strictly compliant Web standards (Blob, CompressionStream, IndexedDB via `fake-indexeddb`).
4. **Strict Type Safety**: All test files strictly adhere to the project's Strict Type Safety invariant: zero instances of `any`, zero `as any`, and explicit type guards/Zod schemas at boundaries.
5. **Progressive Testability & Isolation**: Every test is atomic, self-contained, and independent of execution order. No shared mutable state between test cases.

---

## 2. Test Suite Hierarchy (4 Tiers + Tier 5 Hardening)

The test suite is structured into 4 foundational tiers ensuring layered verification from isolated features to end-to-end production workloads, providing a baseline of ≥587 opaque-box test cases:

```
┌────────────────────────────────────────────────────────────────────────┐
│             Tier 4: Real-World Application Scenarios (≥26 tests)        │
│    (End-to-End User Journeys: Wedding Batches, ID Renewals, Tickets)   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│          Tier 3: Cross-Feature Combinations (≥51 pairwise tests)       │
│  (Interactions: ID Studio + Background Flood-Fill + Cut Marks + PDF)   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│          Tier 2: Boundary & Corner Cases (≥5 tests/feature = 255)      │
│  (Limits: 0/1000 Copies, 72/1200 DPI, Extremes, Decompression Bombs)   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│          Tier 1: Feature Coverage (≥5 tests/feature = 255 tests)       │
│  (Equivalence Class Happy Paths for all 51 Features in PROJECT.md)     │
└────────────────────────────────────────────────────────────────────────┘
```

### Tier Breakdown Summary:
- **Tier 1: Feature Coverage** (51 features × 5 tests = **255 test cases**):
  Exercises the nominal, expected operation and contracts of each feature in isolation.
- **Tier 2: Boundary & Corner Cases** (51 features × 5 tests = **255 test cases**):
  Exercises parameter extremes (min/max limits, empty strings, zero dimensions, large batches up to 25 designs / 1,000 finished pieces, memory quotas, NaN rejection).
- **Tier 3: Cross-Feature Combinations** (**55 test cases**):
  Systematic pairwise interaction coverage combining features across all 7 functional pillars.
- **Tier 4: Real-World Application Scenarios** (**30 test cases**):
  Comprehensive production workloads simulating realistic customer use cases (wedding photobooths, consular passport sheets, numbered festival tickets, artisan sticker sheets, corporate business card batches, etc.).
- **Total Test Count**: **595 test cases** (exceeding the ≥587 threshold).

---

## 3. Directory Layout & Test Suite Organization

All tests reside under `tests/e2e/` co-located with the project source:

```
tests/e2e/
├── tier1_features_part1.test.ts   # Tier 1: Features 1 through 25 (125 tests)
├── tier1_features_part2.test.ts   # Tier 1: Features 26 through 51 (130 tests)
├── tier2_boundaries_part1.test.ts # Tier 2: Boundaries for Features 1-25 (125 tests)
├── tier2_boundaries_part2.test.ts # Tier 2: Boundaries for Features 26-51 (130 tests)
├── tier3_combinations.test.ts     # Tier 3: Cross-Feature Combinations (55 tests)
└── tier4_scenarios.test.ts        # Tier 4: Real-World Application Scenarios (30 tests)
```

---

## 4. Execution Commands & Automation

The test runner utilizes Node.js 24 native TypeScript execution with `--experimental-strip-types`:

### Run Full E2E Test Suite (All 4 Tiers):
```bash
node --experimental-strip-types --test tests/e2e/*.test.ts
```

### Run Specific Tiers:
```bash
# Tier 1: Feature Coverage
node --experimental-strip-types --test tests/e2e/tier1_features_*.test.ts

# Tier 2: Boundary & Corner Cases
node --experimental-strip-types --test tests/e2e/tier2_boundaries_*.test.ts

# Tier 3: Cross-Feature Combinations
node --experimental-strip-types --test tests/e2e/tier3_combinations.test.ts

# Tier 4: Real-World Application Scenarios
node --experimental-strip-types --test tests/e2e/tier4_scenarios.test.ts
```

### Run Combined Suite (Existing Unit Baseline + E2E Suite):
```bash
node --experimental-strip-types --test src/core/*.test.ts tests/e2e/*.test.ts
```

---

## 5. 51-Feature Coverage Matrix

| # | Feature Name | Tier 1 Tests | Tier 2 Tests | Tier 3 Coverage | Tier 4 Coverage |
|---|--------------|:------------:|:------------:|:---------------:|:---------------:|
| 1 | Core PhotoAsset Entity | 5 | 5 | Yes | Yes |
| 2 | Sheet & Placement Models | 5 | 5 | Yes | Yes |
| 3 | Print Mode & Job Contracts | 5 | 5 | Yes | Yes |
| 4 | Project & Storage Models | 5 | 5 | Yes | Yes |
| 5 | Layer & Frame Models | 5 | 5 | Yes | Yes |
| 6 | Physical Geometry & Units | 5 | 5 | Yes | Yes |
| 7 | Cut Marks Geometry | 5 | 5 | Yes | Yes |
| 8 | PDF Tile Geometry | 5 | 5 | Yes | Yes |
| 9 | Asset & Number Validation | 5 | 5 | Yes | Yes |
| 10 | Durable Blobs & IndexedDB | 5 | 5 | Yes | Yes |
| 11 | Object URL Registry | 5 | 5 | Yes | Yes |
| 12 | Worker & Rendering Core | 5 | 5 | Yes | Yes |
| 13 | Font Assets & Loading | 5 | 5 | Yes | Yes |
| 14 | Client-side ZIP Engine | 5 | 5 | Yes | Yes |
| 15 | Shared Primitives & Styles | 5 | 5 | Yes | Yes |
| 16 | Normal Print Mode | 5 | 5 | Yes | Yes |
| 17 | Notepad Cut Mode | 5 | 5 | Yes | Yes |
| 18 | Ticket Cut Mode | 5 | 5 | Yes | Yes |
| 19 | Rush ID Cut Mode | 5 | 5 | Yes | Yes |
| 20 | Sticker & Card Cut Modes | 5 | 5 | Yes | Yes |
| 21 | Multi-Image Assignment | 5 | 5 | Yes | Yes |
| 22 | Sheet Layout Packing | 5 | 5 | Yes | Yes |
| 23 | Shape Polygon Nesting | 5 | 5 | Yes | Yes |
| 24 | Manual Sheet Placement | 5 | 5 | Yes | Yes |
| 25 | Paper Sizes & Custom Manager | 5 | 5 | Yes | Yes |
| 26 | Smart ID Studio Framing | 5 | 5 | Yes | Yes |
| 27 | Smart ID Face Alignment | 5 | 5 | Yes | Yes |
| 28 | Smart ID Backdrops & Variants | 5 | 5 | Yes | Yes |
| 29 | Photo Editor Light & Color | 5 | 5 | Yes | Yes |
| 30 | Photo Editor Detail & Geometry | 5 | 5 | Yes | Yes |
| 31 | Photo Editor Retouch & Styles | 5 | 5 | Yes | Yes |
| 32 | Background Color Removal | 5 | 5 | Yes | Yes |
| 33 | Background Alpha Brushes | 5 | 5 | Yes | Yes |
| 34 | Background AI Segmentation | 5 | 5 | Yes | Yes |
| 35 | Vector & Text Layers | 5 | 5 | Yes | Yes |
| 36 | Decorative Frames System | 5 | 5 | Yes | Yes |
| 37 | High-Res PDF Export | 5 | 5 | Yes | Yes |
| 38 | Streaming PNG & Batch Export | 5 | 5 | Yes | Yes |
| 39 | Projects & Draft Recovery | 5 | 5 | Yes | Yes |
| 40 | Tab Collision & Backups | 5 | 5 | Yes | Yes |
| 41 | App Shell & Header | 5 | 5 | Yes | Yes |
| 42 | Workspace State Slicing | 5 | 5 | Yes | Yes |
| 43 | View Component Memoization | 5 | 5 | Yes | Yes |
| 44 | Fast Slider Visual Feedback | 5 | 5 | Yes | Yes |
| 45 | Transferable Worker Pipeline | 5 | 5 | Yes | Yes |
| 46 | Worker LRU ImageBitmap Cache | 5 | 5 | Yes | Yes |
| 47 | Canvas Tile Pooling | 5 | 5 | Yes | Yes |
| 48 | Shape Nesting Spatial Index | 5 | 5 | Yes | Yes |
| 49 | Bounded History URL Retain | 5 | 5 | Yes | Yes |
| 50 | 100% E2E Test Suite Pass | 5 | 5 | Yes | Yes |
| 51 | Tier 5 Adversarial Hardening | 5 | 5 | Yes | Yes |
| **Total** | **51 Features** | **255** | **255** | **55** | **30** |

**Grand Total Test Count**: **595 Tests**
