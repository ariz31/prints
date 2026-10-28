import {useRef,useState} from "react";
import type {Dispatch,SetStateAction} from "react";
import {editorHistory} from "../core/editorHistory.ts";
import type {EditorHistory} from "../core/editorHistory.ts";

/** Slider bursts form one undo step; separate actions remain independently reversible. */
export function useEditorHistory<T>(initial:T|(()=>T)){
 const [state,setState]=useState<EditorHistory<T>>(()=>({value:typeof initial==="function"?(initial as ()=>T)():initial,past:[],future:[]}));
 const latest=useRef(state);latest.current=state;
 const last=useRef({key:"",time:0});
 const publish=(next:EditorHistory<T>)=>{latest.current=next;setState(next);};
 const set:Dispatch<SetStateAction<T>>=value=>{
  const current=latest.current;
  publish(editorHistory(current,{type:"set",value:typeof value==="function"?(value as (old:T)=>T)(current.value):value}));
  last.current={key:"",time:0};
 };
 return {value:state.value,set,canUndo:!!state.past.length,canRedo:!!state.future.length,
  undo:()=>{publish(editorHistory(latest.current,{type:"undo"}));last.current={key:"",time:0};},
  redo:()=>{publish(editorHistory(latest.current,{type:"redo"}));last.current={key:"",time:0};},
  reset:(value:T)=>{publish(editorHistory(latest.current,{type:"reset",value}));last.current={key:"",time:0};},
  change:(value:T,key:string)=>{
   const time=Date.now(),coalesce=last.current.key===key&&time-last.current.time<450;
   publish(editorHistory(latest.current,{type:"set",value,coalesce}));last.current={key,time};
  }};
}
