import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('================================================================');
console.log('  CHALLENGER M3: EMPIRICAL PERFORMANCE & MEMOIZATION HARNESS');
console.log('  Testing Features F43-2, F43-3, F44-1 (Issue #118)');
console.log('================================================================');

let totalTests = 0;
let totalPassed = 0;
let totalFailed = 0;
const failures = [];

function check(name, condition, extraInfo = '') {
  totalTests++;
  if (condition) {
    totalPassed++;
    console.log(`  [PASS] ${name}`);
  } else {
    totalFailed++;
    console.error(`  [FAIL] ${name} ${extraInfo}`);
    failures.push({ name, extraInfo });
  }
}

// ---------------------------------------------------------------------------
// 1. Load and Transpile Target Modules
// ---------------------------------------------------------------------------
const sheetPreviewPath = path.join(projectRoot, 'src/features/sheet-composer/components/SheetPreview.tsx');
const assetCardPath = path.join(projectRoot, 'src/app/shell/AssetCard.tsx');

assert.ok(fs.existsSync(sheetPreviewPath), `SheetPreview.tsx must exist at ${sheetPreviewPath}`);
assert.ok(fs.existsSync(assetCardPath), `AssetCard.tsx must exist at ${assetCardPath}`);

const sheetPreviewSource = fs.readFileSync(sheetPreviewPath, 'utf8');
const assetCardSource = fs.readFileSync(assetCardPath, 'utf8');

const sheetTranspiled = ts.transpileModule(sheetPreviewSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;

const assetTranspiled = ts.transpileModule(assetCardSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;

// Extract pure comparator functions
const sheetFnMatch = sheetTranspiled.match(/export function areSheetPreviewPropsEqual\([\s\S]*?\n\}/);
assert.ok(sheetFnMatch, 'areSheetPreviewPropsEqual function declaration must exist in SheetPreview.tsx');
const areSheetPreviewPropsEqual = new Function(sheetFnMatch[0].replace('export ', '') + '; return areSheetPreviewPropsEqual;')();

const assetFnMatch = assetTranspiled.match(/export function areAssetCardPropsEqual\([\s\S]*?\n\}/);
assert.ok(assetFnMatch, 'areAssetCardPropsEqual function declaration must exist in AssetCard.tsx');
const areAssetCardPropsEqual = new Function(assetFnMatch[0].replace('export ', '') + '; return areAssetCardPropsEqual;')();

// ---------------------------------------------------------------------------
// Helper Fixture Builders
// ---------------------------------------------------------------------------
function createAsset(id, overrides = {}) {
  return {
    id,
    name: `Photo_${id}.jpg`,
    url: `blob:http://localhost/orig-${id}`,
    pixelWidth: 2000,
    pixelHeight: 3000,
    widthMm: 50,
    heightMm: 75,
    quantity: 2,
    focalX: 0.5,
    focalY: 0.5,
    crop: { x: 0, y: 0, width: 1, height: 1 },
    cropShape: 'rectangle',
    layers: [],
    adjustments: { brightness: 0, contrast: 0, saturation: 0 },
    ...overrides,
  };
}

function createPlacement(itemId, copyIndex, xMm = 10, yMm = 10, overrides = {}) {
  return {
    itemId,
    copyIndex,
    xMm,
    yMm,
    widthMm: 50,
    heightMm: 75,
    rotated: false,
    ...overrides,
  };
}

function createSheetPage(pageNumber, placements) {
  return {
    pageNumber,
    placements,
  };
}

const defaultAsset1 = createAsset('asset-1');
const defaultAsset2 = createAsset('asset-2');
const defaultAssets = [defaultAsset1, defaultAsset2];
const defaultPreviews = { 'asset-1': 'blob:preview-1', 'asset-2': 'blob:preview-2' };

function createSheetPreviewProps(overrides = {}) {
  const placement1 = createPlacement('asset-1', 0, 10, 10);
  const placement2 = createPlacement('asset-1', 1, 70, 10);

  return {
    page: createSheetPage(1, [placement1, placement2]),
    paper: { widthMm: 210, heightMm: 297 },
    paperLabel: 'A4',
    orientation: 'portrait',
    sheetCount: 2,
    totalCopies: 4,
    printCoverage: '2/2 designs',
    items: defaultAssets,
    previews: defaultPreviews,
    guides: true,
    trimStyle: 'outline',
    index: 0,
    arrange: false,
    marginMm: 5,
    notepadCuts: undefined,
    onRotate: () => {},
    onMove: () => {},
    ...overrides,
  };
}

function createAssetCardProps(item, overrides = {}) {
  return {
    item,
    previewUrl: `blob:preview-${item.id}`,
    unit: 'mm',
    orientation: 'portrait',
    paper: { widthMm: 210, heightMm: 297 },
    notepadPreset: undefined,
    canUseNotepad: false,
    modeQuantityOverride: false,
    modeSizingOverride: false,
    onNotepadChange: () => {},
    onChange: () => {},
    onRemove: () => {},
    onAdjust: () => {},
    onId: () => {},
    onCrop: () => {},
    onBackground: () => {},
    onLayers: () => {},
    onDownload: () => {},
    onDuplicate: () => {},
    ...overrides,
  };
}

// ============================================================================
// SUITE 1: Component Export & React.memo Wrapping Verification
// ============================================================================
console.log('\n--- SUITE 1: Component Export & React.memo Wrapping ---');

check(
  'SheetPreview.tsx wraps component in React.memo with areSheetPreviewPropsEqual',
  sheetPreviewSource.includes('export const SheetPreview = memo(SheetPreviewComponent, areSheetPreviewPropsEqual);')
);

check(
  'AssetCard.tsx wraps component in React.memo with areAssetCardPropsEqual',
  assetCardSource.includes('export const AssetCard = memo(AssetCardComponent, areAssetCardPropsEqual);')
);

check(
  'SheetPreview default and named exports exist',
  sheetPreviewSource.includes('export const SheetPreview') && sheetPreviewSource.includes('export default SheetPreview;')
);

check(
  'AssetCard default and named exports exist',
  assetCardSource.includes('export const AssetCard') && assetCardSource.includes('export default AssetCard;')
);

// ============================================================================
// SUITE 2: Feature F43-2 (`SheetPreview` Memoization & Render Suppression)
// ============================================================================
console.log('\n--- SUITE 2: Feature F43-2 (SheetPreview Memoization) ---');

// Test 2.1: Identical props return true
{
  const prev = createSheetPreviewProps();
  const next = createSheetPreviewProps();
  check('Identical props are equal (re-render suppressed)', areSheetPreviewPropsEqual(prev, next) === true);
}

// Test 2.2: Recreated callback instances (onMove, onRotate) do NOT break memoization
{
  const prev = createSheetPreviewProps({
    onMove: () => console.log('prev move'),
    onRotate: () => console.log('prev rotate'),
  });
  const next = createSheetPreviewProps({
    onMove: () => console.log('next move'),
    onRotate: () => console.log('next rotate'),
  });
  check('Recreated callback closures do NOT trigger re-render', areSheetPreviewPropsEqual(prev, next) === true);
}

// Test 2.3: Recreated items array with same asset references (e.g. parent re-render from sidebar tab change)
{
  const prev = createSheetPreviewProps({ items: defaultAssets });
  const next = createSheetPreviewProps({ items: [...defaultAssets] }); // new array, same elements
  check('Recreated items array with same asset instances suppresses re-render', areSheetPreviewPropsEqual(prev, next) === true);
}

// Test 2.4: Unrelated asset mutation (Asset 2 changes, but Sheet only displays Asset 1)
{
  const asset2Old = createAsset('asset-2', { quantity: 1, adjustments: { brightness: 0, contrast: 0, saturation: 0 } });
  const asset2New = createAsset('asset-2', { quantity: 10, adjustments: { brightness: 25, contrast: 15, saturation: -5 } });

  const prev = createSheetPreviewProps({
    items: [defaultAsset1, asset2Old],
    previews: { 'asset-1': 'blob:prev-1', 'asset-2': 'blob:prev-2-old' },
  });
  const next = createSheetPreviewProps({
    items: [defaultAsset1, asset2New],
    previews: { 'asset-1': 'blob:prev-1', 'asset-2': 'blob:prev-2-new' }, // Asset 2 preview updated
  });

  check(
    'Mutating Asset 2 (not placed on Sheet 1) suppresses Sheet 1 re-render',
    areSheetPreviewPropsEqual(prev, next) === true
  );
}

// Test 2.5: Placed asset mutation (Asset 1 crop/adjustments updated)
{
  const asset1Old = createAsset('asset-1', { adjustments: { brightness: 0, contrast: 0, saturation: 0 } });
  const asset1New = createAsset('asset-1', { adjustments: { brightness: 30, contrast: 10, saturation: 0 } });

  const prev = createSheetPreviewProps({ items: [asset1Old, defaultAsset2] });
  const next = createSheetPreviewProps({ items: [asset1New, defaultAsset2] });

  check(
    'Mutating Asset 1 (placed on Sheet 1) allows Sheet 1 re-render',
    areSheetPreviewPropsEqual(prev, next) === false
  );
}

// Test 2.6: Placed asset preview URL updated
{
  const prev = createSheetPreviewProps({ previews: { 'asset-1': 'blob:preview-1-v1', 'asset-2': 'blob:preview-2' } });
  const next = createSheetPreviewProps({ previews: { 'asset-1': 'blob:preview-1-v2', 'asset-2': 'blob:preview-2' } });

  check(
    'Updating preview URL for placed asset allows Sheet 1 re-render',
    areSheetPreviewPropsEqual(prev, next) === false
  );
}

// Test 2.7: Placement coordinate moved
{
  const p1 = createPlacement('asset-1', 0, 10, 10);
  const p1Moved = createPlacement('asset-1', 0, 15, 10); // xMm shifted 5mm

  const prev = createSheetPreviewProps({ page: createSheetPage(1, [p1]) });
  const next = createSheetPreviewProps({ page: createSheetPage(1, [p1Moved]) });

  check(
    'Nudging placement coordinates (xMm) triggers Sheet 1 re-render',
    areSheetPreviewPropsEqual(prev, next) === false
  );
}

// Test 2.8: Placement rotation toggled
{
  const p1 = createPlacement('asset-1', 0, 10, 10, { rotated: false });
  const p1Rot = createPlacement('asset-1', 0, 10, 10, { rotated: true });

  const prev = createSheetPreviewProps({ page: createSheetPage(1, [p1]) });
  const next = createSheetPreviewProps({ page: createSheetPage(1, [p1Rot]) });

  check(
    'Rotating placement triggers Sheet 1 re-render',
    areSheetPreviewPropsEqual(prev, next) === false
  );
}

// Test 2.9: Paper size changed
{
  const prev = createSheetPreviewProps({ paper: { widthMm: 210, heightMm: 297 }, paperLabel: 'A4' });
  const next = createSheetPreviewProps({ paper: { widthMm: 215.9, heightMm: 279.4 }, paperLabel: 'Letter' });

  check('Changing paper size triggers Sheet re-render', areSheetPreviewPropsEqual(prev, next) === false);
}

// Test 2.10: Orientation changed
{
  const prev = createSheetPreviewProps({ orientation: 'portrait' });
  const next = createSheetPreviewProps({ orientation: 'landscape' });

  check('Changing orientation triggers Sheet re-render', areSheetPreviewPropsEqual(prev, next) === false);
}

// Test 2.11: Sheet page index navigation
{
  const prev = createSheetPreviewProps({ index: 0 });
  const next = createSheetPreviewProps({ index: 1 });

  check('Navigating to next sheet page triggers re-render', areSheetPreviewPropsEqual(prev, next) === false);
}

// Test 2.12: Guides and Arrange Mode toggles
{
  const prevGuides = createSheetPreviewProps({ guides: true });
  const nextGuides = createSheetPreviewProps({ guides: false });
  check('Toggling cut guides triggers re-render', areSheetPreviewPropsEqual(prevGuides, nextGuides) === false);

  const prevArrange = createSheetPreviewProps({ arrange: false });
  const nextArrange = createSheetPreviewProps({ arrange: true });
  check('Entering arrange mode triggers re-render', areSheetPreviewPropsEqual(prevArrange, nextArrange) === false);
}

// Test 2.13: Trim style toggle (outline vs corner)
{
  const prevTrim = createSheetPreviewProps({ trimStyle: 'outline' });
  const nextTrim = createSheetPreviewProps({ trimStyle: 'corner' });
  check('Toggling trim style triggers re-render', areSheetPreviewPropsEqual(prevTrim, nextTrim) === false);
}

// Test 2.14: Safe paper numeric equality (new object, identical dimensions)
{
  const prev = createSheetPreviewProps({ paper: { widthMm: 210, heightMm: 297 } });
  const next = createSheetPreviewProps({ paper: { widthMm: 210, heightMm: 297 } }); // fresh object
  check(
    'Identical paper dimensions in new object reference suppresses re-render',
    areSheetPreviewPropsEqual(prev, next) === true
  );
}

// ============================================================================
// SUITE 3: Feature F43-3 (`AssetCard` Memoization & Isolation)
// ============================================================================
console.log('\n--- SUITE 3: Feature F43-3 (AssetCard Memoization) ---');

// Test 3.1: Identical props return true
{
  const asset1 = createAsset('a1');
  const prev = createAssetCardProps(asset1);
  const next = createAssetCardProps(asset1);
  check('Identical AssetCard props are equal (re-render suppressed)', areAssetCardPropsEqual(prev, next) === true);
}

// Test 3.2: Recreated callback handlers in sidebar do NOT re-render card
{
  const asset1 = createAsset('a1');
  const prev = createAssetCardProps(asset1, {
    onChange: () => {},
    onRemove: () => {},
    onAdjust: () => {},
    onCrop: () => {},
  });
  const next = createAssetCardProps(asset1, {
    onChange: () => {},
    onRemove: () => {},
    onAdjust: () => {},
    onCrop: () => {},
  });
  check('Recreated callback closures do NOT trigger AssetCard re-render', areAssetCardPropsEqual(prev, next) === true);
}

// Test 3.3: 25-Asset Workload Isolation: Updating copies of 1 asset
{
  const assets = Array.from({ length: 25 }, (_, i) => createAsset(`asset-${i + 1}`, { quantity: 1 }));
  const updatedAssets = assets.map((a, i) => (i === 0 ? { ...a, quantity: 5 } : a));

  let suppressedCount = 0;
  let reRenderCount = 0;

  for (let i = 0; i < 25; i++) {
    const prev = createAssetCardProps(assets[i]);
    const next = createAssetCardProps(updatedAssets[i]);
    if (areAssetCardPropsEqual(prev, next)) {
      suppressedCount++;
    } else {
      reRenderCount++;
    }
  }

  check(
    '25-asset workload: 24/25 AssetCards suppressed when 1 asset copies change',
    suppressedCount === 24 && reRenderCount === 1,
    `Suppressed: ${suppressedCount}, Re-rendered: ${reRenderCount}`
  );
}

// Test 3.4: 25-Asset Workload Isolation: Updating thumbnail of 1 asset
{
  const assets = Array.from({ length: 25 }, (_, i) => createAsset(`asset-${i + 1}`));
  const previewsOld = Object.fromEntries(assets.map(a => [a.id, `blob:prev-${a.id}-v1`]));
  const previewsNew = { ...previewsOld, 'asset-1': 'blob:prev-asset-1-v2' }; // only asset-1 changed

  let suppressedCount = 0;
  let reRenderCount = 0;

  for (let i = 0; i < 25; i++) {
    const prev = createAssetCardProps(assets[i], { previewUrl: previewsOld[assets[i].id] });
    const next = createAssetCardProps(assets[i], { previewUrl: previewsNew[assets[i].id] });
    if (areAssetCardPropsEqual(prev, next)) {
      suppressedCount++;
    } else {
      reRenderCount++;
    }
  }

  check(
    '25-asset workload: 24/25 AssetCards suppressed when 1 asset thumbnail changes',
    suppressedCount === 24 && reRenderCount === 1,
    `Suppressed: ${suppressedCount}, Re-rendered: ${reRenderCount}`
  );
}

// Test 3.5: Updating this card's physical dimensions (widthMm / heightMm)
{
  const a1Old = createAsset('a1', { widthMm: 50, heightMm: 75 });
  const a1New = createAsset('a1', { widthMm: 60, heightMm: 75 });
  const prev = createAssetCardProps(a1Old);
  const next = createAssetCardProps(a1New);
  check('Mutating widthMm triggers AssetCard re-render', areAssetCardPropsEqual(prev, next) === false);
}

// Test 3.6: Updating this card's crop region
{
  const a1Old = createAsset('a1', { crop: { x: 0, y: 0, width: 1, height: 1 } });
  const a1New = createAsset('a1', { crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } });
  const prev = createAssetCardProps(a1Old);
  const next = createAssetCardProps(a1New);
  check('Mutating crop rectangle triggers AssetCard re-render', areAssetCardPropsEqual(prev, next) === false);
}

// Test 3.7: Adding/removing layers
{
  const a1Old = createAsset('a1', { layers: [] });
  const a1New = createAsset('a1', { layers: [{ id: 'l1', kind: 'text', visible: true }] });
  const prev = createAssetCardProps(a1Old);
  const next = createAssetCardProps(a1New);
  check('Changing layers count triggers AssetCard re-render', areAssetCardPropsEqual(prev, next) === false);
}

// Test 3.8: Adjustments reference changed but content identical
{
  const a1Old = createAsset('a1', { adjustments: { brightness: 10, contrast: 5, saturation: 0 } });
  const a1New = createAsset('a1', { adjustments: { brightness: 10, contrast: 5, saturation: 0 } }); // fresh object
  const prev = createAssetCardProps(a1Old);
  const next = createAssetCardProps(a1New);
  check(
    'Identical adjustments content in new object reference suppresses re-render',
    areAssetCardPropsEqual(prev, next) === true
  );
}

// Test 3.9: Adjustments content changed
{
  const a1Old = createAsset('a1', { adjustments: { brightness: 10, contrast: 5, saturation: 0 } });
  const a1New = createAsset('a1', { adjustments: { brightness: 25, contrast: 5, saturation: 0 } });
  const prev = createAssetCardProps(a1Old);
  const next = createAssetCardProps(a1New);
  check('Changing photo adjustments triggers AssetCard re-render', areAssetCardPropsEqual(prev, next) === false);
}

// Test 3.10: Global preferences unit changed (mm -> in)
{
  const a1 = createAsset('a1');
  const prev = createAssetCardProps(a1, { unit: 'mm' });
  const next = createAssetCardProps(a1, { unit: 'in' });
  check('Global unit change triggers AssetCard re-render for unit labels', areAssetCardPropsEqual(prev, next) === false);
}

// ============================================================================
// SUITE 4: Feature F44-1 (GPU-Accelerated Drag Feedback & Zero Layout Thrashing)
// ============================================================================
console.log('\n--- SUITE 4: Feature F44-1 (GPU-Accelerated Drag Feedback) ---');

// Test 4.1: Source code contains translate3d with deltaPxX and deltaPxY
check(
  'SheetPreview.tsx uses GPU-accelerated CSS translate3d(draft.deltaPxX, draft.deltaPxY, 0)',
  sheetPreviewSource.includes('`translate3d(${draft.deltaPxX}px, ${draft.deltaPxY}px, 0)`')
);

// Test 4.2: willChange is set to "transform" during moving
check(
  'SheetPreview.tsx declares willChange: moving ? "transform" : undefined',
  sheetPreviewSource.includes('willChange: moving ? "transform" : undefined')
);

// Test 4.3: Element left/top properties are fixed to placement.xMm and paper.widthMm (not draft)
const leftStylePattern = /left:\s*String\(\(placement\.xMm\s*\/\s*paper\.widthMm\)\s*\*\s*100\)\s*\+\s*"%"/;
const topStylePattern = /top:\s*String\(\(placement\.yMm\s*\/\s*paper\.heightMm\)\s*\*\s*100\)\s*\+\s*"%"/;
check('Placement left style stays pinned to placement.xMm (no layout thrashing)', leftStylePattern.test(sheetPreviewSource));
check('Placement top style stays pinned to placement.yMm (no layout thrashing)', topStylePattern.test(sheetPreviewSource));

// Test 4.4: Move handler calls setDraft, does NOT call onMove
const moveFnMatch = sheetPreviewSource.match(/function move\(event:[^)]+\)\s*\{([\s\S]*?)\}/);
check(
  'Pointer move handler updates local draft without calling onMove',
  moveFnMatch && moveFnMatch[1].includes('setDraft(next)') && !moveFnMatch[1].includes('onMove(')
);

// Test 4.5: Finish handler commits onMove ONLY on pointerup
const finishFnMatch = sheetPreviewSource.match(/function finish\(event:[^)]+,\s*cancel\s*=\s*false\)\s*\{([\s\S]*?)\}/);
check(
  'Finish handler calls onMove on commit and clears draft',
  finishFnMatch &&
    finishFnMatch[1].includes('setDraft(null)') &&
    finishFnMatch[1].includes('if (!cancel && next) onMove(')
);

// Test 4.6: Cancellation events (pointercancel, lostpointercapture) pass cancel = true
check(
  'onPointerCancel passes cancel = true',
  sheetPreviewSource.includes('onPointerCancel={event => finish(event, true)}')
);
check(
  'onLostPointerCapture passes cancel = true',
  sheetPreviewSource.includes('onLostPointerCapture={event => finish(event, true)}')
);

// ============================================================================
// SUITE 5: Latency and Throughput Benchmarks
// ============================================================================
console.log('\n--- SUITE 5: Latency & Throughput Benchmarks ---');

const ITERATIONS = 10000;

// Benchmark 5.1: areSheetPreviewPropsEqual throughput
{
  const prev = createSheetPreviewProps();
  const next = createSheetPreviewProps();
  const t0 = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    areSheetPreviewPropsEqual(prev, next);
  }
  const elapsed = performance.now() - t0;
  const usPerOp = (elapsed / ITERATIONS) * 1000;
  console.log(`  [BENCHMARK] areSheetPreviewPropsEqual: ${ITERATIONS} ops in ${elapsed.toFixed(2)}ms (${usPerOp.toFixed(3)} µs/op)`);
  check('areSheetPreviewPropsEqual runs in < 5 µs per check', usPerOp < 5.0, `Actual: ${usPerOp.toFixed(3)} µs`);
}

// Benchmark 5.2: areAssetCardPropsEqual throughput across 25 assets
{
  const assets = Array.from({ length: 25 }, (_, i) => createAsset(`asset-${i + 1}`));
  const cards = assets.map(a => ({ prev: createAssetCardProps(a), next: createAssetCardProps(a) }));

  const t0 = performance.now();
  for (let iter = 0; iter < 1000; iter++) {
    for (let c = 0; c < 25; c++) {
      areAssetCardPropsEqual(cards[c].prev, cards[c].next);
    }
  }
  const elapsed = performance.now() - t0;
  const usPerOp = (elapsed / 25000) * 1000;
  console.log(`  [BENCHMARK] areAssetCardPropsEqual (25 assets): 25,000 checks in ${elapsed.toFixed(2)}ms (${usPerOp.toFixed(3)} µs/op)`);
  check('areAssetCardPropsEqual runs in < 5 µs per check', usPerOp < 5.0, `Actual: ${usPerOp.toFixed(3)} µs`);
}

// ============================================================================
// SUITE 6: Adversarial Boundary & Edge Case Mining
// ============================================================================
console.log('\n--- SUITE 6: Adversarial Boundary & Edge Case Mining ---');

// Test 6.1: Ticket Cut Serial Numbering changes
{
  const p1WithoutSerial = createPlacement('asset-1', 0, 10, 10);
  const p1WithSerial = createPlacement('asset-1', 0, 10, 10, { serial: { text: '001', xPercent: 10, yPercent: 90, fontSizePt: 12 } });
  const p1WithNextSerial = createPlacement('asset-1', 0, 10, 10, { serial: { text: '002', xPercent: 10, yPercent: 90, fontSizePt: 12 } });

  const prev1 = createSheetPreviewProps({ page: createSheetPage(1, [p1WithoutSerial]) });
  const next1 = createSheetPreviewProps({ page: createSheetPage(1, [p1WithSerial]) });
  check('Adding serial numbering to placement triggers re-render', areSheetPreviewPropsEqual(prev1, next1) === false);

  const prev2 = createSheetPreviewProps({ page: createSheetPage(1, [p1WithSerial]) });
  const next2 = createSheetPreviewProps({ page: createSheetPage(1, [p1WithNextSerial]) });
  check('Changing serial numbering text triggers re-render', areSheetPreviewPropsEqual(prev2, next2) === false);
}

// Test 6.2: Notepad Cut Guides changes
{
  const cuts1 = [{ x1: 0, y1: 148.5, x2: 210, y2: 148.5 }];
  const cuts2 = [{ x1: 0, y1: 100, x2: 210, y2: 100 }, { x1: 0, y1: 200, x2: 210, y2: 200 }];

  const prevNoCuts = createSheetPreviewProps({ notepadCuts: undefined });
  const nextCuts = createSheetPreviewProps({ notepadCuts: cuts1 });
  check('Adding notepad cuts triggers re-render', areSheetPreviewPropsEqual(prevNoCuts, nextCuts) === false);

  const prevCuts1 = createSheetPreviewProps({ notepadCuts: cuts1 });
  const nextCuts2 = createSheetPreviewProps({ notepadCuts: cuts2 });
  check('Changing notepad cut line count triggers re-render', areSheetPreviewPropsEqual(prevCuts1, nextCuts2) === false);
}

// Test 6.3: Empty placements page
{
  const prevEmpty = createSheetPreviewProps({ page: createSheetPage(1, []) });
  const nextEmpty = createSheetPreviewProps({ page: createSheetPage(1, []) });
  check('Empty placements on both sheets suppresses re-render', areSheetPreviewPropsEqual(prevEmpty, nextEmpty) === true);
}

// Test 6.4: AssetCard processedUrl update (background removal or edited raster)
{
  const a1 = createAsset('a1', { processedUrl: 'blob:processed-v1' });
  const a2 = createAsset('a1', { processedUrl: 'blob:processed-v2' });
  const prev = createAssetCardProps(a1);
  const next = createAssetCardProps(a2);
  check('AssetCard re-renders when processedUrl changes', areAssetCardPropsEqual(prev, next) === false);
}

// Test 6.5: AssetCard cropShape change (rectangle -> circle)
{
  const a1 = createAsset('a1', { cropShape: 'rectangle' });
  const a2 = createAsset('a1', { cropShape: 'circle' });
  const prev = createAssetCardProps(a1);
  const next = createAssetCardProps(a2);
  check('AssetCard re-renders when cropShape changes', areAssetCardPropsEqual(prev, next) === false);
}

// Test 6.6: AssetCard notepadPreset & mode override changes
{
  const a1 = createAsset('a1');
  const prev = createAssetCardProps(a1, { notepadPreset: undefined, canUseNotepad: true });
  const next = createAssetCardProps(a1, { notepadPreset: 'sheet-cut-4', canUseNotepad: true });
  check('AssetCard re-renders when notepadPreset changes', areAssetCardPropsEqual(prev, next) === false);

  const prevOverride = createAssetCardProps(a1, { modeQuantityOverride: false });
  const nextOverride = createAssetCardProps(a1, { modeQuantityOverride: true });
  check('AssetCard re-renders when modeQuantityOverride changes', areAssetCardPropsEqual(prevOverride, nextOverride) === false);
}

// ---------------------------------------------------------------------------
// Final Summary & Exit
// ---------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`  TOTAL: ${totalTests} | PASSED: ${totalPassed} | FAILED: ${totalFailed}`);
console.log('================================================================');

if (totalFailed > 0) {
  console.error('\nFAILURES:');
  for (const f of failures) {
    console.error(`  - ${f.name} ${f.extraInfo}`);
  }
  process.exit(1);
} else {
  console.log('\nALL MEMOIZATION & PERFORMANCE ADVERSARIAL CHECKS PASSED CLEANLY.');
  process.exit(0);
}
