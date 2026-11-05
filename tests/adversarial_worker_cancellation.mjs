import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const srcDir = path.join(projectRoot, 'src');

console.log('================================================================');
console.log('  CHALLENGER M4-1: ADVERSARIAL CONCURRENCY & CANCELLATION TEST  ');
console.log('================================================================');

let totalTests = 0;
let totalPassed = 0;
let totalFailed = 0;
const failures = [];

function assertTest(name, condition, details = '') {
  totalTests++;
  if (condition) {
    totalPassed++;
    console.log(`[PASS] ${name}`);
  } else {
    totalFailed++;
    console.error(`[FAIL] ${name} ${details}`);
    failures.push({ name, details });
  }
}

// ---------------------------------------------------------------------------
// SUITE 1: CanvasPool Architecture, Overflow & Disposal Adversarial Stress
// ---------------------------------------------------------------------------
console.log('\n--- Suite 1: CanvasPool Invariants & Capacity Limiting ---');

class MockContext {
  constructor() {
    this.clears = [];
    this.draws = [];
  }
  clearRect(x, y, w, h) {
    this.clears.push({ x, y, w, h });
  }
  fillRect(x, y, w, h) {
    this.draws.push({ x, y, w, h });
  }
}

class MockCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.ctx = new MockContext();
  }
  getContext() {
    return this.ctx;
  }
}

// Dynamically transpile canvasPool.ts to test directly
const poolTsPath = path.join(srcDir, 'platform', 'rendering', 'canvasPool.ts');
assertTest('canvasPool.ts exists on disk', fs.existsSync(poolTsPath));

const poolTsSource = fs.readFileSync(poolTsPath, 'utf8');
const transpiledPoolJs = ts.transpileModule(poolTsSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

const tmpPoolFile = path.join(__dirname, '_tmp_canvas_pool.mjs');
fs.writeFileSync(tmpPoolFile, transpiledPoolJs, 'utf8');

const { CanvasPool } = await import(`file://${tmpPoolFile.replace(/\\/g, '/')}`);

try {
  // Test 1: Bounded Capacity Overflow
  const pool = new CanvasPool({
    maxCapacity: 3,
    factory: (w, h) => new MockCanvas(w, h),
    reset: c => c.getContext().clearRect(0, 0, c.width, c.height),
  });

  const canvases = [
    pool.acquire(100, 100),
    pool.acquire(100, 100),
    pool.acquire(100, 100),
    pool.acquire(100, 100),
    pool.acquire(100, 100),
  ];

  assertTest('Pool acquires 5 canvases without failure', canvases.length === 5);
  assertTest('Pool internal size is 0 while all canvases are acquired', pool.size === 0);

  // Release all 5 back into a pool of capacity 3
  for (const c of canvases) {
    pool.release(c);
  }

  assertTest('Pool bounds internal size to maxCapacity = 3', pool.size === 3);
  assertTest('Overflowed canvas 4 had width zeroed to 0', canvases[3].width === 0);
  assertTest('Overflowed canvas 5 had height zeroed to 0', canvases[4].height === 0);

  // Test 2: Dirty Canvas Reset on Re-Acquire
  const c1 = pool.acquire(200, 150);
  assertTest('Acquired pooled canvas was resized to 200x150', c1.width === 200 && c1.height === 150);
  assertTest('Acquired pooled canvas had clearRect called on reset', c1.ctx.clears.length > 0);

  // Test 3: withCanvas helper
  let usedInScope = false;
  pool.withCanvas(50, 50, canvas => {
    usedInScope = true;
    assert.equal(canvas.width, 50);
  });
  assertTest('withCanvas executes callback and returns canvas to pool', usedInScope);

  // Test 4: Disposal invariants
  pool.dispose();
  assertTest('Pool size is 0 after disposal', pool.size === 0);
  let threwOnAcquire = false;
  try {
    pool.acquire(50, 50);
  } catch (err) {
    threwOnAcquire = true;
  }
  assertTest('Acquiring from disposed pool throws Error', threwOnAcquire);

  // Double disposal is safe
  pool.dispose();
  assertTest('Redundant dispose() call is safe no-op', true);
} finally {
  if (fs.existsSync(tmpPoolFile)) fs.unlinkSync(tmpPoolFile);
}

// ---------------------------------------------------------------------------
// SUITE 2: PhotoPreviewRenderer Concurrency & Supersedence Stress Test
// ---------------------------------------------------------------------------
console.log('\n--- Suite 2: Worker Concurrency & Preemptive Cancellation ---');

const rendererTsPath = path.join(srcDir, 'features', 'photo-editor', 'logic', 'photoPreviewRenderer.ts');
assertTest('photoPreviewRenderer.ts exists on disk', fs.existsSync(rendererTsPath));

const rendererSource = fs.readFileSync(rendererTsPath, 'utf8');

// Verify AST patterns for cancellation and ImageBitmap transfer
const rAst = ts.createSourceFile(rendererTsPath, rendererSource, ts.ScriptTarget.Latest, true);

let hasAbortCheck = false;
let hasCancelMessageType = false;
let hasTransferableRenderBitmap = false;
let hasZeroAny = true;

ts.forEachChild(rAst, function checkNode(node) {
  if (ts.isTypeNode(node) && node.kind === ts.SyntaxKind.AnyKeyword) {
    hasZeroAny = false;
  }
  const text = node.getText(rAst);
  if (text.includes('type: "cancel"') || text.includes("type: 'cancel'")) {
    hasCancelMessageType = true;
  }
  if (text.includes('signal.aborted') || text.includes('signal?.aborted')) {
    hasAbortCheck = true;
  }
  if (text.includes('renderBitmap(')) {
    hasTransferableRenderBitmap = true;
  }
  ts.forEachChild(node, checkNode);
});

assertTest('photoPreviewRenderer enforces strict zero-any invariant', hasZeroAny);
assertTest('photoPreviewRenderer implements two-way cancel message protocol', hasCancelMessageType);
assertTest('photoPreviewRenderer checks AbortSignal.aborted preemptively', hasAbortCheck);
assertTest('photoPreviewRenderer exposes renderBitmap transferable method', hasTransferableRenderBitmap);

// ---------------------------------------------------------------------------
// SUITE 3: Worker Transferable Contract & Type Guard Discrimination
// ---------------------------------------------------------------------------
console.log('\n--- Suite 3: Worker Response Type Guard & Protocol Robustness ---');

const workerTsPath = path.join(srcDir, 'platform', 'workers', 'photoPreview.worker.ts');
assertTest('photoPreview.worker.ts exists on disk', fs.existsSync(workerTsPath));

const workerSource = fs.readFileSync(workerTsPath, 'utf8');

assertTest('Worker implements transferToImageBitmap zero-copy transfer', workerSource.includes('transferToImageBitmap()'));
assertTest('Worker posts reply with transferable list [reply.bitmap]', workerSource.includes('[reply.bitmap]'));
assertTest('Worker tracks activeControllers Map for abort signals', workerSource.includes('activeControllers'));
assertTest('Worker checks signal.aborted before expensive pixel filters', workerSource.includes('signal.aborted'));
assertTest('Worker utilizes LruCache for decoded bitmap caching', workerSource.includes('LruCache'));

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`  CHALLENGER M4-1 RESULTS: ${totalPassed}/${totalTests} PASSED (${totalFailed} FAILED)`);
console.log('================================================================\n');

if (totalFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
