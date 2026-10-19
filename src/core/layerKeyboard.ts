import type {DesignLayer} from "./layers.ts";
import {transformLayer} from "./layerTransforms.ts";
/**
 * Keyboard editing uses the same normalized geometry as pointer dragging.
 * Arrow keys move, Shift+arrows resize, Alt offers 0.1% fine control.
 */
export function nudgeLayer<T extends DesignLayer>(
 layer:T,key:string,shift=false,alt=false,
):T|null{
 const vector:Record<string,readonly [number,number]>={
  ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]
 };
 const delta=vector[key];
 if(!delta)return null;
 const step=alt?.001:.01;
 return transformLayer(layer,shift?"resize":"move",delta[0]*step,delta[1]*step);
}
