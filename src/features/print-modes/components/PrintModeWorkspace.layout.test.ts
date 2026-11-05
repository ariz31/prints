import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const component=readFileSync(new URL("./PrintModeWorkspace.tsx",import.meta.url),"utf8");
const styles=readFileSync(new URL("../../../styles/features/print-modes.css",import.meta.url),"utf8");

test("edit and preview share one accessible action row",()=>{
 const row=component.match(/<div className="mode-action-row"[^>]*>([\s\S]*?)<\/div>/)?.[1];
 assert.ok(row);
 assert.equal((row.match(/<button\b/g)??[]).length,2);
 assert.match(row,/onClick=\{onImages\}/);
 assert.match(row,/onClick=\{onPreview\}/);
 assert.match(row,/aria-label="Edit images and crops"/);
 assert.match(row,/aria-label="Open shared preview"/);
});

test("action buttons retain two equal columns and touch targets",()=>{
 const grid=styles.match(/\.mode-action-row\{([^}]*)\}/)?.[1];
 const buttons=styles.match(/\.mode-action-row>button\{([^}]*)\}/)?.[1];
 assert.ok(grid);
 assert.ok(buttons);
 assert.match(grid,/display:grid/);
 assert.match(grid,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(buttons,/width:100%/);
 assert.match(buttons,/min-width:0/);
 assert.match(buttons,/min-height:44px/);
 assert.match(styles,/\.mode-selector-content\.has-mode>\.mode-action-row\{\s*grid-column:1;grid-row:5/);
});
