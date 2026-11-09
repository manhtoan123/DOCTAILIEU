import {afterEach,describe,expect,it,vi} from 'vitest';
import {handleAiTranslate,resetAiKeyState} from '../server/ai-translate';
import {aiTranslate} from '../src/features/ai/services/ai-translate';
import {AI_STREAM_TYPE} from '../src/features/ai/services/ai-stream-protocol';
import {keyHealthId,readKeyHealth,reserveKey,releaseKey} from '../server/ai-key-health';
const env={GEMINI_API_KEY:'synthetic-stream-key'},encoder=new TextEncoder(),model='gemma-4-26b-a4b-it';
const request=(signal?:AbortSignal)=>new Request('https://reader.example/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json',Accept:AI_STREAM_TYPE},body:JSON.stringify({text:'你好',model}),signal});
function provider(){let sink!:ReadableStreamDefaultController<Uint8Array>;const cancel=vi.fn(),stream=new ReadableStream<Uint8Array>({start(c){sink=c;},cancel});return {response:new Response(stream,{headers:{'Content-Type':'text/event-stream'}}),cancel,push:(data:unknown)=>sink.enqueue(encoder.encode('data: '+JSON.stringify(data)+'\r\n\r\n')),raw:(text:string)=>sink.enqueue(encoder.encode(text)),end:()=>sink.close()};}
const chunk=(text:string,stop=false,thought=false)=>({candidates:[{index:0,content:{parts:[{text,...(thought?{thought:true}:{})}]},...(stop?{finishReason:'STOP'}:{})}],...(stop?{usageMetadata:{promptTokenCount:10,candidatesTokenCount:4}}:{})});
const events=(text:string)=>text.trim().split('\n').map(row=>JSON.parse(row));
async function setup(){const upstream=provider();vi.spyOn(globalThis,'fetch').mockResolvedValue(upstream.response);const response=await handleAiTranslate(request(),env),result=response.text().then(events);await vi.waitFor(()=>expect(fetch).toHaveBeenCalledOnce());return {upstream,response,result};}
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();resetAiKeyState();});
describe('AI activity stream server',()=>{
  it('accepts first answer inside 45s and refreshes idle with new answer text',async()=>{
    vi.useFakeTimers();const {upstream,response,result}=await setup();
    expect(response.headers.get('Content-Type')).toContain(AI_STREAM_TYPE);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`);
    await vi.advanceTimersByTimeAsync(44000);upstream.push(chunk('Xin '));await vi.advanceTimersByTimeAsync(6000);upstream.push(chunk('chào.',true));upstream.end();
    const rows=await result;expect(rows.at(-1)).toMatchObject({type:'result',status:200,data:{result:'Xin chào.',model,finishReason:'STOP',inputTokens:10,outputTokens:4}});
    expect(rows.some(row=>row.type==='progress')).toBe(true);expect(vi.getTimerCount()).toBe(0);
  });
  it('times out first silence at 45s; comments, usage and empty parts do not reset it',async()=>{
    vi.useFakeTimers();const {upstream,result}=await setup();
    for(let i=0;i<3;i++){await vi.advanceTimersByTimeAsync(6000);upstream.raw(': keepalive\n\n');upstream.push({candidates:[],usageMetadata:{promptTokenCount:10}});upstream.push(chunk(''));}
    await vi.advanceTimersByTimeAsync(27000);const rows=await result;expect(rows).toHaveLength(2);
    // The first row is safe lease evidence emitted once the server reserved a key; it is not content activity.
    expect(rows[0]).toMatchObject({type:'progress',lease:{requestId:expect.stringMatching(/^[a-f0-9-]{36}$/),leaseIdHash:expect.stringMatching(/^[a-f0-9]{32}$/),keySlot:1}});
    expect(rows[1]).toMatchObject({type:'result',status:504,data:{error:'ai_timeout'}});expect(upstream.cancel).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
  });
  it('aborts 7s after the last actual content even if the transport sends bytes',async()=>{
    vi.useFakeTimers();const {upstream,result}=await setup();await vi.advanceTimersByTimeAsync(44000);upstream.push(chunk('Xin '));await vi.advanceTimersByTimeAsync(6000);upstream.raw(':alive\n\n');await vi.advanceTimersByTimeAsync(1000);
    expect((await result).at(-1)).toMatchObject({status:504,data:{error:'ai_timeout'}});expect(upstream.cancel).toHaveBeenCalledOnce();
  });
  it.each([false,true])('thought never resets first or idle deadline, afterAnswer=%s',async afterAnswer=>{
    vi.useFakeTimers();const {upstream,result}=await setup();await vi.advanceTimersByTimeAsync(44000);
    if(afterAnswer){upstream.push(chunk('Xin '));await vi.advanceTimersByTimeAsync(6000);}
    upstream.push(chunk('PRIVATE',false,true));await vi.advanceTimersByTimeAsync(1000);
    const rows=await result;expect(rows.at(-1)).toMatchObject({status:504,data:{error:'ai_timeout'}});expect(JSON.stringify(rows)).not.toContain('PRIVATE');expect(upstream.cancel).toHaveBeenCalledOnce();
  });
  it('enforces 180s total even while content keeps arriving',async()=>{
    vi.useFakeTimers();const {upstream,result}=await setup();for(let i=0;i<29;i++){await vi.advanceTimersByTimeAsync(6000);upstream.push(chunk('a'));}await vi.advanceTimersByTimeAsync(6000);
    expect((await result).at(-1)).toMatchObject({status:504,data:{error:'ai_timeout'}});expect(upstream.cancel).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
  });
  it('keeps the key reserved while output is active and releases it only after the stream finishes',async()=>{
    vi.useFakeTimers();const {upstream,result}=await setup(),id=await keyHealthId(env.GEMINI_API_KEY);await vi.advanceTimersByTimeAsync(44000);upstream.push(chunk('Xin '));await vi.advanceTimersByTimeAsync(1000);
    expect(await reserveKey(id,model)).toBeUndefined();upstream.push(chunk('chào.',true));upstream.end();expect((await result).at(-1).status).toBe(200);expect((await readKeyHealth()).get(id)?.busy_until).toBe(0);
  });
  it('cancels provider and releases key when the browser cancels the response body',async()=>{
    vi.useFakeTimers();const upstream=provider();vi.spyOn(globalThis,'fetch').mockResolvedValue(upstream.response);const response=await handleAiTranslate(request(),env);await vi.waitFor(()=>expect(fetch).toHaveBeenCalledOnce());await response.body!.cancel();
    await vi.waitFor(()=>expect(upstream.cancel).toHaveBeenCalledOnce());const id=await keyHealthId(env.GEMINI_API_KEY);await vi.waitFor(async()=>expect((await readKeyHealth()).get(id)?.busy_until).toBe(0));expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['missing STOP','MAX_TOKENS','invalid usage','invalid JSON','copied source'])('does not complete on %s',async kind=>{
    const {upstream,result}=await setup();
    if(kind==='invalid JSON')upstream.raw('data: {invalid}\n\n');
    else if(kind==='invalid usage')upstream.push({...chunk('Xin chào.',true),usageMetadata:{candidatesTokenCount:-1}});
    else if(kind==='MAX_TOKENS')upstream.push({candidates:[{content:{parts:[{text:'Xin'}]},finishReason:'MAX_TOKENS'}]});
    else if(kind==='copied source')upstream.push(chunk('Xin chào 你好',true));
    else upstream.push(chunk('Xin'));
    upstream.end();const last=(await result).at(-1);expect(last.status).toBe(502);expect(last.data.result).toBeUndefined();
  });
  it('keeps late CAS release from clearing a newer lease',async()=>{
    vi.useFakeTimers();const old=await reserveKey('synthetic-cas',model,undefined,185000);await vi.advanceTimersByTimeAsync(185001);const next=await reserveKey('synthetic-cas',model,undefined,185000);await releaseKey('synthetic-cas',old!,undefined,185000);expect((await readKeyHealth()).get('synthetic-cas')?.busy_until).toBe(next);await releaseKey('synthetic-cas',next!,undefined,185000);expect((await readKeyHealth()).get('synthetic-cas')?.busy_until).toBe(0);
  });
});
describe('AI activity stream browser client',()=>{
  const valid={result:'Xin chào.',model,finishReason:'STOP',inputTokens:10,outputTokens:4};
  function browserStream(){let sink!:ReadableStreamDefaultController<Uint8Array>;const cancel=vi.fn();const response=new Response(new ReadableStream<Uint8Array>({start(c){sink=c;},cancel}),{headers:{'Content-Type':AI_STREAM_TYPE}});vi.spyOn(globalThis,'fetch').mockResolvedValue(response);return {push:(value:unknown)=>sink.enqueue(encoder.encode(JSON.stringify(value)+'\n')),end:()=>sink.close(),cancel};}
  it('negotiates streaming and continues with activity on real activity, then validates the final result',async()=>{
    vi.useFakeTimers();const stream=browserStream(),pending=aiTranslate({text:'你好',model});await vi.advanceTimersByTimeAsync(44000);stream.push({type:'progress'});await vi.advanceTimersByTimeAsync(6000);stream.push({type:'progress'});await vi.advanceTimersByTimeAsync(6000);stream.push({type:'result',status:200,headers:{'X-AI-Parallel':'2'},data:valid});stream.end();expect(await pending).toMatchObject({...valid,parallel:2});expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toMatchObject({Accept:AI_STREAM_TYPE});expect(vi.getTimerCount()).toBe(0);
  });
  it('retains safe status/retry-after metadata from the final error envelope',async()=>{
    const stream=browserStream(),pending=aiTranslate({text:'你好',model}).catch(e=>e);stream.push({type:'result',status:429,headers:{'Retry-After':'12','X-AI-Failure-Reason':'upstream_http'},data:{error:'ai_rate_limited'}});stream.end();expect(await pending).toMatchObject({code:'ai_rate_limited',status:429,retryAfterMs:12000});
  });
  it('reports safe lease evidence from progress before the result and never treats it as content activity',async()=>{
    vi.useFakeTimers();const stream=browserStream(),leases:{requestId:string;leaseIdHash:string;keySlot?:number;keysAvailable?:number}[]=[];
    let outcome:unknown;
    const pending=aiTranslate({text:'你好',model},undefined,lease=>leases.push(lease)).then(value=>outcome=value,error=>outcome=error);
    const lease={requestId:'11111111-1111-4111-8111-111111111111',leaseIdHash:'a'.repeat(32),keySlot:2,keysAvailable:2};
    stream.push({type:'progress',lease});await vi.advanceTimersByTimeAsync(1);
    expect(leases).toHaveLength(1);expect(leases[0]).toMatchObject(lease);
    // Lease evidence must not switch first-text waiting to the shorter idle window.
    await vi.advanceTimersByTimeAsync(44000);expect(outcome).toBeUndefined();
    await vi.advanceTimersByTimeAsync(12000);expect(await pending).toMatchObject({code:'ai_timeout',reason:'client_deadline'});
    expect(leases).toHaveLength(1);expect(vi.getTimerCount()).toBe(0);
  });
  it('carries safe lease evidence on the final result and rejects a credential-shaped lease field',async()=>{
    const id='22222222-2222-4222-8222-222222222222',hash='b'.repeat(32),stream=browserStream(),leases:unknown[]=[];
    const pending=aiTranslate({text:'你好',model},undefined,lease=>leases.push(lease));
    stream.push({type:'result',status:200,headers:{'X-AI-Parallel':'2','X-AI-Request-Id':id,'X-AI-Lease-Id-Hash':hash,'X-AI-Key-Slot':'2','X-AI-Keys-Available':'2'},data:valid});stream.end();
    expect(await pending).toMatchObject({parallel:2,debug:{requestId:id,leaseIdHash:hash,keySlot:2,keysAvailable:2}});expect(leases).toHaveLength(1);
    const broken=browserStream(),failed=aiTranslate({text:'你好',model}).catch(error=>error);
    broken.push({type:'progress',lease:{requestId:id,leaseIdHash:'sk-secret-credential',keySlot:2}});broken.end();
    expect(await failed).toMatchObject({code:'ai_network_error',reason:'body_stream'});
  });
  it('does not turn progress plus premature EOF into a completed translation',async()=>{
    const stream=browserStream(),pending=aiTranslate({text:'你好',model}).catch(e=>e);stream.push({type:'progress'});stream.end();expect(await pending).toMatchObject({code:'ai_network_error',reason:'body_stream'});
  });
  it('bounds the first wait when an activity stream stays silent',async()=>{
    vi.useFakeTimers();const stream=browserStream(),pending=aiTranslate({text:'你好',model}).catch(e=>e);await vi.advanceTimersByTimeAsync(55000);expect(await pending).toMatchObject({code:'ai_timeout',reason:'client_deadline'});expect(stream.cancel).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
  });
});
