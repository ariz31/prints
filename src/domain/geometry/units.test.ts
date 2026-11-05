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
 assert.equal(parseLength(123 as unknown as string), null);
 assert.equal(parseLength(null as unknown as string), null);
});

test("formatLength rounds midpoints half-away-from-zero without IEEE 754 under-rounding", () => {
 assert.equal(formatLength(10.555, "mm"), "10.56");
 assert.equal(formatLength(-10.555, "mm"), "-10.56");
 assert.equal(formatLength(1.005, "mm"), "1.01");
 assert.equal(formatLength(1.055, "mm"), "1.06");
 assert.equal(formatLength(35.555, "mm"), "35.56");
 assert.equal(formatLength(8192.005, "mm"), "8192.01");
 assert.equal(formatLength(-8192.005, "mm"), "-8192.01");
 assert.equal(formatLength(0.01, "mm"), "0.01");
 assert.equal(formatLength(0, "mm"), "0");
 assert.equal(formatLength(-0, "mm"), "0");
 assert.equal(formatLength(105.55, "cm"), "10.555");
 assert.equal(formatLength(105.555, "cm"), "10.556");
 assert.equal(formatLength(25.4, "in"), "1");
 assert.equal(formatLength(25.4005, "in"), "1");
 assert.equal(formatLength(50.8, "in"), "2");
 assert.equal(formatLength(150, "cm"), "15");
 assert.equal(formatLength(NaN, "mm"), "");
 assert.equal(formatLength(Infinity, "mm"), "");
 assert.equal(formatLength(-Infinity, "mm"), "");
});
