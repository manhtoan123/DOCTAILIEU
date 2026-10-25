import {DatabaseSync} from 'node:sqlite';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
const directory=resolve('.dsh-tmp/server-convert/corpus');
const input=JSON.parse(await readFile(join(directory,'latest.json'),'utf8'));
if(input.unsupportedEntries!==0)throw Error('Incomplete corpus cannot become an eligible packed index');
if(!resolve(input.databasePath).startsWith(directory+sep))throw Error('Source database must stay inside isolated corpus directory');
const source=new DatabaseSync(input.databasePath,{readOnly:true});
const databasePath=join(directory,`packed-${Date.now()}.sqlite`),target=new DatabaseSync(databasePath);
let bucketCount=0,maxBucketBytes=0;
try{
 target.exec(await readFile('experiments/server-convert/packed-schema.sql','utf8'));
 const insert=target.prepare('INSERT INTO probe_buckets VALUES(?,?,?,?,?)');
 const hash='((unicode(substr(lookup_key,1,1))*31+coalesce(unicode(substr(lookup_key,2,1)),0))%4096)';
 let id=-1,page=0,payload=Object.create(null),keys=[],payloadBytes=2;
 const flush=()=>{if(!keys.length)return;const json=JSON.stringify(payload),bytes=Buffer.byteLength(json);if(bytes>45000)throw Error('Packed page exceeds SQL import budget');insert.run(id,page++,keys[0],keys.at(-1),json);bucketCount++;maxBucketBytes=Math.max(maxBucketBytes,bytes);payload=Object.create(null);keys=[];payloadBytes=2;};
 let key=null,events=[];
 const addKey=()=>{if(key===null)return;const bytes=Buffer.byteLength(JSON.stringify(key))+1+Buffer.byteLength(JSON.stringify(events));if(bytes+2>45000)throw Error('Single dictionary key exceeds import page budget');if(payloadBytes+bytes+(keys.length?1:0)>45000)flush();payload[key]=events;payloadBytes+=bytes+(keys.length?1:0);keys.push(key);};
 target.exec('BEGIN');
 for(const row of source.prepare(`SELECT source_key,kind,value,lookup_key,ordinal,${hash} AS bucket FROM probe_dictionary ORDER BY bucket,lookup_key COLLATE BINARY,ordinal`).iterate()){
  if(row.bucket!==id||row.lookup_key!==key){addKey();if(row.bucket!==id){flush();id=row.bucket;page=0;}key=row.lookup_key;events=[];}
  events.push([row.source_key,row.kind,row.value,row.ordinal]);
 }
 addKey();flush();
 const putRule=target.prepare('INSERT INTO probe_rules VALUES(?,?,?,?,?)');let ruleEvents=0;
 for(const row of source.prepare("SELECT * FROM probe_dictionary WHERE kind='rules' ORDER BY ordinal").iterate()){putRule.run(row.source_key,row.kind,row.value,row.lookup_key,row.ordinal);ruleEvents++;}
 target.prepare('INSERT INTO probe_metadata VALUES(1,?)').run(input.maxKeyLength);target.exec('COMMIT');
 const summary={...input,databasePath,dictionaryEvents:input.indexedEvents,storage:'packed-json',bucketCount,maxBucketBytes,ruleEvents,importRows:bucketCount+ruleEvents+1,freeTierFit:'NOT VERIFIED',sourceDatabase:input.databasePath};
 target.close();source.close();summary.databaseBytes=(await stat(databasePath)).size;
 await writeFile(join(directory,'packed-latest.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
}catch(error){try{target.close();}catch{}try{source.close();}catch{}throw error;}
