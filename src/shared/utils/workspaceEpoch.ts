/** A synchronous generation fence for asynchronous file operations.
 * Any committed edit, undo, project switch or import advances the generation.
 * Work awaiting image decode or IndexedDB must revalidate before publishing.
 */
export class WorkspaceEpoch {
  private version=0;
  capture():number{return this.version;}
  advance():number{return ++this.version;}
  current(captured:number):boolean{return captured===this.version;}
}
