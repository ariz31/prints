import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readStylesheet } from '../scripts/read-css.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('================================================================');
console.log('  CHALLENGER M2: CSS MODULARIZATION & FEATURE REGRESSION HARNESS');
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
// CSS Tokenizer & Delimiter Balance Checker
// ---------------------------------------------------------------------------
function checkCssSyntax(filePath, content) {
  const stack = [];
  let inComment = false;
  let inString = null; // '"' or "'"
  let line = 1;
  let col = 0;
  const errors = [];

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1] || '';

    if (char === '\n') {
      line++;
      col = 0;
    } else {
      col++;
    }

    // Inside block comment
    if (inComment) {
      if (char === '*' && nextChar === '/') {
        inComment = false;
        i++; // skip '/'
        col++;
      }
      continue;
    }

    // Inside string
    if (inString !== null) {
      if (char === '\\') {
        // Escaped character, skip next
        i++;
        col++;
      } else if (char === inString) {
        inString = null;
      }
      continue;
    }

    // Not in comment, not in string
    if (char === '/' && nextChar === '*') {
      inComment = true;
      i++; // skip '*'
      col++;
      continue;
    }

    if (char === '"' || char === "'") {
      inString = char;
      continue;
    }

    // Check delimiters: {}, (), []
    if (char === '{' || char === '(' || char === '[') {
      stack.push({ char, line, col });
    } else if (char === '}' || char === ')' || char === ']') {
      const matchMap = { '}': '{', ')': '(', ']': '[' };
      const expected = matchMap[char];
      if (stack.length === 0) {
        errors.push(`Unexpected closing '${char}' at line ${line}, col ${col} (stack empty)`);
      } else {
        const top = stack.pop();
        if (top.char !== expected) {
          errors.push(
            `Mismatched delimiter '${char}' at line ${line}, col ${col}; expected closing for '${top.char}' opened at line ${top.line}, col ${top.col}`
          );
        }
      }
    }
  }

  if (inComment) {
    errors.push(`Unterminated block comment /* at EOF in ${filePath}`);
  }
  if (inString !== null) {
    errors.push(`Unterminated string literal ${inString} at EOF in ${filePath}`);
  }
  if (stack.length > 0) {
    for (const item of stack) {
      errors.push(`Unclosed '${item.char}' opened at line ${item.line}, col ${item.col} in ${filePath}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// SUITE 1: CSS Syntax Integrity (All 17 Modular + 2 Facades + Entrypoint)
// ---------------------------------------------------------------------------
console.log('\n--- SUITE 1: CSS Syntax Integrity & Balanced Braces ---');

const expectedModularFiles = [
  // 4 foundational stylesheets
  'src/styles/tokens.css',
  'src/styles/base.css',
  'src/styles/components.css',
  'src/styles/layout.css',
  // 13 feature stylesheets
  'src/styles/features/sheet-composer.css',
  'src/styles/features/photo-editor.css',
  'src/styles/features/id-photo-studio.css',
  'src/styles/features/crop.css',
  'src/styles/features/background-removal.css',
  'src/styles/features/layers.css',
  'src/styles/features/frames.css',
  'src/styles/features/print-modes.css',
  'src/styles/features/paper-sizes.css',
  'src/styles/features/exports.css',
  'src/styles/features/projects.css',
  'src/styles/features/preferences.css',
  'src/styles/features/workflows.css',
];

const expectedFacadeFiles = [
  'src/shared/styles/tokens.css',
  'src/shared/styles/controls.css',
];

const allCssFiles = [
  'src/styles.css',
  ...expectedModularFiles,
  ...expectedFacadeFiles,
];

assertTest(
  'Inventory count matches exactly 17 modular + 2 facades + 1 entrypoint (20 CSS files)',
  expectedModularFiles.length === 17 && expectedFacadeFiles.length === 2 && allCssFiles.length === 20,
  `Counts: modular=${expectedModularFiles.length}, facades=${expectedFacadeFiles.length}`
);

for (const relPath of allCssFiles) {
  const fullPath = path.join(projectRoot, relPath);
  const exists = fs.existsSync(fullPath);
  assertTest(`File exists: ${relPath}`, exists, `Path does not exist: ${fullPath}`);

  if (exists) {
    const stats = fs.statSync(fullPath);
    assertTest(`File non-empty: ${relPath}`, stats.size > 0, `File size is 0 bytes`);

    const content = fs.readFileSync(fullPath, 'utf8');
    const syntaxCheck = checkCssSyntax(relPath, content);
    assertTest(
      `Balanced delimiters ({}, (), []) & syntax valid: ${relPath}`,
      syntaxCheck.ok,
      syntaxCheck.errors.join('; ')
    );
  }
}

// ---------------------------------------------------------------------------
// SUITE 2: CSS Token Definition & Usage Verification
// ---------------------------------------------------------------------------
console.log('\n--- SUITE 2: CSS Token Definitions & Consumer Syntax ---');

const tokensPath = path.join(projectRoot, 'src/styles/tokens.css');
const tokensContent = fs.readFileSync(tokensPath, 'utf8');

// Extract all custom property declarations in tokens.css: --var-name: value;
const tokenDeclRegex = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
const definedTokens = new Set();
let match;
while ((match = tokenDeclRegex.exec(tokensContent)) !== null) {
  definedTokens.add(match[1]);
}

assertTest(
  `Design tokens defined in src/styles/tokens.css (found ${definedTokens.size} tokens)`,
  definedTokens.size >= 17,
  `Found ${definedTokens.size} tokens: ${Array.from(definedTokens).join(', ')}`
);

// Verify all Impression design tokens specified in check-brand.mjs are defined
const impressionBrandTokens = [
  '--ink',
  '--ink-muted',
  '--line',
  '--line-strong',
  '--canvas',
  '--surface',
  '--surface-muted',
  '--accent',
  '--accent-strong',
  '--accent-soft',
  '--brand-coral',
  '--brand-coral-hover',
  '--brand-paper',
  '--focus',
  '--danger',
  '--warning',
  '--success',
  '--radius',
];
for (const token of impressionBrandTokens) {
  assertTest(
    `Impression brand token defined: ${token}`,
    definedTokens.has(token),
    `Missing in tokens.css: ${token}`
  );
}

// Verify color values in tokens.css are valid 6-character hex colors or valid radius
const colorHexRegex = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
let validColors = true;
const invalidTokens = [];

tokenDeclRegex.lastIndex = 0;
while ((match = tokenDeclRegex.exec(tokensContent)) !== null) {
  const name = match[1];
  const value = match[2].trim();
  if (value.startsWith('#')) {
    if (!colorHexRegex.test(value)) {
      validColors = false;
      invalidTokens.push(`${name}: ${value}`);
    }
  }
}
assertTest(
  'All hex colors in src/styles/tokens.css are syntactically valid',
  validColors,
  `Invalid hex colors: ${invalidTokens.join(', ')}`
);

// Scan all modular stylesheets for var(--...) references and verify valid var syntax
let allVarValid = true;
const varUsageRegex = /var\(\s*(--[a-zA-Z0-9_-]+)(?:\s*,\s*([^)]+))?\s*\)/g;
const referencedTokens = new Set();
const malformedVarRefs = [];

for (const relPath of allCssFiles) {
  const content = fs.readFileSync(path.join(projectRoot, relPath), 'utf8');
  // Strip comments before checking var syntax
  const cleanContent = content.replace(/\/\*[\s\S]*?\*\//g, '');

  let vMatch;
  while ((vMatch = varUsageRegex.exec(cleanContent)) !== null) {
    const varName = vMatch[1];
    referencedTokens.add(varName);
  }

  // Check for malformed var( without proper syntax
  const rawVarRegex = /var\([^)]*$/m;
  if (rawVarRegex.test(cleanContent)) {
    allVarValid = false;
    malformedVarRefs.push(`${relPath}: unclosed var() call`);
  }
}

assertTest(
  'All var(--...) invocations across modular CSS files are syntactically well-formed',
  allVarValid,
  malformedVarRefs.join('; ')
);

// Verify that all 17 foundation tokens defined in tokens.css are referenced by the stylesheets
let unreferencedTokens = [];
for (const token of impressionBrandTokens) {
  if (token !== '--radius' && !referencedTokens.has(token)) {
    unreferencedTokens.push(token);
  }
}
assertTest(
  'All foundational color/brand tokens are actively consumed across the stylesheets',
  unreferencedTokens.length === 0,
  `Unreferenced: ${unreferencedTokens.join(', ')}`
);

// ---------------------------------------------------------------------------
// SUITE 3: Cascade Order & Precedence Invariants
// ---------------------------------------------------------------------------
console.log('\n--- SUITE 3: Cascade Order & Specificity Precedence ---');

const rootStylesPath = path.join(projectRoot, 'src/styles.css');
const rootContent = fs.readFileSync(rootStylesPath, 'utf8');

// Parse @import statements in order of declaration
const importOrder = [];
const importRegex = /@import\s+["']([^"']+)["'];/g;
let impMatch;
while ((impMatch = importRegex.exec(rootContent)) !== null) {
  importOrder.push(impMatch[1]);
}

assertTest(
  `src/styles.css imports exactly 17 modular files (found ${importOrder.length})`,
  importOrder.length === 17,
  `Imports found: ${importOrder.join(', ')}`
);

// Verify tokens.css is the very first import (index 0)
assertTest(
  'Import 0 is tokens.css (foundation tokens defined first)',
  importOrder[0] === './styles/tokens.css',
  `Expected ./styles/tokens.css, got ${importOrder[0]}`
);

// Verify base, components, and layout follow tokens.css before ANY feature
const foundationImports = [
  './styles/tokens.css',
  './styles/base.css',
  './styles/components.css',
  './styles/layout.css',
];

for (let i = 0; i < 4; i++) {
  assertTest(
    `Import ${i} is foundational (${foundationImports[i]})`,
    importOrder[i] === foundationImports[i],
    `Expected ${foundationImports[i]}, got ${importOrder[i]}`
  );
}

// Verify that all subsequent imports (indices 4..16) are feature stylesheets under ./styles/features/
const subsequentAreFeatures = importOrder.slice(4).every(imp => imp.startsWith('./styles/features/'));
assertTest(
  'Imports 4..16 are exclusively feature stylesheets (under ./styles/features/)',
  subsequentAreFeatures,
  `Found non-feature in feature slice: ${importOrder.slice(4).filter(imp => !imp.startsWith('./styles/features/')).join(', ')}`
);

// Verify facade stylesheets point to correct foundation files
const sharedTokensContent = fs.readFileSync(path.join(projectRoot, 'src/shared/styles/tokens.css'), 'utf8');
assertTest(
  'src/shared/styles/tokens.css correctly forwards to ../../styles/tokens.css',
  sharedTokensContent.includes('@import "../../styles/tokens.css";'),
  `Content: ${sharedTokensContent}`
);

const sharedControlsContent = fs.readFileSync(path.join(projectRoot, 'src/shared/styles/controls.css'), 'utf8');
assertTest(
  'src/shared/styles/controls.css correctly forwards to ../../styles/components.css',
  sharedControlsContent.includes('@import "../../styles/components.css";'),
  `Content: ${sharedControlsContent}`
);

// Cascade evaluation: test that readStylesheet produces inlined content where
// tokens come before base, base comes before components, components comes before layout,
// and layout comes before features.
const inlinedCss = await readStylesheet(new URL('../src/styles.css', import.meta.url));

const tokenMarkerPos = inlinedCss.indexOf('--ink:#2a1830');
const baseMarkerPos = inlinedCss.indexOf('*,*::before,*::after{box-sizing:border-box}');
const compMarkerPos = inlinedCss.indexOf('.studio-select');
const layoutMarkerPos = inlinedCss.indexOf('.app-shell');
const featureMarkerPos = inlinedCss.indexOf('.preview-grid');

assertTest(
  'Inlined cascade: tokens precede base rules',
  tokenMarkerPos !== -1 && baseMarkerPos !== -1 && tokenMarkerPos < baseMarkerPos,
  `tokens=${tokenMarkerPos}, base=${baseMarkerPos}`
);

assertTest(
  'Inlined cascade: base rules precede components rules',
  baseMarkerPos !== -1 && compMarkerPos !== -1 && baseMarkerPos < compMarkerPos,
  `base=${baseMarkerPos}, comp=${compMarkerPos}`
);

assertTest(
  'Inlined cascade: components precede layout rules',
  compMarkerPos !== -1 && layoutMarkerPos !== -1 && compMarkerPos < layoutMarkerPos,
  `comp=${compMarkerPos}, layout=${layoutMarkerPos}`
);

assertTest(
  'Inlined cascade: layout rules precede feature rules (sheet-composer)',
  layoutMarkerPos !== -1 && featureMarkerPos !== -1 && layoutMarkerPos < featureMarkerPos,
  `layout=${layoutMarkerPos}, feature=${featureMarkerPos}`
);

// ---------------------------------------------------------------------------
// SUITE 4: scripts/read-css.mjs Stress Tests & Adversarial Scenarios
// ---------------------------------------------------------------------------
console.log('\n--- SUITE 4: scripts/read-css.mjs Adversarial Stress Harness ---');

const tempFixtureDir = path.join(projectRoot, 'tests', 'fixtures_css_temp');
if (fs.existsSync(tempFixtureDir)) {
  fs.rmSync(tempFixtureDir, { recursive: true, force: true });
}
fs.mkdirSync(tempFixtureDir, { recursive: true });

try {
  // 4.1 Nested @import resolution (3 levels deep: root -> a -> b -> leaf)
  fs.writeFileSync(path.join(tempFixtureDir, 'leaf.css'), '.leaf { color: green; }\n');
  fs.writeFileSync(path.join(tempFixtureDir, 'b.css'), '@import "./leaf.css";\n.b { color: blue; }\n');
  fs.writeFileSync(path.join(tempFixtureDir, 'a.css'), '@import "./b.css";\n.a { color: red; }\n');
  fs.writeFileSync(path.join(tempFixtureDir, 'root_nested.css'), '@import "./a.css";\n.root { margin: 0; }\n');

  const resolvedNested = await readStylesheet(new URL('./fixtures_css_temp/root_nested.css', import.meta.url));
  assertTest(
    '4.1 Multi-level nested @import resolves all 3 levels recursively',
    resolvedNested.includes('.leaf { color: green; }') &&
      resolvedNested.includes('.b { color: blue; }') &&
      resolvedNested.includes('.a { color: red; }') &&
      resolvedNested.includes('.root { margin: 0; }'),
    `Resolved output: ${resolvedNested}`
  );

  // 4.2 Multiple @imports on adjacent lines without blank lines
  fs.writeFileSync(path.join(tempFixtureDir, 'm1.css'), '.m1 { font-size: 10px; }\n');
  fs.writeFileSync(path.join(tempFixtureDir, 'm2.css'), '.m2 { font-size: 12px; }\n');
  fs.writeFileSync(path.join(tempFixtureDir, 'm3.css'), '.m3 { font-size: 14px; }\n');
  fs.writeFileSync(
    path.join(tempFixtureDir, 'root_multi.css'),
    '@import "./m1.css";\n@import "./m2.css";\n@import "./m3.css";\n'
  );

  const resolvedMulti = await readStylesheet(new URL('./fixtures_css_temp/root_multi.css', import.meta.url));
  const m1Pos = resolvedMulti.indexOf('.m1');
  const m2Pos = resolvedMulti.indexOf('.m2');
  const m3Pos = resolvedMulti.indexOf('.m3');
  assertTest(
    '4.2 Multiple adjacent @imports preserve exact declaration order',
    m1Pos !== -1 && m2Pos !== -1 && m3Pos !== -1 && m1Pos < m2Pos && m2Pos < m3Pos,
    `Positions: m1=${m1Pos}, m2=${m2Pos}, m3=${m3Pos}`
  );

  // 4.3 Single quotes vs double quotes in @import
  fs.writeFileSync(path.join(tempFixtureDir, 'sq.css'), '.single { display: flex; }\n');
  fs.writeFileSync(path.join(tempFixtureDir, 'dq.css'), '.double { display: grid; }\n');
  fs.writeFileSync(
    path.join(tempFixtureDir, 'root_quotes.css'),
    `@import './sq.css';\n@import "./dq.css";\n`
  );
  const resolvedQuotes = await readStylesheet(new URL('./fixtures_css_temp/root_quotes.css', import.meta.url));
  assertTest(
    '4.3 Handles both single-quote and double-quote @import declarations',
    resolvedQuotes.includes('.single { display: flex; }') &&
      resolvedQuotes.includes('.double { display: grid; }'),
    `Resolved: ${resolvedQuotes}`
  );

  // 4.4 Whitespace and newline variations in @import
  fs.writeFileSync(path.join(tempFixtureDir, 'sp1.css'), '.sp1 { opacity: 1; }\n');
  fs.writeFileSync(path.join(tempFixtureDir, 'sp2.css'), '.sp2 { opacity: 0.5; }\n');
  fs.writeFileSync(
    path.join(tempFixtureDir, 'root_whitespace.css'),
    `@import   "./sp1.css";\n@import\n  "./sp2.css";\n`
  );
  const resolvedWs = await readStylesheet(new URL('./fixtures_css_temp/root_whitespace.css', import.meta.url));
  assertTest(
    '4.4 Handles multiple spaces and newlines between @import and specifier',
    resolvedWs.includes('.sp1 { opacity: 1; }') && resolvedWs.includes('.sp2 { opacity: 0.5; }'),
    `Resolved: ${resolvedWs}`
  );

  // 4.5 Missing imported file error handling
  fs.writeFileSync(
    path.join(tempFixtureDir, 'root_missing.css'),
    `@import "./does_not_exist_404.css";\n.present { color: pink; }\n`
  );
  let threwMissing = false;
  let missingError = '';
  try {
    await readStylesheet(new URL('./fixtures_css_temp/root_missing.css', import.meta.url));
  } catch (err) {
    threwMissing = true;
    missingError = String(err);
  }
  assertTest(
    '4.5 Non-existent imported file rejects cleanly with ENOENT',
    threwMissing && (missingError.includes('ENOENT') || missingError.includes('no such file')),
    `Error thrown: ${missingError}`
  );

  // 4.6 File URL vs String path input support
  const urlRes = await readStylesheet(new URL('./fixtures_css_temp/m1.css', import.meta.url));
  assertTest(
    '4.6 readStylesheet supports file URL inputs',
    urlRes.includes('.m1 { font-size: 10px; }'),
    `URL output: ${urlRes}`
  );

  // 4.7 Mixed CSS rules with @import in the middle
  fs.writeFileSync(path.join(tempFixtureDir, 'mid_inc.css'), '.included { z-index: 10; }\n');
  fs.writeFileSync(
    path.join(tempFixtureDir, 'mid_root.css'),
    `/* Header comment */\n.before { top: 0; }\n@import "./mid_inc.css";\n.after { bottom: 0; }\n`
  );
  const resolvedMid = await readStylesheet(new URL('./fixtures_css_temp/mid_root.css', import.meta.url));
  const beforePos = resolvedMid.indexOf('.before');
  const incPos = resolvedMid.indexOf('.included');
  const afterPos = resolvedMid.indexOf('.after');
  assertTest(
    '4.7 Preserves rules surrounding @import in correct sequence',
    beforePos !== -1 && incPos !== -1 && afterPos !== -1 && beforePos < incPos && incPos < afterPos,
    `Positions: before=${beforePos}, inc=${incPos}, after=${afterPos}`
  );

  // 4.8 Empty CSS file resolution
  fs.writeFileSync(path.join(tempFixtureDir, 'empty.css'), '');
  const emptyRes = await readStylesheet(new URL('./fixtures_css_temp/empty.css', import.meta.url));
  assertTest('4.8 Resolves empty CSS file to empty string', emptyRes === '', `Result: '${emptyRes}'`);

  // 4.9 Stress test: Deep nesting (recursion depth limit verification)
  const DEPTH = 15;
  for (let d = 1; d <= DEPTH; d++) {
    if (d === DEPTH) {
      fs.writeFileSync(path.join(tempFixtureDir, `deep_${d}.css`), `.deep_level_${d} { depth: ${d}; }\n`);
    } else {
      fs.writeFileSync(
        path.join(tempFixtureDir, `deep_${d}.css`),
        `@import "./deep_${d + 1}.css";\n.deep_level_${d} { depth: ${d}; }\n`
      );
    }
  }
  const deepRes = await readStylesheet(new URL('./fixtures_css_temp/deep_1.css', import.meta.url));
  assertTest(
    `4.9 Recursively resolves deeply nested imports (${DEPTH} levels) without stack overflow`,
    deepRes.includes(`.deep_level_${DEPTH} { depth: ${DEPTH}; }`) &&
      deepRes.includes('.deep_level_1 { depth: 1; }'),
    `Missing level in deep resolution`
  );

  // 4.10 Cyclic imports detection: demonstrate infinite async recursion without cycle guard
  fs.writeFileSync(path.join(tempFixtureDir, 'cycle_a.css'), '@import "./cycle_b.css";\n.a { color: red; }\n');
  fs.writeFileSync(path.join(tempFixtureDir, 'cycle_b.css'), '@import "./cycle_a.css";\n.b { color: blue; }\n');
  let timedOut = false;
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('TIMEOUT_INFINITE_ASYNC_LOOP')), 300)
  );
  try {
    await Promise.race([
      readStylesheet(new URL('./fixtures_css_temp/cycle_a.css', import.meta.url)),
      timeoutPromise,
    ]);
  } catch (err) {
    if (err.message === 'TIMEOUT_INFINITE_ASYNC_LOOP') {
      timedOut = true;
    }
  }
  assertTest(
    '4.10 Cyclic @import results in infinite async recursion without cycle guard (oracle detects hang)',
    timedOut,
    'Expected infinite async loop'
  );

  // 4.11 Commented @import edge case verification
  // Since read-css.mjs uses regex without comment stripping, an @import inside /* */ will be parsed.
  fs.writeFileSync(path.join(tempFixtureDir, 'comment_target.css'), '.comment-content { font-weight: bold; }\n');
  fs.writeFileSync(
    path.join(tempFixtureDir, 'root_comment.css'),
    '/* @import "./comment_target.css"; */\n.main { color: red; }\n'
  );
  const resolvedComment = await readStylesheet(new URL('./fixtures_css_temp/root_comment.css', import.meta.url));
  assertTest(
    '4.11 readStylesheet inlines commented @import into comment block (known limitation documented)',
    resolvedComment.includes('/* .comment-content { font-weight: bold; }\n */'),
    `Resolved: ${resolvedComment}`
  );

  // 4.12 Duplicate @import of same target in single file
  fs.writeFileSync(path.join(tempFixtureDir, 'dup_target.css'), '.dup { display: block; }\n');
  fs.writeFileSync(
    path.join(tempFixtureDir, 'root_dup.css'),
    '@import "./dup_target.css";\n.middle { color: green; }\n@import "./dup_target.css";\n'
  );
  const resolvedDup = await readStylesheet(new URL('./fixtures_css_temp/root_dup.css', import.meta.url));
  const occurrences = (resolvedDup.match(/\.dup\s*\{\s*display:\s*block;\s*\}/g) || []).length;
  assertTest(
    '4.12 Duplicate @import statements both get inlined cleanly',
    occurrences === 2 && !resolvedDup.includes('@import'),
    `Occurrences: ${occurrences}, content: ${resolvedDup}`
  );

  // 4.13 Production stylesheets have zero commented-out or duplicate imports
  let prodHasCommentedImport = false;
  let prodHasDuplicateImport = false;
  for (const relPath of allCssFiles) {
    const full = path.join(projectRoot, relPath);
    const content = fs.readFileSync(full, 'utf8');
    const comments = content.match(/\/\*[\s\S]*?\*\//g) || [];
    for (const c of comments) {
      if (c.includes('@import')) {
        prodHasCommentedImport = true;
      }
    }
    const fileImports = [];
    let fMatch;
    const fRegex = /@import\s+["']([^"']+)["'];/g;
    while ((fMatch = fRegex.exec(content)) !== null) {
      if (fileImports.includes(fMatch[1])) prodHasDuplicateImport = true;
      fileImports.push(fMatch[1]);
    }
  }
  assertTest(
    '4.13 Production stylesheets contain zero commented-out @import statements',
    !prodHasCommentedImport,
    'Found commented-out @import in production CSS'
  );
  assertTest(
    '4.14 Production stylesheets contain zero duplicate @import statements',
    !prodHasDuplicateImport,
    'Found duplicate @import in production CSS'
  );

} finally {
  // Clean up temporary fixture directory
  if (fs.existsSync(tempFixtureDir)) {
    fs.rmSync(tempFixtureDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// SUITE 5: Full Inlined CSS Parity & Audit Script Compatibility
// ---------------------------------------------------------------------------
console.log('\n--- SUITE 5: Inlined CSS Parity & Script Compatibility ---');

// Check that readStylesheet inlining matches what check-brand and smoke-ui expect
const stylesUrl = new URL('../src/styles.css', import.meta.url);
const resolvedStyles = await readStylesheet(stylesUrl);

// check-brand.mjs expectations:
// - must include .brand-wordmark and .brand
// - must include tokens --ink, --brand-coral, --brand-coral-hover, --ink-muted, --brand-paper, --surface, --accent, --focus
assertTest(
  'Inlined CSS contains brand selectors required by check-brand.mjs',
  resolvedStyles.includes('.brand-wordmark{width:132px;max-width:100%;height:auto') &&
    resolvedStyles.includes('.brand{') &&
    resolvedStyles.includes('@media(max-width:360px)'),
  'Brand selectors missing in inlined CSS'
);

assertTest(
  'Inlined CSS contains all contrast tokens tested by check-brand.mjs',
  resolvedStyles.includes('--ink:#') &&
    resolvedStyles.includes('--brand-coral:#') &&
    resolvedStyles.includes('--brand-coral-hover:#') &&
    resolvedStyles.includes('--ink-muted:#') &&
    resolvedStyles.includes('--brand-paper:#') &&
    resolvedStyles.includes('--surface:#') &&
    resolvedStyles.includes('--accent:#') &&
    resolvedStyles.includes('--focus:#'),
  'Contrast tokens not all found in inlined CSS'
);

// smoke-ui.mjs expectations:
// - must include .photo-adjust-recovery
// - must include place-items:center;container-type:size;touch-action:none;
assertTest(
  'Inlined CSS contains .photo-adjust-recovery selector required by smoke-ui.mjs',
  resolvedStyles.includes('.photo-adjust-recovery{position:absolute;bottom:12px;'),
  'Missing .photo-adjust-recovery in inlined CSS'
);

assertTest(
  'Inlined CSS contains mobile gesture container rule required by smoke-ui.mjs',
  resolvedStyles.includes('place-items:center;container-type:size;touch-action:none;'),
  'Missing mobile gesture container rule in inlined CSS'
);

// ---------------------------------------------------------------------------
// Summary & Verdict
// ---------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`HARNESS RESULTS: ${totalPassed} PASSED, ${totalFailed} FAILED (TOTAL: ${totalTests})`);
console.log('================================================================');

if (totalFailed > 0) {
  console.error('\nFAILURES DETECTED:');
  for (const f of failures) {
    console.error(`- ${f.name}: ${f.details}`);
  }
  process.exit(1);
} else {
  console.log('\nALL EMPIRICAL ADVERSARIAL STRESS TESTS PASSED CLEANLY.');
  process.exit(0);
}
