/**
 * Prevent an older asynchronous image snapshot from replacing a newer save.
 * Revisions are allocated when editing changes or a manual save begins;
 * per-project writes are serialized through IndexedDB transaction completion.
 */
export class ProjectWriteCoordinator {
  private revisions=new Map<string,number>();
  private tails=new Map<string,Promise<void>>();
  private deleted=new Set<string>();
  begin(id:string):number {
    if(!id)throw new Error("Project identifier required.");
    const version=(this.revisions.get(id)??0)+1;
    this.revisions.set(id,version);
    return version;
  }
  async run(id:string,revision:number,write:()=>Promise<void>):Promise<boolean> {
    if(!Number.isSafeInteger(revision)||revision<1)
      throw new Error("Invalid project write revision.");
    const previous=this.tails.get(id)??Promise.resolve();
    const task=previous.catch(()=>{}).then(async()=>{
      if(this.deleted.has(id)||this.revisions.get(id)!==revision)return false;
      await write();
      // A new edit can arrive even while an IndexedDB transaction is completing.
      // Do not report the older snapshot as the current saved revision.
      return this.revisions.get(id)===revision;
    });
    const settled=task.then(()=>{},()=>{});
    this.tails.set(id,settled);
    try{return await task;}
    finally{if(this.tails.get(id)===settled)this.tails.delete(id);}
  }
  /**
   * Fence saves immediately, then delete after any in-flight write completes.
   * Deleted IDs cannot be resurrected by a delayed autosave in this session.
   */
  async remove(id:string,removeRecord:()=>Promise<void>):Promise<void>{
    this.deleted.add(id);
    this.begin(id);
    const previous=this.tails.get(id)??Promise.resolve();
    const task=previous.catch(()=>{}).then(removeRecord);
    const settled=task.then(()=>{},()=>{});
    this.tails.set(id,settled);
    try{await task;}
    catch(error){
      // A failed delete must not permanently prevent saving the existing record.
      this.deleted.delete(id);
      throw error;
    }finally{
      if(this.tails.get(id)===settled)this.tails.delete(id);
    }
  }

}
