/** One source-aligned mask pipeline for preview, export and batch images.
 * Refinement applies BEFORE authoritative manual edits. The min/max and box
 * filters use bounded sliding windows rather than expensive per-pixel disks. */
import {applyStroke,renderMask} from "./backgroundRecipe.ts";
import type {BackgroundRecipe} from "./backgroundRecipe.ts";

function extrema(alpha:Uint8Array,width:number,height:number,radius:number,min:boolean){
 const intermediate=new Uint8Array(alpha.length);
 const deque=new Int32Array(Math.max(width,height));
 const wins=(a:number,b:number)=>min?a<=b:a>=b;
 // Horizontal min/max filter, using a monotonic deque per scan line.
 for(let y=0;y<height;y++){
   const row=y*width;
   let first=0,last=0,next=0;
   for(let x=0;x<width;x++){
     const right=Math.min(width-1,x+radius);
     while(next<=right){
       const value=alpha[row+next];
       while(last>first&&wins(value,alpha[row+deque[last-1]]))last--;
       deque[last++]=next++;
     }
     while(first<last&&deque[first]<x-radius)first++;
     intermediate[row+x]=alpha[row+deque[first]];
   }
 }
 // Vertical pass over the intermediate image.
 for(let x=0;x<width;x++){
   let first=0,last=0,next=0;
   for(let y=0;y<height;y++){
     const bottom=Math.min(height-1,y+radius);
     while(next<=bottom){
       const value=intermediate[next*width+x];
       while(last>first&&wins(value,intermediate[deque[last-1]*width+x]))last--;
       deque[last++]=next++;
     }
     while(first<last&&deque[first]<y-radius)first++;
     alpha[y*width+x]=intermediate[deque[first]*width+x];
   }
 }
}
function boxBlur(alpha:Uint8Array,width:number,height:number,radius:number){
 const intermediate=new Uint8Array(alpha.length);
 // Running sums keep blur cost linear even when the source is 40 MP.
 for(let y=0;y<height;y++){
   const row=y*width;
   let sum=0,count=0;
   for(let i=0;i<Math.min(width,radius+1);i++){sum+=alpha[row+i];count++;}
   for(let x=0;x<width;x++){
     intermediate[row+x]=Math.round(sum/count);
     if(x-radius>=0){sum-=alpha[row+x-radius];count--;}
     if(x+radius+1<width){sum+=alpha[row+x+radius+1];count++;}
   }
 }
 for(let x=0;x<width;x++){
   let sum=0,count=0;
   for(let i=0;i<Math.min(height,radius+1);i++){sum+=intermediate[i*width+x];count++;}
   for(let y=0;y<height;y++){
     alpha[y*width+x]=Math.round(sum/count);
     if(y-radius>=0){sum-=intermediate[(y-radius)*width+x];count--;}
     if(y+radius+1<height){sum+=intermediate[(y+radius+1)*width+x];count++;}
   }
 }
}
export function renderRefinedMask(recipe:BackgroundRecipe,width:number,height:number):Uint8Array{
 const alpha=renderMask(recipe,width,height,false);
 // User controls describe the 1600px editing mask. Scale their physical
 // radius with the full-resolution source to preserve visual proportions.
 const previewShort=Math.max(1,Math.min(recipe.alpha.width,recipe.alpha.height));
 const scale=Math.min(width,height)/previewShort;
 if(recipe.contract!==0){
   const radius=Math.min(16,Math.max(1,Math.round(Math.abs(recipe.contract)*scale)));
   extrema(alpha,width,height,radius,recipe.contract>0);
 }
 if(recipe.feather>0){
   const radius=Math.min(24,Math.max(1,Math.round(recipe.feather*scale)));
   boxBlur(alpha,width,height,radius);
 }
 for(const stroke of recipe.strokes)applyStroke(alpha,width,height,stroke);
 return alpha;
}
