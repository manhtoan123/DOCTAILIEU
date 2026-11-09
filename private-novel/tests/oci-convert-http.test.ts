import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rename,rm,stat,writeFile} from 'node:fs/promises';
import {request,type RequestOptions} from 'node:https';
import type {AddressInfo} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createConvertServer} from '../convert-server/service';
import {loadLanguageEngine} from '../src/features/names-convert/services/load-language-engine';
import {MAX_CONVERT_BODY,MAX_CONVERT_TEXT,PROFILE_TYPE,type ProfileFile,type ProfileStatus} from '../src/features/names-convert/services/convert-server-protocol';
import {convertTestTls} from './helpers/convert-tls';

const origin='https://reader.example.test';
const row=(kind:ProfileFile['kind'],name:string,data:Buffer|string)=>{
  const blob=Buffer.from(data);
  return {blob,entry:{kind,name,bytes:blob.length,sha256:createHash('sha256').update(blob).digest('hex')}};
};
function pack(rows:ReturnType<typeof row>[]){
  const manifest=Buffer.from(JSON.stringify(rows.map(r=>r.entry)));
  const header=Buffer.alloc(4);
  header.writeUInt32BE(manifest.length);
  return Buffer.concat([header,manifest,...rows.map(r=>r.blob)]);
}
const first=[
  row('vp','Vietphrase.txt','山门=sơn môn/cổng núi\n'),
  row('vp','Vietphrase-2.txt','山门=cổng đá\n'),
  row('names','Names.txt','小周=Châu\n'),
  row('names2','Pronouns.txt','吾=ta\n'),
  row('hanviet','HanViet.txt','山=sơn\n门=môn\n'),
  row('blacklist','Blacklist.txt','跳过\n'),
  row('rules','LuatNhan.txt','老{0}=lão {0}\n'),
];
const input={
  text:'小周：吾到山门。跳过\n🙂老山门。',names:[{key:'小周',value:'Tiểu Châu'},{key:'小周',value:'Châu riêng'}],
  options:{reference:true,capitalize:true,standardizePunctuation:true},
};

describe('OCI Convert over an actual mutually authenticated HTTPS socket',()=>{
  let directory:string,tls:ReturnType<typeof convertTestTls>,port:number,server:ReturnType<typeof createConvertServer>;
  let profile:string;
  beforeAll(async()=>{
    directory=await mkdtemp(join(tmpdir(),'convert-http-'));
    tls=convertTestTls(directory);
    await listen();
    await vi.waitFor(async()=>expect((await call('GET','/v1/health')).value.state).toBe('empty'));
  },20_000);
  afterAll(async()=>{
    if(server?.listening)await close();
    if(directory)await rm(directory,{recursive:true,force:true,maxRetries:5});
  });
  async function listen(){
    server=createConvertServer({directory,appOrigin:origin,tls:tls.server});
    await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    port=(server.address() as AddressInfo).port;
  }
  async function close(){await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
  function call(method:string,path:string,body?:string|Buffer,extra:RequestOptions={},auth=true){
    return new Promise<{status:number;value:any;headers:Record<string,unknown>}>((resolve,reject)=>{
      const req=request({
        hostname:'127.0.0.1',port,path,method,agent:false,
        ...(auth?tls.client:{ca:tls.client.ca}),...extra,
        headers:{Origin:origin,...(body!==undefined?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}:{}),...extra.headers},
      },res=>{
        const chunks:Buffer[]=[];
        res.on('data',chunk=>chunks.push(chunk));
        res.on('error',reject);
        res.on('end',()=>{const raw=Buffer.concat(chunks).toString();resolve({status:res.statusCode!,value:raw?JSON.parse(raw):null,headers:res.headers});});
      });
      req.on('error',reject);
      req.end(body);
    });
  }
  function upload(body:Buffer,expected:string){
    return call('PUT','/v1/profile',body,{headers:{'Content-Type':PROFILE_TYPE,'If-Match':`"${expected}"`}});
  }
  const convert=()=>call('POST','/v1/convert',JSON.stringify(input));

  it('authenticates TLS before HTTP, requires exact origin, and permits scoped preflight',async()=>{
    await expect(call('GET','/v1/health',undefined,{},false)).rejects.toThrow();
    const badOrigin=await call('OPTIONS','/v1/profile',undefined,{headers:{Origin:origin+'.invalid'}});
    expect(badOrigin.status).toBe(403);
    expect(badOrigin.headers).not.toHaveProperty('access-control-allow-origin');
    const preflight=await call('OPTIONS','/v1/profile');
    expect(preflight.status).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe(origin);
    expect((await convert()).value).toEqual({error:'empty'});
  });

  it('retains ordered original bytes and returns the exact engine tokens, including Name scope',async()=>{
    const response=await upload(pack(first),'none');
    expect(response.status).toBe(200);
    const health=response.value as ProfileStatus;
    expect(health).toMatchObject({state:'ready',files:first.map(r=>r.entry)});
    profile=health.profile!;
    const {engine}=await loadLanguageEngine(first.map(({entry,blob})=>({...entry,blob:new Blob([new Uint8Array(blob)])})));
    const expected=engine.convert(input.text,input.names,input.options);
    expect(expected.map(t=>t.targetText).join('')).toContain('Châu riêng');
    expect((await convert()).value).toEqual(expected);
    expect((await call('POST','/v1/lookup','{"source":"山门"}')).value).toEqual(engine.lookup('山门'));
    const word={...input,text:'山门',includeLookup:true};
    expect((await call('POST','/v1/convert',JSON.stringify(word))).value).toEqual({
      tokens:engine.convert(word.text,word.names,word.options),meaning:engine.lookup(word.text),
    });
    const hanviet={...input,options:{mode:'hanviet' as const,multipleMeanings:true}};
    expect((await call('POST','/v1/convert',JSON.stringify(hanviet))).value).toEqual(engine.convert(hanviet.text,hanviet.names,hanviet.options));
    const active=join(directory,'profile.bin'),moved=join(directory,'fixture-moved');
    expect(await readFile(active)).toEqual(pack(first));
    await rename(active,moved);
    try {
      for(let i=0;i<4;i++)expect((await convert()).value).toEqual(expected);
    } finally {await rename(moved,active);}
  });

  it('bounds expensive rule runs and preserves offsets across whitespace',async()=>{
    const text='字'+(' \t'.repeat(20_000))+'字， \t字';
    const response=await call('POST','/v1/convert',JSON.stringify({...input,text}));
    expect(response.status).toBe(200);
    expect(response.value.map((token:{source:string})=>token.source).join('')).toBe(text);
    const replacement=await upload(pack([row('rules','rule.txt','{0}甲甲乙=thử {0}')]),profile);
    expect(replacement.status).toBe(200);
    const expensive='甲甲乙'+'字'.repeat(40_000);
    expect((await call('POST','/v1/convert',JSON.stringify({...input,text:expensive}))).value).toEqual({error:'output_limit'});
    const marker='\uE000'+'\uE001'.repeat(100_000)+'人'.repeat(10_000);
    expect((await call('POST','/v1/convert',JSON.stringify({...input,text:marker,names:[{key:'人',value:'người'}]}))).value)
      .toEqual({error:'output_limit'});
    expect((await call('GET','/v1/health')).value.state).toBe('ready');
    const restored=await upload(pack(first),replacement.value.profile);
    expect(restored.value.profile).toBe(profile);
  });

  it('rejects wrong SHA, encoding, line format, missing precondition and oversized input',async()=>{
    const wrong=row('vp','wrong.txt','山门=lạ');
    wrong.entry.sha256='0'.repeat(64);
    for(const invalid of [wrong,row('vp','encoding.txt',Buffer.from([0xff,0xfe])),row('vp','invalid.txt','no delimiter')]){
      expect(await upload(pack([invalid]),profile)).toMatchObject({status:422,value:{error:'invalid_profile'}});
      expect((await call('GET','/v1/health')).value.profile).toBe(profile);
    }
    expect((await upload(pack(first),'none')).status).toBe(409);
    expect((await call('PUT','/v1/profile',pack(first),{headers:{'Content-Type':PROFILE_TYPE}})).status).toBe(428);
    expect((await call('POST','/v1/convert','{')).status).toBe(400);
    expect((await call('POST','/v1/convert',JSON.stringify({...input,text:'a'.repeat(MAX_CONVERT_TEXT+1)}))).status).toBe(413);
    expect((await call('POST','/v1/convert','',{headers:{'Content-Length':MAX_CONVERT_BODY+1}})).status).toBe(413);
    expect((await convert()).status).toBe(200);
  });

  it('keeps serving the previous index during staging and discards an interrupted upload',async()=>{
    const body=pack([row('vp','replacement.txt','山门=đã thay\n'.repeat(20_000))]);
    const req=request({hostname:'127.0.0.1',port,path:'/v1/profile',method:'PUT',agent:false,...tls.client,
      headers:{Origin:origin,'Content-Type':PROFILE_TYPE,'If-Match':`"${profile}"`,'Content-Length':body.length}});
    const closed=new Promise<void>(resolve=>{req.on('error',()=>{});req.once('close',resolve);});
    req.write(body.subarray(0,body.length/2));
    try {
      await vi.waitFor(async()=>expect((await stat(join(directory,'profile.next'))).size).toBeGreaterThan(0));
      expect((await convert()).value.map((t:{targetText:string})=>t.targetText).join('')).toContain('cổng đá');
      expect((await upload(body,profile)).value.error).toBe('update_in_progress');
    } finally {req.destroy();await closed;}
    await vi.waitFor(async()=>await expect(stat(join(directory,'profile.next'))).rejects.toMatchObject({code:'ENOENT'}));
    expect((await call('GET','/v1/health')).value.profile).toBe(profile);
  });

  it('reloads the committed profile on restart and persists a successful removal',async()=>{
    // Keep the cold phase observable over actual TLS with a valid synthetic file.
    const large=row('vp','large.txt','新词=nghĩa tổng hợp\n'.repeat(750_000));
    const updated=await upload(pack([...first,large]),profile);
    expect(updated.status).toBe(200);
    const next=updated.value.profile;
    await close();
    await writeFile(join(directory,'profile.next'),'interrupted fixture');
    await listen();
    const cold=await call('GET','/v1/health');
    expect(cold).toMatchObject({status:503,value:{state:'loading'},headers:{'retry-after':'2'}});
    await vi.waitFor(async()=>expect((await call('GET','/v1/health')).value).toMatchObject({state:'ready',profile:next}),{timeout:10_000});
    await expect(stat(join(directory,'profile.next'))).rejects.toMatchObject({code:'ENOENT'});
    expect((await convert()).status).toBe(200);
    expect((await upload(pack([]),next)).value).toMatchObject({state:'empty',files:[]});
    await close();
    await listen();
    await vi.waitFor(async()=>expect((await call('GET','/v1/health')).value.state).toBe('empty'));
    expect((await convert()).value.error).toBe('empty');
    await close();
    await writeFile(join(directory,'profile.bin'),'corrupt fixture');
    await listen();
    await vi.waitFor(async()=>expect((await call('GET','/v1/health')).value.state).toBe('error'));
  },30_000);
});
