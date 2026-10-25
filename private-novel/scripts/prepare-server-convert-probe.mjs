import {corpusLines as linesOf} from './lib/server-convert-corpus.mjs';
// LOCAL index preparation from the dictionaries already published by this app.
// No D: reads, cloud writes, library migration or deployment.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {build} from 'esbuild';
const output=resolve('.dsh-tmp/server-convert/corpus');await mkdir(output,{recursive:true});
const origin='https://thu-phong-private.pages.dev';
const response=await fetch(origin+'/api/cloud/dictionaries',{signal:AbortSignal.timeout(30000),redirect:'error'});if(!response.ok||!response.body)throw Error('Manifest unavailable');
let manifestText='',manifestBytes=0;const decoder=new TextDecoder('utf8',{fatal:true});
for await(const chunk of Readable.fromWeb(response.body)){manifestBytes+=chunk.length;if(manifestBytes>16384)throw Error('Manifest limit');manifestText+=decoder.decode(chunk,{stream:true});}manifestText+=decoder.decode();
const manifest=JSON.parse(manifestText);

const kinds=['vp','names','names2','hanviet','rules','chapter','number','pronouns','blacklist','english'];
if(manifest.version!==1||!Array.isArray(manifest.dictionaries)||manifest.dictionaries.length>kinds.length)throw Error('Invalid manifest');
const code=await build({stdin:{contents:"export {dictionaryEntry} from './src/features/names-convert/services/dictionary-reader';export {normalizeKey} from './src/features/names-convert/services/reference-convert';export {nameSourceKey} from './src/features/names-convert/services/name-images';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node'});
const {dictionaryEntry,normalizeKey,nameSourceKey}=await import('data:text/javascript;base64,'+Buffer.from(code.outputFiles[0].text).toString('base64'));
const databasePath=join(output,`probe-${Date.now()}.sqlite`),db=new DatabaseSync(databasePath);
db.exec(await readFile('experiments/server-convert/schema.sql','utf8'));
db.exec('PRAGMA journal_mode=WAL;');
const insert=db.prepare('INSERT INTO probe_dictionary VALUES(?,?,?,?,?)');
const seen=new Set(),report=[];let ordinal=0,maxKeyLength=1,unsupported=0;
try{for(const item of manifest.dictionaries){
 const {kind,sha256,bytes}=item;
 if(!kinds.includes(kind)||seen.has(kind)||!(/^[a-f0-9]{64}$/).test(sha256)||!Number.isSafeInteger(bytes)||bytes<1||bytes>80*1048576)throw Error('Invalid dictionary entry');seen.add(kind);
 const path=join(output,`${kind}-${sha256}.txt`);
 let cached=false;try{if((await stat(path)).size===bytes){const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);cached=hash.digest('hex')===sha256;}}catch{}
 if(!cached){
  const remote=await fetch(`${origin}/api/cloud/dictionaries/${kind}/${sha256}`,{signal:AbortSignal.timeout(120000),redirect:'error'});if(!remote.ok||!remote.body)throw Error('Dictionary unavailable');
  let size=0;const hash=createHash('sha256');
  const validate=new Transform({transform(chunk,_encoding,callback){size+=chunk.length;if(size>bytes){callback(Error('Dictionary size limit'));return;}hash.update(chunk);callback(null,chunk);}});
  await pipeline(Readable.fromWeb(remote.body),validate,createWriteStream(path,{flags:'w',mode:0o600}));
  if(size!==bytes||hash.digest('hex')!==sha256)throw Error('Dictionary SHA/size mismatch');
 }
 const lines=linesOf(path);let valid=0,ignored=0,incompatible=0;
 db.exec('BEGIN');
 for await(const line of lines){const entry=dictionaryEntry(kind,line);if(!entry){ignored++;continue;}
  const [key,value]=entry,lookup=normalizeKey(kind==='names'||kind==='names2'?nameSourceKey(key):key);
  if(!lookup||lookup.length>256||value.length>4096){incompatible++;unsupported++;continue;}
  insert.run(key,kind,value,lookup,ordinal++);valid++;maxKeyLength=Math.max(maxKeyLength,lookup.length);
  if(valid%10000===0){db.exec('COMMIT');db.exec('BEGIN');}
 }
 db.exec('COMMIT');report.push({kind,sha256,bytes,indexedEvents:valid,ignored,incompatible});
 console.log(JSON.stringify({kind,indexedEvents:valid,ignored,incompatible}));
}
db.prepare('INSERT INTO probe_metadata VALUES(1,?)').run(maxKeyLength);
db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
}finally{db.close();}
const summary={version:1,source:'existing cloud dictionary GET, verified SHA/size',databasePath,databaseBytes:(await stat(databasePath)).size,dictionaries:report,indexedEvents:ordinal,maxKeyLength,unsupportedEntries:unsupported,freeTierFit:'NOT VERIFIED',productionChanged:false,remoteWrites:0};
await writeFile(join(output,'latest.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
