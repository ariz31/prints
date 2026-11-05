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


/**
 * Separable, alpha-premultiplied feather for a manually refined cutout.
 * Premultiplication prevents white/colored transparent-background fringes.
 * Returns a new buffer; the original is not modified.
 */
export function featherAlphaMask(
 pixels:Uint8ClampedArray,width:number,height:number,radius:number,
):Uint8ClampedArray{
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||
   width<=0||height<=0||width*height>2_560_000||
   pixels.length!==width*height*4||
   !Number.isSafeInteger(radius)||radius<0||radius>6)
   throw new Error("Invalid feather radius or raster dimensions.");
 if(radius===0)return new Uint8ClampedArray(pixels);
 const intermediate=new Float32Array(pixels.length);
 const result=new Uint8ClampedArray(pixels.length);
 // Horizontal convolution in premultiplied space.
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const start=Math.max(0,x-radius),end=Math.min(width-1,x+radius);
  const count=end-start+1,at=(y*width+x)*4;
  let rr=0,gg=0,bb=0,aa=0;
  for(let sx=start;sx<=end;sx++){
   const p=(y*width+sx)*4,alpha=pixels[p+3]/255;
   rr+=pixels[p]*alpha;gg+=pixels[p+1]*alpha;bb+=pixels[p+2]*alpha;aa+=alpha;
  }
  intermediate[at]=rr/count;intermediate[at+1]=gg/count;
  intermediate[at+2]=bb/count;intermediate[at+3]=aa/count;
 }
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const start=Math.max(0,y-radius),end=Math.min(height-1,y+radius);
  const count=end-start+1,at=(y*width+x)*4;
  let rr=0,gg=0,bb=0,aa=0;
  for(let sy=start;sy<=end;sy++){
   const p=(sy*width+x)*4;
   rr+=intermediate[p];gg+=intermediate[p+1];
   bb+=intermediate[p+2];aa+=intermediate[p+3];
  }
  aa/=count;
  if(aa>1e-6){
   result[at]=rr/count/aa;result[at+1]=gg/count/aa;
   result[at+2]=bb/count/aa;
  }
  result[at+3]=aa*255;
 }
 return result;
}
