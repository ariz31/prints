/** A recovery snapshot may safely keep editing the named project only when its
 * source revision still matches. Otherwise preserve it as a detached draft,
 * without bypassing IndexedDB's cross-tab conflict checks. */
export interface RecoveryOrigin {projectId:string;revision:string}
export interface RecoveryResumePlan {
  projectId:string|null;
  revision:string|null;
  conflict:boolean;
}
export function planRecoveredWorkspace(
  origin:RecoveryOrigin|undefined,
  current:{id:string;revision:string}|null,
):RecoveryResumePlan {
  if(!origin)return {projectId:null,revision:null,conflict:false};
  if(current?.id===origin.projectId&&current.revision===origin.revision)
    return {projectId:origin.projectId,revision:current.revision,conflict:false};
  return {projectId:null,revision:null,conflict:true};
}

/** Old installations have no workspace token; permit one initial migration
 * only when there is no previously established v2 active-session marker.
 * New blank projects must never silently reopen a stale legacy checkpoint. */
export function matchesActiveRecovery(
 checkpointToken:string|undefined,
 sessionToken:string,
 allowLegacyMigration:boolean,
):boolean {
 return checkpointToken===sessionToken||
   (checkpointToken===undefined&&allowLegacyMigration);
}
