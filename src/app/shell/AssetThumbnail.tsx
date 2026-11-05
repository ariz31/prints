import { useState } from "react";
import type { PhotoAsset } from "../../domain/models/asset.ts";
import StudioIcon from "../../components/StudioIcon.tsx";
import { selectThumbnailSource } from "../../platform/rendering/previewCache.ts";

export interface AssetThumbnailProps {
  item: PhotoAsset;
  previewUrl?: string;
}

/** Prefer the generated print preview, then processed bytes, then original bytes.
 * Failed sources are skipped individually so one stale URL never produces a broken thumbnail. */
export function AssetThumbnail({item,previewUrl}: AssetThumbnailProps) {
  const [failedSources, setFailedSources] = useState<ReadonlySet<string>>(() => new Set());
  const source=selectThumbnailSource([previewUrl,item.processedUrl,item.url],failedSources);
  return !source ? (
    <span
      className="asset-thumbnail asset-thumbnail-unavailable"
      role="img"
      aria-label={"Thumbnail unavailable for " + item.name}
    >
      <StudioIcon name="images" size={18} />
    </span>
  ) : (
    <img
      className="asset-thumbnail"
      src={source}
      alt=""
      loading="lazy"
      onError={() => setFailedSources(previous=>new Set([...previous,source]))}
    />
  );
}

export default AssetThumbnail;
