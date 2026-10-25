import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve,join,sep,basename} from 'node:path';
import {performance} from 'node:perf_hooks';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {corpusLines} from './lib/server-convert-corpus.mjs';
import {serverConvertCases} from './lib/server-convert-cases.mjs';
const sqlCandidates=process.argv.includes('--sql');
const directory=resolve('.dsh-tmp/server-convert/corpus');
const corpus=JSON.parse(await readFile(join(directory,'packed-latest.json'),'utf8'));
if(corpus.unsupportedEntries!==0||!resolve(corpus.databasePath).startsWith(directory+sep))throw Error('Invalid/incomplete local corpus');
const runDirectory=resolve(`.dsh-tmp/server-convert/runtime-${Date.now()}`);await mkdir(runDirectory,{recursive:true});
const bundle=await build({entryPoints:['experiments/server-convert/worker.ts'],bundle:true,write:false,format:'esm',platform:'browser'});
const options=()=>convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-01-01',d1Databases:['PROBE_DB'],resourcePersistencePath:runDirectory,bindings:{PROBE_STORAGE:'packed',PROBE_SQL_CANDIDATES:sqlCandidates?'1':'0'}});
let runtime=new Miniflare(options());
try{const db=await runtime.getD1Database('PROBE_DB');const schema=await readFile('experiments/server-convert/packed-schema.sql','utf8');for(const sql of schema.split(';').filter(s=>s.trim()))await db.prepare(sql).run();}finally{await runtime.dispose();}
const files=(await readdir(runDirectory,{recursive:true})).filter(file=>/^[a-f0-9]{64}\.sqlite$/.test(basename(file))&&file.split(/[\\/]/)[0]==='d1');
if(files.length!==1)throw Error('Ambiguous isolated D1 database');
const databasePath=resolve(runDirectory,files[0]);if(!databasePath.startsWith(runDirectory+sep))throw Error('Invalid isolated D1 path');
const local=new DatabaseSync(databasePath);
try{
 if(local.prepare('SELECT count(*) AS count FROM probe_buckets').get().count!==0)throw Error('Refuse to overwrite existing data');
 local.prepare('ATTACH DATABASE ? AS corpus').run(corpus.databasePath);local.exec('BEGIN;INSERT INTO probe_buckets SELECT * FROM corpus.probe_buckets;INSERT INTO probe_rules SELECT * FROM corpus.probe_rules;INSERT INTO probe_metadata SELECT * FROM corpus.probe_metadata;COMMIT;DETACH DATABASE corpus;');
}finally{local.close();}
const helper=await build({stdin:{contents:"export {LanguageEngine} from './src/features/names-convert/services/language';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node'});
const {LanguageEngine}=await import('data:text/javascript;base64,'+Buffer.from(helper.outputFiles[0].text).toString('base64'));
const complete=new LanguageEngine(),loadStart=performance.now();
for(const entry of corpus.dictionaries){
 const file=join(directory,`${entry.kind}-${entry.sha256}.txt`),hash=createHash('sha256');let bytes=0;
 for await(const chunk of createReadStream(file)){hash.update(chunk);bytes+=chunk.length;}
 if(bytes!==entry.bytes||hash.digest('hex')!==entry.sha256)throw Error('Corpus SHA/size changed');
 for await(const line of corpusLines(file))complete.add(entry.kind,line);
}
console.log(JSON.stringify({phase:'full-reference-loaded',localLoadMs:performance.now()-loadStart,nodeHeapBytes:process.memoryUsage().heapUsed}));
runtime=new Miniflare(options());
const results=[],samples=[...['林儿打开门。','中国人民来到山门。','他抬起头，看着天空，什么也没有说。','“你是谁？”她轻声问道。','第十二章 山中来客','林儿😀，打开门！','甲乙丙丁。','天空中没有一丝光亮，所有人都站在原地。'.repeat(5)].map((text,id)=>({id:`original${id}`,text,names:[{key:'$林儿',value:'Tiểu Lâm'}],expectedStatus:200,expectedError:undefined})),...(process.argv.includes('--stress')?serverConvertCases:[])];
try{
 const db=await runtime.getD1Database('PROBE_DB');const count=await db.prepare('SELECT count(*) AS count FROM probe_buckets').first();if(count.count!==corpus.bucketCount)throw Error('Isolated D1 corpus count mismatch');
 for(const [index,sample] of samples.entries())for(let repeat=0;repeat<2;repeat++){
  const {text,names}=sample,expected=complete.convert(text,names,{reference:true,standardizePunctuation:true,capitalize:true});
  const start=performance.now(),response=await runtime.dispatchFetch('https://local-probe.invalid/convert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,names})});
  const result=await response.json(),localRoundTripMs=performance.now()-start;
  const bounded=sample.expectedStatus===413&&response.status===413&&result.error===sample.expectedError&&!result.tokens;
  const parity=bounded||(response.status===200&&JSON.stringify(result.tokens)===JSON.stringify(expected));
  const lookupsParity=bounded||(response.status===200&&JSON.stringify(result.lookups)===JSON.stringify(result.tokens.filter(t=>t.source.trim()).map(t=>({source:t.source,...complete.lookup(t.source)}))));
  results.push({sample:index,id:sample.id,inputLength:text.length,nameCount:names.length,repeat,status:response.status,localRoundTripMs,parity,lookupsParity,diagnostics:result.diagnostics,error:result.error});
  console.log(JSON.stringify(results.at(-1)));
 }
}finally{await runtime.dispose();}
const report={runtime:'local workerd+D1',dataset:'actual existing cloud dictionary, SHA verified',dictionaryEvents:corpus.indexedEvents,packedRows:corpus.importRows,databaseBytes:corpus.databaseBytes,maxBucketBytes:corpus.maxBucketBytes,results,cloudflareCpuMs:null,workerdPeakMemoryBytes:null,freeTierFit:'NOT VERIFIED',productionChanged:false,remoteWrites:0};
await writeFile(`.dsh-tmp/server-convert/real-report${sqlCandidates?'-sql':''}.json`,JSON.stringify(report,null,2));
if(results.some(row=>!row.parity||!row.lookupsParity))process.exitCode=1;
