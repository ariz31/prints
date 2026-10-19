/**
 * Bounded, immutable editor history. Image bytes/temporary object URLs are not
 * duplicated; callers reset history when importing/replacing source images.
 */
export interface History<T>{undo:readonly T[];redo:readonly T[]}
export function emptyHistory<T>():History<T>{return {undo:[],redo:[]}}
export function pushHistory<T>(state:History<T>,snapshot:T,limit=50):History<T>{
 if(!Number.isSafeInteger(limit)||limit<1)throw new Error("Invalid history limit");
 return {undo:[...state.undo,snapshot].slice(-limit),redo:[]};
}
export function travelHistory<T>(
 history:History<T>,current:T,direction:"undo"|"redo",
):{history:History<T>;value:T}|null {
 const source=direction==="undo"?history.undo:history.redo;
 if(source.length===0)return null;
 const value=source[source.length-1];
 return {value,history:direction==="undo"?
   {undo:history.undo.slice(0,-1),redo:[...history.redo,current]}:
   {undo:[...history.undo,current],redo:history.redo.slice(0,-1)}};
}
