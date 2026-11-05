import { exactCropSourceRect } from "../../core/crop.ts";
import { maskCropShape } from "../../core/cropShapes.ts";
import { previewRasterDimensions } from "../rendering/imageRaster.ts";
import {
  hasGeometryTransform,
  needsPixelProcessing,
  rotationCoverScale,
  setCanvasPhotoFilter,
  photoOpacityFraction,
} from "../../core/photoAdjustments.ts";
import { processPhotoPixels } from "../rendering/photoPixels.ts";
import type { PreviewWorkerJob, PreviewWorkerReply } from "../../core/photoPreviewRenderer.ts";
import { LruCache } from "../../shared/utils/lruCache.ts";

interface WorkerDedicatedScope {
  onmessage: ((event: MessageEvent<PreviewWorkerJob>) => void) | null;
  postMessage: (reply: PreviewWorkerReply, transfer?: Transferable[]) => void;
}

const activeControllers = new Map<number, AbortController>();

const bitmapCache = new LruCache<string, ImageBitmap>({
  maxCapacity: 6,
  onEvict: (_url, bitmap) => {
    try {
      bitmap.close();
    } catch {
      // Ignore if already closed
    }
  },
});

async function sourceBitmap(url: string, signal?: AbortSignal): Promise<ImageBitmap> {
  const existing = bitmapCache.get(url);
  if (existing) return existing;
  const response = await fetch(url, { credentials: "omit", signal });
  if (!response.ok) throw new Error("Local image source could not be decoded.");
  const blob = await response.blob();
  if (signal?.aborted) throw new DOMException("Job aborted", "AbortError");
  const next = await createImageBitmap(blob);
  bitmapCache.set(url, next);
  return next;
}

async function render(message: PreviewWorkerJob, signal: AbortSignal): Promise<PreviewWorkerReply> {
  if (signal.aborted) throw new DOMException("Job aborted", "AbortError");
  if (message.type === "cancel") {
    return { id: message.id, ok: false, error: "Job cancelled.", cancelled: true };
  }
  const { asset, adjustments, mode, quality } = message;
  const format = message.format ?? "blob";
  const image = await sourceBitmap(asset.processedUrl ?? asset.url, signal);
  if (signal.aborted) throw new DOMException("Job aborted", "AbortError");

  const fullWidth = asset.processedWidth ?? asset.pixelWidth;
  const fullHeight = asset.processedHeight ?? asset.pixelHeight;
  if (!Number.isFinite(fullWidth) || !Number.isFinite(fullHeight) || fullWidth <= 0 || fullHeight <= 0) {
    throw new Error("Invalid source image dimensions.");
  }
  const scaleToPreview = Math.min(1, 1200 / Math.max(fullWidth, fullHeight));
  const base =
    mode === "crop"
      ? previewRasterDimensions(asset.widthMm, asset.heightMm, message.dimensions)
      : {
          width: Math.max(1, Math.round(fullWidth * scaleToPreview)),
          height: Math.max(1, Math.round(fullHeight * scaleToPreview)),
        };
  const scale = quality === "interactive" ? Math.min(1, 680 / Math.max(base.width, base.height)) : 1;
  const width = Math.max(1, Math.round(base.width * scale));
  const height = Math.max(1, Math.round(base.height * scale));

  if (signal.aborted) throw new DOMException("Job aborted", "AbortError");
  const canvas = new OffscreenCanvas(width, height);
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("OffscreenCanvas unavailable.");
    context.imageSmoothingQuality = "high";
    const source =
      mode === "full"
        ? { sx: 0, sy: 0, sw: image.width, sh: image.height }
        : exactCropSourceRect(image.width, image.height, asset.crop, asset.widthMm, asset.heightMm);
    context.clearRect(0, 0, width, height);
    setCanvasPhotoFilter(context, adjustments);
    context.globalAlpha = photoOpacityFraction(adjustments);
    if (hasGeometryTransform(adjustments)) {
      const angle = (((adjustments.rotation ?? 0) + (adjustments.straighten ?? 0)) * Math.PI) / 180;
      const cover = rotationCoverScale(width, height, (angle * 180) / Math.PI);
      context.save();
      context.translate(width / 2, height / 2);
      context.rotate(angle);
      context.scale((adjustments.flipX ? -1 : 1) * cover, (adjustments.flipY ? -1 : 1) * cover);
      context.drawImage(image, source.sx, source.sy, source.sw, source.sh, -width / 2, -height / 2, width, height);
      context.restore();
    } else {
      context.drawImage(image, source.sx, source.sy, source.sw, source.sh, 0, 0, width, height);
    }
    if (signal.aborted) throw new DOMException("Job aborted", "AbortError");
    if (needsPixelProcessing(adjustments)) {
      const frame = context.getImageData(0, 0, width, height);
      const whole = mode === "full" ? { ...adjustments, regions: [] } : adjustments;
      frame.data.set(processPhotoPixels(frame.data, width, height, whole));
      context.putImageData(frame, 0, 0);
    }
    if (mode === "crop") maskCropShape(context, asset.cropShape, width, height);
    if (signal.aborted) throw new DOMException("Job aborted", "AbortError");

    if (format === "bitmap" && typeof canvas.transferToImageBitmap === "function") {
      const bitmap = canvas.transferToImageBitmap();
      return { id: message.id, ok: true, format: "bitmap", bitmap, width, height };
    }
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return { id: message.id, ok: true, format: "blob", blob, width, height };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

const scope = self as unknown as WorkerDedicatedScope;
scope.onmessage = event => {
  const job = event.data;
  if (!job || typeof job !== "object" || typeof (job as { id?: unknown }).id !== "number") return;

  if (job.type === "cancel") {
    const active = activeControllers.get(job.id);
    if (active) {
      active.abort();
      activeControllers.delete(job.id);
    }
    return;
  }

  const controller = new AbortController();
  activeControllers.set(job.id, controller);

  void render(job, controller.signal).then(
    reply => {
      const wasActive = activeControllers.has(job.id);
      activeControllers.delete(job.id);
      if (!wasActive || controller.signal.aborted) {
        if (reply.ok && "bitmap" in reply && reply.bitmap) {
          try {
            reply.bitmap.close();
          } catch {}
        }
        return;
      }
      if (reply.ok && "bitmap" in reply && reply.bitmap) {
        scope.postMessage(reply, [reply.bitmap]);
      } else {
        scope.postMessage(reply);
      }
    },
    error => {
      const wasActive = activeControllers.has(job.id);
      activeControllers.delete(job.id);
      if (!wasActive || controller.signal.aborted) return;
      scope.postMessage({
        id: job.id,
        ok: false,
        error: error instanceof Error ? error.message : "Worker preview failed.",
      });
    },
  );
};
