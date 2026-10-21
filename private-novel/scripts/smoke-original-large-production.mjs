// Endpoint-only 40MiB synthetic capacity probe. Never imports/reads real stories.
import {randomUUID,createHash} from 'node:crypto';
const origin='https://thu-phong-private.pages.dev',id=randomUUID(),sourceId=randomUUID();
const raw=Buffer.alloc(40*1024*1024,97),sha=createHash('sha256').update(raw).digest('hex');
const snapshot={format:'thu-phong-cloud',version:1,book:{id,title:'Synthetic original capacity probe',author:'',createdAt:1,updatedAt:1,status:'ready',chapterCount:1,charCount:3},chapters:[{id:randomUUID(),bookId:id,order:0,title:'Synthetic',text:'AAA',revision:1,sourceId:''}],names:[]};
const json=JSON.stringify(snapshot),snapshotSha=createHash('sha256').update(json).digest('hex');
const descriptor={version:1,sourceId,name:'synthetic40MiB.txt',relativePath:'Synthetic/synthetic40MiB.txt',encoding:'utf-8',sha256:sha,bytes:raw.length};
async function checked(path,init,status){const response=await fetch(origin+'/api/cloud/'+path,{...init,headers:{Origin:origin,'X-Original-Probe':'capacity',...init?.headers},signal:AbortSignal.timeout(180000)});if(response.status!==status)throw new Error(`Synthetic ${init?.method??'GET'} HTTP${response.status}, expected${status}`);return response;}
let created=false;const started=Date.now();
try{
 await checked(`books/${id}`,{method:'PUT',headers:{'Content-Type':'application/json','X-Book-Title':encodeURIComponent(snapshot.book.title),'X-Content-SHA256':snapshotSha},body:json},201);created=true;
 await checked(`books/${id}/originals/${sourceId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(descriptor)},201);
 await checked(`books/${id}/originals/${sourceId}/data`,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:raw},201);
 const response=await checked(`books/${id}/originals/${sourceId}/data`,undefined,200),hash=createHash('sha256');let received=0;
 for await(const chunk of response.body){received+=chunk.length;hash.update(chunk);}
 if(received!==raw.length||hash.digest('hex')!==sha)throw new Error('Synthetic40MiB returned bytes or SHA differ');
 console.log(JSON.stringify({synthetic:true,production40MiB:true,shaVerified:true,wallMs:Date.now()-started,workerCpu:'not measured',workerPeakRAM:'not measured',fullImporter:'not tested here'}));
}finally{if(created){await checked(`books/${id}`,{method:'DELETE'},200);await checked(`books/${id}/originals/${sourceId}/data`,undefined,410);console.log('Synthetic capacity book tombstoned; originalGET410; ledger reservation retained.');}}
