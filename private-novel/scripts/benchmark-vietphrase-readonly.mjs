import {createHash} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {IDBFactory} from 'fake-indexeddb';
import {createServer} from 'vite';

const directory=process.argv[2];
if(!directory)throw new Error('Pass the explicitly selected read-only dictionary directory.');

const names=[
  {kind:'vp',name:'Vietphrase.txt'},
  {kind:'names',name:'Names.txt'},
  {kind:'hanviet',name:'HanViet.txt'},
  {kind:'names2',name:'DaiTuNhanXung.txt'},
];
const files=[];
const fileMetadata=[];
for(const item of names){
  const path=join(directory,item.name);
  const before=performance.now();
  let bytes=await readFile(path);
  const readMs=performance.now()-before;
  const sha256=createHash('sha256').update(bytes).digest('hex');
  const size=bytes.byteLength;
  const blob=new Blob([bytes]);
  bytes=null;
  files.push({...item,blob,sha256,updatedAt:1});
  fileMetadata.push({name:item.name,bytes:size,readMs:Number(readMs.toFixed(2))});
  globalThis.gc?.();
}

const vite=await createServer({
  configFile:'vite.config.ts',
  logLevel:'error',
  server:{middlewareMode:true},
  appType:'custom',
});

try{
  const [{loadLanguageEngine},{normalizeKey}]=await Promise.all([
    vite.ssrLoadModule('/src/features/names-convert/services/load-language-engine.ts'),
    vite.ssrLoadModule('/src/features/names-convert/services/reference-convert.ts'),
  ]);

  const peak={rss:0,heap:0};
  const sampleMemory=()=>{
    const memory=process.memoryUsage();
    peak.rss=Math.max(peak.rss,memory.rss);
    peak.heap=Math.max(peak.heap,memory.heapUsed);
  };
  sampleMemory();
  const sampler=setInterval(sampleMemory,100);
  sampler.unref();

  const load=async mode=>{
    const idb=mode==='map'?undefined:new IDBFactory();
    const start=performance.now();
    const result=await loadLanguageEngine(files,mode==='map'?{}:{packed:{enabled:true,idb,normalizeKey}});
    sampleMemory();
    return {result,idb,elapsed:performance.now()-start};
  };
  const dispose=async loaded=>{
    loaded.result=null;
    loaded.idb=null;
    globalThis.gc?.();
    await new Promise(resolve=>setTimeout(resolve,100));
  };
  const measureLoad=async mode=>{
    const samples=[];let retained;
    for(let iteration=0;iteration<3;iteration++){
      const current=await load(mode);
      samples.push(current.elapsed);
      if(iteration===2)retained=current;else await dispose(current);
    }
    return {samplesMs:samples.map(value=>Number(value.toFixed(2))),retained};
  };
  const percentile=(samples,p)=>[...samples].sort((a,b)=>a-b)[Math.ceil(samples.length*p)-1];
  const summarize=samples=>({
    p50Ms:Number(percentile(samples,.5).toFixed(2)),
    p95Ms:Number(percentile(samples,.95).toFixed(2)),
    samples:samples.length,
  });
  const measureConvert=(engine,length)=>{
    const seed='中国人民来到北京。张三和李四开始讨论修仙的方法。';
    const source=seed.repeat(Math.ceil(length/seed.length)).slice(0,length);
    const samples=[];let hash;
    for(let iteration=0;iteration<35;iteration++){
      const start=performance.now();
      const tokens=engine.convert(source,[],{mode:'vietphrase'});
      const elapsed=performance.now()-start;
      const digest=createHash('sha256');
      for(const token of tokens)digest.update(token.targetText);
      const currentHash=digest.digest('hex');
      if(hash&&hash!==currentHash)throw new Error(`Convert output changed for ${length} UTF-16 units.`);
      hash=currentHash;
      if(iteration>=5)samples.push(elapsed);
    }
    return {sourceUnits:length,outputSha256:hash,timing:summarize(samples)};
  };
  const packedSize=index=>{
    const data=index.data;
    if(!data)return null;
    return [data.base,data.normalized].reduce((total,table)=>total+
      table.keyUnits.byteLength+table.keyOffsets.byteLength+
      table.valueUnits.byteLength+table.valueOffsets.byteLength,0)+data.maxByFirst.byteLength;
  };

  const mapCold=await measureLoad('map');
  const mapConvert=[10000,100000].map(length=>measureConvert(mapCold.retained.result.engine,length));
  await dispose(mapCold.retained);

  const idb=new IDBFactory();
  const coldPackedSamples=[];
  for(let iteration=0;iteration<3;iteration++){
    const start=performance.now();
    const coldIdb=new IDBFactory();
    const result=await loadLanguageEngine(files,{packed:{enabled:true,idb:coldIdb,normalizeKey}});
    coldPackedSamples.push(performance.now()-start);
    result.engine&&sampleMemory();
    result.engine=null;globalThis.gc?.();
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  // Rebuild a cache once in a retained in-memory IndexedDB, then measure cache hits.
  const warmStart=performance.now();
  const warmEngine=await loadLanguageEngine(files,{packed:{enabled:true,idb,normalizeKey}});
  const warmPrimeMs=performance.now()-warmStart;
  const warmSamples=[];
  for(let iteration=0;iteration<30;iteration++){
    const start=performance.now();
    await loadLanguageEngine(files,{packed:{enabled:true,idb,normalizeKey}});
    const elapsed=performance.now()-start;
    if(iteration>=5)warmSamples.push(elapsed);
  }
  const packedConvert=[10000,100000].map(length=>measureConvert(warmEngine.engine,length));
  for(let index=0;index<mapConvert.length;index++)if(mapConvert[index].outputSha256!==packedConvert[index].outputSha256)throw new Error(`Map and packed Convert differ at ${mapConvert[index].sourceUnits} units.`);
  const packedIndex=warmEngine.engine.indexes.vp;
  const packedBytes=packedSize(packedIndex);
  clearInterval(sampler);

  console.log(JSON.stringify({
    runtime:{node:process.version,storage:'RAM + fake-indexeddb memory only',externalRequests:0,persistentWrites:0},
    files:fileMetadata,
    rawDictionaryBytes:files.reduce((total,file)=>total+file.blob.size,0),
    coldLoad:{map:summarize(mapCold.samplesMs),packed:summarize(coldPackedSamples)},
    warmPackedLoad:{cacheSeedMs:Number(warmPrimeMs.toFixed(2)),afterWarmup:summarize(warmSamples)},
    packedVietphraseIndexBytes:packedBytes,
    convert:{map:mapConvert.map(({sourceUnits,timing})=>({sourceUnits,timing})),packed:packedConvert.map(({sourceUnits,timing})=>({sourceUnits,timing})),outputsMatch:true},
    peakMemoryBytes:peak,
    note:'This reads selected files into process memory and uses in-memory IndexedDB for packed-cache timing. It does not persist dictionary bytes/cache to disk or send requests. Node timing does not represent Edge/Android.'
  },null,2));

  globalThis.gc?.();
}finally{
  await vite.close();
}
