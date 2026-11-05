export interface BoundingBox2D {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface SpatialItem2D<T> {
  readonly id: string;
  readonly bounds: BoundingBox2D;
  readonly data: T;
}

export function boxesIntersect(a: BoundingBox2D, b: BoundingBox2D, gap = 0): boolean {
  return !(
    a.maxX + gap <= b.minX ||
    b.maxX + gap <= a.minX ||
    a.maxY + gap <= b.minY ||
    b.maxY + gap <= a.minY
  );
}

export class UniformSpatialGrid2D<T> {
  public readonly widthMm: number;
  public readonly heightMm: number;
  public readonly cellSizeMm: number;
  public readonly cols: number;
  public readonly rows: number;

  private readonly buckets: Array<Set<SpatialItem2D<T>>>;
  private readonly itemBuckets = new Map<string, number[]>();
  private readonly itemsById = new Map<string, SpatialItem2D<T>>();

  constructor(widthMm: number, heightMm: number, cellSizeMm?: number) {
    if (!Number.isFinite(widthMm) || widthMm <= 0 || !Number.isFinite(heightMm) || heightMm <= 0) {
      throw new Error("Spatial grid dimensions must be positive finite numbers.");
    }
    this.widthMm = widthMm;
    this.heightMm = heightMm;
    this.cellSizeMm =
      cellSizeMm && Number.isFinite(cellSizeMm) && cellSizeMm > 0
        ? cellSizeMm
        : Math.max(10, Math.min(widthMm, heightMm) / 10);

    this.cols = Math.max(1, Math.ceil(this.widthMm / this.cellSizeMm));
    this.rows = Math.max(1, Math.ceil(this.heightMm / this.cellSizeMm));
    this.buckets = Array.from({ length: this.cols * this.rows }, () => new Set<SpatialItem2D<T>>());
  }

  get itemCount(): number {
    return this.itemsById.size;
  }

  private cellIndex(col: number, row: number): number {
    return row * this.cols + col;
  }

  private getCellRange(
    box: BoundingBox2D,
    gap = 0,
  ): { minCol: number; maxCol: number; minRow: number; maxRow: number } {
    const minCol = Math.max(0, Math.min(this.cols - 1, Math.floor((box.minX - gap) / this.cellSizeMm)));
    const maxCol = Math.max(0, Math.min(this.cols - 1, Math.floor((box.maxX + gap) / this.cellSizeMm)));
    const minRow = Math.max(0, Math.min(this.rows - 1, Math.floor((box.minY - gap) / this.cellSizeMm)));
    const maxRow = Math.max(0, Math.min(this.rows - 1, Math.floor((box.maxY + gap) / this.cellSizeMm)));
    return { minCol, maxCol, minRow, maxRow };
  }

  public insert(item: SpatialItem2D<T>): void {
    if (this.itemsById.has(item.id)) {
      this.remove(item.id);
    }
    this.itemsById.set(item.id, item);

    const { minCol, maxCol, minRow, maxRow } = this.getCellRange(item.bounds);
    const bucketIndices: number[] = [];

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const idx = this.cellIndex(c, r);
        this.buckets[idx].add(item);
        bucketIndices.push(idx);
      }
    }
    this.itemBuckets.set(item.id, bucketIndices);
  }

  public remove(id: string): boolean {
    const item = this.itemsById.get(id);
    if (!item) return false;

    const bucketIndices = this.itemBuckets.get(id);
    if (bucketIndices) {
      for (const idx of bucketIndices) {
        this.buckets[idx].delete(item);
      }
      this.itemBuckets.delete(id);
    }
    this.itemsById.delete(id);
    return true;
  }

  public clear(): void {
    for (const bucket of this.buckets) {
      bucket.clear();
    }
    this.itemBuckets.clear();
    this.itemsById.clear();
  }

  public queryBox(box: BoundingBox2D): readonly SpatialItem2D<T>[] {
    const { minCol, maxCol, minRow, maxRow } = this.getCellRange(box);
    const candidateSet = new Set<SpatialItem2D<T>>();

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const bucket = this.buckets[this.cellIndex(c, r)];
        for (const item of bucket) {
          candidateSet.add(item);
        }
      }
    }

    const matches: SpatialItem2D<T>[] = [];
    for (const item of candidateSet) {
      if (boxesIntersect(box, item.bounds, 0)) {
        matches.push(item);
      }
    }
    return matches;
  }

  public queryPoint(x: number, y: number): readonly SpatialItem2D<T>[] {
    if (x < 0 || x > this.widthMm || y < 0 || y > this.heightMm) {
      return [];
    }
    const col = Math.max(0, Math.min(this.cols - 1, Math.floor(x / this.cellSizeMm)));
    const row = Math.max(0, Math.min(this.rows - 1, Math.floor(y / this.cellSizeMm)));
    const bucket = this.buckets[this.cellIndex(col, row)];

    const matches: SpatialItem2D<T>[] = [];
    for (const item of bucket) {
      if (
        x >= item.bounds.minX &&
        x <= item.bounds.maxX &&
        y >= item.bounds.minY &&
        y <= item.bounds.maxY
      ) {
        matches.push(item);
      }
    }
    return matches;
  }

  public hasCollision(box: BoundingBox2D, gapMm: number): boolean {
    const { minCol, maxCol, minRow, maxRow } = this.getCellRange(box, gapMm);

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const bucket = this.buckets[this.cellIndex(c, r)];
        for (const item of bucket) {
          if (boxesIntersect(box, item.bounds, gapMm)) {
            return true;
          }
        }
      }
    }
    return false;
  }
}
