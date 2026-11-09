/** A single mask pipeline is shared by preview, batch and print export.
 * AI refinement happens first. Manual erase/restore is authoritative and
 * cannot be undone by feather/contract settings. */
import {applyStroke,renderMask} from "./backgroundRecipe.ts";
import type {BackgroundRecipe} from "./backgroundRecipe.ts";

function refine(alpha:Uint8Array,width:number,height:number,recipe:BackgroundRecipe):void{
 const contract=recipe.contract;
 if(contract!==0){
   const copy=alpha.slice(),distance=Math.abs(contract);
   for(let y=0;y<height;y++)for(let x=0;x<width;x++){
     let value=contract>0?255:0;
     for(let dy=-distance;dy<=distance;dy++)for(let dx=-distance;dx<=distance;dx++){
       if(dx*dx+dy*dy>distance*distance)continue;
       const p=(Math.min(height-1,Math.max(0,y+dy))*width+
          Math.min(width-1,Math.max(0,x+dx)));
       value=contract>0?Math.min(value,copy[p]):Math.max(value,copy[p]);
     }
     alpha[y*width+x]=value;
   }
 }
 if(recipe.feather>0){
   const tmp=alpha.slice(),r=recipe.feather;
   for(let y=0;y<height;y++)for(let x=0;x<width;x++){
     let sum=0,n=0;
     for(let dx=-r;dx<=r;dx++){const px=x+dx;if(px>=0&&px<width){sum+=tmp[y*width+px];n++;}}
     alpha[y*width+x]=Math.round(sum/n);
   }
   tmp.set(alpha);
   for(let y=0;y<height;y++)for(let x=0;x<width;x++){
     let sum=0,n=0;
     for(let dy=-r;dy<=r;dy++){const py=y+dy;if(py>=0&&py<height){sum+=tmp[py*width+x];n++;}}
     alpha[y*width+x]=Math.round(sum/n);
   }
 }
}
export function renderRefinedMask(recipe:BackgroundRecipe,width:number,height:number):Uint8Array{
 const alpha=renderMask(recipe,width,height,false);
 refine(alpha,width,height,recipe);
 for(const stroke of recipe.strokes)applyStroke(alpha,width,height,stroke);
 return alpha;
}
