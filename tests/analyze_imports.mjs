import fs from 'node:fs';
import path from 'node:path';

function walk(dir) {
  let res = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) res = res.concat(walk(p));
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) res.push(p);
  }
  return res;
}

const files = walk('src/features');
const legacyInFeatures = {};
let totalImports = 0;

for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  const matches = [...content.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)].map(m => m[1]);
  for (const m of matches) {
    if (m.includes('/core/') || m.includes('/components/')) {
      legacyInFeatures[f] = legacyInFeatures[f] || [];
      legacyInFeatures[f].push(m);
      totalImports++;
    }
  }
}

console.log(`Total feature files: ${files.length}`);
console.log(`Feature files with legacy imports: ${Object.keys(legacyInFeatures).length}`);
console.log(`Total legacy imports in features: ${totalImports}`);

const breakdown = {};
for (const [f, imps] of Object.entries(legacyInFeatures)) {
  for (const imp of imps) {
    const base = path.basename(imp);
    breakdown[base] = (breakdown[base] || 0) + 1;
  }
}
console.log('\nTop imported legacy modules:', Object.entries(breakdown).sort((a,b) => b[1] - a[1]).slice(0, 15));
