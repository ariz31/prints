import assert from "node:assert/strict";
import test from "node:test";
import {DEFAULT_PREFERENCES,isValidPreferences} from "./preferences.ts";
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
