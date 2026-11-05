import { formatLength } from "../src/domain/geometry/units.ts";
import { validDesignLayers, MAX_DESIGN_LAYERS, newFrameLayer } from "../src/core/layers.ts";

console.log("=================================================");
console.log("   EMPIRICAL ADVERSARIAL TEST HARNESS (CHALLENGER 2)");
console.log("=================================================");

let totalPassed = 0;
let totalFailed = 0;
const findings = [];

function assertTest(name, condition, details = "") {
  if (condition) {
    totalPassed++;
    console.log(`[PASS] ${name}`);
  } else {
    totalFailed++;
    console.error(`[FAIL] ${name} ${details}`);
    findings.push({ name, details });
  }
}

// --------------------------------------------------------------------------
// SUITE 1: Mathematical Precision & Float Scaling (roundHalfAway / formatLength)
// --------------------------------------------------------------------------
console.log("\n--- Suite 1: Mathematical Precision & Float Scaling ---");

// 1.1 Zero and Signed Zero
assertTest("formatLength(0, 'mm') === '0'", formatLength(0, "mm") === "0");
assertTest("formatLength(-0, 'mm') === '0'", formatLength(-0, "mm") === "0");
assertTest("formatLength(0, 'in') === '0'", formatLength(0, "in") === "0");
assertTest("formatLength(0, 'cm') === '0'", formatLength(0, "cm") === "0");

// 1.2 Sub-micron Scale (< 1 micron / 0.001 mm)
assertTest("formatLength(0.0001, 'mm') === '0'", formatLength(0.0001, "mm") === "0");
assertTest("formatLength(0.0049, 'mm') === '0'", formatLength(0.0049, "mm") === "0");
assertTest("formatLength(0.005, 'mm') === '0.01' (half-away midpoint)", formatLength(0.005, "mm") === "0.01");
assertTest("formatLength(-0.0049, 'mm') === '0'", formatLength(-0.0049, "mm") === "0");
assertTest("formatLength(-0.005, 'mm') === '-0.01' (half-away midpoint negative)", formatLength(-0.005, "mm") === "-0.01");
assertTest("formatLength(Number.MIN_VALUE, 'mm') === '0'", formatLength(Number.MIN_VALUE, "mm") === "0");

// 1.3 Normal Print Dimensions (1 mm <= n < 1000 mm)
assertTest("formatLength(10.555, 'mm') === '10.56' (IEEE 754 precision)", formatLength(10.555, "mm") === "10.56");
assertTest("formatLength(10.554, 'mm') === '10.55'", formatLength(10.554, "mm") === "10.55");
assertTest("formatLength(-10.555, 'mm') === '-10.56'", formatLength(-10.555, "mm") === "-10.56");
assertTest("formatLength(210, 'mm') === '210' (A4 width)", formatLength(210, "mm") === "210");
assertTest("formatLength(297, 'mm') === '297' (A4 height)", formatLength(297, "mm") === "297");
assertTest("formatLength(25.4, 'in') === '1' (exact 1 inch)", formatLength(25.4, "in") === "1");
assertTest("formatLength(50.8, 'in') === '2' (exact 2 inches)", formatLength(50.8, "in") === "2");
assertTest("formatLength(100, 'cm') === '10' (100 mm in cm)", formatLength(100, "cm") === "10");
assertTest("formatLength(10.555, 'cm') === '1.056'", formatLength(10.555, "cm") === "1.056");

// 1.4 Large Scale (n >= 8192 mm)
assertTest("formatLength(8192, 'mm') === '8192'", formatLength(8192, "mm") === "8192");
assertTest("formatLength(8192.555, 'mm') === '8192.56'", formatLength(8192.555, "mm") === "8192.56");
assertTest("formatLength(-8192.555, 'mm') === '-8192.56'", formatLength(-8192.555, "mm") === "-8192.56");
assertTest("formatLength(8192, 'in') === '322.5197'", formatLength(8192, "in") === "322.5197");
assertTest("formatLength(65536, 'mm') === '65536'", formatLength(65536, "mm") === "65536");

// 1.5 Billboard Scale (n >= 100000 mm = 100 meters)
assertTest("formatLength(100000, 'mm') === '100000'", formatLength(100000, "mm") === "100000");
assertTest("formatLength(100000.555, 'mm') === '100000.56'", formatLength(100000.555, "mm") === "100000.56");
assertTest("formatLength(-100000.555, 'mm') === '-100000.56'", formatLength(-100000.555, "mm") === "-100000.56");
assertTest("formatLength(100000, 'in') === '3937.0079'", formatLength(100000, "in") === "3937.0079");
assertTest("formatLength(1000000, 'mm') === '1000000' (1 km)", formatLength(1000000, "mm") === "1000000");

// 1.6 Non-Finite and Extreme Floats
assertTest("formatLength(NaN, 'mm') === ''", formatLength(NaN, "mm") === "");
assertTest("formatLength(Infinity, 'mm') === ''", formatLength(Infinity, "mm") === "");
assertTest("formatLength(-Infinity, 'mm') === ''", formatLength(-Infinity, "mm") === "");
assertTest("formatLength(Number.MAX_SAFE_INTEGER, 'mm') === '9007199254740991'", formatLength(Number.MAX_SAFE_INTEGER, "mm") === "9007199254740991");
assertTest("formatLength(1e20, 'mm') === '100000000000000000000'", formatLength(1e20, "mm") === "100000000000000000000");
assertTest("formatLength(1e300, 'mm') === '1e+300'", formatLength(1e300, "mm") === "1e+300");

// Edge case analysis on exponent overflow (1e307):
const extremeResult = formatLength(1e307, "mm");
console.log(`[INFO] formatLength(1e307, 'mm') = '${extremeResult}' (Exponent shift overflow to Infinity -> NaN)`);


// --------------------------------------------------------------------------
// SUITE 2: Layer Integration & Boundary Stress (validDesignLayers)
// --------------------------------------------------------------------------
console.log("\n--- Suite 2: Layer Integration & Boundary Stress ---");
console.log(`[INFO] MAX_DESIGN_LAYERS constant value in code: ${MAX_DESIGN_LAYERS}`);

const validRect = {
  id: "rect-1",
  name: "Rectangle 1",
  visible: true,
  color: "#ff0000",
  kind: "rectangle",
  x: 0.1,
  y: 0.1,
  width: 0.4,
  height: 0.4,
};

const validText = {
  id: "text-1",
  name: "Text 1",
  visible: true,
  color: "#000000",
  kind: "text",
  x: 0.1,
  y: 0.1,
  width: 0.8,
  height: 0.2,
  text: "Sample Label",
  fontSizePt: 12,
  fontFamily: "Helvetica",
  align: "center",
};

// 2.1 Layer Count Boundaries
assertTest("validDesignLayers([]) === true (empty array)", validDesignLayers([]) === true);

const layers20 = Array.from({ length: 20 }, (_, i) => ({ ...validRect, id: `layer-${i}` }));
assertTest("validDesignLayers(20 layers) === true", validDesignLayers(layers20) === true);

const layers21 = Array.from({ length: 21 }, (_, i) => ({ ...validRect, id: `layer-${i}` }));
assertTest("validDesignLayers(21 layers) === true (MAX_DESIGN_LAYERS is 100, so 21 <= 100 is valid)", validDesignLayers(layers21) === true);

const layers100 = Array.from({ length: MAX_DESIGN_LAYERS }, (_, i) => ({ ...validRect, id: `layer-${i}` }));
assertTest("validDesignLayers(100 layers) === true (boundary exactly at limit)", validDesignLayers(layers100) === true);

const layers101 = Array.from({ length: MAX_DESIGN_LAYERS + 1 }, (_, i) => ({ ...validRect, id: `layer-${i}` }));
assertTest("validDesignLayers(101 layers) === false (boundary exceeding limit rejected)", validDesignLayers(layers101) === false);

// 2.2 Sparse Arrays & Non-Array Payloads
assertTest("validDesignLayers(null) === false", validDesignLayers(null) === false);
assertTest("validDesignLayers(undefined) === false", validDesignLayers(undefined) === false);
assertTest("validDesignLayers('string') === false", validDesignLayers("string") === false);
assertTest("validDesignLayers(123) === false", validDesignLayers(123) === false);
assertTest("validDesignLayers({ length: 1, 0: validRect }) === false (plain object array-like)", validDesignLayers({ length: 1, 0: validRect }) === false);
assertTest("validDesignLayers(new Array(5)) === false (sparse array)", validDesignLayers(new Array(5)) === false);
assertTest("validDesignLayers([validRect, , validRect2]) === false (array hole)", validDesignLayers([validRect, , { ...validRect, id: "r2" }]) === false);

const trailingHoleArr = [validRect];
trailingHoleArr.length = 3;
assertTest("validDesignLayers(array with extended length hole) === false", validDesignLayers(trailingHoleArr) === false);

// 2.3 Negative Dimensions & Zero Dimension Checks
assertTest("Negative x (-0.01) rejected", validDesignLayers([{ ...validRect, x: -0.01 }]) === false);
assertTest("Negative y (-0.01) rejected", validDesignLayers([{ ...validRect, y: -0.01 }]) === false);
assertTest("Negative width (-0.1) rejected", validDesignLayers([{ ...validRect, width: -0.1 }]) === false);
assertTest("Negative height (-0.1) rejected", validDesignLayers([{ ...validRect, height: -0.1 }]) === false);
assertTest("Zero width (width = 0) rejected", validDesignLayers([{ ...validRect, width: 0 }]) === false);
assertTest("Zero height (height = 0) rejected", validDesignLayers([{ ...validRect, height: 0 }]) === false);
assertTest("Negative zero x (-0) accepted as 0", validDesignLayers([{ ...validRect, x: -0 }]) === true);

// 2.4 Dimension Boundary & Overflow Tolerances
assertTest("Dimension overflow x + width > 1.000001 rejected", validDesignLayers([{ ...validRect, x: 0.6, width: 0.5 }]) === false);
assertTest("Dimension overflow y + height > 1.000001 rejected", validDesignLayers([{ ...validRect, y: 0.6, height: 0.5 }]) === false);
assertTest("Full coverage x=0, y=0, width=1, height=1 accepted", validDesignLayers([{ ...validRect, x: 0, y: 0, width: 1, height: 1 }]) === true);
assertTest("Micro-overflow 0.5 + 0.500002 = 1.000002 rejected", validDesignLayers([{ ...validRect, x: 0.5, width: 0.500002 }]) === false);
assertTest("Micro-epsilon 0.5 + 0.5000005 = 1.0000005 accepted", validDesignLayers([{ ...validRect, x: 0.5, width: 0.5000005 }]) === true);

// 2.5 Opacity Boundaries
assertTest("Opacity 0 accepted", validDesignLayers([{ ...validRect, opacity: 0 }]) === true);
assertTest("Opacity 1 accepted", validDesignLayers([{ ...validRect, opacity: 1 }]) === true);
assertTest("Opacity 0.5 accepted", validDesignLayers([{ ...validRect, opacity: 0.5 }]) === true);
assertTest("Opacity undefined accepted", validDesignLayers([{ ...validRect, opacity: undefined }]) === true);
assertTest("Opacity -0.0001 rejected", validDesignLayers([{ ...validRect, opacity: -0.0001 }]) === false);
assertTest("Opacity 1.0001 rejected", validDesignLayers([{ ...validRect, opacity: 1.0001 }]) === false);
assertTest("Opacity NaN rejected", validDesignLayers([{ ...validRect, opacity: NaN }]) === false);
assertTest("Opacity Infinity rejected", validDesignLayers([{ ...validRect, opacity: Infinity }]) === false);
assertTest("Opacity string '0.5' rejected", validDesignLayers([{ ...validRect, opacity: "0.5" }]) === false);
assertTest("Opacity null rejected", validDesignLayers([{ ...validRect, opacity: null }]) === false);

// 2.6 Frame Layer Constraints
const validFrame = newFrameLayer("hairline");
assertTest("Valid frame layer accepted", validDesignLayers([validFrame]) === true);
assertTest("Duplicate frame layer in same design rejected", validDesignLayers([validFrame, { ...validFrame, id: "f-2" }]) === false);
assertTest("Frame layer not full size (x=0.1) rejected", validDesignLayers([{ ...validFrame, x: 0.1 }]) === false);
assertTest("Frame layer with groupId rejected", validDesignLayers([{ ...validFrame, groupId: "g-1" }]) === false);
assertTest("Frame layer with invalid weight (<0.25) rejected", validDesignLayers([{ ...validFrame, weight: 0.1 }]) === false);
assertTest("Frame layer with invalid weight (>8) rejected", validDesignLayers([{ ...validFrame, weight: 8.5 }]) === false);

// 2.7 Text Layer Constraints
assertTest("Valid text layer accepted", validDesignLayers([validText]) === true);
assertTest("Text length > 300 rejected", validDesignLayers([{ ...validText, text: "A".repeat(301) }]) === false);
assertTest("FontSizePt < 4 rejected", validDesignLayers([{ ...validText, fontSizePt: 3 }]) === false);
assertTest("FontSizePt > 180 rejected", validDesignLayers([{ ...validText, fontSizePt: 181 }]) === false);
assertTest("Invalid align rejected", validDesignLayers([{ ...validText, align: "justify" }]) === false);
assertTest("Invalid fontFamily rejected", validDesignLayers([{ ...validText, fontFamily: "ComicSans" }]) === false);

// 2.8 Prototype Pollution & Proxy Stress
console.log("\n--- Suite 2.8: Prototype Pollution & Throwing Accessors ---");

// Test 2.8.1: Throwing length accessor outside try/catch
let threwUnhandledOnLength = false;
try {
  const evilLengthProxy = new Proxy([], {
    get(target, prop) {
      if (prop === "length") throw new Error("Throwing length accessor");
      return Reflect.get(target, prop);
    },
  });
  validDesignLayers(evilLengthProxy);
} catch (e) {
  threwUnhandledOnLength = true;
  console.log(`[FINDING] Unhandled exception triggered when proxy length throws: '${e.message}' (input.length evaluated before try block)`);
}
assertTest("Array Proxy with throwing length throws unhandled exception", threwUnhandledOnLength);

// Test 2.8.2: Throwing property accessor inside element is caught cleanly
let threwUnhandledOnElementProp = false;
try {
  const evilPropProxy = new Proxy({ ...validRect }, {
    get(target, prop) {
      if (prop === "id") throw new Error("Throwing id accessor");
      return Reflect.get(target, prop);
    },
  });
  const res = validDesignLayers([evilPropProxy]);
  assertTest("Throwing element property returns false without throwing", res === false);
} catch (e) {
  threwUnhandledOnElementProp = true;
}
assertTest("Element Proxy with throwing property caught cleanly by try/catch", !threwUnhandledOnElementProp);

// Test 2.8.3: Prototype pollution injecting invalid opacity
let prototypePollutionOpacityBrokeValidLayers = false;
try {
  Object.prototype.opacity = -5;
  // A clean layer that has NO own opacity property
  const layerWithoutOpacity = { ...validRect };
  delete layerWithoutOpacity.opacity;
  const res = validDesignLayers([layerWithoutOpacity]);
  if (res === false) {
    prototypePollutionOpacityBrokeValidLayers = true;
    console.log(`[FINDING] Prototype pollution 'Object.prototype.opacity = -5' broke valid layer without own opacity: validDesignLayers returned false`);
  }
} finally {
  delete Object.prototype.opacity;
}
assertTest("Prototype pollution on opacity affects layers without own property", prototypePollutionOpacityBrokeValidLayers);

// Test 2.8.4: Prototype pollution passing empty object {}
let emptyObjectPassedViaPrototypePollution = false;
try {
  Object.prototype.id = "injected-id";
  Object.prototype.name = "injected-name";
  Object.prototype.visible = true;
  Object.prototype.color = "#000000";
  Object.prototype.kind = "rectangle";
  Object.prototype.x = 0.1;
  Object.prototype.y = 0.1;
  Object.prototype.width = 0.5;
  Object.prototype.height = 0.5;

  const emptyObj = {};
  const res = validDesignLayers([emptyObj]);
  if (res === true) {
    emptyObjectPassedViaPrototypePollution = true;
    console.log(`[FINDING] Empty object {} certified as valid DesignLayer when Object.prototype is polluted with layer properties`);
  }
} finally {
  delete Object.prototype.id;
  delete Object.prototype.name;
  delete Object.prototype.visible;
  delete Object.prototype.color;
  delete Object.prototype.kind;
  delete Object.prototype.x;
  delete Object.prototype.y;
  delete Object.prototype.width;
  delete Object.prototype.height;
}
assertTest("Empty object {} can pass validDesignLayers via polluted prototype properties", emptyObjectPassedViaPrototypePollution);

console.log("\n=================================================");
console.log(`HARNESS EXECUTION COMPLETE: ${totalPassed} Passed, ${totalFailed} Failed`);
console.log("=================================================");
