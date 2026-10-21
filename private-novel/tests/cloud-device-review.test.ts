import 'fake-indexeddb/auto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type {D1Database,R2Bucket} from '@cloudflare/workers-types';
import {handleCloudLibrary,type CloudLibraryEnv} from '../server/cloud-library';
import {db,deleteBook} from '../src/core/db';
import {connectCloudDeviceFromLocation,initializeCloudDevice,forgetCloudDevice,getCloudDeviceToken,CLOUD_DEVICE_TOKEN_KEY,buildCloudDeviceLink} from '../src/features/sync-cloud/services/cloud-device';
import {downloadCloudBook,syncLocalBooks,listCloudBooks} from '../src/features/sync-cloud/services/cloud-client';
import {createCloudSnapshot,contentHash} from '../src/features/sync-cloud/services/cloud-snapshot';

// Public synthetic credentials, never production capability material.
const token='1'.repeat(64), other='2'.repeat(64), origin='https://example.test';
const id='00000000-0000-4000-8000-000000000001';
const ack=`cloud-uploaded:${origin}:${id}`;
const passwordHash=`pbkdf2-sha256:600000:${'a'.repeat(32)}:${'a'.repeat(64)}`;
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const opened:DatabaseSync[]=[];
beforeEach(async()=>{
  await db.delete();await db.open();
  vi.stubGlobal('location',{origin,pathname:'/',search:'',hash:''});
  vi.stubGlobal('history',{state:{keep:true},replaceState:vi.fn()});
  vi.stubGlobal('navigator',{storage:{estimate:async()=>({})}});
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();for(const sqlite of opened.splice(0))sqlite.close();});
async function connect(value=token){location.hash=`#cloud-connect=${value}`;await connectCloudDeviceFromLocation();}
async function seed(){
  await db.books.add({id,title:'Synthetic review',author:'',status:'ready',chapterCount:1,charCount:2,createdAt:1,updatedAt:1});
  await db.chapters.add({id:'00000000-0000-4000-8000-000000000002',bookId:id,order:0,title:'Chapter',text:'正文',sourceId:'',revision:1});
  await db.sources.add({id:'source',bookId:id,name:'fixture.txt',relativePath:'',encoding:'utf8',sha256:digest('source'),bytes:6,blob:new Blob(['source'])});
  await db.dictionaries.add({kind:'vp',name:'fixture',sha256:digest('字=word'),updatedAt:1,blob:new Blob(['字=word'])});
}
function server(){
  const sqlite=new DatabaseSync(':memory:');opened.push(sqlite);
  for(const file of ['0001_auth.sql','0002_cloud_library.sql','0003_cloud_book_deletions.sql','0004_cloud_book_albums.sql','0005_cloud_originals.sql'])sqlite.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  sqlite.prepare('INSERT INTO sessions VALUES (?,?)').run(digest(other),Date.now()+60000);
  const prepare=vi.fn((sql:string)=>{let args:SQLInputValue[]=[];return {
    bind(...values:SQLInputValue[]){args=values;return this;},
    async first(){return sqlite.prepare(sql).get(...args)??null;},
    async all(){return {success:true,results:sqlite.prepare(sql).all(...args)};},
    async run(){return {success:true,meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};},
  };});
  const env:CloudLibraryEnv={DB:{prepare} as unknown as D1Database,AUTH_PASSWORD_HASH:passwordHash,CLOUD_ACCESS_TOKEN_HASH:digest(token),LIBRARY_BUCKET:{} as R2Bucket};
  const request=(headers:HeadersInit={Authorization:`Bearer ${token}`},method='GET',path='/api/cloud/books')=>new Request(origin+path,{method,headers});
  return {env,prepare,request,run:(req:Request)=>handleCloudLibrary(req,env)};
}

describe('independent device security review',()=>{
  it('accepts SHA-256 capability with legacy password configured without consulting sessions',async()=>{
    const s=server();const response=await s.run(s.request());expect(response.status).toBe(200);
    expect(await response.json()).toEqual({books:[],cursor:null});
    expect(s.prepare.mock.calls.every(([sql])=>!sql.includes('sessions'))).toBe(true);
  });
  it('does not authenticate cookies, query credentials, hash values, multiple or malformed bearer credentials',async()=>{
    const s=server();
    for(const Authorization of ['',`Bearer ${other}`,`Bearer ${digest(token)}`,`Bearer  ${token}`,`Bearer ${token}, Bearer ${token}`,`Basic ${token}`,`Bearer ${token.toUpperCase().replace('1','A')}`]){
      const response=await s.run(s.request({Authorization,Cookie:`__Host-session=${other}`},'GET',`/api/cloud/books?token=${token}&cloud-connect=${token}`));
      expect(response.status).toBe(401);expect(await response.json()).toEqual({error:'unauthorized'});
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    }
    expect(s.prepare).not.toHaveBeenCalled();
  });
  it('fails closed on empty, malformed and null configured hashes rather than using a valid cookie',async()=>{
    const s=server();
    for(const invalid of ['',token+'0','not-a-hash',digest(token)+'\n',digest(token)+'\r\n',null]){
      s.env.CLOUD_ACCESS_TOKEN_HASH=invalid as unknown as string;
      const response=await s.run(s.request({Authorization:`Bearer ${token}`,Cookie:`__Host-session=${other}`}));expect(response.status).toBe(503);
      expect(await response.text()).not.toContain(other);
    }
    expect(s.prepare).not.toHaveBeenCalled();
    delete s.env.CLOUD_ACCESS_TOKEN_HASH;
    expect((await s.run(s.request({Cookie:`__Host-session=${other}`}))).status).toBe(200);
  });
  it('requires exact Origin before unsafe routing and hides binding failures',async()=>{
    const s=server();
    for(const Origin of ['',origin+'.evil.test','null','http://example.test']){
      expect((await s.run(s.request({Authorization:`Bearer ${token}`,Origin},'PUT',`/api/cloud/books/${id}`))).status).toBe(403);
    }
    expect(s.prepare).not.toHaveBeenCalled();
    s.prepare.mockImplementation(()=>{throw new Error(`Sensitive binding ${token}`);});
    const response=await s.run(s.request());expect(response.status).toBe(503);expect(await response.text()).not.toContain(token);
    s.env.LIBRARY_BUCKET=undefined;expect((await s.run(s.request())).status).toBe(503);
    s.env.DB=undefined as unknown as D1Database;expect((await s.run(s.request())).status).toBe(503);
  });
  it('outer middleware allows passwordless UI but anonymous cloud still reaches its own closed gate',async()=>{
    const s=server();
    // Middleware is compiled by tsconfig.server, where PagesFunction is global.
    // Keep that server global out of the app tsconfig while executing its code.
    const middlewarePath='../functions/_middleware';
    const {onRequest}=await import(middlewarePath) as {onRequest:(context:{env:CloudLibraryEnv;request:Request;next:()=>Promise<Response>})=>Promise<Response>};
    const invoke=async(request:Request)=>onRequest({env:s.env,request,next:()=>handleCloudLibrary(request,s.env)});
    expect((await invoke(s.request())).status).toBe(200);
    expect((await invoke(s.request({}))).status).toBe(401);
    s.env.CLOUD_ACCESS_TOKEN_HASH='';expect((await invoke(s.request())).status).toBe(503);
  });
});

describe('independent device local-data review',()=>{
  it('shares one pending bootstrap promise across StrictMode replay after fragment removal',async()=>{
    location.hash=`#cloud-connect=${token}`;
    vi.mocked(history.replaceState).mockImplementation(()=>{location.hash='';});
    const first=initializeCloudDevice(),second=initializeCloudDevice();
    expect(first).toBe(second);expect(history.replaceState).toHaveBeenCalledOnce();
    expect(await first).toBe(true);expect(await second).toBe(true);expect(await getCloudDeviceToken()).toBe(token);
  });
  it('strips the fragment synchronously before DB access and never consumes query credentials',async()=>{
    location.pathname='/reader';location.search='?view=1';location.hash=`#cloud-connect=${token}`;
    const get=vi.spyOn(db.settings,'get');
    const replace=vi.mocked(history.replaceState);replace.mockImplementation(()=>{expect(get).not.toHaveBeenCalled();});
    const pending=connectCloudDeviceFromLocation();expect(replace).toHaveBeenCalledWith({keep:true},'','/reader?view=1');
    expect(await pending).toBe(true);expect(await getCloudDeviceToken()).toBe(token);
    location.hash='';location.search=`?cloud-connect=${other}`;expect(await connectCloudDeviceFromLocation()).toBe(false);
    expect(await getCloudDeviceToken()).toBe(token);expect(buildCloudDeviceLink(token)).toBe(`${origin}/#cloud-connect=${token}`);
  });
  it('removes malformed fragment material without persisting it or exposing it in errors',async()=>{
    await connect();
    for(const fragment of [`#cloud-connect=${other}&next=https://evil.test`,`#cloud-connect=${other.toUpperCase()}ZZ`,`#cloud-connect=%31${token}`]){
      location.hash=fragment;await expect(connectCloudDeviceFromLocation()).rejects.not.toThrow(other);
      expect(history.replaceState).toHaveBeenLastCalledWith({keep:true},'','/');
      expect(await getCloudDeviceToken()).toBe(token);
    }
  });
  it('same-token connect keeps ACKs; rotation and forgetting remove only current-origin ACKs and preserve user data',async()=>{
    await seed();await connect();
    const otherAck=`cloud-uploaded:https://other.test:${id}`;
    await db.settings.bulkPut([{key:ack,value:{sha256:token}},{key:otherAck,value:true},{key:'reader',value:{fontSize:24}}]);
    await connect();expect(await db.settings.get(ack)).toBeDefined();
    await connect(other);expect(await db.settings.get(ack)).toBeUndefined();
    await db.settings.put({key:ack,value:true});await forgetCloudDevice();
    expect(await getCloudDeviceToken()).toBeUndefined();expect(await db.settings.get(ack)).toBeUndefined();
    expect(await db.settings.get(otherAck)).toBeDefined();expect(await db.settings.get('reader')).toBeDefined();
    expect(await db.books.count()).toBe(1);expect(await db.chapters.count()).toBe(1);expect(await db.sources.count()).toBe(1);expect(await db.dictionaries.count()).toBe(1);
  });
  it('rolls credential and ACK changes back together if a persistence hook fails',async()=>{
    await connect();await db.settings.put({key:ack,value:true});
    const fail=(_changes:unknown,key:unknown)=>{if(key===CLOUD_DEVICE_TOKEN_KEY)throw new Error('synthetic quota');};
    db.settings.hook('updating',fail);
    try{await expect(connect(other)).rejects.toThrow('Không thể lưu');}finally{db.settings.hook('updating').unsubscribe(fail);}
    expect(await getCloudDeviceToken()).toBe(token);expect(await db.settings.get(ack)).toBeDefined();
    const failDelete=(key:unknown)=>{if(key===CLOUD_DEVICE_TOKEN_KEY)throw new Error('synthetic quota');};
    db.settings.hook('deleting',failDelete);
    try{await expect(forgetCloudDevice()).rejects.toThrow('Không thể xóa');}finally{db.settings.hook('deleting').unsubscribe(failDelete);}
    expect(await getCloudDeviceToken()).toBe(token);expect(await db.settings.get(ack)).toBeDefined();
  });
  it('sends capability only in Authorization to private API and rejects a malicious download ID before network',async()=>{
    await connect();
    const fetch=vi.fn(async(path:string,init?:RequestInit)=>{
      expect(path.startsWith('/api/cloud/')).toBe(true);expect(path).not.toContain(token);
      expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${token}`);
      expect(init?.redirect).toBe('error');return Response.json({books:[],cursor:null});
    });vi.stubGlobal('fetch',fetch);await listCloudBooks();expect(fetch).toHaveBeenCalledOnce();fetch.mockClear();
    await expect(downloadCloudBook({id:'../../../auth/login',title:'bad',sha256:token,bytes:1,updatedAt:1})).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('cannot recreate old ACK after forget while PUT is in flight',async()=>{
    await connect();await seed();
    vi.stubGlobal('fetch',vi.fn(async(_path:string,init?:RequestInit)=>{
      if(init?.method!=='PUT')return Response.json({books:[],cursor:null});
      await forgetCloudDevice();return Response.json({id,sha256:new Headers(init.headers).get('X-Content-SHA256')});
    }));
    await expect(syncLocalBooks()).rejects.toThrow();expect(await db.settings.get(ack)).toBeUndefined();expect(await db.books.count()).toBe(1);
  });
  it('rejects a download whose credential changes during precommit storage estimate without importing any data',async()=>{
    await connect();await seed();const bytes=await createCloudSnapshot(id),sha256=await contentHash(bytes);await deleteBook(id);
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/json'}})));
    vi.stubGlobal('navigator',{storage:{estimate:async()=>{await connect(other);return {};}}});
    await expect(downloadCloudBook({id,title:'remote',sha256,bytes:bytes.length,updatedAt:1})).rejects.toThrow();
    expect(await db.books.count()).toBe(0);expect(await db.chapters.count()).toBe(0);expect(await db.names.count()).toBe(0);expect(await db.settings.get(ack)).toBeUndefined();
  });
});
