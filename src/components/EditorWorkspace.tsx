import type {KeyboardEvent,ReactNode} from "react";
import StudioIcon from "./StudioIcon.tsx";

export function editorShortcut(event:KeyboardEvent,undo?:()=>void,redo?:()=>void){
 const target=event.target as HTMLElement;
 if(target.isContentEditable||["TEXTAREA","SELECT"].includes(target.tagName)||
  (target.tagName==="INPUT"&&(target as HTMLInputElement).type!=="range"))return;
 if((event.ctrlKey||event.metaKey)&&!event.altKey){
  const key=event.key.toLowerCase();
  if(key==="z"||key==="y"){
   event.preventDefault();event.stopPropagation();
   (key==="y"||event.shiftKey?redo:undo)?.();
  }
 }
}
interface Props{
 title:string;name:string;onCancel:()=>void;onApply?:()=>void;applyLabel?:string;disabled?:boolean;
 stage:ReactNode;tools?:ReactNode;children:ReactNode;undo?:()=>void;redo?:()=>void;
 canUndo?:boolean;canRedo?:boolean;className?:string;
}
export default function EditorWorkspace({title,name,onCancel,onApply,applyLabel="Apply changes",disabled,
 stage,tools,children,undo,redo,canUndo,canRedo,className=""}:Props){
 return <main className={"editor-workspace "+className} aria-label={title}
  onKeyDown={event=>editorShortcut(event,undo,redo)}>
  <header className="editor-header">
   <button type="button" className="secondary-button" onClick={onCancel}><StudioIcon name="left" size={17}/>Cancel</button>
   <div className="editor-title"><h1>{title}</h1><p title={name}>{name}</p></div>
   <div className="editor-header-actions">
    {undo&&<div className="editor-history" role="group" aria-label="Editor undo and redo">
     <button type="button" className="icon-button" aria-label="Undo edit" disabled={!canUndo} onClick={undo}><StudioIcon name="undo" size={18}/></button>
     <button type="button" className="icon-button" aria-label="Redo edit" disabled={!canRedo} onClick={redo}><StudioIcon name="redo" size={18}/></button>
    </div>}
    {onApply&&<button type="button" className="primary-button" disabled={disabled} onClick={onApply}>{applyLabel}</button>}
   </div>
  </header>
  <div className="editor-layout">
   <section className="editor-stage" aria-label="Editing preview">
    <div className="editor-canvas-area">{stage}</div>
    {tools&&<div className="editor-stage-tools">{tools}</div>}
   </section>
   <section className="editor-inspector" aria-label="Editing controls" tabIndex={0}>{children}</section>
  </div>
 </main>;
}
