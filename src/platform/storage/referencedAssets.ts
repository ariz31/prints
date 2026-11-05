import type { PhotoAsset } from "../../domain/models/asset.ts";

export const DEFAULT_MAX_RASTER_GENERATIONS = 4;

/** Keep original and processed browser URLs alive while ANY active design or
 * history frame references them.
 * Original photo URLs (asset.url) are permanent roots across all active and history states.
 * Derived processed URLs (asset.processedUrl) are generation-bounded to limit peak Blob retention.
 * Pending imports are also roots: their URLs are not yet in active or history
 * frames but must remain valid until their entire batch commits or aborts.
 */
export function referencedImageUrls(
  active: readonly PhotoAsset[],
  history: readonly { items: readonly PhotoAsset[] }[],
  pending: ReadonlySet<string> = new Set<string>(),
  maxRasterGenerations = DEFAULT_MAX_RASTER_GENERATIONS,
): Set<string> {
  const references = new Set<string>(pending);

  // 1. Permanent roots: All original photo URLs across active and ALL history states
  for (const asset of active) {
    references.add(asset.url);
  }
  for (const snapshot of history) {
    for (const asset of snapshot.items) {
      references.add(asset.url);
    }
  }

  // 2. Active processed URLs are always rooted
  for (const asset of active) {
    if (asset.processedUrl) references.add(asset.processedUrl);
  }

  // 3. Historical processed URLs are bounded by generation scope
  // Traverse from newest snapshot backwards towards oldest
  const rasterGenerations = new Map<string, Set<string>>();
  for (let i = history.length - 1; i >= 0; i--) {
    const snapshot = history[i];
    for (const asset of snapshot.items) {
      if (asset.processedUrl) {
        let seen = rasterGenerations.get(asset.id);
        if (!seen) {
          seen = new Set<string>();
          rasterGenerations.set(asset.id, seen);
        }
        if (seen.size < maxRasterGenerations || seen.has(asset.processedUrl)) {
          seen.add(asset.processedUrl);
          references.add(asset.processedUrl);
        }
      }
    }
  }

  return references;
}
