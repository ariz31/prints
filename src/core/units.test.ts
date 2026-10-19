import assert from "node:assert/strict";
import test from "node:test";
import {parseLength,formatLength} from "./units.ts";
test("double quotes and double apostrophes are inches",()=>{
 for(const s of ['1"',"1''","1in","1 inch","1 inches","1″"])
 assert.equal(parseLength(s,"mm"),25.4);
});
test("explicit units override defaults, bare numbers follow display unit",()=>{
 assert.equal(parseLength("2.54 cm","mm"),25.4);
 assert.equal(parseLength("25.4mm","in"),25.4);
 assert.equal(parseLength("1","in"),25.4);
 assert.equal(parseLength("1/2in","mm"),12.7);
 assert.equal(parseLength("3,5cm"),35);
});
test("rejected malformed inputs cannot mutate print geometry",()=>{
 for(const s of ["","-1","foo","1px","1/0","Infinity"])assert.equal(parseLength(s),null);
 assert.equal(parseLength("0 mm"),0);
 assert.equal(formatLength(50.8,"in"),"2");
});
