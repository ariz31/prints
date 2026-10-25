import {Component} from "react";
import type {ErrorInfo,ReactNode} from "react";
type Props={children:ReactNode};
type State={failed:boolean};
/** Prevent a render exception from silently replacing the workspace with a blank page. */
export default class WorkspaceErrorBoundary extends Component<Props,State>{
 state:State={failed:false};
 static getDerivedStateFromError():State{return {failed:true};}
 componentDidCatch(error:Error,info:ErrorInfo){
   console.error("PRINTS workspace render failed",error,info.componentStack);
 }
 render(){
   if(!this.state.failed)return this.props.children;
   return <main className="workspace-crash" role="alert">
     <h1>PRINTS could not display this workspace</h1>
     <p>The editor encountered an unexpected error. Reloading may restore a
       saved project or recoverable draft; unsaved edits are not guaranteed.</p>
     <p>Do not clear this site's browser data. Reopen your most recent saved
       project or import a portable backup if recovery is unavailable.</p>
     <button type="button" className="primary-button" onClick={()=>window.location.reload()}>
       Reload editor
     </button>
   </main>;
 }
}
