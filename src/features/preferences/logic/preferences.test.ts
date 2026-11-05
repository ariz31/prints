import assert from "node:assert/strict";
import test from "node:test";
import {DEFAULT_PREFERENCES,isValidPreferences,defaultPrintSettings} from "./preferences.ts";
test("autosave option defaults to enabled for projects explicitly saved",()=>{
 assert.equal(DEFAULT_PREFERENCES.autoSave,true);
 assert.equal(isValidPreferences({...DEFAULT_PREFERENCES,autoSave:false}),true);
});
test("legacy preferences are valid, corrupt autosave is rejected",()=>{
 const legacy={...DEFAULT_PREFERENCES};
 delete legacy.autoSave;
 assert.equal(isValidPreferences(legacy),true);
 assert.equal(isValidPreferences({...DEFAULT_PREFERENCES,autoSave:"off"}),false);
});


test("custom default dimensions survive preference validation and project initialization",()=>{
 const custom={...DEFAULT_PREFERENCES,defaultPaper:"Custom" as const,
   defaultCustomWidthMm:215.9,defaultCustomHeightMm:330.2};
 assert.equal(isValidPreferences(custom),true);
 assert.equal(isValidPreferences({...custom,defaultCustomWidthMm:-1}),false);
 assert.equal(isValidPreferences({...custom,defaultCustomHeightMm:2001}),false);
 assert.equal(isValidPreferences({...custom,defaultCustomHeightMm:Number.NaN}),false);
 assert.deepEqual([defaultPrintSettings(custom).customWidthMm,defaultPrintSettings(custom).customHeightMm],[215.9,330.2]);
});
