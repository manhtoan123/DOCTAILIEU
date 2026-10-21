import {createHash} from 'node:crypto';
import {createReadStream,writeFileSync,mkdirSync} from 'node:fs';
import {stat} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {spawnSync} from 'node:child_process';

// Only these dictionaries were authorized. Never enumerate or upload story folders.
const directory='D:\\linh tinh\\tm\\Vietphrase-data';
const choices=[['vp','Vietphrase.txt'],['names','Names.txt'],['hanviet','HanViet.txt'],['chapter','Vietphrase_Chapter.txt'],['number','Vietphrase_Number.txt'],['pronouns','DaiTuNhanXung.txt'],['blacklist','Blacklist.txt']];
const entries=[];
function wrangler(args){
  // Launch Wrangler's bundled JavaScript with Node; no shell quoting of paths.
  const result=spawnSync(process.execPath,[join(process.cwd(),'node_modules','wrangler','bin','wrangler.js'),...args],{stdio:'inherit'});
  if(result.status!==0)throw new Error('Dictionary seed command failed; manifest not published.');
}
for(const[kind,name]of choices){
  const file=join(directory,name),info=await stat(file);
  if(!info.isFile()||info.size<1||info.size>80*1048576)throw new Error('Invalid seed dictionary size');
  const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);
  const sha256=hash.digest('hex'),objectKey=`dictionaries/v1/${kind}/${sha256}.txt`;
  entries.push({kind,name,sha256,bytes:info.size,objectKey,file});
}
const stateDirectory=join(homedir(),'.codex','private-novel');mkdirSync(stateDirectory,{recursive:true});
const manifestPath=join(stateDirectory,'default-dictionaries-manifest.json');
writeFileSync(manifestPath,JSON.stringify({version:1,dictionaries:entries.map(({file,...entry})=>entry)}),{mode:0o600});
if(process.argv.includes('--upload')){
  for(const entry of entries)wrangler(['r2','object','put',`thu-phong-library/${entry.objectKey}`,'--remote','--file',entry.file,'--content-type','text/plain; charset=utf-8']);
  wrangler(['r2','object','put','thu-phong-library/dictionaries/v1/manifest.json','--remote','--file',manifestPath,'--content-type','application/json']);
}
console.log(JSON.stringify({prepared:entries.length,bytes:entries.reduce((n,e)=>n+e.bytes,0),uploaded:process.argv.includes('--upload'),source:directory}));
