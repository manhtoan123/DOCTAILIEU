import type {D1Database} from '@cloudflare/workers-types';
import {dictionaryKinds,type DictKind} from '../../src/core/domain';
import {LanguageEngine} from '../../src/features/names-convert/services/language';
import {normalizeKey} from '../../src/features/names-convert/services/reference-convert';
import {nameSourceKey} from '../../src/features/names-convert/services/name-images';
import {candidateSql,matchedSql} from './candidate-query';

const MAX_BODY=32768,MAX_TEXT=512,MAX_CANDIDATES=8192,MAX_ROWS=512;
/** Isolated experiment: no public route, Reader integration or automatic fallback. */
export default {async fetch(request:Request,env:{PROBE_DB:D1Database;PROBE_STORAGE?:'rows'|'packed';PROBE_SQL_CANDIDATES?:string;CONVERT_VERSION?:string}){
 let measuredReads=0;
 const reply=(body:Record<string,unknown>,status=200)=>Response.json(env.CONVERT_VERSION?{...body,version:env.CONVERT_VERSION}:body,{status,headers:{'Cache-Control':'no-store','X-Convert-Reads':String(measuredReads+1),...(typeof body.error==='string'?{'X-Convert-Error':body.error}:{})}});
 if(new URL(request.url).pathname!=='/convert')return reply({error:'not_found'},404);
 if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
 if(request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json')return reply({error:'content_type'},415);
 const reader=request.body?.getReader();if(!reader)return reply({error:'body_required'},400);
 let bytes=0;const chunks:Uint8Array[]=[];
 try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_BODY){await reader.cancel();return reply({error:'body_limit'},413);}chunks.push(value);}}
 finally{reader.releaseLock();}
 const all=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.byteLength;}
 let input:unknown;try{input=JSON.parse(new TextDecoder().decode(all));}catch{return reply({error:'invalid_json'},400);}
 if(!input||typeof input!=='object'||Array.isArray(input))return reply({error:'invalid_input'},400);
 const data=input as {text?:unknown;names?:unknown;includeLookup?:unknown};
 if(data.includeLookup!==undefined&&typeof data.includeLookup!=='boolean')return reply({error:'invalid_input'},400);
 if(typeof data.text!=='string'||!data.text.trim()||data.text.length>MAX_TEXT)return reply({error:'text_limit'},400);
 if(data.names!==undefined&&(!Array.isArray(data.names)||data.names.length>100))return reply({error:'invalid_names'},400);
 const sourceText=data.text;
 const names:{key:string;value:string}[]=[];
 for(const row of (data.names??[]) as unknown[]){
  if(!row||typeof row!=='object'||Array.isArray(row))return reply({error:'invalid_names'},400);
  const {key,value}=row as {key?:unknown;value?:unknown};
  if(typeof key!=='string'||!key.trim()||key.length>256||/[\r\n=]/.test(key)||typeof value!=='string'||(value!==''&&!value.trim())||value.length>2048||/[\r\n]/.test(value))return reply({error:'invalid_names'},400);
  names.push({key,value});
 }
 try{
  const metadata=await env.PROBE_DB.prepare('SELECT max_key_length FROM probe_metadata WHERE id=1').first<{max_key_length:number}>();
  if(!metadata||!Number.isInteger(metadata.max_key_length)||metadata.max_key_length<1||metadata.max_key_length>256)return reply({error:'index_not_ready'},503);
  const candidates=new Set<string>();
  const normalized=normalizeKey(data.text),variants=[...new Set([data.text,normalized])];
  const generateCandidates=()=>{for(const text of variants){
   const chars=[...text];for(let start=0;start<chars.length;start++){let key='';for(let end=start;end<chars.length;end++){
    key+=chars[end];if(key.length>metadata.max_key_length)break;candidates.add(key);
    if(candidates.size>MAX_CANDIDATES)throw Error('candidate_limit');
   }}
  }};
  type Row={source_key:string;kind:DictKind;value:string;ordinal:number};
  let queries=1,rowsRead=0;
  const rows=new Map<number,Row>(),queried=new Set<string>();
  const remember=(items:Row[])=>{
   for(const row of items){
    if(typeof row.source_key!=='string'||!row.source_key||row.source_key.length>256||!Number.isSafeInteger(row.ordinal)||!dictionaryKinds.includes(row.kind)||typeof row.value!=='string'||row.value.length>4096)throw Error('invalid_index');
    rows.set(row.ordinal,row);
   }
   if(rows.size>MAX_ROWS)throw Error('match_limit');
  };
  const packed=env.PROBE_STORAGE==='packed';
  const rules=await env.PROBE_DB.prepare(packed?"SELECT source_key,kind,value,ordinal FROM probe_rules ORDER BY ordinal LIMIT ?":"SELECT source_key,kind,value,ordinal FROM probe_dictionary WHERE kind='rules' ORDER BY ordinal LIMIT ?").bind(MAX_ROWS+1).all<Row>();
  queries++;rowsRead+=rules.meta.rows_read;measuredReads=rowsRead;remember(rules.results);
  const sqlCandidates=env.PROBE_SQL_CANDIDATES==='1'&&rules.results.length===0;
  let candidateCount=0;
  const fetchKeys=async(keys:string[])=>{
   keys.forEach(key=>queried.add(key));
   const found=await env.PROBE_DB.prepare(`WITH eligible(value) AS (SELECT value FROM json_each(?)) ${matchedSql(packed)}`).bind(JSON.stringify(keys),MAX_ROWS+1).all<Row>();
   queries++;rowsRead+=found.meta.rows_read;measuredReads=rowsRead;remember(found.results);
  };
  if(sqlCandidates){
   const found=await env.PROBE_DB.prepare(`${candidateSql}, matched AS (${matchedSql(packed)})
    SELECT NULL AS source_key,NULL AS kind,NULL AS value,NULL AS ordinal,candidate_count FROM budget
    UNION ALL SELECT source_key,kind,value,ordinal,NULL AS candidate_count FROM matched`)
    .bind(JSON.stringify(variants.map(text=>[...text])),metadata.max_key_length-1,metadata.max_key_length,metadata.max_key_length,MAX_ROWS+1).all<Row&{candidate_count:number|null}>();
   queries++;rowsRead+=found.meta.rows_read;measuredReads=rowsRead;
   const count=found.results.find(row=>row.candidate_count!==null)?.candidate_count;
   if(typeof count!=='number'||!Number.isSafeInteger(count)||count<0)throw Error('invalid_index');
   if(count>MAX_CANDIDATES)throw Error('candidate_limit');candidateCount=count;
   remember(found.results.filter(row=>row.candidate_count===null));
  }else{generateCandidates();await fetchKeys([...candidates]);}
  const hasRule=rules.results.some(row=>{const [before,after]=normalizeKey(row.source_key).split('{0}');return after!==undefined&&normalized.includes(before)&&normalized.includes(after);});
  // Reject obvious repeated-value expansion before the engine builds tokens.
  // Ordinary short entries need no occurrence scan. The final aggregate cap
  // below still covers combinations and Rules without returning partial text.
  const boundExpansion=(key:string,value:string)=>{
   key=normalizeKey(key);if(!key||Math.floor(normalized.length/key.length)*value.length<=32768)return;
   let at=0,count=0;while((at=normalized.indexOf(key,at))!==-1){if(++count*value.length>32768)throw Error('output_limit');at+=key.length;}
  };
  for(const name of names)boundExpansion(nameSourceKey(name.key),name.value);
  // Observe only keys the existing engine requests. Rules may create new source
  // strings; retry with their indexed dependencies, never return a partial result.
  for(let pass=0;pass<4;pass++){
   const engine=new LanguageEngine();
   for(const row of [...rows.values()].sort((a,b)=>a.ordinal-b.ordinal)){if(row.kind!=='rules')boundExpansion(row.kind==='names'||row.kind==='names2'?nameSourceKey(row.source_key):row.source_key,row.value);engine.add(row.kind,`${row.source_key}=${row.value}`);}
   const add=(key:string)=>{key=normalizeKey(key);if(key.length&&key.length<=metadata.max_key_length)candidates.add(key);if(candidates.size>MAX_CANDIDATES)throw Error('candidate_limit');};
   if(hasRule){
    const visited=new Map<string,Set<number>>();
    for(const index of Object.values(engine.indexes)){
     const get=index.get.bind(index),match=index.match.bind(index);
     index.get=(key,isNormalized=false)=>{add(key);return get(key,isNormalized);};
     index.match=(text,at,isNormalized=false)=>{
      let positions=visited.get(text);if(!positions)visited.set(text,positions=new Set());
      if(!positions.has(at)){positions.add(at);let key='';for(const char of text.slice(at)){key+=char;if(key.length>metadata.max_key_length)break;add(key);}}
      return match(text,at,isNormalized);
     };
    }
   }
   const tokens=engine.convert(data.text,names,{reference:true,standardizePunctuation:true,capitalize:true});
   // Bound serialized expansion before creating per-token lookup duplicates.
   let outputSize=tokens.reduce((size,t)=>size+t.source.length+t.targetText.length+t.hanviet.length+t.meanings.reduce((sum,s)=>sum+s.length,0)+(t.nameImage?t.nameImage.label.length+t.nameImage.url.length:0),0);
   if(outputSize>65536)throw Error('output_limit');
   const pending=[...candidates].filter(key=>!queried.has(key));
   const result=()=>{
    const cache=new Map<string,ReturnType<LanguageEngine['lookup']>>();
    const look=(source:string)=>{let meaning=cache.get(source);if(!meaning){meaning=engine.lookup(source);cache.set(source,meaning);}return meaning;};
    const measure=(m:ReturnType<LanguageEngine['lookup']>)=>m.hanviet.length+[...m.meanings,...(m.english??[]),...(m.names??[])].reduce((sum,s)=>sum+s.length,0);
    const lookup=data.includeLookup===false?{hanviet:'',meanings:[]}:look(sourceText);outputSize+=measure(lookup);if(outputSize>65536)throw Error('output_limit');
    const lookups=[];
    for(const token of tokens){if(!token.source.trim())continue;const meaning=look(token.source);outputSize+=token.source.length+measure(meaning);if(outputSize>65536)throw Error('output_limit');lookups.push({source:token.source,...meaning});}
    return reply({tokens,lookup,lookups,diagnostics:{candidates:sqlCandidates?candidateCount:candidates.size,loadedRows:rows.size,rowsRead,queries,dependencyPasses:pass,candidateMode:sqlCandidates?'sql':'js'}});
   };
   if(!pending.length)return result();
   const before=rows.size;await fetchKeys(pending);
   if(rows.size===before)return result();
  }
  return reply({error:'dependency_limit'},413);
 }catch(error){const code=error instanceof Error?error.message:'';if(['candidate_limit','match_limit','output_limit'].includes(code))return reply({error:code},413);return reply({error:'probe_failed'},503);}
}};
