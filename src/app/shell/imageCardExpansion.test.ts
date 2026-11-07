import assert from "node:assert/strict";
import test from "node:test";
import {
  imageCardScope,
  isImageCardExpanded,
  moveImageCardOverrides,
  readImageCardOverrides,
  writeImageCardOverrides,
} from "./imageCardExpansion.ts";

function fakeStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    removeItem(key: string) { values.delete(key); },
    entries: values,
  };
}

test("one or two images expand by default; three and above collapse", () => {
  assert.equal(isImageCardExpanded("a", 1, {}), true);
  assert.equal(isImageCardExpanded("a", 2, {}), true);
  assert.equal(isImageCardExpanded("a", 3, {}), false);
  assert.equal(isImageCardExpanded("a", 5, {}), false);
});

test("manual state survives image count thresholds and other images", () => {
  const overrides = { a: true, b: false };
  assert.equal(isImageCardExpanded("a", 5, overrides), true);
  assert.equal(isImageCardExpanded("b", 2, overrides), false);
  assert.equal(isImageCardExpanded("c", 5, overrides), false);
  assert.equal(isImageCardExpanded("c", 2, overrides), true);
});

test("states persist separately for each project and draft", () => {
  const storage = fakeStorage();
  const first = imageCardScope("project-a", "session-1");
  const second = imageCardScope("project-b", "session-2");
  writeImageCardOverrides(first, { a: true, b: false }, storage);
  writeImageCardOverrides(second, { a: false }, storage);
  assert.deepEqual(readImageCardOverrides(first, storage), { a: true, b: false });
  assert.deepEqual(readImageCardOverrides(second, storage), { a: false });
  assert.notEqual(imageCardScope(null, "session-1"), imageCardScope(null, "session-2"));
});

test("saving an untitled draft transfers its existing selections to the named project", () => {
  const storage = fakeStorage();
  const draft = imageCardScope(null, "session-1");
  const named = imageCardScope("new-project", "session-1");
  writeImageCardOverrides(draft, { a: true, b: false }, storage);
  assert.deepEqual(
    moveImageCardOverrides(draft, named, readImageCardOverrides(draft, storage), storage),
    { a: true, b: false },
  );
  assert.deepEqual(readImageCardOverrides(draft, storage), {});
  assert.deepEqual(readImageCardOverrides(named, storage), { a: true, b: false });
});

test("corrupt storage, obsolete versions, and invalid values are ignored", () => {
  const storage = fakeStorage();
  const scope = "project:test";
  storage.setItem("prints:image-card-disclosure:v1:" + scope, "{bad-json");
  assert.deepEqual(readImageCardOverrides(scope, storage), {});
  storage.setItem("prints:image-card-disclosure:v1:" + scope, JSON.stringify({
    version: 99, overrides: { a: true },
  }));
  assert.deepEqual(readImageCardOverrides(scope, storage), {});
  storage.setItem("prints:image-card-disclosure:v1:" + scope, JSON.stringify({
    version: 1, overrides: { a: true, b: "yes", c: null },
  }));
  assert.deepEqual(readImageCardOverrides(scope, storage), { a: true });
});

test("blocked browser storage does not prevent in-memory interaction", () => {
  const blocked = {
    getItem(_key: string): string | null { throw new Error("blocked"); },
    setItem(_key: string, _value: string) { throw new Error("blocked"); },
    removeItem(_key: string) { throw new Error("blocked"); },
  };
  assert.deepEqual(readImageCardOverrides("project:a", blocked), {});
  assert.doesNotThrow(() => writeImageCardOverrides("project:a", { a: true }, blocked));
  assert.deepEqual(moveImageCardOverrides("draft:a", "project:a", { a: true }, blocked), { a: true });
});
