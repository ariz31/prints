export interface LruCacheOptions<K, V> {
  maxCapacity: number;
  onEvict?: (key: K, value: V) => void;
}

export class LruCache<K, V> {
  private readonly map = new Map<K, V>();
  private readonly maxCapacity: number;
  private readonly onEvict?: (key: K, value: V) => void;

  constructor(options: LruCacheOptions<K, V>) {
    if (!Number.isSafeInteger(options.maxCapacity) || options.maxCapacity < 1) {
      throw new Error("LruCache maxCapacity must be a positive integer.");
    }
    this.maxCapacity = options.maxCapacity;
    this.onEvict = options.onEvict;
  }

  get capacity(): number {
    return this.maxCapacity;
  }

  get size(): number {
    return this.map.size;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): this {
    if (this.map.has(key)) {
      const existing = this.map.get(key)!;
      if (existing !== value) {
        this.onEvict?.(key, existing);
      }
      this.map.delete(key);
    } else if (this.map.size >= this.maxCapacity) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        const oldestValue = this.map.get(oldestKey)!;
        this.map.delete(oldestKey);
        this.onEvict?.(oldestKey, oldestValue);
      }
    }
    this.map.set(key, value);
    return this;
  }

  delete(key: K): boolean {
    if (!this.map.has(key)) return false;
    const value = this.map.get(key)!;
    this.map.delete(key);
    this.onEvict?.(key, value);
    return true;
  }

  clear(): void {
    if (this.onEvict) {
      for (const [key, value] of this.map.entries()) {
        this.onEvict(key, value);
      }
    }
    this.map.clear();
  }

  keys(): IterableIterator<K> {
    return this.map.keys();
  }

  values(): IterableIterator<V> {
    return this.map.values();
  }

  entries(): IterableIterator<[K, V]> {
    return this.map.entries();
  }

  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.map.entries();
  }
}
