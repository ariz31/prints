import type {TextLayer,DesignLayer} from "./layers.ts";
/** A font is private local project data; bytes never leave this browser. */
export const MAX_USER_FONT_BYTES=1_100_000;
export function decodeLocalFont(data:string):Uint8Array{
 if(!/^data:font\/(ttf|otf);base64,[A-Za-z0-9+/]+={0,2}$/.test(data)||
    data.length>1_600_000)throw new Error("Invalid embedded font encoding.");
 const raw=atob(data.slice(data.indexOf(",")+1));
 if(raw.length<12||raw.length>MAX_USER_FONT_BYTES)throw new Error("Font exceeds the safe 1.1 MB limit.");
 const buf=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)buf[i]=raw.charCodeAt(i);
 const signature=String.fromCharCode(...buf.subarray(0,4));
 const ttf=buf[0]===0&&buf[1]===1&&buf[2]===0&&buf[3]===0;
 if(!ttf&&signature!=="OTTO"&&signature!=="true")
  throw new Error("Only valid TTF and OTF fonts are supported.");
 return buf;
}
export async function encodeLocalFont(file:File):Promise<{fontData:string;fontName:string}>{
 if(file.size<12||file.size>MAX_USER_FONT_BYTES||!/[.]((ttf)|(otf))$/i.test(file.name))
  throw new Error("Choose a licensed TTF/OTF font smaller than 1.1 MB.");
 const buf=new Uint8Array(await file.arrayBuffer());
 const mime=/\.otf$/i.test(file.name)?"otf":"ttf";
 const segments:string[]=[];
 for(let i=0;i<buf.length;i+=16384)
  segments.push(String.fromCharCode(...buf.subarray(i,i+16384)));
 const data="data:font/"+mime+";base64,"+btoa(segments.join(""));
 decodeLocalFont(data);
 return {fontData:data,fontName:file.name.slice(0,100)};
}
export function fontCssName(layer:TextLayer):string{
 if(!layer.fontData)return layer.fontFamily==="TimesRoman"?"Georgia, 'Times New Roman', serif":
  layer.fontFamily==="Courier"?"'Courier New', monospace":"Arial, Helvetica, sans-serif";
 let hash=2166136261;
 // Prefix only; collisions are extremely unlikely but are not security boundaries.
 for(let i=0;i<layer.fontData.length;i++)hash=Math.imul(hash^layer.fontData.charCodeAt(i),16777619);
 return "'prints-font-"+(hash>>>0).toString(16)+"'";
}
const fontPromises=new Map<string,Promise<void>>();
export async function loadLocalFonts(layers:readonly DesignLayer[]):Promise<void>{
 if(typeof FontFace==="undefined"||typeof document==="undefined")return;
 const jobs:Promise<void>[]=[];
 for(const layer of layers){
  if(layer.kind!=="text"||!layer.fontData)continue;
  const name=fontCssName(layer).slice(1,-1);
  if(!fontPromises.has(name)){
   const bytes=decodeLocalFont(layer.fontData);
   const promise=(async()=>{
    const font=new FontFace(name,bytes.buffer as ArrayBuffer);
    await font.load();document.fonts.add(font);
   })();
   fontPromises.set(name,promise);
  }
  jobs.push(fontPromises.get(name)!);
 }
 await Promise.all(jobs);
}
