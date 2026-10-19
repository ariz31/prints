/** Human-friendly 1-based page lists, returned as sorted unique zero-based indices. */
export function selectPages(spec:string,totalPages:number):number[]{
 if(!Number.isSafeInteger(totalPages)||totalPages<0||totalPages>200)
   throw new Error("Invalid print sheet count.");
 const text=spec.trim().toLowerCase();
 if(text===""||text==="all")return Array.from({length:totalPages},(_,i)=>i);
 const result=new Set<number>();
 for(const part of text.split(",")){
   const match=/^\s*(\d{1,3})(?:\s*-\s*(\d{1,3}))?\s*$/.exec(part);
   if(!match)throw new Error("Use page numbers such as 1-3,5 or all.");
   const from=Number(match[1]),to=match[2]===undefined?from:Number(match[2]);
   if(from<1||to<from||to>totalPages)
     throw new Error("Selected pages must be between 1 and "+totalPages+".");
   for(let value=from;value<=to;value++)result.add(value-1);
 }
 return [...result].sort((a,b)=>a-b);
}
