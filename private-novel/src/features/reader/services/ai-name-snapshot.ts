import type {AiReadingSource,ReadingAiSettings} from '../../ai/services/ai-reading';
type Name={key:string;value:string};
/** Per-mount snapshots: current, retry and an already-started prewarm share Names. */
export class AiNameSnapshots {
 private entries=new Map<string,{text:string;names:Name[]}>();
 peek(source:AiReadingSource,settings:ReadingAiSettings,names:readonly Name[]):Name[]{
  const old=this.entries.get(JSON.stringify([source.bookId,source.id,source.revision,settings]));
  return old?.text===source.text?old.names:names.map(({key,value})=>({key,value}));
 }
 get(source:AiReadingSource,settings:ReadingAiSettings,names:readonly Name[]):Name[]{
  const key=JSON.stringify([source.bookId,source.id,source.revision,settings]);
  const old=this.entries.get(key);if(old?.text===source.text){this.entries.delete(key);this.entries.set(key,old);return old.names;}
  const copy=names.map(({key,value})=>({key,value}));
  this.entries.set(key,{text:source.text,names:copy});
  if(this.entries.size>8)this.entries.delete(this.entries.keys().next().value!);
  return copy;
 }
}
