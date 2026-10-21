// Explicit real Gemini fixture smoke; never reads or uploads any novel.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base='https://thu-phong-private.pages.dev';
const body={text:'林儿推开窗，看见张明站在院子里。他说：“等了十分钟，我们终于可以出发了。”',names:{'林儿':'Lâm Nhi','张明':'Trương Minh'},model:'gemini-3.5-flash',temperature:0,userPromptTemplate:'{{name}}Dịch sang {{language}} và chỉ trả bản dịch:\n{{text}}'};
for(const [label,auth,origin,expected] of [['anonymous-synthetic',false,base,200],['foreign-origin-synthetic',false,'https://other.example',200]]){
 const start=performance.now();const response=await fetch(base+'/api/ai/translate',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','User-Agent':'Mozilla/5.0'},body:JSON.stringify(body),signal:AbortSignal.timeout(70000)});
 const data=await response.json();console.log(label,response.status,Math.round(performance.now()-start)+'ms',JSON.stringify(data));assert.equal(response.status,expected);
 if(response.status===200){assert.equal(data.finishReason,'STOP');assert.match(data.result,/Lâm Nhi/);assert.match(data.result,/Trương Minh/);assert.match(data.result,/mười phút/);}
}
const html=await(await fetch(base,{headers:{'User-Agent':'Mozilla/5.0'}})).text();const built=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');const asset=built.match(/assets\/index-[\w-]+\.js/)[0];assert.ok(html.includes(asset));console.log('Canonical deployed bundle verified.');

const selected=await fetch(base+'/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'你好。',model:'gemini-3.8-flash',temperature:0}),signal:AbortSignal.timeout(70000)});
const selectedData=await selected.json();
console.log('Additional selected model:',JSON.stringify({status:selected.status,model:selectedData.model,error:selectedData.error,finishReason:selectedData.finishReason}));
if(selected.ok){assert.equal(selectedData.model,'gemini-3.8-flash');assert.equal(selectedData.finishReason,'STOP');}
