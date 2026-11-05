/** Pixel history has a byte budget, independent of photo dimensions or brush length. */
export class MaskHistory{
 private states:Uint8ClampedArray[]=[];
 private cursor=-1;
 private readonly budget:number;
 constructor(budget=40*1024*1024){this.budget=budget;}
 get canUndo(){return this.cursor>0;}
 get canRedo(){return this.cursor<this.states.length-1;}
 get byteLength(){return this.states.reduce((sum,s)=>sum+s.byteLength,0);}
 clear(){this.states=[];this.cursor=-1;}
 commit(pixels:Uint8ClampedArray){
  const current=this.states[this.cursor];
  if(current?.length===pixels.length&&current.every((v,i)=>v===pixels[i]))return;
  if(pixels.byteLength>this.budget)throw new Error("Mask history exceeds its memory budget.");
  this.states=this.states.slice(0,this.cursor+1);
  this.states.push(new Uint8ClampedArray(pixels));
  while(this.byteLength>this.budget&&this.states.length>1)this.states.shift();
  this.cursor=this.states.length-1;
 }
 travel(direction:"undo"|"redo"){
  if(direction==="undo"?!this.canUndo:!this.canRedo)return null;
  this.cursor+=direction==="undo"?-1:1;
  return new Uint8ClampedArray(this.states[this.cursor]);
 }
}
