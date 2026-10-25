// Profiles a LOCAL workerd inspector, optionally using isolated remote D1.
// Sampling results identify hotspots; they are not Cloudflare invocation CPU.
import {mkdir,writeFile} from 'node:fs/promises';
import WebSocket from 'ws';
import {serverConvertCases} from './lib/server-convert-cases.mjs';
const directory='.dsh-tmp/server-convert';await mkdir(directory,{recursive:true});
const targets=await(await fetch('http://127.0.0.1:9296/json/list',{signal:AbortSignal.timeout(10000)})).json();
if(targets.length!==1)throw Error('Expected one isolated Worker inspector');
const url=new URL(targets[0].webSocketDebuggerUrl);
if(url.hostname!=='127.0.0.1'||url.port!=='9296'||url.protocol!=='ws:')throw Error('Inspector must stay on loopback');
const socket=new WebSocket(url,{headers:{Origin:'http://127.0.0.1:9296'}}),pending=new Map();let next=0;
await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',()=>reject(Error('Inspector connection failed')),{once:true});});
socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(!message.id)return;const task=pending.get(message.id);if(!task)return;pending.delete(message.id);clearTimeout(task.timer);message.error?task.reject(Error(message.error.message)):task.resolve(message.result);});
const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('Inspector command timeout'));},30000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
const summary=[];
try{
 await command('Profiler.enable');await command('Profiler.setSamplingInterval',{interval:100});
 for(const sample of serverConvertCases){
  await command('Profiler.start');const results=[];
  for(let repeat=0;repeat<30;repeat++){
   const start=performance.now(),response=await fetch('http://127.0.0.1:8796/convert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:sample.text,names:sample.names}),signal:AbortSignal.timeout(30000)});
   const result=await response.json();results.push({repeat,status:response.status,roundTripMs:performance.now()-start,diagnostics:result.diagnostics,error:result.error});
  }
  const {profile}=await command('Profiler.stop');await writeFile(`${directory}/profile-${sample.id}.cpuprofile`,JSON.stringify(profile));
  const totals=new Map();for(const [i,id]of (profile.samples??[]).entries())totals.set(id,(totals.get(id)??0)+(profile.timeDeltas?.[i]??0));
  const hotspots=profile.nodes.map(node=>({function:node.callFrame.functionName,url:node.callFrame.url,line:node.callFrame.lineNumber+1,sampledSelfMs:(totals.get(node.id)??0)/1000})).filter(node=>node.sampledSelfMs>0&&!['(idle)','(root)'].includes(node.function)).sort((a,b)=>b.sampledSelfMs-a.sampledSelfMs).slice(0,12);
  const row={sample:sample.id,inputLength:sample.text.length,nameCount:sample.names.length,results,hotspots};summary.push(row);console.log(JSON.stringify({sample:sample.id,statuses:[...new Set(results.map(r=>r.status))],hotspots:hotspots.slice(0,5)}));
 }
 await writeFile(`${directory}/profile-summary.json`,JSON.stringify({runtime:'local workerd with isolated remote D1',cloudflareCpu:false,summary},null,2));
}finally{socket.close();}
