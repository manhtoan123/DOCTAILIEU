import {createHash} from 'node:crypto';
import {readdir,readFile,stat,writeFile} from 'node:fs/promises';
import {join,relative,resolve,sep} from 'node:path';

const dist=resolve('dist');
const workerPath=join(dist,'sw.js');
const template=await readFile(workerPath,'utf8');
const assetsRoot=join(dist,'assets');
const files=[];

async function walk(directory){
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const path=join(directory,entry.name);
    if(entry.isDirectory())await walk(path);
    else if(/\.(?:js|css)$/i.test(entry.name)&&!/^(?:docx|pdf)-convert-/i.test(entry.name))files.push(path);
  }
}

await walk(assetsRoot);
const rootFiles=await readdir(dist,{withFileTypes:true});
for(const entry of rootFiles){
  if(entry.isFile()&&/^epub-bridge-v\d+\.js$/i.test(entry.name))files.push(join(dist,entry.name));
}

const urls=['/index.html',...files.map(path=>`/${relative(dist,path).split(sep).join('/')}`)].sort();
const revision=await Promise.all(urls.map(async url=>{
  const content=await readFile(join(dist,url.slice(1)));
  return {url,hash:createHash('sha256').update(content).digest('hex'),size:(await stat(join(dist,url.slice(1)))).size};
}));
const buildId=createHash('sha256').update(template).update(revision.map(row=>`${row.url}:${row.hash}`).join('\n')).digest('hex').slice(0,16);
if(!template.includes('__BUILD_ID__')||!template.includes('__PRECACHE_URLS__'))throw new Error('PWA shell worker markers are missing');
const output=template.replace('__BUILD_ID__',buildId).replace('__PRECACHE_URLS__',JSON.stringify(urls));
await writeFile(workerPath,output);
console.log(`Prepared PWA shell ${buildId}: ${urls.length} URLs, ${Math.round(revision.reduce((total,row)=>total+row.size,0)/1024)} KiB.`);
