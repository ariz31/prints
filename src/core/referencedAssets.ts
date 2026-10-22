import type {PhotoAsset} from "./exportPdf.ts";

/** Keep original and processed browser URLs alive while ANY active design or
 * history frame references them. This deliberately does not retain rasterized
 * thumbnail cache URLs, which have an independent lifecycle.
 */
export function referencedImageUrls(
  active:readonly PhotoAsset[],
  history:readonly {items:readonly PhotoAsset[]}[],
):Set<string>{
  const references=new Set<string>();
  for(const assets of [active,...history.map(snapshot=>snapshot.items)]){
    for(const asset of assets){
      references.add(asset.url);
      if(asset.processedUrl)references.add(asset.processedUrl);
    }
  }
  return references;
}
