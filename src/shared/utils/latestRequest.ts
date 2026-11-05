/** Discard older asynchronous results and their cleanup when a newer
 * analysis supersedes them. Separate from workspace history/edit generations.
 */
export class LatestRequest {
 private generation=0;
 begin():number{return ++this.generation;}
 cancel():void{this.generation++;}
 isCurrent(generation:number):boolean{return generation===this.generation;}
}
