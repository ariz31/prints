import type { PhotoAsset } from "../../../core/exportPdf.ts";
import type { PhotoAdjustments } from "./photoAdjustments.ts";
import { rasterizePhotoPreview } from "../../../core/imageRaster.ts";
import type {CropPreviewSize} from "../../../core/imageRaster.ts";

export type WorkerOutputFormat = "bitmap" | "blob";

export type PreviewSource = Pick<
  PhotoAsset,
  | "url"
  | "processedUrl"
  | "crop"
  | "cropShape"
  | "widthMm"
  | "heightMm"
  | "pixelWidth"
  | "pixelHeight"
  | "processedWidth"
  | "processedHeight"
>;

export interface PreviewRenderRequest {
  type: "render";
  id: number;
  asset: PreviewSource;
  adjustments: PhotoAdjustments;
  mode: "full" | "crop";
  quality: "interactive" | "final";
  format?: WorkerOutputFormat;
  dimensions?: CropPreviewSize;
}

export interface PreviewCancelRequest {
  type: "cancel";
  id: number;
}

export interface LegacyPreviewRenderRequest {
  type?: undefined;
  id: number;
  asset: PreviewSource;
  adjustments: PhotoAdjustments;
  mode: "full" | "crop";
  quality: "interactive" | "final";
  format?: WorkerOutputFormat;
  dimensions?: CropPreviewSize;
}

export type PreviewWorkerJob = PreviewRenderRequest | PreviewCancelRequest | LegacyPreviewRenderRequest;

export interface PreviewWorkerBitmapSuccess {
  id: number;
  ok: true;
  format: "bitmap";
  bitmap: ImageBitmap;
  width: number;
  height: number;
}

export interface PreviewWorkerBlobSuccess {
  id: number;
  ok: true;
  format: "blob";
  blob: Blob;
  width: number;
  height: number;
}

export interface PreviewWorkerLegacyBlobSuccess {
  id: number;
  ok: true;
  format?: undefined;
  blob: Blob;
}

export interface PreviewWorkerFailure {
  id: number;
  ok: false;
  error: string;
  cancelled?: boolean;
}

export type PreviewWorkerReply =
  | PreviewWorkerBitmapSuccess
  | PreviewWorkerBlobSuccess
  | PreviewWorkerLegacyBlobSuccess
  | PreviewWorkerFailure;

export function isPreviewWorkerReply(data: unknown): data is PreviewWorkerReply {
  if (typeof data !== "object" || data === null) return false;
  const record = data as Record<string, unknown>;
  if (typeof record.id !== "number" || typeof record.ok !== "boolean") return false;
  if (!record.ok) return typeof record.error === "string";
  if ("bitmap" in record) {
    return typeof record.bitmap === "object" && record.bitmap !== null;
  }
  if ("blob" in record) {
    return typeof record.blob === "object" && record.blob !== null;
  }
  return false;
}

interface Pending {
  id: number;
  asset: PhotoAsset;
  adjustments: PhotoAdjustments;
  mode: "full" | "crop";
  quality: "interactive" | "final";
  format: WorkerOutputFormat;
  dimensions?: CropPreviewSize;
  signal?: AbortSignal;
  abortListener?: () => void;
  resolve: (value: Blob | ImageBitmap) => void;
  reject: (cause: Error) => void;
}

function sourceForWorker(asset: PhotoAsset): PreviewSource {
  const {
    url,
    processedUrl,
    crop,
    cropShape,
    widthMm,
    heightMm,
    pixelWidth,
    pixelHeight,
    processedWidth,
    processedHeight,
  } = asset;
  return {
    url,
    processedUrl,
    crop,
    cropShape,
    widthMm,
    heightMm,
    pixelWidth,
    pixelHeight,
    processedWidth,
    processedHeight,
  };
}

/** Off-main-thread latest-only render queue; no hosted image processing. */
export class PhotoPreviewRenderer {
  private worker: Worker | null = null;
  private active: Pending | null = null;
  private pending: Pending | null = null;
  private nextId = 0;
  private disposed = false;

  constructor() {
    if (
      typeof Worker === "undefined" ||
      typeof OffscreenCanvas === "undefined" ||
      typeof createImageBitmap === "undefined"
    )
      return;
    try {
      const worker = new Worker(
        new URL("../../../platform/workers/photoPreview.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.onmessage = (event: MessageEvent<unknown>) => {
        if (isPreviewWorkerReply(event.data)) {
          this.onMessage(event.data);
        }
      };
      worker.onerror = event => {
        event.preventDefault();
        this.disableWorker();
      };
      this.worker = worker;
    } catch {
      /* Use the exact main-thread renderer on unsupported browsers. */
    }
  }

  get usesWorker(): boolean {
    return this.worker !== null;
  }

  render(
    asset: PhotoAsset,
    adjustments: PhotoAdjustments,
    mode: "full" | "crop",
    quality: "interactive" | "final" = "final",
    signal?: AbortSignal,
    dimensions?: CropPreviewSize,
  ): Promise<Blob> {
    return this.enqueue(asset, adjustments, mode, quality, "blob", signal, dimensions) as Promise<Blob>;
  }

  renderBitmap(
    asset: PhotoAsset,
    adjustments: PhotoAdjustments,
    mode: "full" | "crop",
    quality: "interactive" | "final" = "final",
    signal?: AbortSignal,
    dimensions?: CropPreviewSize,
  ): Promise<ImageBitmap> {
    return this.enqueue(asset, adjustments, mode, quality, "bitmap", signal, dimensions) as Promise<ImageBitmap>;
  }

  private enqueue(
    asset: PhotoAsset,
    adjustments: PhotoAdjustments,
    mode: "full" | "crop",
    quality: "interactive" | "final",
    format: WorkerOutputFormat,
    signal?: AbortSignal,
    dimensions?: CropPreviewSize,
  ): Promise<Blob | ImageBitmap> {
    if (this.disposed) return Promise.reject(new Error("Preview renderer disposed."));
    if (signal?.aborted) {
      const reason = signal.reason;
      return Promise.reject(
        reason instanceof Error ? reason : new DOMException("The operation was aborted.", "AbortError"),
      );
    }
    return new Promise<Blob | ImageBitmap>((resolve, reject) => {
      const job: Pending = {
        id: ++this.nextId,
        asset,
        adjustments,
        mode,
        quality,
        format,
        dimensions,
        signal,
        resolve,
        reject,
      };

      if (signal) {
        const onAbort = () => {
          if (this.pending?.id === job.id) {
            const reason = signal.reason;
            this.pending.reject(
              reason instanceof Error
                ? reason
                : new DOMException("The operation was aborted.", "AbortError"),
            );
            this.pending = null;
          } else if (this.active?.id === job.id) {
            this.worker?.postMessage({ type: "cancel", id: job.id });
            const reason = signal.reason;
            this.active.reject(
              reason instanceof Error
                ? reason
                : new DOMException("The operation was aborted.", "AbortError"),
            );
            this.active = null;
            this.pump();
          }
        };
        job.abortListener = onAbort;
        signal.addEventListener("abort", onAbort, { once: true });
      }

      if (this.pending) {
        if (this.pending.signal && this.pending.abortListener) {
          this.pending.signal.removeEventListener("abort", this.pending.abortListener);
        }
        this.pending.reject(new Error("Preview superseded."));
      }

      this.pending = job;
      this.pump();
    });
  }

  private pump(): void {
    if (this.disposed || this.active || !this.pending) return;
    const job = this.pending;
    this.pending = null;
    this.active = job;
    if (!this.worker) {
      this.fallback(job);
      return;
    }
    try {
      const message: PreviewWorkerJob = {
        type: "render",
        id: job.id,
        asset: sourceForWorker(job.asset),
        adjustments: job.adjustments,
        mode: job.mode,
        quality: job.quality,
        format: job.format,
        dimensions: job.dimensions,
      };
      this.worker.postMessage(message);
    } catch {
      this.disableWorker();
    }
  }

  private fallback(job: Pending): void {
    if (job.format === "bitmap" && typeof createImageBitmap !== "undefined") {
      void rasterizePhotoPreview(job.asset, job.adjustments, job.mode, job.dimensions)
        .then(blob => createImageBitmap(blob))
        .then(
          bitmap => this.finish(job, bitmap),
          error => this.fail(job, error),
        );
    } else {
      void rasterizePhotoPreview(job.asset, job.adjustments, job.mode, job.dimensions).then(
        blob => this.finish(job, blob),
        error => this.fail(job, error),
      );
    }
  }

  private finish(job: Pending, result: Blob | ImageBitmap): void {
    if (this.active?.id !== job.id) {
      if ("close" in result && typeof result.close === "function") {
        (result as ImageBitmap).close();
      }
      return;
    }
    if (job.signal && job.abortListener) {
      job.signal.removeEventListener("abort", job.abortListener);
    }
    this.active = null;
    job.resolve(result);
    this.pump();
  }

  private fail(job: Pending, cause: unknown): void {
    if (this.active?.id !== job.id) return;
    if (job.signal && job.abortListener) {
      job.signal.removeEventListener("abort", job.abortListener);
    }
    this.active = null;
    job.reject(cause instanceof Error ? cause : new Error("Preview failed."));
    this.pump();
  }

  private onMessage(reply: PreviewWorkerReply): void {
    if (!this.active || reply.id !== this.active.id) {
      if (reply.ok && "bitmap" in reply && reply.bitmap) {
        try {
          reply.bitmap.close();
        } catch {}
      }
      return;
    }
    if (reply.ok) {
      if ("bitmap" in reply && reply.bitmap) {
        this.finish(this.active, reply.bitmap);
      } else if ("blob" in reply && reply.blob) {
        this.finish(this.active, reply.blob);
      }
      return;
    }
    if (reply.cancelled) {
      return;
    }
    this.disableWorker();
  }

  private disableWorker(): void {
    if (!this.worker) return;
    this.worker.terminate();
    this.worker = null;
    if (this.active) this.fallback(this.active);
    else this.pump();
  }

  dispose(): void {
    this.disposed = true;
    if (this.worker && this.active) {
      try {
        this.worker.postMessage({ type: "cancel", id: this.active.id });
      } catch {}
    }
    this.worker?.terminate();
    this.worker = null;
    if (this.active?.signal && this.active.abortListener) {
      this.active.signal.removeEventListener("abort", this.active.abortListener);
    }
    if (this.pending?.signal && this.pending.abortListener) {
      this.pending.signal.removeEventListener("abort", this.pending.abortListener);
    }
    this.active?.reject(new Error("Preview canceled."));
    this.pending?.reject(new Error("Preview canceled."));
    this.active = null;
    this.pending = null;
  }
}
