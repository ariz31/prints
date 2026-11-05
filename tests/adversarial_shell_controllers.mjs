import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const srcDir = path.join(projectRoot, 'src');

console.log('================================================================');
console.log('  EMPIRICAL ADVERSARIAL TEST: M3 SHELL, CONTROLLERS & FACADES');
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
// Helper: Transpile and import TSX modules with proper Node module resolution
// ---------------------------------------------------------------------------
const boundedTmp = path.join(projectRoot, 'tests', '_bounded.mjs');
const featureTmp = path.join(projectRoot, 'tests', '_feature.mjs');
const facadeTmp = path.join(projectRoot, 'tests', '_facade.mjs');

// ===========================================================================
// SUITE 1: SheetPreview Facade Identity & Comparator Invariants
// ===========================================================================
console.log('\n--- Suite 1: SheetPreview Facade Identity & Comparator Invariants ---');

const facadePath = path.join(srcDir, 'components', 'SheetPreview.tsx');
const featurePath = path.join(srcDir, 'features', 'sheet-composer', 'components', 'SheetPreview.tsx');

assertTest('SheetPreview facade file exists on disk', fs.existsSync(facadePath));
assertTest('SheetPreview feature component exists on disk', fs.existsSync(featurePath));

// AST Analysis of facade
const facadeSource = fs.readFileSync(facadePath, 'utf8');
const facadeAst = ts.createSourceFile(facadePath, facadeSource, ts.ScriptTarget.Latest, true);

let hasStarExport = false;
let hasDefaultExport = false;
let starExportTarget = '';
let defaultExportTarget = '';

ts.forEachChild(facadeAst, node => {
  if (ts.isExportDeclaration(node)) {
    if (!node.exportClause && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      hasStarExport = true;
      starExportTarget = node.moduleSpecifier.text;
    } else if (node.exportClause && ts.isNamedExports(node.exportClause) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      for (const el of node.exportClause.elements) {
        if (el.name.text === 'default') {
          hasDefaultExport = true;
          defaultExportTarget = node.moduleSpecifier.text;
        }
      }
    }
  }
});

assertTest('Facade has star export (export *)', hasStarExport, `Found: ${hasStarExport}`);
assertTest('Facade has default export (export { default })', hasDefaultExport, `Found: ${hasDefaultExport}`);
assertTest('Star export targets sheet-composer SheetPreview', starExportTarget.includes('sheet-composer/components/SheetPreview'));
assertTest('Default export targets sheet-composer SheetPreview', defaultExportTarget.includes('sheet-composer/components/SheetPreview'));

// Runtime Transpilation & Exports
let facadeMod = null;
let featureMod = null;

try {
  const boundedFieldPath = path.join(srcDir, 'shared', 'components', 'BoundedNumberField.tsx');
  let boundedCode = fs.readFileSync(boundedFieldPath, 'utf8');
  boundedCode = boundedCode.replace(/from\s+['"](\.\.?\/[^'"]+\.ts)['"]/g, (m, rel) => {
    const abs = path.resolve(path.dirname(boundedFieldPath), rel);
    return 'from ' + JSON.stringify(pathToFileURL(abs).href);
  });
  const transpiledBounded = ts.transpileModule(boundedCode, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  fs.writeFileSync(boundedTmp, transpiledBounded);

  const stubFramePath = path.join(projectRoot, 'tests', '_stub_frame.mjs');
  fs.writeFileSync(stubFramePath, 'export default function FrameSvg() { return null; }\n');

  let featureCode = fs.readFileSync(featurePath, 'utf8');
  featureCode = featureCode.replaceAll('../../../shared/components/BoundedNumberField.tsx', './_bounded.mjs');
  featureCode = featureCode.replaceAll('../../frames/index.ts', './_stub_frame.mjs');
  featureCode = featureCode.replaceAll('../../crop/index.ts', '../../crop/logic/cropShapes.ts');
  featureCode = featureCode.replace(/from\s+['"](\.\.?\/[^'"]+\.ts)['"]/g, (m, rel) => {
    const abs = path.resolve(path.dirname(featurePath), rel);
    return 'from ' + JSON.stringify(pathToFileURL(abs).href);
  });
  const transpiledFeature = ts.transpileModule(featureCode, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  fs.writeFileSync(featureTmp, transpiledFeature);

  let facadeCode = fs.readFileSync(facadePath, 'utf8');
  facadeCode = facadeCode.replaceAll('../features/sheet-composer/components/SheetPreview.tsx', './_feature.mjs');
  const transpiledFacade = ts.transpileModule(facadeCode, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  fs.writeFileSync(facadeTmp, transpiledFacade);

  featureMod = await import(pathToFileURL(featureTmp).href);
  facadeMod = await import(pathToFileURL(facadeTmp).href);
  assertTest('Transpilation and import of SheetPreview modules succeeds', true);
} catch (err) {
  assertTest('Transpilation and import of SheetPreview modules succeeds', false, err.message);
} finally {
  const stubFramePath = path.join(projectRoot, 'tests', '_stub_frame.mjs');
  if (fs.existsSync(stubFramePath)) fs.unlinkSync(stubFramePath);
  if (fs.existsSync(boundedTmp)) fs.unlinkSync(boundedTmp);
  if (fs.existsSync(featureTmp)) fs.unlinkSync(featureTmp);
  if (fs.existsSync(facadeTmp)) fs.unlinkSync(facadeTmp);
}

if (facadeMod && featureMod) {
  assertTest('Facade exports default component function', typeof facadeMod.default === 'object' || typeof facadeMod.default === 'function');
  assertTest('Feature exports default component function', typeof featureMod.default === 'object' || typeof featureMod.default === 'function');
  assertTest('Named SheetPreview export exists in facade', typeof facadeMod.SheetPreview !== 'undefined');
  assertTest('Named areSheetPreviewPropsEqual comparator exists in facade', typeof facadeMod.areSheetPreviewPropsEqual === 'function');
  assertTest('Comparator function reference identity matches feature', facadeMod.areSheetPreviewPropsEqual === featureMod.areSheetPreviewPropsEqual);

  // Adversarial Stress Testing of areSheetPreviewPropsEqual
  const areEqual = facadeMod.areSheetPreviewPropsEqual;

  const mockPlacement1 = {
    itemId: 'asset-1',
    copyIndex: 0,
    xMm: 10,
    yMm: 10,
    widthMm: 50,
    heightMm: 50,
    rotated: false,
    serial: { text: '001', xPercent: 50, yPercent: 50, fontSizePt: 10 },
  };

  const mockPlacement2 = {
    itemId: 'asset-2',
    copyIndex: 0,
    xMm: 70,
    yMm: 10,
    widthMm: 50,
    heightMm: 50,
    rotated: false,
  };

  const mockItem1 = { id: 'asset-1', name: 'Photo 1', widthMm: 50, heightMm: 50, copies: 1 };
  const mockItem2 = { id: 'asset-2', name: 'Photo 2', widthMm: 50, heightMm: 50, copies: 1 };
  const mockItemUnplaced = { id: 'asset-3', name: 'Photo 3 (Unplaced)', widthMm: 50, heightMm: 50, copies: 1 };

  function makeProps(overrides = {}) {
    return {
      index: 0,
      sheetCount: 1,
      totalCopies: 2,
      paperLabel: 'A4',
      orientation: 'portrait',
      guides: true,
      trimStyle: 'outline',
      arrange: false,
      marginMm: 5,
      printCoverage: '85%',
      paper: { widthMm: 210, heightMm: 297 },
      page: {
        pageNumber: 1,
        placements: [{ ...mockPlacement1 }, { ...mockPlacement2 }],
      },
      items: [mockItem1, mockItem2, mockItemUnplaced],
      previews: { 'asset-1': 'blob:url1', 'asset-2': 'blob:url2', 'asset-3': 'blob:url3' },
      notepadCuts: undefined,
      onRotate: () => {},
      onMove: () => {},
      ...overrides,
    };
  }

  const baseProps = makeProps();

  // Test 1: Identical baseline
  assertTest('areSheetPreviewPropsEqual: baseline identical props returns true', areEqual(baseProps, makeProps()) === true);

  // Test 2: Scalar mutations
  assertTest('areSheetPreviewPropsEqual: index mutation returns false', areEqual(baseProps, makeProps({ index: 1 })) === false);
  assertTest('areSheetPreviewPropsEqual: sheetCount mutation returns false', areEqual(baseProps, makeProps({ sheetCount: 2 })) === false);
  assertTest('areSheetPreviewPropsEqual: totalCopies mutation returns false', areEqual(baseProps, makeProps({ totalCopies: 3 })) === false);
  assertTest('areSheetPreviewPropsEqual: paperLabel mutation returns false', areEqual(baseProps, makeProps({ paperLabel: 'Letter' })) === false);
  assertTest('areSheetPreviewPropsEqual: orientation mutation returns false', areEqual(baseProps, makeProps({ orientation: 'landscape' })) === false);
  assertTest('areSheetPreviewPropsEqual: guides mutation returns false', areEqual(baseProps, makeProps({ guides: false })) === false);
  assertTest('areSheetPreviewPropsEqual: trimStyle mutation returns false', areEqual(baseProps, makeProps({ trimStyle: 'corner' })) === false);
  assertTest('areSheetPreviewPropsEqual: arrange mutation returns false', areEqual(baseProps, makeProps({ arrange: true })) === false);
  assertTest('areSheetPreviewPropsEqual: marginMm mutation returns false', areEqual(baseProps, makeProps({ marginMm: 10 })) === false);
  assertTest('areSheetPreviewPropsEqual: printCoverage mutation returns false', areEqual(baseProps, makeProps({ printCoverage: '90%' })) === false);

  // Test 3: Paper dimension value equality
  assertTest('areSheetPreviewPropsEqual: paper widthMm mutation returns false', areEqual(baseProps, makeProps({ paper: { widthMm: 200, heightMm: 297 } })) === false);
  assertTest('areSheetPreviewPropsEqual: paper heightMm mutation returns false', areEqual(baseProps, makeProps({ paper: { widthMm: 210, heightMm: 290 } })) === false);
  assertTest('areSheetPreviewPropsEqual: paper new object with identical values returns true', areEqual(baseProps, makeProps({ paper: { widthMm: 210, heightMm: 297 } })) === true);

  // Test 4: Placement mutations
  const mutatedPageNumber = makeProps({ page: { pageNumber: 2, placements: [{ ...mockPlacement1 }, { ...mockPlacement2 }] } });
  assertTest('areSheetPreviewPropsEqual: pageNumber mutation returns false', areEqual(baseProps, mutatedPageNumber) === false);

  const mutatedPlacementLen = makeProps({ page: { pageNumber: 1, placements: [{ ...mockPlacement1 }] } });
  assertTest('areSheetPreviewPropsEqual: placements count change returns false', areEqual(baseProps, mutatedPlacementLen) === false);

  const mutatedPlacementCoord = makeProps({
    page: { pageNumber: 1, placements: [{ ...mockPlacement1, xMm: 15 }, { ...mockPlacement2 }] },
  });
  assertTest('areSheetPreviewPropsEqual: placement coordinate xMm mutation returns false', areEqual(baseProps, mutatedPlacementCoord) === false);

  const mutatedPlacementSerial = makeProps({
    page: { pageNumber: 1, placements: [{ ...mockPlacement1, serial: { text: '002', xPercent: 50, yPercent: 50, fontSizePt: 10 } }, { ...mockPlacement2 }] },
  });
  assertTest('areSheetPreviewPropsEqual: placement serial text mutation returns false', areEqual(baseProps, mutatedPlacementSerial) === false);

  // Test 5: Selective Page Isolation (Memoization efficiency)
  // Mutating an item placed on the page MUST trigger re-render
  const mutatedPlacedItem = makeProps({
    items: [{ ...mockItem1, widthMm: 60 }, mockItem2, mockItemUnplaced],
  });
  assertTest('areSheetPreviewPropsEqual: placed item modification returns false', areEqual(baseProps, mutatedPlacedItem) === false);

  // Mutating an item NOT placed on this page MUST NOT trigger re-render
  const mutatedUnplacedItem = makeProps({
    items: [mockItem1, mockItem2, { ...mockItemUnplaced, widthMm: 60 }],
  });
  assertTest('areSheetPreviewPropsEqual: unplaced item modification preserves memoization (returns true)', areEqual(baseProps, mutatedUnplacedItem) === true);

  // Mutating preview for placed item MUST trigger re-render
  const mutatedPlacedPreview = makeProps({
    previews: { 'asset-1': 'blob:url1-updated', 'asset-2': 'blob:url2', 'asset-3': 'blob:url3' },
  });
  assertTest('areSheetPreviewPropsEqual: placed item preview URL change returns false', areEqual(baseProps, mutatedPlacedPreview) === false);

  // Mutating preview for unplaced item MUST NOT trigger re-render
  const mutatedUnplacedPreview = makeProps({
    previews: { 'asset-1': 'blob:url1', 'asset-2': 'blob:url2', 'asset-3': 'blob:url3-updated' },
  });
  assertTest('areSheetPreviewPropsEqual: unplaced item preview URL change preserves memoization (returns true)', areEqual(baseProps, mutatedUnplacedPreview) === true);

  // Test 6: Notepad cut lines
  const withCuts = makeProps({ notepadCuts: [{ x1: 0, y1: 50, x2: 210, y2: 50 }] });
  assertTest('areSheetPreviewPropsEqual: notepadCuts added returns false against undefined', areEqual(baseProps, withCuts) === false);
  const withDifferentCuts = makeProps({ notepadCuts: [{ x1: 0, y1: 50, x2: 210, y2: 50 }, { x1: 0, y1: 100, x2: 210, y2: 100 }] });
  assertTest('areSheetPreviewPropsEqual: notepadCuts length change returns false', areEqual(withCuts, withDifferentCuts) === false);
}

// ===========================================================================
// SUITE 2: Multi-Tab Lease Election, Broadcast Collisions & CAS Tokens
// ===========================================================================
console.log('\n--- Suite 2: Multi-Tab Lease Election, Broadcast Collisions & CAS Tokens ---');

// Import tab collision logic
const collisionModPath = pathToFileURL(path.join(srcDir, 'features', 'projects', 'logic', 'tabSessionCollision.ts')).href;
const { validSessionPeerMessage, shouldForkSession } = await import(collisionModPath);

// 1. Boundary & Fuzz Testing for validSessionPeerMessage
assertTest('validSessionPeerMessage: valid probe message returns true',
  validSessionPeerMessage({ kind: 'probe', token: 'uuid-tok-1', instance: 'inst-1' }) === true);

assertTest('validSessionPeerMessage: valid present message returns true',
  validSessionPeerMessage({ kind: 'present', token: 'uuid-tok-1', instance: 'inst-1' }) === true);

// Adversarial malformed inputs
assertTest('validSessionPeerMessage rejects null', validSessionPeerMessage(null) === false);
assertTest('validSessionPeerMessage rejects undefined', validSessionPeerMessage(undefined) === false);
assertTest('validSessionPeerMessage rejects number', validSessionPeerMessage(12345) === false);
assertTest('validSessionPeerMessage rejects string', validSessionPeerMessage('kind:probe') === false);
assertTest('validSessionPeerMessage rejects array', validSessionPeerMessage([]) === false);
assertTest('validSessionPeerMessage rejects empty object', validSessionPeerMessage({}) === false);
assertTest('validSessionPeerMessage rejects unknown kind', validSessionPeerMessage({ kind: 'claim', token: 'a', instance: 'b' }) === false);
assertTest('validSessionPeerMessage rejects numeric token', validSessionPeerMessage({ kind: 'probe', token: 999, instance: 'b' }) === false);
assertTest('validSessionPeerMessage rejects empty token', validSessionPeerMessage({ kind: 'probe', token: '', instance: 'b' }) === false);
assertTest('validSessionPeerMessage rejects token > 100 chars', validSessionPeerMessage({ kind: 'probe', token: 'a'.repeat(101), instance: 'b' }) === false);
assertTest('validSessionPeerMessage accepts token at 100 chars bound', validSessionPeerMessage({ kind: 'probe', token: 'a'.repeat(100), instance: 'b' }) === true);
assertTest('validSessionPeerMessage rejects empty instance', validSessionPeerMessage({ kind: 'probe', token: 'a', instance: '' }) === false);
assertTest('validSessionPeerMessage rejects instance > 100 chars', validSessionPeerMessage({ kind: 'probe', token: 'a', instance: 'b'.repeat(101) }) === false);
assertTest('validSessionPeerMessage accepts instance at 100 chars bound', validSessionPeerMessage({ kind: 'probe', token: 'a', instance: 'b'.repeat(100) }) === true);

// 2. Truth Table & Symmetry Invariants for shouldForkSession
// Invariant A: Once claimed, a tab NEVER yields (shouldForkSession === false)
assertTest('shouldForkSession: claimed tab never yields to probe',
  shouldForkSession('inst-1', { kind: 'probe', token: 'tok', instance: 'inst-2' }, true) === false);

assertTest('shouldForkSession: claimed tab never yields to present',
  shouldForkSession('inst-1', { kind: 'present', token: 'tok', instance: 'inst-2' }, true) === false);

// Invariant B: Own messages are always ignored
assertTest('shouldForkSession: own message is ignored when unclaimed',
  shouldForkSession('inst-1', { kind: 'present', token: 'tok', instance: 'inst-1' }, false) === false);

// Invariant C: Unclaimed tab ALWAYS yields to "present" (established tab)
assertTest('shouldForkSession: unclaimed tab yields to established present peer',
  shouldForkSession('inst-1', { kind: 'present', token: 'tok', instance: 'inst-2' }, false) === true);

// Invariant D: Concurrent probes resolve deterministically by lexicographical ordering
const instA = '11111111-0000-0000-0000-000000000000';
const instB = '22222222-0000-0000-0000-000000000000';

const probeFromA = { kind: 'probe', token: 'tok', instance: instA };
const probeFromB = { kind: 'probe', token: 'tok', instance: instB };

// Tab B (lexicographically larger) MUST yield
const forkB = shouldForkSession(instB, probeFromA, false);
// Tab A (lexicographically smaller) MUST NOT yield
const forkA = shouldForkSession(instA, probeFromB, false);

assertTest('shouldForkSession: lexicographically larger tab B yields', forkB === true);
assertTest('shouldForkSession: lexicographically smaller tab A claims (does not yield)', forkA === false);
assertTest('shouldForkSession: exactly one tab forks in simultaneous probe conflict', (forkA !== forkB) && (forkA === false && forkB === true));

// Invariant E: High-density Randomized Symmetry Invariant over 1,000 pairs
let symmetryViolations = 0;
for (let i = 0; i < 1000; i++) {
  const u1 = crypto.randomUUID();
  const u2 = crypto.randomUUID();
  if (u1 === u2) continue;

  const f1 = shouldForkSession(u1, { kind: 'probe', token: 't', instance: u2 }, false);
  const f2 = shouldForkSession(u2, { kind: 'probe', token: 't', instance: u1 }, false);

  // Exactly one must fork
  if ((f1 && f2) || (!f1 && !f2)) {
    symmetryViolations++;
  }
}
assertTest('shouldForkSession: 1,000 randomized concurrent probe races produce zero symmetry violations', symmetryViolations === 0);

// 3. Storage Parsing & Resilience in useActiveSession
const sessionModPath = pathToFileURL(path.join(srcDir, 'app', 'controllers', 'useActiveSession.ts')).href;
const { readActiveSession, persistActiveSession, ACTIVE_SESSION_KEY } = await import(sessionModPath);

// Test sessionStorage resilience with mocked storage
const mockSessionStore = new Map();
globalThis.sessionStorage = {
  getItem: (k) => mockSessionStore.get(k) ?? null,
  setItem: (k, v) => mockSessionStore.set(k, String(v)),
  removeItem: (k) => mockSessionStore.delete(k),
  clear: () => mockSessionStore.clear(),
};

// Test reading when empty
mockSessionStore.clear();
const initialSession = readActiveSession();
assertTest('readActiveSession: empty storage generates valid UUID token and null project',
  typeof initialSession.token === 'string' && initialSession.token.length > 0 && initialSession.projectId === null);

// Test reading valid entry
mockSessionStore.set(ACTIVE_SESSION_KEY, JSON.stringify({ token: 'test-token-123', projectId: 'project-abc' }));
const validRead = readActiveSession();
assertTest('readActiveSession: reads valid token and projectId',
  validRead.token === 'test-token-123' && validRead.projectId === 'project-abc');

// Test reading with null projectId
mockSessionStore.set(ACTIVE_SESSION_KEY, JSON.stringify({ token: 'test-token-456', projectId: null }));
const nullProjectRead = readActiveSession();
assertTest('readActiveSession: preserves null projectId',
  nullProjectRead.token === 'test-token-456' && nullProjectRead.projectId === null);

// Adversarial storage corruption: syntax error
mockSessionStore.set(ACTIVE_SESSION_KEY, '{ invalid json syntax');
const corruptRead = readActiveSession();
assertTest('readActiveSession: syntax error safely falls back without throwing',
  typeof corruptRead.token === 'string' && corruptRead.projectId === null);

// Adversarial storage corruption: wrong types
mockSessionStore.set(ACTIVE_SESSION_KEY, JSON.stringify({ token: 99999, projectId: 12345 }));
const typeErrorRead = readActiveSession();
assertTest('readActiveSession: non-string token safely falls back',
  typeof typeErrorRead.token === 'string' && typeErrorRead.projectId === null);

// Adversarial storage corruption: token > 100 chars
mockSessionStore.set(ACTIVE_SESSION_KEY, JSON.stringify({ token: 't'.repeat(101), projectId: 'p' }));
const oversizedRead = readActiveSession();
assertTest('readActiveSession: oversized token safely falls back',
  typeof oversizedRead.token === 'string' && oversizedRead.token.length < 100);

// Test persistActiveSession
persistActiveSession({ token: 'persisted-tok-99', projectId: 'p-99' });
const rawPersisted = JSON.parse(mockSessionStore.get(ACTIVE_SESSION_KEY));
assertTest('persistActiveSession writes correct JSON to ACTIVE_SESSION_KEY',
  rawPersisted.token === 'persisted-tok-99' && rawPersisted.projectId === 'p-99');

// Test persistActiveSession throwing error (e.g. QuotaExceededError)
const origSetItem = globalThis.sessionStorage.setItem;
globalThis.sessionStorage.setItem = () => { throw new Error('QuotaExceededError: DOM Exception 22'); };
let persistThrew = false;
try {
  persistActiveSession({ token: 'tok', projectId: null });
} catch {
  persistThrew = true;
}
assertTest('persistActiveSession suppresses storage quota errors without unhandled rejection', persistThrew === false);
globalThis.sessionStorage.setItem = origSetItem;

// 4. CAS Revision Tokens & Concurrency Conflict Detection
const projectStorePath = pathToFileURL(path.join(srcDir, 'features', 'projects', 'logic', 'projectStore.ts')).href;
const { storedProjectRevision, matchesProjectRevision, validateStoredProject } = await import(projectStorePath);

const sampleProject = {
  schemaVersion: 1,
  id: 'proj-001',
  name: 'Sample Project',
  updatedAt: '2026-11-05T10:00:00.000Z',
  revisionToken: 'cas-token-rev-1',
  settings: {
    paper: 'A4',
    orientation: 'portrait',
    customWidthMm: 210,
    customHeightMm: 297,
    marginMm: 5,
    gapMm: 5,
    cutGuides: true,
  },
  assets: [],
};

assertTest('storedProjectRevision: extracts revisionToken when present',
  storedProjectRevision(sampleProject) === 'cas-token-rev-1');

// Legacy fallback to updatedAt
const legacyProject = { ...sampleProject, revisionToken: undefined };
assertTest('storedProjectRevision: falls back to updatedAt for legacy records',
  storedProjectRevision(legacyProject) === '2026-11-05T10:00:00.000Z');

// CAS Token Matching Invariants
assertTest('matchesProjectRevision: matching expected token returns true',
  matchesProjectRevision(sampleProject, 'cas-token-rev-1') === true);

assertTest('matchesProjectRevision: mismatched token returns false (detects collision)',
  matchesProjectRevision(sampleProject, 'stale-token-rev-0') === false);

assertTest('matchesProjectRevision: expected null for existing project returns false (detects duplicate creation)',
  matchesProjectRevision(sampleProject, null) === false);

assertTest('matchesProjectRevision: expected null for undefined record returns true (initial creation succeeds)',
  matchesProjectRevision(undefined, null) === true);

assertTest('matchesProjectRevision: expected token for undefined record returns false (project deleted in another tab)',
  matchesProjectRevision(undefined, 'cas-token-rev-1') === false);

// validateStoredProject Security Invariants
assertTest('validateStoredProject accepts valid project',
  validateStoredProject(sampleProject) === sampleProject);

assertTest('validateStoredProject rejects schemaVersion !== 1', (() => {
  try {
    validateStoredProject({ ...sampleProject, schemaVersion: 2 });
    return false;
  } catch {
    return true;
  }
})());

assertTest('validateStoredProject rejects invalid revisionToken (>100 chars)', (() => {
  try {
    validateStoredProject({ ...sampleProject, revisionToken: 't'.repeat(105) });
    return false;
  } catch {
    return true;
  }
})());

assertTest('validateStoredProject rejects more than 25 assets', (() => {
  try {
    const assets = Array.from({ length: 26 }, (_, i) => ({ id: `asset-${i}` }));
    validateStoredProject({ ...sampleProject, assets });
    return false;
  } catch {
    return true;
  }
})());

// ===========================================================================
// SUITE 3: Draft Recovery, Undo/Redo Stacks & Archive Resilience
// ===========================================================================
console.log('\n--- Suite 3: Draft Recovery, Undo/Redo Stacks & Archive Resilience ---');

// 1. History Engine Invariants (emptyHistory, pushHistory, travelHistory)
const historyModPath = pathToFileURL(path.join(srcDir, 'shared', 'utils', 'history.ts')).href;
const { emptyHistory, pushHistory, travelHistory } = await import(historyModPath);

let hist = emptyHistory();
assertTest('history: initial state has empty undo and redo stacks', hist.undo.length === 0 && hist.redo.length === 0);

// Invariant: Traveling on empty history returns null
assertTest('history: travel undo on empty history returns null', travelHistory(hist, 'current-state', 'undo') === null);
assertTest('history: travel redo on empty history returns null', travelHistory(hist, 'current-state', 'redo') === null);

// Invariant: Bounded capacity under bursts
for (let i = 1; i <= 80; i++) {
  hist = pushHistory(hist, `state-${i}`, 50);
}
assertTest('history: stack bounded strictly to capacity 50 under 80 pushed states', hist.undo.length === 50);
assertTest('history: oldest entries dropped, top is state-80', hist.undo[hist.undo.length - 1] === 'state-80');

// Invariant: Rapid Alternating Undo/Redo Stress (1,000 cycles)
let currentVal = 'state-81';
let travelIntegrity = true;

for (let cycle = 0; cycle < 1000; cycle++) {
  const undoResult = travelHistory(hist, currentVal, 'undo');
  if (!undoResult || undoResult.value !== 'state-80') {
    travelIntegrity = false;
    break;
  }
  hist = undoResult.history;
  currentVal = undoResult.value;

  const redoResult = travelHistory(hist, currentVal, 'redo');
  if (!redoResult || redoResult.value !== 'state-81') {
    travelIntegrity = false;
    break;
  }
  hist = redoResult.history;
  currentVal = redoResult.value;
}
assertTest('history: 1,000 rapid alternating undo/redo cycles preserve complete state integrity', travelIntegrity === true);

// Invariant: Branching edit invalidates redo stack
const undoStep = travelHistory(hist, currentVal, 'undo');
hist = undoStep.history;
currentVal = undoStep.value; // now state-80, redo has [state-81]
assertTest('history: after undo, redo stack has 1 element', hist.redo.length === 1);

hist = pushHistory(hist, currentVal, 50); // push new branching edit
assertTest('history: new edit clears redo stack completely', hist.redo.length === 0);

// 2. Draft Recovery & Conflict Detection
const draftModPath = pathToFileURL(path.join(srcDir, 'features', 'projects', 'logic', 'draftRecovery.ts')).href;
const { newestRecoveryFirst, obsoleteRecoveryIds } = await import(draftModPath);

const recoveryModPath = pathToFileURL(path.join(srcDir, 'features', 'projects', 'logic', 'workspaceRecovery.ts')).href;
const { matchesActiveRecovery, planRecoveredWorkspace } = await import(recoveryModPath);

// Deterministic ordering of drafts
const recordOlder = { id: 'draft-1', revision: 10, updatedAt: '2026-11-05T08:00:00.000Z' };
const recordNewer = { id: 'draft-2', revision: 20, updatedAt: '2026-11-05T09:00:00.000Z' };
assertTest('newestRecoveryFirst orders newer date first', newestRecoveryFirst(recordOlder, recordNewer) > 0);
assertTest('newestRecoveryFirst orders newer date ahead in sort', [recordOlder, recordNewer].sort(newestRecoveryFirst)[0].id === 'draft-2');

// Pruning obsolete drafts (> 6 limit)
const tenDrafts = Array.from({ length: 10 }, (_, i) => ({
  id: `draft-${i}`,
  revision: i + 1,
  updatedAt: new Date(Date.now() - (10 - i) * 60000).toISOString(),
  project: { schemaVersion: 1, assets: [] },
}));
const obsolete = obsoleteRecoveryIds(tenDrafts, 6);
assertTest('obsoleteRecoveryIds: exactly 4 oldest drafts marked obsolete out of 10', obsolete.length === 4);
assertTest('obsoleteRecoveryIds: 6 newest drafts are preserved', !obsolete.includes('draft-9') && !obsolete.includes('draft-8'));

// matchesActiveRecovery
assertTest('matchesActiveRecovery: identical tokens match',
  matchesActiveRecovery('tok-1', 'tok-1', false) === true);

assertTest('matchesActiveRecovery: divergent tokens do not match',
  matchesActiveRecovery('tok-1', 'tok-2', false) === false);

assertTest('matchesActiveRecovery: undefined token rejected when legacy not allowed',
  matchesActiveRecovery(undefined, 'tok-1', false) === false);

assertTest('matchesActiveRecovery: undefined token accepted when legacy explicitly allowed',
  matchesActiveRecovery(undefined, 'tok-1', true) === true);

// planRecoveredWorkspace
const originSaved = { projectId: 'proj-1', revision: 'rev-100' };

// Scenario A: Saved project unchanged
const planClean = planRecoveredWorkspace(originSaved, { id: 'proj-1', revision: 'rev-100' });
assertTest('planRecoveredWorkspace: unchanged saved project resumes without conflict',
  planClean.conflict === false && planClean.projectId === 'proj-1' && planClean.revision === 'rev-100');

// Scenario B: Saved project updated in another tab (revision diverged)
const planConflict = planRecoveredWorkspace(originSaved, { id: 'proj-1', revision: 'rev-101' });
assertTest('planRecoveredWorkspace: diverged saved project flags conflict',
  planConflict.conflict === true && planConflict.projectId === null && planConflict.revision === null);

// Scenario C: Saved project deleted in another tab (current is null)
const planDeleted = planRecoveredWorkspace(originSaved, null);
assertTest('planRecoveredWorkspace: deleted saved project flags conflict',
  planDeleted.conflict === true && planDeleted.projectId === null && planDeleted.revision === null);

// 3. Corrupt ZIP Archive Resilience
const zipArchiveModPath = pathToFileURL(path.join(srcDir, 'features', 'projects', 'logic', 'projectZipArchive.ts')).href;
const { readProjectZipArchive } = await import(zipArchiveModPath);

// Corrupt Archive Test 1: Empty Blob (0 bytes)
let emptyZipThrew = false;
try {
  await readProjectZipArchive(new Blob([], { type: 'application/zip' }));
} catch (err) {
  emptyZipThrew = err.message.includes('Unsupported ZIP backup size');
}
assertTest('readProjectZipArchive rejects 0-byte file with clear message', emptyZipThrew);

// Corrupt Archive Test 2: Truncated header (20 bytes)
let truncatedThrew = false;
try {
  await readProjectZipArchive(new Blob([new Uint8Array(20)], { type: 'application/zip' }));
} catch (err) {
  truncatedThrew = err.message.includes('Unsupported ZIP backup size');
}
assertTest('readProjectZipArchive rejects truncated archive (< 100 bytes)', truncatedThrew);

// Corrupt Archive Test 3: Random garbage payload (200 bytes without ZIP magic numbers)
let garbageThrew = false;
try {
  const garbage = new Uint8Array(200);
  crypto.getRandomValues(garbage);
  await readProjectZipArchive(new Blob([garbage], { type: 'application/zip' }));
} catch (err) {
  garbageThrew = err.message.includes('Unsupported ZIP archive structure') || err.message.includes('Malformed ZIP directory');
}
assertTest('readProjectZipArchive rejects random non-ZIP byte payload', garbageThrew);

// Corrupt Archive Test 4: Path traversal attempt in ZIP entry name
// Create a fake ZIP with central entry containing "../evil.png"
function createMinimalFakeZip(entryName, contentBytes = new Uint8Array([1, 2, 3])) {
  const nameBytes = new TextEncoder().encode(entryName);
  const localHeader = new Uint8Array(30 + nameBytes.length);
  const lhView = new DataView(localHeader.buffer);
  lhView.setUint32(0, 0x04034b50, true);
  lhView.setUint16(4, 20, true);
  lhView.setUint16(6, 0x0800, true);
  lhView.setUint16(8, 0, true);
  lhView.setUint32(14, 0x12345678, true); // dummy crc
  lhView.setUint32(18, contentBytes.length, true);
  lhView.setUint32(22, contentBytes.length, true);
  lhView.setUint16(26, nameBytes.length, true);
  localHeader.set(nameBytes, 30);

  const localOffset = 0;
  const centralHeader = new Uint8Array(46 + nameBytes.length);
  const chView = new DataView(centralHeader.buffer);
  chView.setUint32(0, 0x02014b50, true);
  chView.setUint16(4, 20, true);
  chView.setUint16(6, 20, true);
  chView.setUint16(8, 0x0800, true);
  chView.setUint16(10, 0, true);
  chView.setUint32(16, 0x12345678, true);
  chView.setUint32(20, contentBytes.length, true);
  chView.setUint32(24, contentBytes.length, true);
  chView.setUint16(28, nameBytes.length, true);
  chView.setUint32(42, localOffset, true);
  centralHeader.set(nameBytes, 46);

  const dirOffset = localHeader.length + contentBytes.length;
  const dirSize = centralHeader.length;

  const endHeader = new Uint8Array(22);
  const eView = new DataView(endHeader.buffer);
  eView.setUint32(0, 0x06054b50, true);
  eView.setUint16(8, 1, true);
  eView.setUint16(10, 1, true);
  eView.setUint32(12, dirSize, true);
  eView.setUint32(16, dirOffset, true);

  return new Blob([localHeader, contentBytes, centralHeader, endHeader], { type: 'application/zip' });
}

let pathTraversalThrew = false;
try {
  const traversalZip = createMinimalFakeZip('../../secret.key');
  await readProjectZipArchive(traversalZip);
} catch (err) {
  pathTraversalThrew = err.message.includes('Unsafe or duplicated archive filename');
}
assertTest('readProjectZipArchive rejects path traversal filename ("../../secret.key")', pathTraversalThrew);

// Corrupt Archive Test 5: Filename not matching ^image-[0-9]{3}$ or manifest.json
let invalidNameThrew = false;
try {
  const badNameZip = createMinimalFakeZip('arbitrary_file.exe');
  await readProjectZipArchive(badNameZip);
} catch (err) {
  invalidNameThrew = err.message.includes('Unsafe or duplicated archive filename');
}
assertTest('readProjectZipArchive rejects arbitrary unexpected filename ("arbitrary_file.exe")', invalidNameThrew);

// ===========================================================================
// SUMMARY & VERDICT
// ===========================================================================
console.log('\n================================================================');
console.log(`TOTAL TESTS:  ${totalTests}`);
console.log(`PASSED:       ${totalPassed}`);
console.log(`FAILED:       ${totalFailed}`);
console.log('================================================================');

if (failures.length > 0) {
  console.error('\nFAILURES RECORDED:');
  for (const f of failures) {
    console.error(`- ${f.name}: ${f.details}`);
  }
  process.exit(1);
} else {
  console.log('\nALL ADVERSARIAL CHALLENGES PASSED CONVINCINGLY.');
  process.exit(0);
}
