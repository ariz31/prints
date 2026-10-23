/** Browser-history navigation for PRINTS. No full-page reload is required. */
export type WorkspaceView="preview"|"images"|"print";
export type EditorView="crop"|"background"|"layers"|"adjust"|"id";
export interface AppRoute{
  view:WorkspaceView;
  editor?:EditorView;
  assetId?:string;
  preferences?:boolean;
}
const VIEWS:readonly WorkspaceView[]=["preview","images","print"];
const EDITORS:readonly EditorView[]=["crop","background","layers","adjust","id"];

export function readAppRoute(address:string):AppRoute{
  const url=new URL(address,"https://prints.local");
  const segment=url.pathname.replace(/\/$/,"").split("/").at(-1);
  const view:WorkspaceView=VIEWS.includes(segment as WorkspaceView)
    ?segment as WorkspaceView:"preview";
  const result:AppRoute={view};
  if(url.searchParams.get("panel")==="preferences"){
    result.preferences=true;
    return result;
  }
  const editor=url.searchParams.get("editor");
  const assetId=url.searchParams.get("asset");
  if(view==="preview"&&EDITORS.includes(editor as EditorView)&&assetId&&assetId.length<=200){
    result.editor=editor as EditorView;
    result.assetId=assetId;
  }
  return result;
}

export function appRouteUrl(route:AppRoute):string{
  const view=VIEWS.includes(route.view)?route.view:"preview";
  if(route.preferences)return "/"+view+"?panel=preferences";
  if(view==="preview"&&route.editor&&EDITORS.includes(route.editor)&&route.assetId){
    return "/preview?editor="+route.editor+"&asset="+encodeURIComponent(route.assetId);
  }
  return "/"+view;
}
export function sameRoute(a:AppRoute,b:AppRoute):boolean{
  return appRouteUrl(a)===appRouteUrl(b);
}

/** Narrow history interface enables deterministic Back-stack regression tests. */
export interface NavigationHistory {
 state:unknown;
 pushState(data:unknown,unused:string,url?:string|URL|null):void;
 replaceState(data:unknown,unused:string,url?:string|URL|null):void;
}
export function recordAppNavigation(
 history:NavigationHistory,current:AppRoute,next:AppRoute,replace=false,
):boolean {
 if(sameRoute(current,next))return false;
 const previous=history.state&&typeof history.state==="object"
   ?history.state as Record<string,unknown>:{};
 const oldDepth=typeof previous.printsDepth==="number"&&
   Number.isSafeInteger(previous.printsDepth)&&previous.printsDepth>=0
   ?previous.printsDepth:0;
 const state={...previous,printsDepth:replace?oldDepth:oldDepth+1};
 if(replace)history.replaceState(state,"",appRouteUrl(next));
 else history.pushState(state,"",appRouteUrl(next));
 return true;
}
