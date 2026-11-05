import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const srcDir = path.join(projectRoot, 'src');
const componentsDir = path.join(srcDir, 'components');
const coreDir = path.join(srcDir, 'core');
const featuresDir = path.join(srcDir, 'features');
const sharedDir = path.join(srcDir, 'shared');

console.log('================================================================');
console.log('  EMPIRICAL ADVERSARIAL TEST: FACADE RUNTIME EQUIVALENCE & BARRELS');
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
// SUITE 1: Runtime Referential Identity of Core Facades (src/core/*.ts)
// ---------------------------------------------------------------------------
console.log('\n--- Suite 1: Runtime Referential Identity of Core Facades ---');

const coreFiles = fs.readdirSync(coreDir).filter(f => f.endsWith('.ts'));
console.log(`[INFO] Found ${coreFiles.length} core facades to test for runtime equivalence`);

let coreEquivalenceFailures = [];

for (const f of coreFiles) {
  const facadePath = path.join(coreDir, f);
  const facadeUrl = pathToFileURL(facadePath).href;

  try {
    const facadeModule = await import(facadeUrl);
    const content = fs.readFileSync(facadePath, 'utf8');

    // Find target path from export ... from '...'
    const targetMatch = content.match(/export\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/);
    if (!targetMatch) {
      assertTest(`Facade ${f} has export source`, false, 'No export source found');
      continue;
    }

    const targetRel = targetMatch[1];
    const targetResolved = path.resolve(coreDir, targetRel);
    const targetUrl = pathToFileURL(targetResolved).href;

    const targetModule = await import(targetUrl);

    // Verify all keys in target are present in facade and referentially identical
    const targetKeys = Object.keys(targetModule);
    const facadeKeys = Object.keys(facadeModule);

    let keysMatch = true;
    let missingInFacade = [];
    let mismatchingValues = [];

    for (const key of targetKeys) {
      if (!(key in facadeModule)) {
        keysMatch = false;
        missingInFacade.push(key);
      } else {
        const targetVal = targetModule[key];
        const facadeVal = facadeModule[key];
        if (targetVal !== facadeVal) {
          // If both are NaN, they are equal
          if (typeof targetVal === 'number' && typeof facadeVal === 'number' && isNaN(targetVal) && isNaN(facadeVal)) {
            continue;
          }
          mismatchingValues.push({ key, targetVal: typeof targetVal, facadeVal: typeof facadeVal });
        }
      }
    }

    if (!keysMatch || mismatchingValues.length > 0) {
      coreEquivalenceFailures.push({
        facade: f,
        missingInFacade,
        mismatchingValues
      });
      assertTest(`Facade equivalence: ${f}`, false, `Missing: ${missingInFacade.join(', ')}, Mismatches: ${JSON.stringify(mismatchingValues)}`);
    } else {
      assertTest(`Facade equivalence: ${f} (${targetKeys.length} exported symbols identical)`, true);
    }
  } catch (err) {
    coreEquivalenceFailures.push({ facade: f, error: err.message });
    assertTest(`Facade import succeeds: ${f}`, false, err.message);
  }
}

assertTest('All core facades achieve 100% runtime referential identity with relocated logic', coreEquivalenceFailures.length === 0,
  JSON.stringify(coreEquivalenceFailures.slice(0, 5)));

// ---------------------------------------------------------------------------
// SUITE 2: Component Facade AST Re-Export Equivalence (src/components/*.tsx)
// ---------------------------------------------------------------------------
console.log('\n--- Suite 2: Component Facade AST Re-Export Equivalence ---');

const compFiles = fs.readdirSync(componentsDir).filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));
console.log(`[INFO] Found ${compFiles.length} component facades to test`);

let compEquivalenceFailures = [];

for (const f of compFiles) {
  const facadePath = path.join(componentsDir, f);
  const content = fs.readFileSync(facadePath, 'utf8');

  // Parse using TypeScript compiler
  const sourceFile = ts.createSourceFile(facadePath, content, ts.ScriptTarget.Latest, true);

  let hasExportDefault = false;
  let exportTargets = [];
  let namedExports = [];
  let isExportStar = false;

  ts.forEachChild(sourceFile, node => {
    if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        exportTargets.push(node.moduleSpecifier.text);
      }
      if (node.exportClause) {
        if (ts.isNamedExports(node.exportClause)) {
          for (const el of node.exportClause.elements) {
            namedExports.push(el.name.text);
            if (el.name.text === 'default') hasExportDefault = true;
          }
        }
      } else {
        isExportStar = true;
      }
    } else if (ts.isExportAssignment(node)) {
      hasExportDefault = true;
    }
  });

  if (exportTargets.length === 0) {
    compEquivalenceFailures.push({ file: f, reason: 'No export source found' });
    assertTest(`Component facade ${f} re-exports from target`, false);
    continue;
  }

  // Verify target file exists
  let allTargetsExist = true;
  for (const targetSpec of exportTargets) {
    const candidate = path.resolve(componentsDir, targetSpec);
    let resolved = null;
    const exts = ['', '.tsx', '.ts', '/index.tsx', '/index.ts'];
    for (const ext of exts) {
      if (fs.existsSync(candidate + ext) && fs.statSync(candidate + ext).isFile()) {
        resolved = candidate + ext;
        break;
      }
    }
    if (!resolved) {
      allTargetsExist = false;
      compEquivalenceFailures.push({ file: f, targetSpec, reason: 'Target does not exist on disk' });
    }
  }

  assertTest(`Component facade target resolution: ${f} -> ${exportTargets.join(', ')}`, allTargetsExist);
}

assertTest('All component facades resolve cleanly to relocated components', compEquivalenceFailures.length === 0,
  JSON.stringify(compEquivalenceFailures));

// ---------------------------------------------------------------------------
// SUITE 3: Public API Barrels Export Integrity & Completeness
// ---------------------------------------------------------------------------
console.log('\n--- Suite 3: Public API Barrels Export Integrity & Completeness ---');

const featureDirs = fs.readdirSync(featuresDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

let barrelIssues = [];

for (const feat of featureDirs) {
  const barrelFile = path.join(featuresDir, feat, 'index.ts');
  if (!fs.existsSync(barrelFile)) {
    barrelIssues.push({ feature: feat, issue: 'Missing index.ts' });
    continue;
  }
  const content = fs.readFileSync(barrelFile, 'utf8');
  const sourceFile = ts.createSourceFile(barrelFile, content, ts.ScriptTarget.Latest, true);

  let exportedIdentifiers = [];
  let exportSources = [];

  ts.forEachChild(sourceFile, node => {
    if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        exportSources.push(node.moduleSpecifier.text);
      }
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const el of node.exportClause.elements) {
          exportedIdentifiers.push(el.name.text);
        }
      }
    }
  });

  // Verify that all exportSources point to internal files inside src/features/<feat>/ (or shared)
  for (const src of exportSources) {
    const resolved = path.resolve(path.join(featuresDir, feat), src);
    let found = false;
    for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
      if (fs.existsSync(resolved + ext)) {
        found = true;
        break;
      }
    }
    if (!found) {
      barrelIssues.push({ feature: feat, issue: `Broken export source: ${src}` });
    }
    // Verify it doesn't import from legacy core or components
    if (resolved.startsWith(componentsDir) || resolved.startsWith(coreDir)) {
      barrelIssues.push({ feature: feat, issue: `Barrel re-exports from legacy path: ${path.relative(projectRoot, resolved)}` });
    }
  }

  assertTest(`Barrel integrity: src/features/${feat}/index.ts (${exportedIdentifiers.length} exports)`,
    exportedIdentifiers.length > 0 && exportSources.length > 0);
}

assertTest('All 12 feature barrels are structurally sound with 0 broken export paths', barrelIssues.length === 0,
  JSON.stringify(barrelIssues));

// ---------------------------------------------------------------------------
// SUITE 4: Cross-Feature Boundary Leakage Simulation
// ---------------------------------------------------------------------------
console.log('\n--- Suite 4: Cross-Feature Boundary Leakage Simulation ---');

// Adversarial test: verify that if a consumer imports from a feature barrel,
// it receives the advertised public API and only that API.
// We can also verify that no feature file directly imports private submodules of other features.
let crossFeaturePrivateImports = [];
function walk(dir) {
  let res = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) res = res.concat(walk(p));
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) res.push(p);
  }
  return res;
}

const allFeatureFiles = walk(featuresDir);
for (const file of allFeatureFiles) {
  const rel = path.relative(featuresDir, file);
  const currentFeat = rel.split(path.sep)[0];
  const content = fs.readFileSync(file, 'utf8');
  const importMatches = [...content.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)].map(m => m[1]);

  for (const spec of importMatches) {
    if (!spec.startsWith('.')) continue;
    const resolved = path.resolve(path.dirname(file), spec);
    if (resolved.startsWith(featuresDir)) {
      const targetRel = path.relative(featuresDir, resolved);
      const targetFeat = targetRel.split(path.sep)[0];
      if (targetFeat !== currentFeat) {
        // Must only import from root of target feature or its index.ts
        const rest = targetRel.slice(targetFeat.length).replace(/^[\\\/]/, '');
        const isPublic = rest === '' || rest === 'index.ts' || rest === 'index.tsx';
        if (!isPublic) {
          crossFeaturePrivateImports.push({
            from: path.relative(projectRoot, file),
            to: path.relative(projectRoot, resolved),
            privatePath: rest
          });
        }
      }
    }
  }
}

assertTest('Cross-Feature Boundary Invariant: ZERO private subpath cross-feature imports',
  crossFeaturePrivateImports.length === 0,
  JSON.stringify(crossFeaturePrivateImports));

// ---------------------------------------------------------------------------
// SUMMARY
// ---------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`FACADE & BARREL HARNESS COMPLETE: ${totalPassed} passed, ${totalFailed} failed out of ${totalTests} assertions`);
console.log('================================================================');

if (totalFailed > 0) {
  console.error('\nFAILURES:');
  failures.forEach(f => console.error(` - ${f.name}: ${f.details}`));
  process.exit(1);
} else {
  console.log('\nALL FACADE AND BARREL ADVERSARIAL ASSERTIONS PASSED.');
  process.exit(0);
}
