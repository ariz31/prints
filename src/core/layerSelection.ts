import type {DesignLayer} from "./layers.ts";
export function selectionBounds(layers:readonly DesignLayer[]){
 const x=Math.min(...layers.map(l=>l.x)),y=Math.min(...layers.map(l=>l.y));
 return {x,y,width:Math.max(...layers.map(l=>l.x+l.width))-x,height:Math.max(...layers.map(l=>l.y+l.height))-y};
}
export function transformSelection(layers:readonly DesignLayer[],ids:readonly string[],kind:"move"|"resize",dx:number,dy:number){
 const selected=layers.filter(l=>ids.includes(l.id)&&l.kind!=="frame");
 if(!selected.length||![dx,dy].every(Number.isFinite))return [...layers];
 const box=selectionBounds(selected);
 const mx=Math.max(-box.x,Math.min(1-box.x-box.width,dx));
 const my=Math.max(-box.y,Math.min(1-box.y-box.height,dy));
 const sx=Math.max(.05,Math.min((1-box.x)/box.width,(box.width+dx)/box.width));
 const sy=Math.max(.05,Math.min((1-box.y)/box.height,(box.height+dy)/box.height));
 return layers.map(l=>!selected.includes(l)?l:kind==="move"?{...l,x:l.x+mx,y:l.y+my}:
  {...l,x:box.x+(l.x-box.x)*sx,y:box.y+(l.y-box.y)*sy,width:l.width*sx,height:l.height*sy});
}
export function snapSelection(layers:readonly DesignLayer[],ids:readonly string[],dx:number,dy:number,thresholdX:number,thresholdY:number){
 const selected=layers.filter(l=>ids.includes(l.id)&&l.kind!=="frame");
 if(!selected.length)return {dx,dy,guides:[] as {axis:"x"|"y";value:number}[]};
 const box=selectionBounds(selected),others=layers.filter(l=>l.visible&&!ids.includes(l.id)&&l.kind!=="frame");
 const guides:{axis:"x"|"y";value:number}[]=[];
 function snap(axis:"x"|"y",delta:number,threshold:number){
  const length=axis==="x"?"width":"height";
  const anchors=[0,.5,1,...others.flatMap(l=>[l[axis],l[axis]+l[length]/2,l[axis]+l[length]])];
  let adjustment=threshold,target:number|undefined;
  for(const own of [box[axis],box[axis]+box[length]/2,box[axis]+box[length]])for(const anchor of anchors){
   const difference=anchor-(own+delta);
   if(Math.abs(difference)<Math.abs(adjustment)){adjustment=difference;target=anchor;}
  }
  if(target!==undefined){guides.push({axis,value:target});return delta+adjustment;}
  return delta;
 }
 return {dx:snap("x",dx,thresholdX),dy:snap("y",dy,thresholdY),guides};
}
export function alignSelection(layers:readonly DesignLayer[],ids:readonly string[],axis:"x"|"y",position:"start"|"center"|"end"){
 const selected=layers.filter(l=>ids.includes(l.id)&&l.kind!=="frame");
 if(!selected.length)return [...layers];
 const box=selected.length>1?selectionBounds(selected):{x:0,y:0,width:1,height:1};
 const size=axis==="x"?"width":"height";
 return layers.map(l=>!selected.includes(l)?l:{...l,[axis]:box[axis]+(position==="start"?0:position==="center"?(box[size]-l[size])/2:box[size]-l[size])});
}
