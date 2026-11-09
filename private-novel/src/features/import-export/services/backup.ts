import {BOOK_METADATA_MAX_CHARS} from '../../../shared/constants/book-metadata';
import {readEffectiveBookNames,validateAlbumNameCapacity} from '../../names-convert/services/scoped-names';
import {ALBUM_NAMES_PREFIX,albumNameSetting,nameAlbumRoot,parseAlbumNameKey} from '../../names-convert/services/album-name-schema';
import {validateSharedRecord,type SharedRecord} from '../../sync-cloud/services/shared-state-schema';
import {validateHiddenChapterIds} from '../../sync-cloud/services/chapter-state-schema';
import {validateEpubBook,validateEpubLayout} from './epub-layout-schema';
import {createSHA256} from 'hash-wasm';
import {db} from '../../../core/db';
import {removeBookWithLocalData} from '../../library/services/book-removal';
import {hasUsableSourceData} from './source-data';
import {CONVERT_NAMES_KEY,readConvertNames,validateConvertNames,type ConvertName} from '../../names-convert/services/convert-names';
import {convertTombKey} from '../../sync-cloud/services/shared-name-intents';
import {
  uid,
  dictionaryKinds,
  type Book,
  type Chapter,
  type NameEntry,
  type Progress,
  type DictKind,
  type DictionaryFile,
  type BackupMode,
  type BackupOptions,
  type RestoreOptions,
  type RestoreConflict,
  type RestoreJob,
  type BackupSourceData,
  type BackupDictionaryData,
  type BackupManifest
} from '../../../core/domain';

export async function hashBlob(blob:Blob){
  const hash=await createSHA256();hash.init();
  for(let at=0;at<blob.size;at+=262144)hash.update(new Uint8Array(await blob.slice(at,at+262144).arrayBuffer()));
  return hash.digest('hex');
}

export function download(blob:Blob,name:string){
  const href=URL.createObjectURL(blob);const a=document.createElement('a');
  a.href=href;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(href),60000);
}

export async function blobToBase64(blob:Blob):Promise<string>{
  if(typeof Buffer!=='undefined'){
    const buf=Buffer.from(await blob.arrayBuffer());
    return buf.toString('base64');
  }
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onloadend=()=>{
      const res=reader.result as string;
      resolve(res.split(',')[1]||'');
    };
    reader.onerror=reject;
    reader.readAsDataURL(blob);
  });
}

export function base64ToBlob(base64:string,type='application/octet-stream'):Blob{
  if(typeof Buffer!=='undefined'){
    const buf=Buffer.from(base64,'base64');
    return new Blob([buf],{type});
  }
  const bin=atob(base64);
  const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
  return new Blob([bytes],{type});
}

interface Body {
  manifest?: BackupManifest;
  mode?: BackupMode;
  book?: Book;
  names?: NameEntry[];
  albumNames?: SharedRecord[];
  convertNames?: ConvertName[];
  progress?: Progress;
  dictionaryRequirements?: {kind:DictKind;name:string;sha256:string}[];
  sources?: BackupSourceData[];
  dictionaries?: BackupDictionaryData[];
  chapters: Chapter[];
}

interface Packet {
  format:'thu-phong';
  version:1|2|3;
  backupId:string;
  index:number;
  total:number;
  checksum:string;
  body:string;
  mode?:BackupMode;
}

const MAX_PACKET_BYTES=16*1024*1024;
const validHash=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value);
async function verifiedBlob(base64:unknown,sha256:string,bytes?:number){
  if(typeof base64!=='string'||base64.length%4!==0||/[^A-Za-z0-9+/=]/.test(base64))throw new Error('Dữ liệu file sao lưu không hợp lệ.');
  const padding=base64.indexOf('=');
  if(padding!==-1&&(padding<base64.length-2||!/^={1,2}$/.test(base64.slice(padding))))throw new Error('Dữ liệu file sao lưu không hợp lệ.');
  const blob=base64ToBlob(base64);
  if(!validHash(sha256)||(bytes!==undefined&&blob.size!==bytes)||await hashBlob(blob)!==sha256.toLowerCase())throw new Error('Bytes hoặc SHA-256 của file sao lưu không khớp.');
  return blob;
}

function hasBackupSourceData(source:BackupSourceData){
  // Older portable exports encoded compact placeholders as an empty string.
  return source.dataStatus!=='missing'&&source.dataBase64!==undefined&&!(source.dataBase64===''&&source.bytes>0);
}

export async function prepareBackup(bookId:string,options?:BackupOptions){
  const mode:BackupMode=options?.mode||'compact';
  const {book,names,albumNames}=await db.transaction('r',[db.books,db.names,db.settings],async()=>{
    const book=await db.books.get(bookId);if(!book||book.status!=='ready')throw new Error('Truyện chưa sẵn sàng.');
    const names=await readEffectiveBookNames(bookId),album=nameAlbumRoot(book.album),albumNames:SharedRecord[]=[];
    if(album)for(const row of await db.settings.where('key').startsWith(ALBUM_NAMES_PREFIX).toArray()){const record=validateSharedRecord(row.value);if(record.kind==='album-name'&&parseAlbumNameKey(record.key)[0]===album)albumNames.push(record);}
    return {book,names,albumNames};
  });
  const refs:{id:string;revision:number;order:number}[]=[];let retainedChars=0;
  await db.chapters.where('bookId').equals(bookId).each(c=>{retainedChars+=c.text.length;refs.push({id:c.id,revision:c.revision,order:c.order});});
  refs.sort((a,b)=>a.order-b.order);
  const convertNames=await readConvertNames();
  const progress=await db.progress.get(bookId);
  const dictionaryRequirements=(await db.dictionaries.toArray()).map(d=>({kind:d.kind,name:d.name,sha256:d.sha256}));
  const sourceRows=await db.sources.where('bookId').equals(bookId).toArray();
  if(book.epub&&!sourceRows.some(row=>row.id===book.epub!.source.sourceId)){const source=validateEpubBook(book.epub).source;sourceRows.push({id:source.sourceId,bookId,name:source.name,relativePath:source.relativePath,encoding:source.encoding,sha256:source.sha256,bytes:source.bytes,blob:new Blob([]),dataStatus:'missing'});}
  if(mode==='portable'&&options?.includeSources!==false&&sourceRows.some(row=>row.encoding==='epub'&&row.blob.size>8*1048576))throw Error('EPUB lớn: lưu tệp EPUB gốc riêng cùng bản sao lưu gọn; mỗi phần khôi phục tối đa 16 MiB.');
  const backupId=uid();
  const total=Math.max(1,Math.ceil(refs.length/20));

  let sourcesPayload:BackupSourceData[]|undefined;
  let dictionariesPayload:BackupDictionaryData[]|undefined;

  if(mode==='portable'){
    if(options?.includeSources!==false&&sourceRows.length>0){
      sourcesPayload=await Promise.all(sourceRows.map(async s=>({
        id:s.id,name:s.name,displayName:s.displayName,relativePath:s.relativePath,encoding:s.encoding,sha256:s.sha256,bytes:s.bytes,
        ...(hasUsableSourceData(s)?{dataBase64:await blobToBase64(s.blob)}:{dataStatus:'missing' as const})
      })));
    }else{
      sourcesPayload=sourceRows.map(s=>({id:s.id,name:s.name,displayName:s.displayName,relativePath:s.relativePath,encoding:s.encoding,sha256:s.sha256,bytes:s.bytes,dataStatus:'missing'}));
    }
    if(options?.includeDictionaries!==false){
      const allDicts=await db.dictionaries.toArray();
      dictionariesPayload=await Promise.all(allDicts.map(async d=>({
        kind:d.kind,name:d.name,sha256:d.sha256,dataBase64:await blobToBase64(d.blob)
      })));
    }
  }else{
    sourcesPayload=sourceRows.map(s=>({id:s.id,name:s.name,displayName:s.displayName,relativePath:s.relativePath,encoding:s.encoding,sha256:s.sha256,bytes:s.bytes,dataStatus:'missing'}));
  }

  const version=book.hiddenChapterIds?.length?3:2;const exportedBook={...book,hiddenChapterIds:book.hiddenChapterIds?.length?book.hiddenChapterIds:undefined,chapterCount:refs.length,charCount:retainedChars};
  const manifest:BackupManifest={
    format:'thu-phong',version,appVersion:'0.1.0',backupId,mode,createdAt:Date.now(),
    book:{title:book.title,author:book.author,chapterCount:exportedBook.chapterCount,charCount:exportedBook.charCount,originalId:book.id},
    dictionaryRequirements,
    sources:(sourcesPayload||[]).map(s=>({id:s.id,name:s.name,encoding:s.encoding,sha256:s.sha256,bytes:s.bytes})),
    hasSourceData:Boolean(sourcesPayload?.some(hasBackupSourceData)),
    hasDictionaryData:Boolean(dictionariesPayload?.some(d=>Boolean(d.dataBase64)))
  };

  return {
    title:book.title,total,mode,manifest,
    async part(index:number){
      if(index<0||index>=total)throw new Error('Phần sao lưu không hợp lệ.');
      const slice=refs.slice(index*20,(index+1)*20);
      const rows=await db.chapters.bulkGet(slice.map(c=>c.id));
      if(rows.some((r,i)=>!r||r.revision!==slice[i].revision))throw new Error('Truyện đã thay đổi khi sao lưu. Hãy tạo bản sao lưu mới.');
      const body:Body={
        chapters:rows as Chapter[],
        ...(index===0?{manifest,mode,book:exportedBook,names,...(albumNames.length?{albumNames}:{}),convertNames,progress,dictionaryRequirements,sources:sourcesPayload,dictionaries:dictionariesPayload}:{})
      };
      const json=JSON.stringify(body);
      const checksum=await hashBlob(new Blob([json]));
      const packet:Packet={format:'thu-phong',version,backupId,index,total,checksum,body:json,mode};
      const blob=new Blob([JSON.stringify(packet)],{type:'application/json'});
      if(blob.size>MAX_PACKET_BYTES)throw new Error('Phần sao lưu vượt 16 MiB. Hãy dùng Gói gọn và lưu file gốc, từ điển riêng.');
      return {blob,name:`thu-phong-${backupId}-${String(index+1).padStart(4,'0')}-of-${total}.tpbackup.json`};
    }
  };
}

function parsePacket(text:string):Packet{
  const p=JSON.parse(text);
  if(p.format!=='thu-phong'||(p.version!==1&&p.version!==2&&p.version!==3)||typeof p.backupId!=='string'||!/^[a-f0-9-]{36}$/i.test(p.backupId)||!Number.isInteger(p.index)||!Number.isInteger(p.total)||p.total<1||p.total>10000||p.index<0||p.index>=p.total||typeof p.body!=='string'||typeof p.checksum!=='string')throw new Error('Định dạng sao lưu không hợp lệ.');
  const body=JSON.parse(p.body);if(body.book?.hiddenChapterIds!==undefined&&(p.version!==3||body.manifest?.version!==3))throw Error('Phiên bản sao lưu không hỗ trợ chương đã xóa.');
  return p;
}

export async function stageBackup(files:File[],notify:(s:string)=>void){
  const ids=new Set<string>();
  for(let i=0;i<files.length;i++) {
    const f=files[i];if(f.size>MAX_PACKET_BYTES)throw new Error('Mỗi phần sao lưu phải nhỏ hơn hoặc bằng 16 MiB.');
    const p=parsePacket(await f.text());
    if(await hashBlob(new Blob([p.body]))!==p.checksum)throw new Error(`Checksum sai: ${f.name}`);
    const old=await db.restorePackets.get(`${p.backupId}:${p.index}`);
    if(old&&old.checksum!==p.checksum)throw new Error('Hai phần cùng số nhưng khác nội dung.');
    await db.restorePackets.put({id:`${p.backupId}:${p.index}`,backupId:p.backupId,index:p.index,total:p.total,body:p.body,checksum:p.checksum});
    ids.add(p.backupId);notify(`Đã kiểm tra ${i+1}/${files.length} phần`);
  }
  return [...ids];
}

export async function restoreInfo(id:string){
  const rows:{index:number;total:number}[]=[];
  let body:Body|undefined;
  await db.restorePackets.where('backupId').equals(id).each(r=>{
    rows.push({index:r.index,total:r.total});
    if(r.index===0)body=JSON.parse(r.body) as Body;
  });
  rows.sort((a,b)=>a.index-b.index);
  if(!rows.length)throw new Error('Không tìm thấy bản sao lưu.');
  const total=rows[0].total;
  if(rows.some(r=>r.total!==total))throw new Error('Các phần có manifest không nhất quán.');
  const complete=rows.length===total&&rows.every((r,i)=>r.index===i);
  const mode:BackupMode=body?.mode||body?.manifest?.mode||'compact';
  const reqs=(body?.dictionaryRequirements||[]) as {kind:DictKind;name:string;sha256:string}[];

  const currentDicts=await db.dictionaries.toArray();
  const availableDictionaries:{kind:DictKind;name:string;sha256:string}[]=[];
  const providedDictionaries:{kind:DictKind;name:string;sha256:string}[]=[];
  const missingDictionaries:{kind:DictKind;name:string;sha256:string}[]=[];

  for(const req of reqs){
    const installed=currentDicts.find(d=>d.kind===req.kind&&d.sha256===req.sha256);
    if(installed){
      availableDictionaries.push(req);
    }else{
      const provided=!currentDicts.some(d=>d.kind===req.kind)&&body?.dictionaries?.find(d=>d.kind===req.kind&&d.sha256===req.sha256&&d.dataBase64!==undefined);
      if(provided)providedDictionaries.push(req);
      else missingDictionaries.push(req);
    }
  }

  const bookTitle=body?.book?.title||'Đang chờ phần đầu';
  const currentBooks=await db.books.toArray();
  const existingBook=currentBooks.find(b=>b.title===bookTitle);
  const currentSources=await db.sources.toArray();
  const backupSources=body?.sources||[];
  const sameHash=backupSources.some(bs=>currentSources.some(cs=>hasUsableSourceData(cs)&&cs.sha256===bs.sha256));

  const conflicts:RestoreConflict={
    bookExists:Boolean(existingBook),
    existingBookId:existingBook?.id,
    existingBookTitle:existingBook?.title,
    sameHash,
    missingDictionaries,
    providedDictionaries,
    availableDictionaries,
    hasSourceFiles:backupSources.length>0
  };

  const sources=backupSources.map(s=>({
    id:s.id,name:s.name,sha256:s.sha256,bytes:s.bytes,hasData:hasBackupSourceData(s)
  }));

  return {
    id,title:bookTitle,received:rows.length,total,complete,mode,requirements:reqs,conflicts,sources,manifest:body?.manifest
  };
}

export async function restoreBackup(id:string,options?:RestoreOptions){
  const info=await restoreInfo(id);
  if(!info.complete)throw new Error(`Chưa đủ phần: ${info.received}/${info.total}. Hãy chọn thêm các file còn thiếu.`);

  const jobId=uid();
  const bookId=uid();
  const restoreJob:RestoreJob={
    jobId,backupId:id,bookId,mode:info.mode,status:'staging',conflicts:info.conflicts,updatedAt:Date.now()
  };
  await db.restoreJobs.add(restoreJob);

  let count=0;let chars=0;
  let lastRestoredOrder=-Infinity;
  const chapterIds=new Map<string,string>();
  const sourceIds=new Map<string,string>();
  let progress:Progress|undefined;let expected:Book|undefined;
  let replaceBookId:string|undefined;
  let omitsSourceData=true;
  const dictionaryCandidates:DictionaryFile[]=[];
  let convertNames:ConvertName[]|undefined;
  let albumNames:SharedRecord[]=[];

  try {
    for(let i=0;i<info.total;i++) {
      const row=await db.restorePackets.get(`${id}:${i}`);
      if(!row||await hashBlob(new Blob([row.body]))!==row.checksum)throw new Error('Sao lưu không còn nguyên vẹn.');
      const body=JSON.parse(row.body) as Body;
      if(i===0){
        const b=body.book;
        if(!b||typeof b.title!=='string'||b.title.length>BOOK_METADATA_MAX_CHARS||!Number.isInteger(b.chapterCount)||!Number.isFinite(b.charCount))throw new Error('Metadata truyện không hợp lệ.');
        if(b.hiddenChapterIds!==undefined){if(body.manifest?.version!==3||b.epub)throw Error('Trạng thái chương sao lưu không hợp lệ.');b.hiddenChapterIds=validateHiddenChapterIds(b.hiddenChapterIds);}
        expected=b;
        if(body.albumNames!==undefined){
          if(!Array.isArray(body.albumNames)||body.albumNames.length>20000)throw Error('Kho Name Album sao lưu không hợp lệ.');
          const root=nameAlbumRoot(b.album);albumNames=body.albumNames.map(value=>{const record=validateSharedRecord(value);if(record.kind!=='album-name'||!root||parseAlbumNameKey(record.key)[0]!==root)throw Error('Name sai Album sao lưu.');return record;});
          if(new Set(albumNames.map(r=>r.key)).size!==albumNames.length)throw Error('Name Album sao lưu bị trùng.');
        }
        if(body.convertNames!==undefined)convertNames=validateConvertNames(body.convertNames);

        let targetTitle=options?.targetTitle?.trim();
        if(!targetTitle){
          if(info.conflicts.bookExists){
            if(options?.onConflict==='replace'){
              targetTitle=b.title;
              replaceBookId=info.conflicts.existingBookId;
            }else{
              targetTitle=`${b.title} (khôi phục)`;
            }
          }else{
            targetTitle=b.title;
          }
        }

        await db.books.add({...b,id:bookId,title:targetTitle,status:'staging',createdAt:Date.now(),updatedAt:Date.now()});

        if(body.sources!==undefined&&!Array.isArray(body.sources))throw new Error('Danh sách file nguồn không hợp lệ.');
        if(body.sources&&body.sources.length>0){
          for(const s of body.sources){
            if(!s||typeof s.id!=='string'||!s.id||typeof s.name!=='string'||s.name.length>1000||typeof s.encoding!=='string'||!validHash(s.sha256)||!Number.isSafeInteger(s.bytes)||s.bytes<0||(s.relativePath!==undefined&&typeof s.relativePath!=='string')||(s.displayName!==undefined&&(typeof s.displayName!=='string'||s.displayName.length>1000))||(s.dataStatus!==undefined&&s.dataStatus!=='missing'))throw new Error('Metadata file nguồn không hợp lệ.');
          }
          omitsSourceData=body.sources.some(s=>!hasBackupSourceData(s));
          for(const s of body.sources){
            if(sourceIds.has(s.id))throw new Error('File nguồn sao lưu bị trùng ID.');
            const newSourceId=uid();
            sourceIds.set(s.id,newSourceId);
            const missing=!hasBackupSourceData(s);
            const blob=missing?new Blob([]):await verifiedBlob(s.dataBase64,s.sha256,s.bytes);
            await db.sources.add({
              id:newSourceId,bookId,name:s.name,displayName:s.displayName,relativePath:s.relativePath||s.name,encoding:s.encoding,sha256:s.sha256,bytes:s.bytes,blob,...(missing?{dataStatus:'missing' as const}:{})
            });
          }
        }

        if(b.epub){const epub=validateEpubBook(b.epub),sourceId=sourceIds.get(epub.source.sourceId);if(!sourceId)throw Error('EPUB thiếu metadata tệp gốc.');await db.books.update(bookId,{epub:{...epub,source:{...epub.source,sourceId}}});}

        if(options?.restoreDictionaries!==false&&body.dictionaries!==undefined){
          if(!Array.isArray(body.dictionaries))throw new Error('Danh sách từ điển không hợp lệ.');
          for(const d of body.dictionaries){
            if(!d||!(dictionaryKinds as readonly string[]).includes(d.kind)||typeof d.name!=='string'||d.name.length>1000||typeof d.sha256!=='string'||d.sha256.length>256||(d.dataBase64!==undefined&&typeof d.dataBase64!=='string'))throw new Error('Metadata từ điển không hợp lệ.');
            if(d.dataBase64!==undefined){
              // Decode outside the IndexedDB transaction; candidates have no
              // global effect until all book data has passed validation.
              const blob=await verifiedBlob(d.dataBase64,d.sha256);
              dictionaryCandidates.push({kind:d.kind,name:d.name,sha256:d.sha256,blob:new Blob([blob],{type:'text/plain'}),updatedAt:Date.now()});
            }
          }
        }

        progress=body.progress;
        const names=body.names||[];
        if(!Array.isArray(names)||names.length>100000||names.some(n=>typeof n.key!=='string'||typeof n.value!=='string'||n.key.length>256||n.value.length>4096))throw new Error('Name List không hợp lệ.');
        await db.names.bulkAdd(names.map(n=>({...n,id:uid(),bookId})));
      }

      if(!Array.isArray(body.chapters)||body.chapters.length>20)throw new Error('Danh sách chương không hợp lệ.');
      const chapters:Chapter[]=body.chapters.map(c=>{
        // Reader splits insert a valid fractional order between neighbours; accept any
        // finite, strictly increasing order and normalise to sequential integers below.
        if(!c||typeof c.order!=='number'||!Number.isFinite(c.order)||c.order<0||c.order<=lastRestoredOrder)throw new Error('Thứ tự chương trong các phần sao lưu không khớp.');
        lastRestoredOrder=c.order;
        if(typeof c.id!=='string'||chapterIds.has(c.id)||typeof c.text!=='string'||c.text.length>128000||typeof c.title!=='string'||c.title.length>1000||(c.displayTitle!==undefined&&(typeof c.displayTitle!=='string'||c.displayTitle.length>1000)))throw new Error('Nội dung chương không hợp lệ.');
        if(c.epub){c.epub=validateEpubLayout(c.epub);if(c.text!==c.epub.nodes.join('\n')||!expected?.epub||expected.epub.spine[count]!==c.epub.path)throw Error('Bố cục EPUB sao lưu không khớp.');}else if(expected?.epub)throw Error('Sao lưu thiếu bố cục EPUB.');
        const next=uid();chapterIds.set(c.id,next);chars+=c.text.length;
        const mappedSourceId=(c.sourceId&&sourceIds.get(c.sourceId))||'';
        return {...c,id:next,bookId,sourceId:mappedSourceId,order:count++,revision:1};
      });
      await db.chapters.bulkAdd(chapters);
    }
    if(!expected||count!==expected.chapterCount||chars!==expected.charCount)throw new Error('Thiếu chương hoặc tổng ký tự không khớp manifest.');
    const hidden=(expected.hiddenChapterIds??[]).map(id=>{const mapped=chapterIds.get(id);if(!mapped)throw Error('Sao lưu thiếu chương đã xóa.');return mapped;});
    if(progress&&!expected.hiddenChapterIds?.includes(progress.chapterId)&&chapterIds.has(progress.chapterId)&&Number.isInteger(progress.paragraph)&&progress.paragraph>=0){
      await db.progress.put({...progress,bookId,chapterId:chapterIds.get(progress.chapterId)!,revision:1,updatedAt:Date.now()});
    }

    // Cam kết nguyên tử (atomic commit): xóa bản cũ (nếu replace) và kích hoạt bản mới trong cùng transaction
    await db.transaction('rw',[db.books,db.chapters,db.sources,db.progress,db.names,db.importJobs,db.restoreJobs,db.dictionaries,db.settings],async()=>{
      const stagingBook=await db.books.get(bookId);
      if(stagingBook?.status!=='staging'||await db.chapters.where('bookId').equals(bookId).count()!==count)throw new Error('Truyện khôi phục không còn ở trạng thái staging đầy đủ.');
      const stagedSources=await db.sources.where('bookId').equals(bookId).toArray();
      if([...sourceIds.values()].some(sourceId=>!stagedSources.some(source=>source.id===sourceId)))throw new Error('File nguồn staging không còn đầy đủ.');
      // Capture the live legacy consensus before replacing/deleting any old book.
      // Private rows restored below must not silently revoke inherited author Names.
      const root=nameAlbumRoot(stagingBook.album),affectedRoots=new Set(root?[root]:[]),legacyValues=new Map<string,Set<string>>();
      if(root){
        const incomingKeys=new Set([...albumNames.map(record=>parseAlbumNameKey(record.key)[1]),...(await db.names.where('bookId').equals(bookId).toArray()).map(row=>row.key)]);
        const members=(await db.books.where('status').equals('ready').toArray()).filter(book=>nameAlbumRoot(book.album)===root).map(book=>book.id);
        if(members.length)for(const row of await db.names.where('bookId').anyOf(members).toArray())if(incomingKeys.has(row.key)){const values=legacyValues.get(row.key)??new Set<string>();values.add(row.value);legacyValues.set(row.key,values);}
        for(const [key,values]of legacyValues)if(values.size===1){const record=validateSharedRecord({kind:'album-name',key:JSON.stringify([root,key]),value:[...values][0]}),setting=albumNameSetting(record.key);if(!await db.settings.get(setting))await db.settings.put({key:setting,value:record});}
      }
      if(replaceBookId){
        const oldBook=await db.books.get(replaceBookId);
        if(!oldBook||oldBook.status!=='ready')throw new Error('Truyện cần ghi đè không còn sẵn sàng.');
        const oldRoot=nameAlbumRoot(oldBook.album);if(oldRoot)affectedRoots.add(oldRoot);
        if(omitsSourceData){
          // Read and carry bytes inside the same transaction that deletes the old
          // book, so staging never holds a stale copy of the user's source files.
          // Nonempty files with inconsistent legacy metadata cannot be used for
          // matching/dedupe, but their bytes still belong to the user and must survive.
          const oldSources=(await db.sources.where('bookId').equals(replaceBookId).toArray()).filter(source=>source.blob.size>0||hasUsableSourceData(source));
          const bound=new Set<string>();
          for(const source of stagedSources){
            if(source.dataStatus!=='missing')continue;
            const original=oldSources.find(old=>hasUsableSourceData(old)&&old.sha256===source.sha256&&old.bytes===source.bytes);
            if(original){
              await db.sources.put({...source,blob:original.blob,dataStatus:undefined});
              bound.add(original.id);
            }
          }
          for(const original of oldSources){
            if(!bound.has(original.id))await db.sources.put({...original,bookId});
          }
        }
        await db.chapters.where('bookId').equals(replaceBookId).delete();
        await db.sources.where('bookId').equals(replaceBookId).delete();
        await db.names.where('bookId').equals(replaceBookId).delete();
        await db.progress.delete(replaceBookId);
        await db.importJobs.where('bookId').equals(replaceBookId).delete();
        await db.books.delete(replaceBookId);
      }
      for(const candidate of dictionaryCandidates){
        // The decision must use the current row under this transaction's lock,
        // preserving dictionary imports or other restores committed meanwhile.
        if(!await db.dictionaries.get(candidate.kind))await db.dictionaries.put(candidate);
      }
      if(convertNames?.length){
        const merged=new Map((await readConvertNames()).map(n=>[n.key,n.value]));
        for(const name of convertNames){
          if(!merged.has(name.key)&&!await db.settings.get(convertTombKey(name.key)))merged.set(name.key,name.value);
        }
        await db.settings.put({key:CONVERT_NAMES_KEY,value:validateConvertNames([...merged].map(([key,value])=>({key,value})))});
      }
      // Add-only at final activation: never overwrite a current value or tombstone.
      for(const record of albumNames){const key=albumNameSetting(record.key),legacy=legacyValues.get(parseAlbumNameKey(record.key)[1]);if(!await db.settings.get(key)&&!(legacy&&legacy.size>1))await db.settings.put({key,value:record});}
      const active=(await db.chapters.where('bookId').equals(bookId).toArray()).filter(c=>!hidden.includes(c.id));
      if(await db.books.update(bookId,{status:'ready',hiddenChapterIds:hidden,chapterCount:active.length,charCount:active.reduce((n,c)=>n+c.text.length,0),updatedAt:Date.now()})!==1)throw new Error('Không thể kích hoạt truyện khôi phục.');
      await validateAlbumNameCapacity(affectedRoots); // Validate all affected readers before activation commits.
      await db.restoreJobs.update(jobId,{status:'committed',updatedAt:Date.now()});
    });
    return bookId;
  }catch(err){
    await removeBookWithLocalData(bookId);
    await db.restoreJobs.update(jobId,{status:'failed',error:err instanceof Error?err.message:String(err),updatedAt:Date.now()});
    throw err;
  }
}
