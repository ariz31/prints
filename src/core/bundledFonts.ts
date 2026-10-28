/**
 * Fonts bundled with PRINTS. Every file is an unmodified static TTF covered
 * by its accompanying SIL Open Font License in public/fonts.
 * IDs and their font bytes are persisted by reference in projects: never reuse
 * an ID for changed bytes. Add a new ID and keep the old file available.
 */
export const BUNDLED_FONTS = [
  {id:"lato",name:"Lato",category:"Sans serif",path:"fonts/Lato-Regular-0f3d0f837d24.ttf",size:656568},
  {id:"crimson-text",name:"Crimson Text",category:"Serif",path:"fonts/CrimsonText-Regular-6b474728a9a4.ttf",size:107200},
  {id:"abril-fatface",name:"Abril Fatface",category:"Display",path:"fonts/AbrilFatface-Regular-e761f7b9c3c7.ttf",size:67364},
  {id:"pacifico",name:"Pacifico",category:"Script",path:"fonts/Pacifico-Regular-27765d02ac13.ttf",size:329380},
] as const;

export type BundledFont = (typeof BUNDLED_FONTS)[number];
export type BundledFontId = BundledFont["id"];

export function bundledFontById(id:unknown):BundledFont|undefined {
  return BUNDLED_FONTS.find(font=>font.id===id);
}

function requireBundledFont(id:string):BundledFont {
  const font=bundledFontById(id);
  if(!font)throw new Error("This project uses an unknown bundled font: "+id);
  return font;
}

/** baseUrl is the Vite application base, `/` in the production configuration. */
export function bundledFontUrl(id:string,baseUrl="/"):string {
  const font=requireBundledFont(id);
  return (baseUrl.endsWith("/")?baseUrl:baseUrl+"/")+font.path;
}

/** CSS-quoted family name; register a FontFace under this name without quotes. */
export function bundledFontCssName(id:string):string {
  return "'prints-bundled-"+requireBundledFont(id).id+"'";
}

const fontPromises=new Map<string,Promise<Uint8Array>>();

/** Load the exact local bytes used for both browser rendering and PDF embedding. */
export function fetchBundledFont(id:string,baseUrl="/"):Promise<Uint8Array> {
  const font=requireBundledFont(id);
  const url=bundledFontUrl(id,baseUrl);
  let pending=fontPromises.get(url);
  if(!pending){
    const promise=(async()=>{
      const response=await fetch(url);
      if(!response.ok)throw new Error("Could not load the bundled "+font.name+" font. Try reloading PRINTS.");
      const bytes=new Uint8Array(await response.arrayBuffer());
      if(bytes.length!==font.size||bytes[0]!==0||bytes[1]!==1||bytes[2]!==0||bytes[3]!==0)
        throw new Error("The bundled "+font.name+" font is incomplete or invalid. Try reloading PRINTS.");
      return bytes;
    })().catch(error=>{
      // A transient failure must not poison the cache for the rest of a session.
      if(fontPromises.get(url)===promise)fontPromises.delete(url);
      throw error;
    });
    fontPromises.set(url,promise);
    pending=promise;
  }
  return pending;
}
