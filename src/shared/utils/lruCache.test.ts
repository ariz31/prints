import assert from "node:assert/strict";
import { test } from "node:test";
import { LruCache } from "./lruCache.ts";

test("LruCache basic get, set, has, size and capacity", () => {
  const cache = new LruCache<string, number>({ maxCapacity: 3 });
  assert.equal(cache.capacity, 3);
  assert.equal(cache.size, 0);

  cache.set("a", 1).set("b", 2);
  assert.equal(cache.size, 2);
  assert.equal(cache.has("a"), true);
  assert.equal(cache.has("c"), false);
  assert.equal(cache.get("a"), 1);
  assert.equal(cache.get("non-existent"), undefined);
});

test("LruCache evicts least-recently-used item when exceeding capacity", () => {
  const evicted: Array<{ key: string; value: number }> = [];
  const cache = new LruCache<string, number>({
    maxCapacity: 3,
    onEvict: (key, value) => evicted.push({ key, value }),
  });

  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);
  assert.equal(cache.size, 3);
  assert.equal(evicted.length, 0);

  // Access "a" to move it to MRU position: order is now b, c, a
  assert.equal(cache.get("a"), 1);

  // Insert "d" -> "b" should be evicted as LRU
  cache.set("d", 4);
  assert.equal(cache.size, 3);
  assert.equal(cache.has("b"), false);
  assert.deepEqual(evicted, [{ key: "b", value: 2 }]);

  // Access "c" -> order is now a, d, c
  assert.equal(cache.get("c"), 3);

  // Insert "e" -> "a" should be evicted
  cache.set("e", 5);
  assert.equal(cache.has("a"), false);
  assert.deepEqual(evicted, [
    { key: "b", value: 2 },
    { key: "a", value: 1 },
  ]);
});

test("LruCache triggers onEvict on overwrite, delete, and clear", () => {
  const evicted: Array<{ key: string; value: string }> = [];
  const cache = new LruCache<string, string>({
    maxCapacity: 2,
    onEvict: (key, value) => evicted.push({ key, value }),
  });

  cache.set("k1", "v1");
  cache.set("k1", "v1-updated");
  assert.deepEqual(evicted, [{ key: "k1", value: "v1" }]);

  // Same value should not trigger onEvict
  cache.set("k1", "v1-updated");
  assert.equal(evicted.length, 1);

  cache.delete("k1");
  assert.deepEqual(evicted, [
    { key: "k1", value: "v1" },
    { key: "k1", value: "v1-updated" },
  ]);

  cache.set("x", "valX");
  cache.set("y", "valY");
  cache.clear();
  assert.equal(cache.size, 0);
  assert.equal(evicted.length, 4);
});

test("LruCache rejects invalid capacity bounds", () => {
  assert.throws(() => new LruCache({ maxCapacity: 0 }), /positive integer/);
  assert.throws(() => new LruCache({ maxCapacity: -1 }), /positive integer/);
  assert.throws(() => new LruCache({ maxCapacity: 1.5 }), /positive integer/);
  assert.throws(() => new LruCache({ maxCapacity: NaN }), /positive integer/);
});

test("LruCache iteration methods and spread support", () => {
  const cache = new LruCache<string, number>({ maxCapacity: 3 });
  cache.set("one", 1).set("two", 2);

  assert.deepEqual([...cache.keys()], ["one", "two"]);
  assert.deepEqual([...cache.values()], [1, 2]);
  assert.deepEqual([...cache.entries()], [["one", 1], ["two", 2]]);
  assert.deepEqual([...cache], [["one", 1], ["two", 2]]);
});
