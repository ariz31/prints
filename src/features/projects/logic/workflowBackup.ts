import { validateWorkflow } from "./workflow.ts";
import type { SavedWorkflow } from "./workflow.ts";

export const WORKFLOW_BACKUP_LIMIT_BYTES=1024*1024;
export function createWorkflowBackup(workflows:readonly SavedWorkflow[]):Blob{
 if(workflows.length>100||workflows.some(w=>!validateWorkflow(w)))
   throw new Error("Workflow collection is invalid or exceeds 100 recipes.");
 const file={format:"PRINTS_WORKFLOWS",schemaVersion:1,
   exportedAt:new Date().toISOString(),workflows};
 const blob=new Blob([JSON.stringify(file)],{type:"application/json"});
 if(blob.size>WORKFLOW_BACKUP_LIMIT_BYTES)
   throw new Error("Workflow backup exceeds 1 MiB.");
 return blob;
}
export async function readWorkflowBackup(file:Blob):Promise<SavedWorkflow[]>{
 if(file.size<1||file.size>WORKFLOW_BACKUP_LIMIT_BYTES)
   throw new Error("Unsupported workflow backup size (maximum 1 MiB).");
 let parsed:unknown;
 try{parsed=JSON.parse(await file.text()) as unknown;}
 catch{throw new Error("Invalid workflow backup JSON.");}
 if(!parsed||typeof parsed!=="object")
   throw new Error("Unsupported workflow backup.");
 const doc=parsed as Record<string,unknown>;
 if(doc.format!=="PRINTS_WORKFLOWS"||doc.schemaVersion!==1||
   !Array.isArray(doc.workflows)||doc.workflows.length>100||
   !doc.workflows.every(validateWorkflow))
   throw new Error("Invalid or unsupported workflow backup.");
 // Imported recipes have new IDs so they cannot overwrite existing saved recipes.
 return (doc.workflows as SavedWorkflow[]).map(workflow=>({
   ...workflow,id:crypto.randomUUID(),
   steps:workflow.steps.map(step=>({...step,id:crypto.randomUUID(),
     parameters:{...step.parameters}})),
 }));
}
