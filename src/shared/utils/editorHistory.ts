/** Bounded, immutable transactions shared by metadata editors. */
export interface EditorHistory<T>{value:T;past:T[];future:T[]}
export type EditorAction<T>={type:"set";value:T;coalesce?:boolean}|{type:"reset";value:T}|{type:"undo"|"redo"};
export function editorHistory<T>(state:EditorHistory<T>,action:EditorAction<T>,limit=60):EditorHistory<T>{
 if(action.type==="reset")return {value:action.value,past:[],future:[]};
 if(action.type==="set"){
  if(JSON.stringify(state.value)===JSON.stringify(action.value))return state;
  return {value:action.value,past:action.coalesce?state.past:[...state.past,state.value].slice(-limit),future:[]};
 }
 const source=action.type==="undo"?state.past:state.future;
 if(!source.length)return state;
 const value=source[source.length-1];
 return action.type==="undo"
  ?{value,past:source.slice(0,-1),future:[...state.future,state.value].slice(-limit)}
  :{value,past:[...state.past,state.value].slice(-limit),future:source.slice(0,-1)};
}
