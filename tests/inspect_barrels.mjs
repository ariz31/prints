import fs from 'node:fs';
import path from 'node:path';

const featuresDir = 'src/features';
const features = fs.readdirSync(featuresDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

console.log(`Found ${features.length} feature directories:`);

for (const feat of features) {
  const barrelPath = path.join(featuresDir, feat, 'index.ts');
  if (!fs.existsSync(barrelPath)) {
    console.log(`[MISSING] ${barrelPath}`);
    continue;
  }
  const content = fs.readFileSync(barrelPath, 'utf8');
  console.log(`\n=== Feature: ${feat} (index.ts) ===`);
  console.log(content.trim());
}
