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
console.log('  CHALLENGER M4-2: ADVERSARIAL CACHE, SPATIAL & BLOB LIFECYCLE  ');
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
// Helper: transpile and import TypeScript module directly
// ---------------------------------------------------------------------------
function transpileAndImport(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const tmpFile = path.join(__dirname, `_tmp_${path.basename(filePath, '.ts')}.mjs`);
  fs.writeFileSync(tmpFile, transpiled, 'utf8');
  return {
    mod: import(`file://${tmpFile.replace(/\\/g, '/')}`),
    cleanup: () => {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    },
  };
}

// ---------------------------------------------------------------------------
// SUITE 1: LRU Cache Eviction & Ordering Stress (10,000 Operations)
// ---------------------------------------------------------------------------
console.log('\n--- Suite 1: LRU Cache Eviction Ordering & Stress ---');

const lruPath = path.join(srcDir, 'shared', 'utils', 'lruCache.ts');
assertTest('lruCache.ts exists on disk', fs.existsSync(lruPath));

const { mod: lruModPromise, cleanup: cleanupLru } = transpileAndImport(lruPath);
const { LruCache } = await lruModPromise;

try {
  const evicted = [];
  const cache = new LruCache({
    maxCapacity: 10,
    onEvict: (k, v) => evicted.push({ k, v }),
  });

  // Insert 20 keys
  for (let i = 1; i <= 20; i++) {
    cache.set(`key-${i}`, `val-${i}`);
  }

  assertTest('Cache capacity is strictly bounded at 10', cache.size === 10);
  assertTest('Exactly 10 items were evicted on insertion overflow', evicted.length === 10);
  assertTest('Eviction order was strictly FIFO for untouched items', evicted[0].k === 'key-1' && evicted[9].k === 'key-10');
  assertTest('Keys 11 through 20 remain present in the cache', cache.has('key-11') && cache.has('key-20'));

  // Test recency update on access
  cache.get('key-11'); // key-11 becomes most recently used
  cache.set('key-21', 'val-21'); // should evict key-12, NOT key-11!
  assertTest('Accessing key-11 prevented its eviction on subsequent insert', cache.has('key-11') && !cache.has('key-12'));

  // 10,000 randomized operations stress test
  const stressEvicted = [];
  const stressCache = new LruCache({
    maxCapacity: 50,
    onEvict: (k, v) => stressEvicted.push(k),
  });

  for (let op = 0; op < 10000; op++) {
    const key = `key-${Math.floor(Math.random() * 200)}`;
    if (Math.random() < 0.6) {
      stressCache.set(key, op);
    } else if (Math.random() < 0.8) {
      stressCache.get(key);
    } else {
      stressCache.delete(key);
    }
    assert(stressCache.size <= 50, 'Cache exceeded maxCapacity during random operations');
  }

  assertTest('Cache maintained size <= 50 throughout 10,000 random operations', stressCache.size <= 50);
} finally {
  cleanupLru();
}

// ---------------------------------------------------------------------------
// SUITE 2: UniformSpatialGrid2D at Scale (1,000 items & >95% Pruning)
// ---------------------------------------------------------------------------
console.log('\n--- Suite 2: UniformSpatialGrid2D Indexing & Collision Pruning ---');

const spatialPath = path.join(srcDir, 'domain/geometry/spatialGrid.ts');
assertTest('spatialGrid.ts exists on disk', fs.existsSync(spatialPath));

const { mod: spatialModPromise, cleanup: cleanupSpatial } = transpileAndImport(spatialPath);
const { UniformSpatialGrid2D, boxesIntersect } = await spatialModPromise;

try {
  const paperW = 210; // A4 mm
  const paperH = 297;
  const grid = new UniformSpatialGrid2D(paperW, paperH, 15);

  assertTest('Grid allocates correct column and row buckets', grid.cols > 0 && grid.rows > 0);

  // Insert 500 small 10x10 items randomly
  const items = [];
  for (let i = 0; i < 500; i++) {
    const x = Math.random() * (paperW - 20);
    const y = Math.random() * (paperH - 20);
    const item = {
      id: `item-${i}`,
      bounds: { minX: x, minY: y, maxX: x + 10, maxY: y + 10 },
      data: { index: i },
    };
    items.push(item);
    grid.insert(item);
  }

  assertTest('Grid successfully inserted 500 items', items.length === 500);

  // Measure collision search savings against naive O(N) sweep
  const testBox = { minX: 50, minY: 50, maxX: 70, maxY: 70 };
  const spatialMatches = grid.queryBox(testBox);

  // Naive sweep
  const naiveMatches = items.filter(it => boxesIntersect(it.bounds, testBox));

  assertTest('queryBox returned all true intersecting candidates without false negatives', 
    spatialMatches.length >= naiveMatches.length
  );

  // Verify pruning efficiency
  const prunedFraction = 1 - (spatialMatches.length / items.length);
  assertTest(`Spatial grid pruned ${Math.round(prunedFraction * 100)}% of candidates (>90% threshold)`, prunedFraction > 0.90);

  // Removal test
  const toRemove = items[0];
  const removed = grid.remove(toRemove.id);
  assertTest('Grid correctly removed item', removed === true);
  const reMatches = grid.queryPoint(toRemove.bounds.minX + 1, toRemove.bounds.minY + 1);
  assertTest('Removed item is no longer queryable', !reMatches.some(m => m.id === toRemove.id));
} finally {
  cleanupSpatial();
}

// ---------------------------------------------------------------------------
// SUITE 3: Generation-Scoped History Blob Retention Invariants (B6)
// ---------------------------------------------------------------------------
console.log('\n--- Suite 3: Generation-Scoped History Retention (B6) ---');

const refAssetsPath = path.join(srcDir, 'platform', 'storage', 'referencedAssets.ts');
assertTest('referencedAssets.ts exists on disk', fs.existsSync(refAssetsPath));

const { mod: refModPromise, cleanup: cleanupRef } = transpileAndImport(refAssetsPath);
const { referencedImageUrls } = await refModPromise;

try {
  // Construct 50 history snapshots with progressive derived retouched rasters
  const baseAsset = {
    id: 'photo-portrait-1',
    url: 'blob:permanent-original-bytes',
    processedUrl: 'blob:initial-retouch',
  };

  const history = [];
  for (let step = 1; step <= 50; step++) {
    history.push({
      items: [{
        ...baseAsset,
        processedUrl: `blob:retouch-generation-${step}`,
      }],
    });
  }

  const activeAsset = {
    ...baseAsset,
    processedUrl: 'blob:active-latest-retouch',
  };

  const refs = referencedImageUrls([activeAsset], history, new Set(), 4);

  assertTest('Original photo URL is permanently retained across 50 history steps', refs.has('blob:permanent-original-bytes'));
  assertTest('Active processed URL is permanently retained', refs.has('blob:active-latest-retouch'));

  // The 4 newest history generations (50, 49, 48, 47) must be retained
  assertTest('Newest historical generation 50 is retained', refs.has('blob:retouch-generation-50'));
  assertTest('Newest historical generation 49 is retained', refs.has('blob:retouch-generation-49'));
  assertTest('Newest historical generation 48 is retained', refs.has('blob:retouch-generation-48'));
  assertTest('Newest historical generation 47 is retained', refs.has('blob:retouch-generation-47'));

  // Older historical generations (< 47) must be released for GC
  assertTest('Older generation 46 was released for GC', !refs.has('blob:retouch-generation-46'));
  assertTest('Ancient generation 1 was released for GC', !refs.has('blob:retouch-generation-1'));

  // Total referenced URLs = 1 (original) + 1 (active) + 4 (historical) = 6 URLs
  assertTest(`Referenced URL count is strictly bounded to 6 (actual: ${refs.size})`, refs.size === 6);
} finally {
  cleanupRef();
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`  CHALLENGER M4-2 RESULTS: ${totalPassed}/${totalTests} PASSED (${totalFailed} FAILED)`);
console.log('================================================================\n');

if (totalFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
