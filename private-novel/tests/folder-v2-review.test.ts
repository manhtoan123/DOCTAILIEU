import 'fake-indexeddb/auto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {db} from '../src/core/db';
import {commitMappedAlbumImports} from '../src/features/library/services/albums';

beforeEach(async()=>{await db.delete();await db.open();});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
async function preview(id:string){
  await db.books.add({id,title:id,author:'',createdAt:1,updatedAt:1,status:'staging',chapterCount:1,charCount:1});
  await db.importJobs.add({jobId:id,bookId:id,phase:'preview',totalFiles:1,processedFiles:1,processedBytes:1,checkpoint:1,duplicateFiles:[],updatedAt:1});
}
describe('independent folder v2 publication review',()=>{
  it('rolls back all Albums and ready states after the last committed-job write fails',async()=>{
    await preview('one');await preview('two');
    const before=await Promise.all([db.books.toArray(),db.importJobs.toArray()]);
    const update=db.importJobs.update.bind(db.importJobs);let calls=0;
    vi.spyOn(db.importJobs,'update').mockImplementation((...args:Parameters<typeof update>)=>{
      if(++calls===2)return Promise.reject(new Error('Injected last write failure')) as ReturnType<typeof update>;
      return update(...args);
    });
    await expect(commitMappedAlbumImports([{id:'one',album:'Root/A'},{id:'two',album:'Root/B'}])).rejects.toThrow('Injected last write failure');
    expect(await Promise.all([db.books.toArray(),db.importJobs.toArray()])).toEqual(before);
  });

  it('preserves per-file BOM recognition, selected encoding, raw SHA, strict decode and blank rejection',async()=>{
    const messages:{type:string;message?:string;parts?:{text:string}[];encoding?:string;sha256?:string}[]=[];
    const scope={onmessage:null as null|((event:{data:unknown})=>Promise<void>),postMessage(message:typeof messages[number]){
      messages.push(message);
      if(message.type==='batch')queueMicrotask(()=>{void scope.onmessage!({data:{type:'ack'}});});
    }};
    vi.stubGlobal('self',scope);
    await import('../src/workers/import.worker');
    const text='第1章 开始\r\n正文🙂';
    const utf16=(be:boolean,bom=true)=>{
      const offset=bom?2:0,raw=new Uint8Array(offset+text.length*2);
      if(bom)raw.set(be?[0xfe,0xff]:[0xff,0xfe]);
      for(let i=0;i<text.length;i++){const lo=text.charCodeAt(i)&255,hi=text.charCodeAt(i)>>8;raw[offset+i*2]=be?hi:lo;raw[offset+i*2+1]=be?lo:hi;}
      return raw;
    };
    const utf8=new TextEncoder().encode(text),utf8Bom=new Uint8Array(utf8.length+3);utf8Bom.set([0xef,0xbb,0xbf]);utf8Bom.set(utf8,3);
    const cases=[
      {raw:utf16(false),selected:'utf-8',actual:'utf-16le'},
      {raw:utf16(true),selected:'utf-8',actual:'utf-16be'},
      {raw:utf8Bom,selected:'utf-16le',actual:'utf-8'},
      {raw:utf16(false,false),selected:'utf-16le',actual:'utf-16le'},
      {raw:utf16(true,false),selected:'utf-16be',actual:'utf-16be'},
      {raw:utf8,selected:'utf-8',actual:'utf-8'},
    ];
    for(const {raw,selected,actual} of cases){
      messages.length=0;
      await scope.onmessage!({data:{type:'start',file:new File([raw],'bom.txt'),title:'bom',encoding:selected,pattern:'',detect:true}});
      expect(messages.filter(message=>message.type==='error'),actual).toEqual([]);
      expect(messages.filter(message=>message.type==='batch').flatMap(message=>message.parts!).map(part=>part.text).join('')).toBe(text.replace(/\r\n/g,'\n'));
      const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
      expect(messages.at(-1)).toMatchObject({type:'done',encoding:actual,sha256});
    }
    for(const body of [new Uint8Array([0xc3,0x28]),new Uint8Array([0xff,0xfe,0x41]),'', ' \r\n\t', ' '.repeat(262145)]){
      messages.length=0;
      await scope.onmessage!({data:{type:'start',file:new File([body],'invalid.txt'),title:'invalid',encoding:'utf-8',pattern:'',detect:true}});
      expect(messages.at(-1)?.type).toBe('error');expect(messages.some(message=>message.type==='done')).toBe(false);
    }
  });
});
