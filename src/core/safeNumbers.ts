/** Strict form parsing: a blank entry is not the numeric value zero. */
export function parseBoundedNumber(
 raw:string,min:number,max:number,integer=false,
):number|null {
 if(!raw.trim()||!Number.isFinite(min)||!Number.isFinite(max)||min>max)return null;
 const n=Number(raw);
 if(!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isSafeInteger(n)))return null;
 return n;
}
