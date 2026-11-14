import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {performance} from 'node:perf_hooks';

const source=new URL('../src/features/names-convert/services/packed-index.ts',import.meta.url);
const text=await readFile(source,'utf8');
const js=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const mod=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const count=Number(process.argv[2]||1_200_000),lines=new Array(count);
for(let i=0;i<count;i++)lines[i]=`${String.fromCodePoint(0x4e00+(i%20000))}${String.fromCodePoint(0x4e00+Math.floor(i/20000)%20000)}${i.toString(36)}=nghĩa-${i.toString(36)}`;
global.gc?.();const before=process.memoryUsage().heapUsed,start=performance.now(),map=new Map();for(const line of lines){const p=line.indexOf('=');map.set(line.slice(0,p),line.slice(p+1));}const oldMs=performance.now()-start,oldHeap=(process.memoryUsage().heapUsed-before)/1048576;
global.gc?.();const bstart=performance.now(),builder=new mod.PackedBuilder(x=>x),split=new Map();for(const line of lines){const p=line.indexOf('=');split.set(line.slice(0,p),line.slice(p+1));}for(const [k,v]of split)builder.add(k,v);const data=await builder.build(),buildMs=performance.now()-bstart;
global.gc?.();const cloneStart=performance.now(),clone=structuredClone(data),cloneMs=performance.now()-cloneStart,hitStart=performance.now(),index=new mod.PackedIndex(clone,x=>x),hitMs=performance.now()-hitStart;
const probe=`${String.fromCodePoint(0x4e00)}${String.fromCodePoint(0x4e00)}0`,queries=Array.from({length:36000},(_,i)=>lines[i%count].slice(0,lines[i%count].indexOf('='))),mapLookupStart=performance.now();for(const key of queries)map.get(key);const mapLookupMs=performance.now()-mapLookupStart,packedLookupStart=performance.now();for(const key of queries)index.get(key);const packedLookupMs=performance.now()-packedLookupStart,heap=(process.memoryUsage().heapUsed)/1048576;console.log(JSON.stringify({node:process.version,count,oldMapBuildMs:+oldMs.toFixed(1),packedBuildMs:+buildMs.toFixed(1),structuredCloneMs:+cloneMs.toFixed(1),packedIndexInitMs:+hitMs.toFixed(1),lookup36000:{mapMs:+mapLookupMs.toFixed(1),packedBinarySearchMs:+packedLookupMs.toFixed(1)},heapMiB:+heap.toFixed(1),lookupMatches:map.get(probe)===index.get(probe)},null,2));
