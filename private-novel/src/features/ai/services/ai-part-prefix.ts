import type {AiTranslateClientResponse} from './ai-translate';

/** Complete checkpoints only. A parent supersedes old descendants; a missing
 * left branch blocks its right sibling and every later source root. */
export function aiCompletedPrefix(roots:{id:string}[],completed:Map<string,AiTranslateClientResponse>,separator='\n'):string{
 const keys=[...completed.keys()],model=completed.values().next().value?.model;
 const visit=(id:string,depth:number):{text:string;complete:boolean}=>{
  const value=completed.get(id);
  if(value)return value.finishReason==='STOP'&&value.model===model&&!!value.result.trim()?{text:value.result,complete:true}:{text:'',complete:false};
  if(depth>=3||!keys.some(key=>key.startsWith(id+'/')))return {text:'',complete:false};
  const left=visit(id+'/0',depth+1);if(!left.complete)return left;
  const right=visit(id+'/1',depth+1);return {text:left.text+(right.text?separator+right.text:''),complete:right.complete};
 };
 const prefix:string[]=[];
 for(const root of roots){const part=visit(root.id,0);if(part.text)prefix.push(part.text);if(!part.complete)break;}
 return prefix.join(separator);
}
