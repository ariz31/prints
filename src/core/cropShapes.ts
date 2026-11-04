/** Fifteen non-destructive print crop contours. Coordinates are local [0,1]. */
export const CROP_SHAPES = [
  {id:"rectangle",label:"Rectangle"},
  {id:"rounded",label:"Rounded rectangle"},
  {id:"circle",label:"Circle"},
  {id:"oval",label:"Oval"},
  {id:"triangle",label:"Triangle"},
  {id:"right-triangle",label:"Right triangle"},
  {id:"diamond",label:"Diamond"},
  {id:"pentagon",label:"Pentagon"},
  {id:"hexagon",label:"Hexagon"},
  {id:"octagon",label:"Octagon"},
  {id:"star",label:"Five-point star"},
  {id:"star-six",label:"Six-point star"},
  {id:"heart",label:"Heart"},
  {id:"shield",label:"Shield"},
  {id:"scallop",label:"Scalloped circle"},
] as const;
export type CropShape = typeof CROP_SHAPES[number]["id"];
export type ShapePoint = {x:number;y:number};
export function validCropShape(value:unknown):value is CropShape {
  return typeof value==="string" && CROP_SHAPES.some(s=>s.id===value);
}
const point=(x:number,y:number):ShapePoint=>({x,y});
function regular(sides:number,phase=-Math.PI/2):ShapePoint[]{
  return Array.from({length:sides},(_,i)=>{
    const theta=phase+i*2*Math.PI/sides;
    return point(.5+.5*Math.cos(theta),.5+.5*Math.sin(theta));
  });
}
function star(points:number):ShapePoint[]{
  return Array.from({length:points*2},(_,i)=>{
    const theta=-Math.PI/2+i*Math.PI/points, r=i%2?.24:.5;
    return point(.5+r*Math.cos(theta),.5+r*Math.sin(theta));
  });
}
function oval(segments=48):ShapePoint[]{
  return Array.from({length:segments},(_,i)=>{
    const a=-Math.PI/2+i*Math.PI*2/segments;
    return point(.5+.5*Math.cos(a),.5+.5*Math.sin(a));
  });
}
function rounded():ShapePoint[]{
  const points:ShapePoint[]=[];
  for(const [cx,cy,a] of [[.85,.15,-Math.PI/2],[.85,.85,0],[.15,.85,Math.PI/2],[.15,.15,Math.PI]]){
    for(let i=0;i<=7;i++){
      const theta=a+i*Math.PI/14;
      points.push(point(cx+.15*Math.cos(theta),cy+.15*Math.sin(theta)));
    }
  }
  return points;
}
function heart():ShapePoint[]{
  const raw=Array.from({length:60},(_,i)=>{
    const t=2*Math.PI*i/60;
    return point(16*Math.pow(Math.sin(t),3),
      13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t));
  });
  const minX=Math.min(...raw.map(p=>p.x)),maxX=Math.max(...raw.map(p=>p.x));
  const minY=Math.min(...raw.map(p=>p.y)),maxY=Math.max(...raw.map(p=>p.y));
  return raw.map(p=>point((p.x-minX)/(maxX-minX),(maxY-p.y)/(maxY-minY)));
}
export function cropShapePoints(shape:CropShape|undefined):ShapePoint[]{
  switch(shape){
    case undefined:
    case "rectangle":return [point(0,0),point(1,0),point(1,1),point(0,1)];
    case "rounded":return rounded();
    case "circle":case "oval":return oval();
    case "triangle":return [point(.5,0),point(1,1),point(0,1)];
    case "right-triangle":return [point(0,0),point(1,1),point(0,1)];
    case "diamond":return [point(.5,0),point(1,.5),point(.5,1),point(0,.5)];
    case "pentagon":return regular(5);
    case "hexagon":return regular(6);
    case "octagon":return regular(8);
    case "star":return star(5);
    case "star-six":return star(6);
    case "heart":return heart();
    case "shield":return [point(.08,0),point(.92,0),point(.92,.58),point(.75,.81),point(.5,1),point(.25,.81),point(.08,.58)];
    case "scallop":return Array.from({length:72},(_,i)=>{
      const angle=-Math.PI/2+i*Math.PI/36;
      const r=.455+.045*Math.cos(12*angle);
      return point(.5+r*Math.cos(angle),.5+r*Math.sin(angle));
    });
  }
}
export function shapeClipPath(shape:CropShape|undefined,rotated=false):string|undefined{
  if(!shape||shape==="rectangle")return undefined;
  return "polygon("+cropShapePoints(shape).map(p=>rotated
    ?((1-p.y)*100).toFixed(3)+"% "+(p.x*100).toFixed(3)+"%"
    :(p.x*100).toFixed(3)+"% "+(p.y*100).toFixed(3)+"%").join(",")+")";
}
export function shapePolygonMm(
 shape:CropShape|undefined,xMm:number,yMm:number,widthMm:number,heightMm:number,rotated=false,
):ShapePoint[]{
  return cropShapePoints(shape).map(p=>rotated
    ?point(xMm+(1-p.y)*widthMm,yMm+p.x*heightMm)
    :point(xMm+p.x*widthMm,yMm+p.y*heightMm));
}
export function polygonArea(poly:readonly ShapePoint[]):number{
  let area=0;
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length];
    area+=a.x*b.y-b.x*a.y;
  }
  return Math.abs(area)/2;
}
export function shapeAreaFraction(shape:CropShape|undefined):number{
  return polygonArea(cropShapePoints(shape));
}
/** Mask AFTER photo color/retouch processing to prevent source-dependent edge effects.
 * Coordinates are relative to the full output, even when clipping a raster tile. */
export function maskCropShape(
  ctx:CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D,
  shape:CropShape|undefined,fullW:number,fullH:number,offsetX=0,offsetY=0,
):void{
  if(!shape||shape==="rectangle")return;
  const points=cropShapePoints(shape);
  ctx.save();
  ctx.globalAlpha=1;
  ctx.globalCompositeOperation="destination-in";
  ctx.beginPath();
  points.forEach((p,i)=>i===0?ctx.moveTo(p.x*fullW-offsetX,p.y*fullH-offsetY):
    ctx.lineTo(p.x*fullW-offsetX,p.y*fullH-offsetY));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
