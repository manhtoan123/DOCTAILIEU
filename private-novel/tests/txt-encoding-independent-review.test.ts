import {createHash} from 'node:crypto';
import {afterEach,expect,it,vi} from 'vitest';
import {deriveAnthologyFiles,scanAnthology} from '../src/features/import-export/services/anthology';
import {resolveTextEncoding} from '../src/features/import-export/services/text-encoding';

// All bytes are synthetic. Never use a user's story as a test fixture.
const chunk=262144;
const hash=(raw:Uint8Array)=>createHash('sha256').update(raw).digest('hex');
type WorkerMessage={type:string;message?:string;encoding?:string;sha256?:string;chapterCount?:number;parts?:{title:string;text:string}[]};
async function worker(){
  const messages:WorkerMessage[]=[];
  const scope={onmessage:null as null|((event:{data:unknown})=>Promise<void>),postMessage(message:WorkerMessage){
    messages.push(message);
    if(message.type==='batch')queueMicrotask(()=>{void scope.onmessage!({data:{type:'ack'}});});
  }};
  vi.stubGlobal('self',scope);vi.resetModules();await import('../src/workers/import.worker');
  return async(type:'preview'|'start',file:File,encoding='auto',pattern='',maxChars=128000)=>{
    messages.length=0;
    await scope.onmessage!({data:{type,file,title:'Synthetic',encoding,pattern,detect:true,maxChars}});
    return [...messages];
  };
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

it('preserves whitespace-only parts within a valid book and counts them consistently in preview',async()=>{
 const run=await worker(),text='Chapter 1 Start\nA'+' '.repeat(250)+'B\n';
 const file=new File([text],'synthetic.txt');
 const preview=await run('preview',file,'utf-8','',100);
 const imported=await run('start',file,'utf-8','',100);
 const chapters=imported.filter(row=>row.type==='batch').flatMap(row=>row.parts??[]);
 expect(chapters.some(chapter=>!chapter.text.trim())).toBe(true);
 expect(chapters.map(chapter=>chapter.text).join('')).toBe(text);
 expect(preview.at(-1)).toMatchObject({type:'preview_done',chapterCount:chapters.length,totalChars:text.length});
});

it.each(['utf-16le','utf-16be'])('review: strong BOMless ASCII-line evidence resolves %s while retaining exact bytes',async encoding=>{
  const raw=Buffer.from('Chapter 1 Start\n'+'A'.repeat(180)+'\nChapter 2 End\nBody 中文🙂\n','utf16le');
  if(encoding==='utf-16be')raw.swap16();
  const file=new File([raw],'no-bom.txt');
  expect(await resolveTextEncoding(file,'auto')).toBe(encoding);
  expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array(raw));
});

it('review: canceled resolution never becomes a successful encoding fallback',async()=>{
  const alreadyStopped=new AbortController();alreadyStopped.abort();
  await expect(resolveTextEncoding(new File(['Plain text'],'stopped.txt'),'auto',alreadyStopped.signal)).rejects.toMatchObject({name:'AbortError'});
  const controller=new AbortController(),file=new File(['A'.repeat(chunk*2+8)],'mid-read.txt'),slice=file.slice.bind(file);
  vi.spyOn(file,'slice').mockImplementation((...args:Parameters<Blob['slice']>)=>{
    if((args[0]??0)>=chunk)controller.abort();
    return slice(...args);
  });
  await expect(resolveTextEncoding(file,'auto',controller.signal)).rejects.toMatchObject({name:'AbortError'});
});

it.each([
  {encoding:'utf-8',raw:Buffer.from('第1章 起点\n正文🙂\n第2章 终点\n结束')},
  {encoding:'gb18030',raw:Buffer.from([0xb5,0xda,0x31,0xd5,0xc2,10,0xd6,0xd0,0xce,0xc4,10,0xb5,0xda,0x32,0xd5,0xc2,10,0x94,0x39,0xfc,0x36])},
])('review: auto preview and import agree for $encoding without changing bytes or SHA',async({raw,encoding})=>{
  const run=await worker(),file=new File([raw],'synthetic.txt'),before=new Uint8Array(await file.arrayBuffer());
  const preview=await run('preview',file),imported=await run('start',file);
  expect(preview.at(-1)).toMatchObject({type:'preview_done',encoding});
  expect(imported.at(-1)).toMatchObject({type:'done',encoding,sha256:hash(raw)});
  expect(imported.filter(message=>message.type==='batch').flatMap(message=>message.parts!).map(part=>part.text).join('')).toBe(new TextDecoder(encoding,{fatal:true}).decode(raw));
  expect(new Uint8Array(await file.arrayBuffer())).toEqual(before);
});

it.each([
  {encoding:'utf-8',tail:Buffer.from('🙂')},
  {encoding:'gb18030',tail:Buffer.from([0x94,0x39,0xfc,0x36])},
])('review: auto validates $encoding across the streaming chunk boundary',async({encoding,tail})=>{
  const run=await worker(),raw=Buffer.concat([Buffer.alloc(chunk-1,0x41),tail,Buffer.from('\nEnd')]),file=new File([raw],'boundary.txt');
  expect((await run('preview',file)).at(-1)).toMatchObject({type:'preview_done',encoding});
  const imported=await run('start',file);
  expect(imported.at(-1)).toMatchObject({type:'done',encoding,sha256:hash(raw)});
  expect(imported.filter(message=>message.type==='batch').flatMap(message=>message.parts!).map(part=>part.text).join('')).toBe(new TextDecoder(encoding,{fatal:true}).decode(raw));
});

it('review: a BOM overrides an explicit conflicting encoding and corrupt BOM tails never fall back',async()=>{
  const run=await worker(),raw=Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('第1章 Start\nBody🙂','utf16le')]);
  for(const type of ['preview','start'] as const){
    expect((await run(type,new File([raw],'bom.txt'),'gb18030')).at(-1)).toMatchObject({type:type==='preview'?'preview_done':'done',encoding:'utf-16le'});
    const broken=Buffer.concat([raw,Buffer.from([0x41])]);
    const messages=await run(type,new File([broken],'broken.txt'));
    expect(messages.at(-1)?.type).toBe(type==='preview'?'preview_error':'error');
    expect(messages.some(message=>message.type==='done'||message.type==='preview_done')).toBe(false);
  }
});

it('review: explicit UTF8 remains strict instead of automatically retrying another encoding',async()=>{
  const run=await worker(),file=new File([new Uint8Array([0xd6,0xd0,0xce,0xc4])],'manual.txt');
  expect((await run('preview',file,'utf-8')).at(-1)?.type).toBe('preview_error');
  expect((await run('start',file,'utf-8')).at(-1)?.type).toBe('error');
  expect((await run('start',file,'gb18030')).at(-1)).toMatchObject({type:'done',encoding:'gb18030'});
});

it('review: anthology auto validates overlong lines and invalid trailing bytes, including BOM input',async()=>{
  const prefix=Buffer.from('STORY Alpha\nA\nSTORY Beta\n'),long=Buffer.alloc(chunk+17,0x41);
  for(const selected of ['auto','utf-8']){
    const broken=Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),prefix,long,Buffer.from([0xc3])]);
    await expect(scanAnthology(new File([broken],'invalid.txt'),selected,'^STORY')).rejects.toThrow();
  }
});

it('review: anthology auto detection keeps exact source slices and the resolved encoding for later imports',async()=>{
  const raw=Buffer.from([...Buffer.from('STORY Alpha\n'),0xd6,0xd0,0xce,0xc4,...Buffer.from('\nSTORY Beta\n'),0x94,0x39,0xfc,0x36]);
  const file=new File([raw],'synthetic.txt'),outline=await scanAnthology(file,'auto','^STORY');
  expect(outline.encoding).toBe('gb18030');expect(outline.sha256).toBe(hash(raw));
  const parts=await deriveAnthologyFiles(file,outline,outline.starts,['Alpha','Beta']);
  expect(new Uint8Array(await new Blob(parts).arrayBuffer())).toEqual(new Uint8Array(raw));
  const run=await worker();
  for(const part of parts)expect((await run('start',part,outline.encoding)).at(-1)).toMatchObject({type:'done',encoding:'gb18030',sha256:hash(new Uint8Array(await part.arrayBuffer()))});
});

const denseNumber=(value:number,fullwidth=false)=>String(value).replace(/\d/g,n=>fullwidth?String.fromCharCode(0xff10+Number(n)):n);
const denseHeading=(value:number,fullwidth=false)=>`第${denseNumber(value,fullwidth)}章标题${denseNumber(value,fullwidth)}`;
const denseBody=()=>`Body ${'x'.repeat(240)}\n`;
const establishedDense=()=>Array.from({length:4},(_,i)=>`${denseHeading(i+1)}\n${denseBody()}`).join('');

it.each([false,true])('review: file evidence enables glued headings with fullwidth=%s without inserting characters',async fullwidth=>{
  const source=Array.from({length:8},(_,i)=>`${i>=4?'前文':''}${denseHeading(i+1,fullwidth)}\n${denseBody()}`).join('');
  const run=await worker(),file=new File([source],'dense.txt');
  expect((await run('preview',file)).at(-1)).toMatchObject({type:'preview_done',chapterCount:8});
  const imported=await run('start',file),parts=imported.flatMap(message=>message.parts??[]);
  expect(parts).toHaveLength(8);expect(parts.map(part=>part.title)).toEqual(Array.from({length:8},(_,i)=>denseHeading(i+1,fullwidth)));
  expect(parts.map(part=>part.text).join('')).toBe(source);expect(imported.at(-1)).toMatchObject({type:'done',sha256:hash(Buffer.from(source))});
});

it('review: duplicate prose references prevent a second boundary for the same dense chapter number',async()=>{
  const source=establishedDense()+`他翻到${denseHeading(5)}\nCommentary\n${denseHeading(5)}\nActual body\n${denseHeading(6)}\nEnd\n`;
  const run=await worker(),file=new File([source],'duplicate-reference.txt'),messages=await run('start',file),parts=messages.flatMap(message=>message.parts??[]);
  expect(parts).toHaveLength(6);expect(parts[3].text).toContain(`他翻到${denseHeading(5)}`);expect(parts.filter(part=>part.title===denseHeading(5))).toHaveLength(1);
  expect(parts.map(part=>part.text).join('')).toBe(source);
});

it('review: short runs and files with spaced heading titles do not activate the dense fallback',async()=>{
  for(const source of [
    `${denseHeading(1)}\nBody\n前文${denseHeading(2)}\nBody\n前文${denseHeading(3)}\nBody\n`,
    Array.from({length:4},(_,i)=>`第${i+1}章 标题${i+1}\n${denseBody()}`).join('')+Array.from({length:4},(_,i)=>`前文${denseHeading(i+5)}\n${denseBody()}`).join(''),
  ]){
    const run=await worker(),parts=(await run('start',new File([source],'insufficient.txt'))).flatMap(message=>message.parts??[]);
    expect(parts).toHaveLength(source.startsWith('第1章 标题')?4:1);expect(parts.map(part=>part.text).join('')).toBe(source);
  }
});

it('review: custom regex bypasses dense fallback while keeping the original source intact',async()=>{
  const source=establishedDense()+Array.from({length:4},(_,i)=>`前文${denseHeading(i+5)}\n${denseBody()}`).join(''),run=await worker(),file=new File([source],'custom.txt');
  expect((await run('preview',file,'auto','^UNIT')).at(-1)).toMatchObject({type:'preview_done',chapterCount:1});
  const parts=(await run('start',file,'auto','^UNIT')).flatMap(message=>message.parts??[]);
  expect(parts).toHaveLength(1);expect(parts[0].text).toBe(source);
});

it('review: a numbering gap followed by fewer than four unique markers is not promoted to chapter evidence',async()=>{
  const source=establishedDense()+Array.from({length:3},(_,i)=>`前文${denseHeading(i+9)}\n${denseBody()}`).join(''),run=await worker();
  const parts=(await run('start',new File([source],'number-gap.txt'))).flatMap(message=>message.parts??[]);
  expect(parts).toHaveLength(4);expect(parts.map(part=>part.text).join('')).toBe(source);
});

it('review: dense marker across a byte chunk boundary is found without changing the bounded splitter output',async()=>{
  const prefix=establishedDense(),padding=chunk-1-Buffer.byteLength(prefix)-Buffer.byteLength('\n甲');
  const source=prefix+'x'.repeat(padding)+`\n甲${denseHeading(5)}\n${denseBody()}${denseHeading(6)}\n${denseBody()}${denseHeading(7)}\n${denseBody()}${denseHeading(8)}\n${denseBody()}`,run=await worker(),file=new File([source],'dense-boundary.txt');
  const preview=await run('preview',file),messages=await run('start',file),parts=messages.flatMap(message=>message.parts??[]);
  expect(preview.at(-1)).toMatchObject({type:'preview_done',chapterCount:parts.length});expect(parts.some(part=>part.title===denseHeading(5))).toBe(true);
  expect(parts.map(part=>part.text).join('')).toBe(source);expect(parts.every(part=>part.text.length<=128000)).toBe(true);
});

it.each(['他读到','她翻到','他们提到'])('review: a unique prose reference introduced by %s stays in the body even when the actual chapter is missing',async introducer=>{
  const reference=`${introducer}第5章内容很精彩`,source=establishedDense()+reference+`\n${denseBody()}`+Array.from({length:3},(_,i)=>`${denseHeading(i+6)}\n${denseBody()}`).join('');
  const run=await worker(),file=new File([source],'missing-actual.txt'),messages=await run('start',file),parts=messages.flatMap(message=>message.parts??[]);
  expect(parts).toHaveLength(7);expect(parts[3].text).toContain(reference);expect(parts.some(part=>part.title.startsWith('第5章'))).toBe(false);
  expect(parts.map(part=>part.text).join('')).toBe(source);
});

it('review: dense markers surrounded by very short bodies are not inferred',async()=>{
  const source=establishedDense()+Array.from({length:4},(_,i)=>`前文${denseHeading(i+5)}\nShort\n`).join(''),run=await worker();
  const parts=(await run('start',new File([source],'short-bodies.txt'))).flatMap(message=>message.parts??[]);
  expect(parts).toHaveLength(4);expect(parts.map(part=>part.text).join('')).toBe(source);
});

it('review: a nearby duplicate raw marker blocks inference even when the first numeric neighbor is far away',async()=>{
  const source=establishedDense()+`${denseHeading(5)}\n${denseBody()}重复第5章提及\n`+Array.from({length:4},(_,i)=>`前文${denseHeading(i+6)}\n${denseBody()}`).join('');
  const run=await worker(),parts=(await run('start',new File([source],'near-duplicate.txt'))).flatMap(message=>message.parts??[]);
  expect(parts).toHaveLength(5);expect(parts.map(part=>part.text).join('')).toBe(source);
});

it('review: the entire inferred heading must fit the eighty-character bound',async()=>{
  const overlong=`第5章${'长'.repeat(78)}`,source=establishedDense()+`前文${overlong}\n${denseBody()}`+Array.from({length:3},(_,i)=>`${denseHeading(i+6)}\n${denseBody()}`).join('');
  const run=await worker(),parts=(await run('start',new File([source],'long-title.txt'))).flatMap(message=>message.parts??[]);
  expect(overlong.length).toBeGreaterThan(80);expect(parts).toHaveLength(7);expect(parts.some(part=>part.title===overlong)).toBe(false);
  expect(parts.map(part=>part.text).join('')).toBe(source);
});
