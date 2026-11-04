import type {PhotoAsset} from "./exportPdf.ts";
import type {ProjectSettings} from "./projectStore.ts";
import {getPaperDimensions} from "./layout.ts";
import {notepadGrid,optimalSingleDesignCopies} from "./notepadLayout.ts";
import {fitCropToAspect} from "./crop.ts";
import {maximumShapeCopies,isActualShaped} from "./shapeNesting.ts";

/** Reconcile only the single-design layout. Existing saved/manual copy
 * quantities are never silently replaced. The printable artwork is inset
 * inside equal-cut sheet cells. */
export function reconcileSingleDesign(items:PhotoAsset[], config:ProjectSettings):PhotoAsset[]{
  if(items.length!==1)return items;
  const asset=items[0];
  const paper=getPaperDimensions(config.paper,config.orientation,{
    widthMm:config.customWidthMm,heightMm:config.customHeightMm,
  });
  if(config.notepadPreset){
    const grid=notepadGrid(config.notepadPreset,paper,config.orientation,config.marginMm);
    const resized=asset.widthMm!==grid.artWidthMm||asset.heightMm!==grid.artHeightMm;
    return [{...asset,widthMm:grid.artWidthMm,heightMm:grid.artHeightMm,
      quantity:config.copyMode==="automatic"?grid.copiesPerSheet:asset.quantity,
      crop:resized?fitCropToAspect(asset.crop,asset.processedWidth??asset.pixelWidth,
        asset.processedHeight??asset.pixelHeight,grid.artWidthMm,grid.artHeightMm):asset.crop}];
  }
  if(config.copyMode!=="automatic")return items;
  if(config.packing!=="optimized")return [{...asset,quantity:1}];
  const nestSpec={widthMm:asset.widthMm,heightMm:asset.heightMm,id:asset.id,quantity:1,
    cropShape:asset.cropShape,canRotate:!(asset.layers??[]).some(layer=>layer.visible)};
  const count=isActualShaped(asset)?maximumShapeCopies(nestSpec,{
    paperWidthMm:paper.widthMm,paperHeightMm:paper.heightMm,
    marginMm:config.marginMm,gapMm:config.gapMm,packing:"optimized",autoRotate:config.autoRotate??false,
  }):optimalSingleDesignCopies({
    widthMm:asset.widthMm,heightMm:asset.heightMm,
    canRotate:!(asset.layers??[]).some(layer=>layer.visible),
  },paper,config.marginMm,config.gapMm,config.autoRotate??false);
  return [{...asset,quantity:count}];
}


export function reconcilePaperSelection(items:PhotoAsset[],settings:ProjectSettings):
 {items:PhotoAsset[];requiresAdjustment:boolean}{
 try{return {items:reconcileSingleDesign(items,settings),requiresAdjustment:false};}
 catch(error){
   // Existing artwork must not be lost because the chosen sheet is too small.
   if(error instanceof Error&&/does not fit the printable sheet|inset leaves no printable artwork/i.test(error.message))
     return {items,requiresAdjustment:true};
   throw error;
 }
}
