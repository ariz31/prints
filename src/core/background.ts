/**
 * Deterministic local uniform-background cleanup.
 * This is NOT semantic subject segmentation; best for plain-color photo backdrops.
 */
export type RGB = readonly [number, number, number];
export type BrushMode = "erase" | "restore";

export function removeConnectedBackground(
  source: Uint8ClampedArray, width: number, height: number,
  sample: RGB, tolerance: number,
): { pixels: Uint8ClampedArray; removed: number } {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width <= 0 || height <= 0 || source.length !== width * height * 4 ||
      !Number.isFinite(tolerance) || tolerance < 0 || tolerance > 255 ||
      sample.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 255)) {
    throw new Error("Invalid background removal image or tolerance.");
  }
  const pixels = new Uint8ClampedArray(source);
  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const maxDistSq = tolerance * tolerance;
  let head = 0, tail = 0, removed = 0;
  const matches = (idx: number) => {
    const offset = idx * 4;
    const dr = source[offset] - sample[0];
    const dg = source[offset + 1] - sample[1];
    const db = source[offset + 2] - sample[2];
    return source[offset + 3] > 0 && dr * dr + dg * dg + db * db <= maxDistSq;
  };
  const enqueue = (idx: number) => {
    if (visited[idx]) return;
    visited[idx] = 1;
    if (matches(idx)) queue[tail++] = idx;
  };
  for (let x = 0; x < width; x++) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  while (head < tail) {
    const idx = queue[head++];
    pixels[idx * 4 + 3] = 0;
    removed++;
    const x = idx % width;
    if (x > 0) enqueue(idx - 1);
    if (x < width - 1) enqueue(idx + 1);
    if (idx >= width) enqueue(idx - width);
    if (idx < total - width) enqueue(idx + width);
  }
  return { pixels, removed };
}

export function paintAlphaBrush(
  current: Uint8ClampedArray, original: Uint8ClampedArray,
  width: number, height: number, centerX: number, centerY: number,
  radius: number, mode: BrushMode,
): void {
  if (current.length !== width * height * 4 || original.length !== current.length ||
      !Number.isFinite(centerX) || !Number.isFinite(centerY) ||
      !Number.isFinite(radius) || radius <= 0) {
    throw new Error("Invalid brush input.");
  }
  const x0 = Math.max(0, Math.floor(centerX - radius));
  const x1 = Math.min(width - 1, Math.ceil(centerX + radius));
  const y0 = Math.max(0, Math.floor(centerY - radius));
  const y1 = Math.min(height - 1, Math.ceil(centerY + radius));
  const radiusSq = radius * radius;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if ((x - centerX) ** 2 + (y - centerY) ** 2 > radiusSq) continue;
      const offset = (y * width + x) * 4;
      if (mode === "erase") current[offset + 3] = 0;
      else for (let i = 0; i < 4; i++) current[offset + i] = original[offset + i];
    }
  }
}
