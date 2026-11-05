import { readFile } from "node:fs/promises";

/**
 * Resolves CSS stylesheets and recursively inlines `@import` declarations,
 * matching Vite's build-time CSS aggregation behavior.
 *
 * @param {URL|string} url - File URL or path to the CSS entry point
 * @returns {Promise<string>} Fully inlined CSS stylesheet string
 */
export async function readStylesheet(url) {
  let content = await readFile(url, "utf8");
  const importRegex = /@import\s+["']([^"']+)["'];/g;
  const imports = [];
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push({ statement: match[0], specifier: match[1] });
  }
  for (const { statement, specifier } of imports) {
    const importedUrl = new URL(specifier, url);
    const importedContent = await readStylesheet(importedUrl);
    content = content.replace(statement, () => importedContent);
  }
  return content;
}
