import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const srcDir = path.join(projectRoot, 'src');

console.log('================================================================');
console.log('  CHALLENGER M2: BARREL BOUNDARY, FACADE & CYCLE ADVERSARIAL HARNESS');
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
// Helper: Walk all files matching extensions
// ---------------------------------------------------------------------------
function walkDir(dir, filterExts = ['.ts', '.tsx']) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of list) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walkDir(fullPath, filterExts));
    } else if (entry.isFile()) {
      if (filterExts.some(ext => entry.name.endsWith(ext))) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Helper: Resolve import specifier to exact file
// ---------------------------------------------------------------------------
function resolveImportPath(sourceFile, specifier) {
  if (!specifier.startsWith('.')) {
    // External npm package
    return null;
  }
  const dir = path.dirname(sourceFile);
  const candidate = path.resolve(dir, specifier);

  // Exact file
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return candidate;
  }
  // Try extensions
  const extensions = ['.ts', '.tsx', '.d.ts', '.js', '.mjs', '.css'];
  for (const ext of extensions) {
    if (fs.existsSync(candidate + ext) && fs.statSync(candidate + ext).isFile()) {
      return candidate + ext;
    }
  }
  // Try directory index
  for (const ext of extensions) {
    const idx = path.join(candidate, 'index' + ext);
    if (fs.existsSync(idx) && fs.statSync(idx).isFile()) {
      return idx;
    }
  }
  return candidate; // unresolved or missing
}

// ---------------------------------------------------------------------------
// Helper: Extract import and export specifiers from TypeScript/JavaScript
// ---------------------------------------------------------------------------
function extractImportsAndExports(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const importSpecifiers = [];
  const exportSpecifiers = [];

  const staticImportExportRegex = /(?:import|export)\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = staticImportExportRegex.exec(content)) !== null) {
    const spec = match[1];
    if (match[0].startsWith('export')) {
      exportSpecifiers.push(spec);
    } else {
      importSpecifiers.push(spec);
    }
  }

  const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicImportRegex.exec(content)) !== null) {
    importSpecifiers.push(match[1]);
  }

  return { content, importSpecifiers, exportSpecifiers };
}

// ===========================================================================
// SUITE 1: Full Dependency Graph & Strict Cycle Detection
// ===========================================================================
console.log('\n--- Suite 1: Full Dependency Graph & Strict Cycle Detection ---');

const allSrcFiles = walkDir(srcDir, ['.ts', '.tsx']);
console.log(`[INFO] Found ${allSrcFiles.length} TypeScript source files in src/`);

const depGraph = new Map(); // file -> Set<file>
const unresolvedImports = [];

for (const file of allSrcFiles) {
  depGraph.set(file, new Set());
  const { importSpecifiers, exportSpecifiers } = extractImportsAndExports(file);
  const allSpecifiers = [...importSpecifiers, ...exportSpecifiers];

  for (const spec of allSpecifiers) {
    const resolved = resolveImportPath(file, spec);
    if (resolved) {
      if (fs.existsSync(resolved)) {
        depGraph.get(file).add(resolved);
      } else {
        unresolvedImports.push({ file, spec, resolved });
      }
    }
  }
}

assertTest('All relative imports resolve to existing files', unresolvedImports.length === 0,
  unresolvedImports.length > 0 ? `(${unresolvedImports.length} broken: ${JSON.stringify(unresolvedImports.slice(0, 3))})` : '');

// DFS cycle detection
const cycles = [];
const visited = new Map(); // file -> 0: unvisited, 1: visiting, 2: visited
const currentPath = [];

function dfs(node) {
  visited.set(node, 1);
  currentPath.push(node);

  const neighbors = depGraph.get(node) || new Set();
  for (const neighbor of neighbors) {
    if (!depGraph.has(neighbor)) continue; // ignore external or non-src files
    const state = visited.get(neighbor) || 0;
    if (state === 1) {
      // Cycle detected!
      const cycleStartIdx = currentPath.indexOf(neighbor);
      const cycle = currentPath.slice(cycleStartIdx).concat(neighbor);
      cycles.push(cycle);
    } else if (state === 0) {
      dfs(neighbor);
    }
  }

  currentPath.pop();
  visited.set(node, 2);
}

for (const file of allSrcFiles) {
  if ((visited.get(file) || 0) === 0) {
    dfs(file);
  }
}

assertTest('Zero circular dependency cycles detected across all src files', cycles.length === 0,
  cycles.length > 0 ? `Found ${cycles.length} cycles! First: ${cycles[0].map(p => path.relative(projectRoot, p)).join(' -> ')}` : '');

// ===========================================================================
// SUITE 2: Architectural Layer DAG & Public Barrel Isolation
// ===========================================================================
console.log('\n--- Suite 2: Architectural Layer DAG & Public Barrel Isolation ---');

const domainDir = path.join(srcDir, 'domain');
const platformDir = path.join(srcDir, 'platform');
const sharedDir = path.join(srcDir, 'shared');
const featuresDir = path.join(srcDir, 'features');
const appDir = path.join(srcDir, 'app');
const componentsDir = path.join(srcDir, 'components');
const coreDir = path.join(srcDir, 'core');

const domainFiles = walkDir(domainDir);
const platformFiles = walkDir(platformDir);
const sharedFiles = walkDir(sharedDir);
const featureFiles = walkDir(featuresDir);
const appFiles = walkDir(appDir);

// 2.1 Domain layer isolation (excluding known M1 printPreflight audit note)
let domainViolations = [];
for (const file of domainFiles) {
  const { importSpecifiers } = extractImportsAndExports(file);
  for (const spec of importSpecifiers) {
    if (spec === 'react' || spec === 'react-dom' || spec.startsWith('lucide-react')) {
      domainViolations.push({ file: path.relative(projectRoot, file), spec, reason: 'Domain cannot depend on UI/React' });
    }
    const resolved = resolveImportPath(file, spec);
    if (resolved) {
      // Allow known pre-existing M1 printPreflight.ts dependencies
      if (path.basename(file) === 'printPreflight.ts') continue;
      if (resolved.startsWith(platformDir) || resolved.startsWith(sharedDir) || resolved.startsWith(featuresDir) || resolved.startsWith(appDir)) {
        domainViolations.push({ file: path.relative(projectRoot, file), spec, reason: 'Domain cannot depend on platform, shared, features, or app' });
      }
    }
  }
}
assertTest('Domain layer purity: 0 dependencies on UI/React/Platform/Shared/Features (excluding M1 printPreflight)', domainViolations.length === 0,
  JSON.stringify(domainViolations));

// 2.2 Platform layer isolation: depends only on domain and shared, NOT features or app
let platformViolations = [];
for (const file of platformFiles) {
  const { importSpecifiers } = extractImportsAndExports(file);
  for (const spec of importSpecifiers) {
    const resolved = resolveImportPath(file, spec);
    if (resolved) {
      if (resolved.startsWith(featuresDir) || resolved.startsWith(appDir)) {
        platformViolations.push({ file: path.relative(projectRoot, file), spec, reason: 'Platform cannot depend on features or app' });
      }
    }
  }
}
assertTest('Platform layer isolation: 0 dependencies on features or app', platformViolations.length === 0,
  JSON.stringify(platformViolations));

// 2.3 Shared layer isolation: reusable UI & utils, ZERO dependencies on features or app
let sharedViolations = [];
for (const file of sharedFiles) {
  const { importSpecifiers } = extractImportsAndExports(file);
  for (const spec of importSpecifiers) {
    const resolved = resolveImportPath(file, spec);
    if (resolved) {
      if (resolved.startsWith(featuresDir) || resolved.startsWith(appDir)) {
        sharedViolations.push({ file: path.relative(projectRoot, file), spec, reason: 'Shared cannot depend on features or app' });
      }
    }
  }
}
assertTest('Shared layer isolation: 0 dependencies on features or app', sharedViolations.length === 0,
  JSON.stringify(sharedViolations));

// 2.4 Cross-Feature boundary violation:
// If Feature A imports from Feature B, it MUST go through Feature B's public barrel (src/features/B or src/features/B/index.ts)
// No deep imports into src/features/B/components/... or src/features/B/logic/...
let crossFeatureDeepImports = [];
for (const file of featureFiles) {
  const relToFeatures = path.relative(featuresDir, file);
  const currentFeature = relToFeatures.split(path.sep)[0];

  const { importSpecifiers } = extractImportsAndExports(file);
  for (const spec of importSpecifiers) {
    const resolved = resolveImportPath(file, spec);
    if (resolved && resolved.startsWith(featuresDir)) {
      const targetRel = path.relative(featuresDir, resolved);
      const targetFeature = targetRel.split(path.sep)[0];
      if (targetFeature !== currentFeature) {
        const subPath = targetRel.substring(targetFeature.length).replace(/^[\\\/]/, '');
        const isPublicBarrel = subPath === '' || subPath === 'index.ts' || subPath === 'index.tsx';
        if (!isPublicBarrel) {
          crossFeatureDeepImports.push({
            from: path.relative(projectRoot, file),
            to: path.relative(projectRoot, resolved),
            spec,
            fromFeature: currentFeature,
            toFeature: targetFeature,
            privateSubpath: subPath,
          });
        }
      }
    }
  }
}
assertTest('Cross-Feature encapsulation: 0 private/deep subpath imports across features', crossFeatureDeepImports.length === 0,
  JSON.stringify(crossFeatureDeepImports.slice(0, 5)));

// 2.5 Barrel completeness: verify all 12 feature barrels exist and export symbols
const expectedFeatures = [
  'background-removal',
  'crop',
  'exports',
  'frames',
  'id-photo-studio',
  'layers',
  'paper-sizes',
  'photo-editor',
  'preferences',
  'print-modes',
  'projects',
  'sheet-composer'
];

for (const feat of expectedFeatures) {
  const barrelPath = path.join(featuresDir, feat, 'index.ts');
  const exists = fs.existsSync(barrelPath);
  assertTest(`Feature barrel exists: src/features/${feat}/index.ts`, exists);
  if (exists) {
    const content = fs.readFileSync(barrelPath, 'utf8');
    const hasExports = /export\s+/g.test(content);
    assertTest(`Feature barrel has active exports: src/features/${feat}/index.ts`, hasExports);
  }
}

// 2.6 Shared barrels exist and export symbols
const sharedBarrels = [
  path.join(sharedDir, 'index.ts'),
  path.join(sharedDir, 'components', 'index.ts'),
  path.join(sharedDir, 'hooks', 'index.ts'),
  path.join(sharedDir, 'utils', 'index.ts')
];
for (const sb of sharedBarrels) {
  const exists = fs.existsSync(sb);
  assertTest(`Shared barrel exists: ${path.relative(projectRoot, sb)}`, exists);
  if (exists) {
    const content = fs.readFileSync(sb, 'utf8');
    assertTest(`Shared barrel has active exports: ${path.relative(projectRoot, sb)}`, /export\s+/g.test(content));
  }
}

// ===========================================================================
// SUITE 3: Facade Completeness & Resolution Verification
// ===========================================================================
console.log('\n--- Suite 3: Facade Completeness & Resolution Verification ---');

const componentFacades = walkDir(componentsDir);
const coreFacades = walkDir(coreDir);
console.log(`[INFO] Checking ${componentFacades.length} component facades and ${coreFacades.length} core facades`);

let brokenFacades = [];
let facadesReexportingNothing = [];

function checkFacade(facadeFile) {
  const content = fs.readFileSync(facadeFile, 'utf8');
  const { exportSpecifiers } = extractImportsAndExports(facadeFile);

  if (exportSpecifiers.length === 0 && !/export\s+/g.test(content)) {
    facadesReexportingNothing.push(path.relative(projectRoot, facadeFile));
    return;
  }

  // Check each export target resolves
  for (const spec of exportSpecifiers) {
    const resolved = resolveImportPath(facadeFile, spec);
    if (!resolved || !fs.existsSync(resolved)) {
      brokenFacades.push({
        facade: path.relative(projectRoot, facadeFile),
        spec,
        resolved: resolved ? path.relative(projectRoot, resolved) : 'null'
      });
    }
  }
}

for (const f of componentFacades) checkFacade(f);
for (const f of coreFacades) checkFacade(f);

assertTest('All component and core facades resolve to valid target files', brokenFacades.length === 0,
  JSON.stringify(brokenFacades));
assertTest('All component and core facades contain export declarations', facadesReexportingNothing.length === 0,
  JSON.stringify(facadesReexportingNothing));

// ===========================================================================
// SUITE 4: Strict Type Safety & `any` Fuzzing
// ===========================================================================
console.log('\n--- Suite 4: Strict Type Safety & any Fuzzing ---');

let anyViolations = [];

const anyTypeAnnotationRegex = /:\s*any\b/g;
const asAnyCastRegex = /\bas\s+any\b/g;
const genericAnyRegex = /<\s*any\s*>/g;
const anyArrayRegex = /\bany\s*\[\s*\]/g;
const arrayAnyRegex = /\bArray\s*<\s*any\s*>/g;

for (const file of allSrcFiles) {
  let content = fs.readFileSync(file, 'utf8');

  // Strip single-line and multi-line comments
  const strippedContent = content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  const lines = strippedContent.split('\n');
  lines.forEach((line, idx) => {
    if (
      anyTypeAnnotationRegex.test(line) ||
      asAnyCastRegex.test(line) ||
      genericAnyRegex.test(line) ||
      anyArrayRegex.test(line) ||
      arrayAnyRegex.test(line)
    ) {
      anyViolations.push({
        file: path.relative(projectRoot, file),
        line: idx + 1,
        code: line.trim()
      });
    }
  });
}

assertTest('Zero instances of prohibited `any` (: any, as any, <any>, any[]) across all src files', anyViolations.length === 0,
  anyViolations.length > 0 ? `Found ${anyViolations.length} violations: ${JSON.stringify(anyViolations.slice(0, 5))}` : '');

// ===========================================================================
// SUITE 5: Modular Stylesheets Architecture
// ===========================================================================
console.log('\n--- Suite 5: Modular Stylesheets Architecture ---');

const rootCssPath = path.join(srcDir, 'styles.css');
assertTest('src/styles.css exists', fs.existsSync(rootCssPath));

const rootCssContent = fs.readFileSync(rootCssPath, 'utf8');
const importCssMatches = [...rootCssContent.matchAll(/@import\s+['"]([^'"]+)['"];/g)].map(m => m[1]);

console.log(`[INFO] src/styles.css contains ${importCssMatches.length} @import statements`);
assertTest('src/styles.css acts as an aggregator with @import statements', importCssMatches.length >= 15);

let brokenCssImports = [];
for (const cssSpec of importCssMatches) {
  const resolvedCss = path.resolve(srcDir, cssSpec);
  if (!fs.existsSync(resolvedCss)) {
    brokenCssImports.push({ spec: cssSpec, resolved: path.relative(projectRoot, resolvedCss) });
  }
}
assertTest('All @import stylesheets in src/styles.css exist on disk', brokenCssImports.length === 0,
  JSON.stringify(brokenCssImports));

// Verify curly brace balance in all css files
const allCssFiles = walkDir(path.join(srcDir, 'styles'), ['.css']);
allCssFiles.push(rootCssPath);

let unbalancedCss = [];
for (const cssFile of allCssFiles) {
  const content = fs.readFileSync(cssFile, 'utf8');
  let open = 0;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') open++;
    else if (content[i] === '}') open--;
  }
  if (open !== 0) {
    unbalancedCss.push({ file: path.relative(projectRoot, cssFile), balance: open });
  }
}
assertTest('All modular stylesheets have balanced curly braces', unbalancedCss.length === 0,
  JSON.stringify(unbalancedCss));

// ===========================================================================
// SUMMARY
// ===========================================================================
console.log('\n================================================================');
console.log(`CHALLENGER M2 HARNESS COMPLETE: ${totalPassed} passed, ${totalFailed} failed out of ${totalTests} assertions`);
console.log('================================================================');

if (totalFailed > 0) {
  console.error('\nFAILURES SUMMARY:');
  failures.forEach(f => console.error(` - ${f.name}: ${f.details}`));
  process.exit(1);
} else {
  console.log('\nALL ADVERSARIAL ASSERTIONS PASSED WITH ZERO FAILURES.');
  process.exit(0);
}
