import {useEffect,useState} from "react";
const COLORS=["#ffffff","#1f2937","#a93621","#d8b56b","#215c46","#0066cc","#9c6a83","#000000"];
const KEY="prints:colors:v1";
export default function InlineColorField({label,value,onChange}:{label:string;value:string;onChange:(hex:string)=>void}){
 const [text,setText]=useState(value),[invalid,setInvalid]=useState(false);
 const [saved,setSaved]=useState<string[]>(()=>{try{const v:unknown=JSON.parse(localStorage.getItem(KEY)??"[]");
  return Array.isArray(v)?v.filter((s):s is string=>typeof s==="string"&&/^#[\da-f]{6}$/i.test(s)).slice(0,8):[];
 }catch{return [];}});
 useEffect(()=>{setText(value);setInvalid(false);},[value]);
 function commit(){
  const candidate=(text.startsWith("#")?text:"#"+text).toLowerCase();
  if(!/^#[\da-f]{6}$/.test(candidate)){setInvalid(true);return;}
  setInvalid(false);setText(candidate);if(candidate!==value)onChange(candidate);
 }
 return <div className="inline-color-field" role="group" aria-label={label}>
  <label>{label}<span className="hex-field"><span className="color-preview" style={{background:value}}/>
   <input aria-label={label+" HEX"} spellCheck={false} maxLength={7} value={text} aria-invalid={invalid}
    onChange={e=>{setText(e.target.value);setInvalid(false);}} onBlur={commit}
    onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur();if(e.key==="Escape"){setText(value);setInvalid(false);}}}/>
  </span></label>
  {invalid&&<small role="alert">Use a six-digit HEX color.</small>}
  <div className="color-swatches" role="group" aria-label={label+" palette"}>
   {[...new Set([...COLORS,...saved])].map(color=><button key={color} type="button" style={{background:color}}
    aria-label={label+" "+color} aria-pressed={value.toLowerCase()===color} onClick={()=>onChange(color)}/>)}
   <button type="button" className="save-color" aria-label={"Save "+label+" color"} title="Save this color"
    onClick={()=>{const next=[value.toLowerCase(),...saved.filter(c=>c!==value.toLowerCase())].slice(0,8);
     setSaved(next);try{localStorage.setItem(KEY,JSON.stringify(next));}catch{/* Palette stays available for this session. */}}}>+</button>
  </div>
 </div>;
}
