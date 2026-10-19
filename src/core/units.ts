/** Distances are kept in millimeters internally, independent of presentation units. */
export type DisplayUnit = "mm" | "cm" | "in";
export const UNIT_MULTIPLIER: Record<DisplayUnit,number>={mm:1,cm:10,in:25.4};
export function parseLength(value:string,assumed:DisplayUnit="mm"):number|null {
  const text=value.trim().replace(/,/g,".");
  const match=/^([+]?(?:\d+(?:\.\d*)?|\.\d+)(?:\s*\/\s*\d+(?:\.\d+)?)?)\s*(mm|cm|in|inch|inches|"|''|″)?$/i.exec(text);
  if(!match)return null;
  const [numerator,denominator]=match[1].split(/\s*\/\s*/).map(Number);
  const number=denominator===undefined?numerator:numerator/denominator;
  if(!Number.isFinite(number)||number<0)return null;
  const raw=(match[2]??assumed).toLowerCase();
  const unit:DisplayUnit=raw==="mm"?"mm":raw==="cm"?"cm":"in";
  const mm=number*UNIT_MULTIPLIER[unit];
  return Number.isFinite(mm)&&mm<=100000?mm:null;
}
export function formatLength(mm:number,unit:DisplayUnit):string {
  const n=mm/UNIT_MULTIPLIER[unit];
  if(!Number.isFinite(n))return "";
  return Number(n.toFixed(unit==="in"?4:unit==="cm"?3:2)).toString();
}
