/** Browser-history navigation for PRINTS. No full-page reload is required. */
export type WorkspaceView="preview"|"images"|"print";
export type EditorView="crop"|"background"|"layers";
export interface AppRoute{
  view:WorkspaceView;
  editor?:EditorView;
  assetId?:string;
  preferences?:boolean;
}
const VIEWS:readonly WorkspaceView[]=["preview","images","print"];
const EDITORS:readonly EditorView[]=["crop","background","layers"];

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
