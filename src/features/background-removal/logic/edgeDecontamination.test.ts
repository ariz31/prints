import assert from "node:assert/strict";
import test from "node:test";
import {cleanEdgeColors} from "./edgeDecontamination.ts";

function pixels(width:number,height:number):Uint8ClampedArray{
  const result=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<result.length;i+=4){
    result[i]=10;result[i+1]=60;result[i+2]=240;result[i+3]=255;
  }
  return result;
}
test("edge decontamination matches full preview and halo-padded streamed stripes",()=>{
  const w=7,h=12,y=6,x=3;
  const matte=new Uint8Array(w*h);
  matte[y*w+x]=128;
  matte[(y+1)*w+x]=255;
  const original=pixels(w,h);
  const neighbor=((y+1)*w+x)*4;
  original[neighbor]=240;original[neighbor+1]=20;original[neighbor+2]=10;
  const full=new Uint8ClampedArray(original);
  cleanEdgeColors(full,original,matte,w,h,0,0,h,1);
  const start=y-3,last=y+2+3,stripedSource=original.slice(start*w*4,last*w*4);
  const stripe=new Uint8ClampedArray(stripedSource);
  cleanEdgeColors(stripe,stripedSource,matte,w,h,start,y,2,1);
  const a=((y*w+x)*4),b=((y-start)*w+x)*4;
  assert.deepEqual(Array.from(stripe.slice(b,b+3)),Array.from(full.slice(a,a+3)));
  assert.ok(full[a]>original[a],"edge red sampled from confident foreground");
  assert.ok(full[a+2]<original[a+2],"old edge blue spill suppressed");
  assert.equal(full[a+3],255,"alpha is not modified by RGB decontamination");
});
test("a partial preview updates only the requested dirty rectangle",()=>{
  const w=5,h=6;
  const src=pixels(w,h);
  const matte=new Uint8Array(w*h);
  matte[3*w+2]=128;matte[3*w+3]=255;
  src[(3*w+3)*4]=255;
  const output=new Uint8ClampedArray(src);
  cleanEdgeColors(output,src,matte,w,h,0,3,1,1,2,1);
  assert.notDeepEqual(Array.from(output.slice((3*w+2)*4,(3*w+2)*4+3)),
    Array.from(src.slice((3*w+2)*4,(3*w+2)*4+3)));
  assert.equal(output[(3*w+1)*4],src[(3*w+1)*4]);
});
test("invalid stripe range, image length and strength reject rather than corrupt",()=>{
  const src=pixels(4,4),alpha=new Uint8Array(16);
  assert.throws(()=>cleanEdgeColors(src,src,alpha,4,4,2,1,3,.5),/Invalid/);
  assert.throws(()=>cleanEdgeColors(src,src,alpha,4,4,0,0,4,Infinity),/Invalid/);
  assert.throws(()=>cleanEdgeColors(src,src,alpha,4,4,0,0,4,.5,2,3),/Invalid/);
});

test("full-resolution radius samples foreground strands beyond preview's three pixels",()=>{
 const w=13,h=13,y=6,x=6,mask=new Uint8Array(w*h);
 mask[y*w+x]=128;mask[y*w+x+4]=255;
 const original=pixels(w,h),edge=(y*w+x)*4,neighbor=(y*w+x+4)*4;
 original[edge]=12;original[edge+2]=245;
 original[neighbor]=235;original[neighbor+2]=15;
 const preview=new Uint8ClampedArray(original),full=new Uint8ClampedArray(original);
 cleanEdgeColors(preview,original,mask,w,h,0,0,h,1);
 cleanEdgeColors(full,original,mask,w,h,0,0,h,1,0,w,5);
 assert.equal(preview[edge],original[edge],"default preview radius does not sample four pixels away");
 assert.ok(full[edge]>preview[edge],"scaled full-resolution radius finds confident foreground");
});
