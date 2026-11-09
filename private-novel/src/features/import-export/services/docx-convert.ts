import {assembleDocumentChapters,type DocumentBlock} from './document-chapters';
import mammoth from 'mammoth/mammoth.browser';
import {openEpubZip,readEpubEntry} from './epub-zip';
import {rasterBlob} from '../../sync-cloud/services/shared-images';

const MIB=1048576;
const MAX_EXPANDED=128*MIB,MAX_ASSET=8*MIB,MAX_ASSETS=64*MIB;

function imageExtension(contentType:string,bytes:Uint8Array):string{
 const type=contentType.toLowerCase();
 if(type==='image/png'&&bytes.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return 'png';
 if(type==='image/jpeg'&&bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'jpg';
 if(type==='image/webp'&&bytes.length>=12&&new TextDecoder().decode(bytes.subarray(0,4))==='RIFF'&&new TextDecoder().decode(bytes.subarray(8,12))==='WEBP')return 'webp';
 throw Error('DOCX chứa ảnh không được hỗ trợ hoặc không hợp lệ; chỉ nhận PNG, JPEG và WebP. Chưa nhập dữ liệu.');
}

/** Convert semantic DOCX content; the import pipeline sanitizes the resulting HTML. */
export async function convertDocx(file:File,signal:AbortSignal):Promise<{sections:{title:string;html:string}[];assets:Record<string,Uint8Array>}>{
 signal.throwIfAborted();
 if(file.size>40*MIB)throw Error('DOCX vượt giới hạn 40 MiB; chưa nhập dữ liệu.');
 const entries=await openEpubZip(file,signal);
 if(!entries.has('[Content_Types].xml')||!entries.has('word/document.xml'))throw Error('File không phải tài liệu DOCX được hỗ trợ.');
 let expanded=0;
 for(const entry of entries.values()){
  expanded+=entry.bytes;
  if(expanded>MAX_EXPANDED)throw Error('Nội dung giải nén DOCX vượt giới hạn 128 MiB; chưa nhập dữ liệu.');
 }
 // Validate actual decompression, local headers and CRC, not only advertised ZIP sizes.
 // Discard each entry before reading the next, keeping validation memory bounded.
 for(const entry of entries.values())await readEpubEntry(file,entry,undefined,signal);
 signal.throwIfAborted();
 const assets:Record<string,Uint8Array>=Object.create(null);
 let assetBytes=0,imageCount=0,imageFailure:unknown;
 const input=await file.arrayBuffer();
 signal.throwIfAborted();
 const result=await mammoth.convertToHtml({arrayBuffer:input},{
  externalFileAccess:false,
  includeEmbeddedStyleMap:false,
  convertImage:mammoth.images.imgElement(async image=>{
   try{
    signal.throwIfAborted();
    const bytes=new Uint8Array(await image.readAsArrayBuffer());
    signal.throwIfAborted();
    if(!bytes.length||bytes.length>MAX_ASSET||assetBytes+bytes.length>MAX_ASSETS)throw Error('Ảnh DOCX vượt giới hạn 8 MiB/ảnh hoặc tổng 64 MiB; chưa nhập dữ liệu.');
    const extension=imageExtension(image.contentType,bytes);
    const safe=await rasterBlob(new Blob([new Uint8Array(bytes)],{type:image.contentType}));
    const decoded=await createImageBitmap(safe);
    try{if(decoded.width*decoded.height>16000000||Math.max(decoded.width,decoded.height)>16384)throw Error('Ảnh DOCX vượt 16 triệu pixel hoặc cạnh 16.384 pixel.');}finally{decoded.close();}
    const name=`image${++imageCount}.${extension}`;
    assetBytes+=bytes.length;
    assets[name]=bytes;
    return {src:name};
   }catch(error){imageFailure??=error;throw error;}
  }),
 });
 signal.throwIfAborted();
 // Mammoth recovers from failed images. Reject explicitly so images cannot disappear silently.
 if(imageFailure)throw imageFailure;
 if(result.messages.some(message=>message.type==='error'||/Could not find image file|v:imagedata.*ignored/i.test(message.message)))throw Error('Không thể chuyển đổi đầy đủ nội dung hoặc ảnh DOCX; chưa nhập dữ liệu.');
 const doc=new DOMParser().parseFromString(result.value,'text/html');
 for(const image of doc.querySelectorAll('img')){
  if(!Object.hasOwn(assets,image.getAttribute('src')??''))throw Error('DOCX chứa ảnh ngoài tài liệu hoặc ảnh không thể chuyển đổi; chưa nhập dữ liệu.');
  image.removeAttribute('srcset');
 }
 // Mammoth emits semantic HTML; never carry active or externally loaded resources forward.
 doc.querySelectorAll('script,style,link,iframe,object,embed,source,audio,video').forEach(element=>element.remove());
 const blocks:DocumentBlock[]=[];
 for(const node of Array.from(doc.body.childNodes)){
  signal.throwIfAborted();
  const html=new XMLSerializer().serializeToString(node);
  if(!html.trim())continue;
  blocks.push({html,text:node.textContent??'',heading:node.nodeType===1&&/^H[12]$/i.test((node as Element).tagName)});
 }
 const sections=assembleDocumentChapters(blocks);
 if(!sections.length)throw Error('DOCX không có nội dung văn bản hoặc ảnh để đọc.');
 return {sections,assets};
}
