import {type AiDivisionReason} from './ai-division';
import type {AiTranslateClientResponse} from './ai-translate';
export interface AiLeafProgress {done:number;total:number}
export function hasUnknownAiParts(roots:{id:string}[],completed:Map<string,AiTranslateClientResponse>){
 const keys=[...completed.keys()];
 const visit=(id:string):boolean=>{const result=completed.get(id);if(result)return !result.division;return keys.some(key=>key.startsWith(id+'/'))&&(visit(id+'/0')||visit(id+'/1'));};
 return roots.some(p=>visit(p.id));
}
/** A complete subtree counts once, even when old child checkpoints remain. */
export function aiLeafProgress(roots:{id:string}[],completed:Map<string,AiTranslateClientResponse>,splits:Map<string,AiDivisionReason>,unknown=false){
 if(unknown)return;
 const descendants=[...completed.keys()];
 function visit(id:string):AiLeafProgress{
  const result=completed.get(id);if(result){const total=result.division?.parts??1;return {done:total,total};}
  if(splits.has(id)||descendants.some(key=>key.startsWith(id+'/'))){const left=visit(id+'/0'),right=visit(id+'/1');return {done:left.done+right.done,total:left.total+right.total};}
  return {done:0,total:1};
 }
 return roots.map(p=>visit(p.id)).reduce((sum,p)=>({done:sum.done+p.done,total:sum.total+p.total}),{done:0,total:0});
}
export function aiTreeFacts(roots:{id:string}[],completed:Map<string,AiTranslateClientResponse>,splits:Map<string,AiDivisionReason>,reason:AiDivisionReason,unknown:boolean){
 const leafProgress=aiLeafProgress(roots,completed,splits,unknown);if(!leafProgress)return {division:undefined,leafProgress:undefined};
 const reasons:AiDivisionReason[]=roots.length>1?[reason]:[];
 const keys=[...completed.keys()];
 const visit=(id:string)=>{const result=completed.get(id);if(result){reasons.push(...(result.division?.reasons??[]));return;}const why=splits.get(id);if(why)reasons.push(why);if(why||keys.some(key=>key.startsWith(id+'/'))){visit(id+'/0');visit(id+'/1');}};
 roots.forEach(p=>visit(p.id));
 return {division:{version:1 as const,parts:leafProgress.total,reasons:[...new Set(reasons)]},leafProgress};
}
