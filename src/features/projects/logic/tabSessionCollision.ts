/** Distinguishes a duplicated tab from an ordinary reload. When two tabs
 * simultaneously start with an inherited session token, the lexicographically
 * larger instance yields. Established tabs never yield to new probes. */
export interface SessionPeerMessage {
  kind:"probe"|"present";
  token:string;
  instance:string;
}
export function validSessionPeerMessage(value:unknown):value is SessionPeerMessage {
  if(!value||typeof value!=="object")return false;
  const m=value as Record<string,unknown>;
  return (m.kind==="probe"||m.kind==="present")&&
    typeof m.token==="string"&&m.token.length>0&&m.token.length<=100&&
    typeof m.instance==="string"&&m.instance.length>0&&m.instance.length<=100;
}
export function shouldForkSession(
  ownInstance:string,peer:SessionPeerMessage,claimed:boolean,
):boolean {
  if(claimed||ownInstance===peer.instance)return false;
  return peer.kind==="present"||ownInstance>peer.instance;
}
