import {wakeAiRequestQueue,type AiPartsControl} from './ai-scheduler';

/** Keep an existing prewarm job when its chapter becomes visible. */
export class AiJobHandoff {
 private listeners=new Set<(model:string)=>void>();
 private lastModel?:string;
 private closed=false;
 constructor(private control:AiPartsControl,private prewarm:boolean,onModel?:(model:string)=>void){if(onModel)this.listeners.add(onModel);}
 readonly priority=()=>this.prewarm?100:0;
 readonly isForeground=()=>!this.prewarm;
 attach(onModel:((model:string)=>void)|undefined,foreground:boolean){
  if(this.closed)return;
  if(foreground&&this.prewarm){this.prewarm=false;wakeAiRequestQueue(this.control);}
  if(onModel){this.listeners.add(onModel);if(this.lastModel)this.notify(onModel,this.lastModel);}
 }
 readonly model=(model:string)=>{if(this.closed)return;this.lastModel=model;for(const listener of this.listeners)this.notify(listener,model);};
 close(){this.closed=true;this.listeners.clear();}
 private notify(listener:(model:string)=>void,model:string){try{listener(model);}catch{/* A display observer must not restart translation. */}}
}
