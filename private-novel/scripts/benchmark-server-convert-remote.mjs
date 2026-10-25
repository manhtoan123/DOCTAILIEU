// Remote preview is forwarded by Wrangler on loopback; never prints preview credentials.
import {readFile,writeFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {build} from 'esbuild';
import {corpusLines} from './lib/server-convert-corpus.mjs';
import {serverConvertCases} from './lib/server-convert-cases.mjs';
const repetitions=Number(process.argv.find(arg=>arg.startsWith('--repeat='))?.split('=')[1]??2);
if(!Number.isInteger(repetitions)||repetitions<1||repetitions>30)throw Error('Repeat budget must be 1..30');
const directory=resolve('.dsh-tmp/server-convert/corpus');
const corpus=JSON.parse(await readFile(join(directory,'packed-latest.json'),'utf8'));
const bundle=await build({stdin:{contents:"export {LanguageEngine} from './src/features/names-convert/services/language';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node'});
const {LanguageEngine}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const complete=new LanguageEngine();
for(const entry of corpus.dictionaries){
 if(!/^[a-z0-9]+$/.test(entry.kind)||!/^[a-f0-9]{64}$/.test(entry.sha256))throw Error('Invalid corpus identity');
 const file=join(directory,`${entry.kind}-${entry.sha256}.txt`),hash=createHash('sha256');let bytes=0;
 for await(const chunk of createReadStream(file)){hash.update(chunk);bytes+=chunk.length;}
 if(bytes!==entry.bytes||hash.digest('hex')!==entry.sha256)throw Error('Corpus SHA/size mismatch');
 for await(const line of corpusLines(file))complete.add(entry.kind,line);
}
const original=['林儿打开门。','中国人民来到山门。','他抬起头，看着天空，什么也没有说。','“你是谁？”她轻声问道。','第十二章 山中来客','林儿😀，打开门！','甲乙丙丁。','天空中没有一丝光亮，所有人都站在原地。'.repeat(5)].map((text,id)=>({id:`original${id}`,text,names:[{key:'$林儿',value:'Tiểu Lâm'}],expectedStatus:200,expectedError:undefined}));
const selected=process.argv.includes('--stress-only')?serverConvertCases:[...original,...(process.argv.includes('--stress')?serverConvertCases:[])];
const samples=selected.filter(sample=>!process.argv.includes('--skip-overflow')||sample.expectedStatus!==413);
const rowsBudget=Number(process.argv.find(arg=>arg.startsWith('--rows-budget='))?.split('=')[1]??150000);
if(!Number.isInteger(rowsBudget)||rowsBudget<1||rowsBudget>1500000)throw Error('Read budget must be 1..1500000');
const results=[];
const startedAt=new Date().toISOString();let totalRowsRead=0,completed=false;
try{
for(const [sample,input] of samples.entries())for(let repeat=0;repeat<repetitions;repeat++){
 // These fixed cases were measured locally: success <=15,486 reads; overflow
 // is not measured by the response. Reserve before each request and stop if
 // costs drift, rather than silently beginning another request near the cap.
 const reservation=input.expectedStatus===413?100000:20000;
 if(totalRowsRead+reservation>rowsBudget)throw Error('Remote read budget cannot reserve next request');
 const {text,names}=input,expected=complete.convert(text,names,{reference:true,standardizePunctuation:true,capitalize:true});
 const start=performance.now(),response=await fetch('http://127.0.0.1:8796/convert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,names}),signal:AbortSignal.timeout(30000)});
 const body=await response.text();let result;try{result=JSON.parse(body);}catch{result={error:`non_json_response_${response.status}`};}
 const bounded=input.expectedStatus===413&&response.status===413&&result.error===input.expectedError&&!result.tokens;
 const parity=bounded||(response.status===200&&JSON.stringify(result.tokens)===JSON.stringify(expected));
 const lookupsParity=bounded||(response.status===200&&JSON.stringify(result.lookups)===JSON.stringify(expected.filter(t=>t.source.trim()).map(t=>({source:t.source,...complete.lookup(t.source)}))));
 const row={sample,id:input.id,repeat,inputLength:text.length,nameCount:names.length,status:response.status,roundTripMs:performance.now()-start,parity,lookupsParity,diagnostics:result.diagnostics,error:result.error};results.push(row);console.log(JSON.stringify(row));
 // Overflow without diagnostics reserves 100k reads; do not count it as zero.
 const readCost=Number.isSafeInteger(result.diagnostics?.rowsRead)?result.diagnostics.rowsRead+1:100000;
 totalRowsRead+=readCost;
 if(!parity||!lookupsParity)throw Error('Remote parity/status check failed');
 if(process.argv.includes('--expect-sql')&&response.status===200&&result.diagnostics?.candidateMode!=='sql')throw Error('Remote candidate mode mismatch');
 if(readCost>reservation)throw Error('Remote read cost exceeds measured reservation; batch stopped');
 if(totalRowsRead>rowsBudget)throw Error('Remote read budget exceeded; batch stopped');
}
completed=true;
}finally{
const report={runtime:'Cloudflare remote preview + isolated remote D1 via loopback',startedAt,endedAt:new Date().toISOString(),completed,rowsBudget,totalRowsReadIncludingReservations:totalRowsRead,dictionaryEvents:corpus.indexedEvents,results,cloudflareCpuMs:null,peakMemoryBytes:null,freeTierFit:'NOT VERIFIED',readerIntegrated:false};
await writeFile(`.dsh-tmp/server-convert/remote-report-${Date.now()}.json`,JSON.stringify(report,null,2));
}
