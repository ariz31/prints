export interface CanvasLike {
  width: number;
  height: number;
  getContext(
    contextId: "2d",
    options?: CanvasRenderingContext2DSettings,
  ): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
}

export interface CanvasPoolOptions<T extends CanvasLike> {
  maxCapacity?: number;
  factory?: (width: number, height: number) => T;
  reset?: (canvas: T) => void;
}

export class CanvasPool<T extends CanvasLike> {
  private readonly pool: T[] = [];
  private readonly maxCapacity: number;
  private readonly factory: (width: number, height: number) => T;
  private readonly reset?: (canvas: T) => void;
  private disposed = false;

  constructor(options: CanvasPoolOptions<T> = {}) {
    this.maxCapacity = Math.max(1, options.maxCapacity ?? 4);
    this.reset = options.reset;
    this.factory =
      options.factory ??
      ((width: number, height: number) => defaultCanvasFactory(width, height) as unknown as T);
  }

  get size(): number {
    return this.pool.length;
  }

  get capacity(): number {
    return this.maxCapacity;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  acquire(width: number, height: number): T {
    if (this.disposed) {
      throw new Error("Cannot acquire from a disposed CanvasPool.");
    }
    const pooled = this.pool.pop();
    const canvas = pooled ?? this.factory(width, height);
    if (pooled) {
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      } else {
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, width, height);
      }
    }
    this.reset?.(canvas);
    return canvas;
  }

  release(canvas: T): void {
    if (this.disposed || this.pool.length >= this.maxCapacity) {
      canvas.width = 0;
      canvas.height = 0;
      return;
    }
    this.pool.push(canvas);
  }

  clear(): void {
    while (this.pool.length > 0) {
      const canvas = this.pool.pop()!;
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.clear();
  }

  withCanvas<R>(width: number, height: number, fn: (canvas: T) => R): R {
    const canvas = this.acquire(width, height);
    try {
      return fn(canvas);
    } finally {
      this.release(canvas);
    }
  }

  async withCanvasAsync<R>(
    width: number,
    height: number,
    fn: (canvas: T) => Promise<R>,
  ): Promise<R> {
    const canvas = this.acquire(width, height);
    try {
      return await fn(canvas);
    } finally {
      this.release(canvas);
    }
  }
}

export function defaultCanvasFactory(width: number, height: number): HTMLCanvasElement {
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height) as unknown as HTMLCanvasElement;
  }
  throw new Error("HTMLCanvasElement is not available in the current environment.");
}

export function defaultOffscreenCanvasFactory(width: number, height: number): OffscreenCanvas {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  throw new Error("OffscreenCanvas is not available in the current environment.");
}
