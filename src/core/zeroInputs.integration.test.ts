import assert from "node:assert/strict";
import test from "node:test";
import {parseBoundedNumber,workflowParameterBounds} from "./safeNumbers.ts";
import {parseLength} from "./units.ts";
import {composeSheets} from "./layout.ts";
import {validProjectSettings} from "./projectStore.ts";
import {isValidPreferences,DEFAULT_PREFERENCES} from "./preferences.ts";
import {validPhotoAdjustments,photoFilterCss} from "./photoAdjustments.ts";
import {newLayer,validDesignLayers} from "./layers.ts";
import {setLayerPercent,transformLayer} from "./layerTransforms.ts";
import {removeConnectedBackground,paintAlphaBrush} from "./background.ts";
import {zoomCrop,fitCropToAspect,exactCropSourceRect,FULL_CROP} from "./crop.ts";
import {rasterDimensions} from "./imageRaster.ts";

test("all numeric user controls reject blank input rather than coercing it to zero",()=>{
 for(const [field,min,max,integer] of [
  ["copies",1,1000,true],["layer X",0,100,true],["layer Y",0,100,true],
  ["layer width",1,100,true],["layer height",1,100,true],
  ["font size",4,180,true],["background tolerance",0,150,true],
  ["brush radius",2,100,true],["crop zoom",1,8,false],
  ["brightness",-100,100,true],["contrast",-100,100,true],
  ["saturation",-100,200,true],
 ] as const){
   for(const value of [""," ","Infinity","NaN","1e999"]){
     assert.equal(parseBoundedNumber(value,min,max,integer),null,field+" / "+value);
   }
 }
});
test("zero is valid for offsets, margins, tone and background tolerance",()=>{
 const cases:[string,number,number,boolean][]=[
  ["X",0,100,true],["Y",0,100,true],
  ["margin",0,1999.999,false],["gap",0,1999.999,false],
  ["tolerance",0,150,true],["brightness",-100,100,true],
  ["contrast",-100,100,true],["saturation",-100,200,true],
 ];
 for(const [name,min,max,integer] of cases){
   assert.equal(parseBoundedNumber("0",min,max,integer),0,name);
 }
 for(const name of ["marginMm","gapMm","focalX","focalY","brightness","contrast","saturation"]){
   const {min,max,integer}=workflowParameterBounds(name);
   assert.equal(parseBoundedNumber("0",min,max,integer),0,name);
 }
 assert.equal(parseLength("0","mm"),0);
 assert.equal(parseLength("0cm","mm"),0);
 assert.equal(parseLength('0"',"mm"),0);
 assert.ok(isValidPreferences({...DEFAULT_PREFERENCES,defaultMarginMm:0,defaultGapMm:0}));
 assert.ok(validProjectSettings({paper:"A4",orientation:"portrait",customWidthMm:210,
   customHeightMm:297,marginMm:0,gapMm:0,cutGuides:false}));
 assert.equal(photoFilterCss({brightness:0,contrast:0,saturation:0}),
   "brightness(1) contrast(1) saturate(1)");
 assert.equal(validPhotoAdjustments({brightness:0,contrast:0,saturation:0}),true);
});
test("zero layer coordinates stay valid but zero width, height and font are rejected",()=>{
 const layer=newLayer("text");
 const atOrigin=setLayerPercent(setLayerPercent(layer,"x",0),"y",0);
 assert.equal(atOrigin.x,0);
 assert.equal(atOrigin.y,0);
 assert.equal(validDesignLayers([atOrigin]),true);
 const widthZero=setLayerPercent(atOrigin,"width",0);
 const heightZero=setLayerPercent(atOrigin,"height",0);
 assert.equal(widthZero.width,atOrigin.width);
 assert.equal(heightZero.height,atOrigin.height);
 assert.equal(validDesignLayers([{...layer,width:0}]),false);
 assert.equal(validDesignLayers([{...layer,height:0}]),false);
 assert.equal(validDesignLayers([{...layer,fontSizePt:0}]),false);
 const atMaximum=setLayerPercent(atOrigin,"x",100);
 assert.ok(atMaximum.x+atMaximum.width<=1);
 assert.equal(validDesignLayers([atMaximum]),true);
 const moved=transformLayer(atOrigin,"move",0,0);
 assert.equal(validDesignLayers([moved]),true);
});
test("zero paper dimensions, print copies, brush radius and zoom cannot produce invalid output",()=>{
 const paper={paperWidthMm:210,paperHeightMm:297,marginMm:0,gapMm:0};
 const job={id:"photo",widthMm:50.8,heightMm:50.8,quantity:1};
 assert.equal(composeSheets([job],paper).length,1);
 assert.throws(()=>composeSheets([{...job,quantity:0}],paper),/positive integer/);
 assert.throws(()=>composeSheets([{...job,widthMm:0}],paper),/positive dimensions/);
 assert.throws(()=>composeSheets([job],{...paper,paperWidthMm:0}),/must be positive/);
 assert.throws(()=>rasterDimensions(0,50,300),/Invalid raster dimensions/);
 assert.throws(()=>fitCropToAspect(FULL_CROP,100,100,0,50),/must be positive/);
 assert.throws(()=>zoomCrop(FULL_CROP,0),/Invalid crop zoom/);
 assert.throws(()=>exactCropSourceRect(100,100,{x:0,y:0,width:0,height:1},50,50),/Invalid crop bounds/);
 const pixels=new Uint8ClampedArray([255,255,255,255]);
 const cleared=removeConnectedBackground(pixels,1,1,[255,255,255],0);
 assert.equal(cleared.removed,1);
 assert.throws(()=>paintAlphaBrush(pixels,pixels,1,1,0,0,0,"erase"),/Invalid brush input/);
 assert.equal(parseBoundedNumber("0",2,100,true),null);
 assert.equal(parseBoundedNumber("0",1,8),null);
});
