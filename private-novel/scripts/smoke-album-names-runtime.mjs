import {spawn,execFileSync} from 'node:child_process';
import {openSync,closeSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';
const directory='.dsh-tmp/album-names',persist=resolve(directory,'runtime-state-'+Date.now()),origin='http://127.0.0.1:8794';mkdirSync(directory,{recursive:true});
const cli=resolve('node_modules/wrangler/bin/wrangler.js'),log=openSync(directory+'/runtime-server.log','w'),env={...process.env,WRANGLER_SEND_METRICS:'false'};
let child;
try{
 await new Promise((resolve,reject)=>{const probe=createServer();probe.once('error',reject);probe.listen(8794,'127.0.0.1',()=>probe.close(resolve));});
 for(const migration of ['0002_cloud_library.sql','0003_cloud_book_deletions.sql','0010_shared_state.sql'])execFileSync(process.execPath,[cli,'d1','execute','thu-phong-auth','--local','--persist-to',persist,'--file','migrations/'+migration],{env,stdio:['ignore',log,log],windowsHide:true});
 child=spawn(process.execPath,[cli,'pages','dev','dist','--port','8794','--inspector-port','0','--persist-to',persist,'--show-interactive-dev-session=false'],{env,stdio:['ignore',log,log],windowsHide:true});
 let ready=false;for(let n=0;n<90;n++){try{const r=await fetch(origin+'/api/state?after=0');if(r.status===200){ready=true;break;}}catch{}if(child.exitCode!==null)throw Error('Local Pages runtime exited; see runtime-server.log');await new Promise(r=>setTimeout(r,1000));}assert(ready,'Local Pages timeout');
 const record={kind:'album-name',key:JSON.stringify(['Synthetic Runtime Author','甲']),value:'Tên tổng hợp'},id=createHash('sha256').update(JSON.stringify(['album-name','',record.key])).digest('hex');
 const put=(record,baseRevision)=>fetch(origin+'/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,baseRevision,record})});
 let response=await put(record,0);assert.equal(response.status,200);const created=(await response.json()).row;assert.deepEqual(created.record,record);
 response=await put({...record,value:'Stale'},0);assert.equal(response.status,409);
 response=await put({...record,value:null},created.revision);assert.equal(response.status,200);
 response=await fetch(origin+'/api/state?after=0');assert.equal(response.status,200);const page=await response.json();assert(page.rows.some(row=>row.id===id&&row.record.value===null));
 response=await put({...record,bookId:'unrelated'},0);assert.equal(response.status,400);
 const report={status:'PASS',runtime:'Wrangler local Pages + workerd + isolated D1',http:[200,409,200,200,400],tombstone:true,remoteWrites:0,sourceWrites:0};writeFileSync(directory+'/runtime-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{if(child?.pid&&child.exitCode===null){try{execFileSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});}catch{}}closeSync(log);}
