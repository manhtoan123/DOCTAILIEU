import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {transformWithEsbuild} from 'vite';

const sourceUrl=new URL('../src/features/library/services/album-tree.ts',import.meta.url);
const source=await readFile(sourceUrl,'utf8');
const {code}=await transformWithEsbuild(source,fileURLToPath(sourceUrl),{loader:'ts'});
const moduleUrl=`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const {albumContains,groupBooksByAlbumPath}=await import(moduleUrl);

const authors=Array.from({length:10},(_,index)=>`Author ${index}`);
const paths=authors.flatMap(author=>Array.from({length:5},(_,index)=>`${author}/Series ${index}`));
const albums=paths.flatMap(path=>[path,`${path}/Volume 1`,`${path}/Volume 1/Arc`]);
const books=Array.from({length:5000},(_,index)=>({
  id:`book-${index}`,
  album:albums[(index*7919+Math.floor(index/7)*104729)%albums.length],
}));

function legacyFilter(){
  return albums.map(path=>[path,books.filter(book=>albumContains(path,book.album))]);
}

function indexedGrouping(){
  const groups=groupBooksByAlbumPath(books);
  return albums.map(path=>[path,groups.get(path)??[]]);
}

function assertEquivalent(){
  const before=legacyFilter(),after=indexedGrouping();
  if(before.length!==after.length)throw new Error('Album count differs');
  for(let index=0;index<before.length;index++){
    const [path,expected]=before[index],actual=after[index][1];
    if(path!==after[index][0]||expected.length!==actual.length||expected.some((book,bookIndex)=>book!==actual[bookIndex])){
      throw new Error(`Grouping mismatch at ${path}`);
    }
  }
}

function percentile(samples,value){
  const sorted=[...samples].sort((a,b)=>a-b);
  return sorted[Math.ceil(sorted.length*value)-1];
}

function measure(run){
  const samples=[];
  for(let iteration=0;iteration<35;iteration++){
    const start=performance.now();run();const elapsed=performance.now()-start;
    if(iteration>=5)samples.push(elapsed);
  }
  return {p50:percentile(samples,.5),p95:percentile(samples,.95)};
}

assertEquivalent();
const before=measure(legacyFilter);
const after=measure(indexedGrouping);
console.log(JSON.stringify({
  fixture:{books:books.length,albumPaths:albums.length,uniqueBookAlbums:new Set(books.map(book=>book.album)).size,maxDepth:3},
  warmupRuns:5,measuredRuns:30,
  legacyFilterMs:{p50:Number(before.p50.toFixed(2)),p95:Number(before.p95.toFixed(2))},
  indexedGroupingMs:{p50:Number(after.p50.toFixed(2)),p95:Number(after.p95.toFixed(2))},
  p50Speedup:Number((before.p50/after.p50).toFixed(2)),
  membershipAndOrder:'identical',
  note:'Synthetic Node microbenchmark; excludes React render, title/search filters, sort, browser and Android.'
},null,2));
