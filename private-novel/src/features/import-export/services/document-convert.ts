import {zipSync,strToU8} from 'fflate';
import {importEpub} from './epub-import';
import {db,deleteBook} from '../../../core/db';
import {hashBlob} from './backup';
import {uid,cleanTitle} from '../../../core/domain';
import {throwIfImportAborted,type ImportStatus} from './importer';
export interface ConvertedDocument {sections:{title:string;html:string}[];assets:Record<string,Uint8Array>}
export const xmlEscape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
export async function prepareDocument(file:File,signal:AbortSignal):Promise<File>{
 if(!/\.(pdf|docx)$/i.test(file.name)||!file.size||file.size>40*1048576)throw Error('Chọn PDF hoặc DOCX tối đa 40 MiB.');
 throwIfImportAborted(signal);
 const converted=/\.pdf$/i.test(file.name)?await (await import('./pdf-convert')).convertPdf(file,signal):await (await import('./docx-convert')).convertDocx(file,signal);
 throwIfImportAborted(signal);
 const {sanitizeEpubChapter}=await import('./epub-model');
 for(const [i,section] of converted.sections.entries()){throwIfImportAborted(signal);sanitizeEpubChapter(`<html><body>${section.html}</body></html>`,`section${i}.xhtml`);}
 return packageDocument(converted,cleanTitle(file.name));
}
export function packageDocument(doc:ConvertedDocument,title:string):File{
 if(!doc.sections.length||doc.sections.length>2000)throw Error('Tài liệu không có nội dung hoặc quá 2.000 phần.');
 const entries:Record<string,Uint8Array>={mimetype:strToU8('application/epub+zip'),'META-INF/container.xml':strToU8('<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>')};
 let total=0;for(const [path,data] of Object.entries(doc.assets)){if(!/^image\d+\.(png|jpeg|jpg|gif|webp)$/.test(path)||data.length>8*1048576)throw Error('Ảnh tài liệu vượt giới hạn.');total+=data.length;entries[path]=data;}
 if(total>24*1048576)throw Error('Tổng ảnh vượt 24 MiB; hãy chia nhỏ tài liệu để giữ đủ ảnh khi đọc.');
 const manifest:string[]=[],spine:string[]=[];
 doc.sections.forEach((section,i)=>{const path=`section${i}.xhtml`,html=`<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${xmlEscape(section.title)}</title></head><body>${section.html}</body></html>`;if(html.length>500000)throw Error('Một phần tài liệu quá lớn.');entries[path]=strToU8(html);manifest.push(`<item id="s${i}" href="${path}" media-type="application/xhtml+xml"/>`);spine.push(`<itemref idref="s${i}"/>`);});
 for(const path of Object.keys(doc.assets))manifest.push(`<item id="${path}" href="${path}" media-type="image/${path.endsWith('.jpg')?'jpeg':path.split('.').at(-1)}"/>`);
 entries['nav.xhtml']=strToU8(`<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol>${doc.sections.map((section,i)=>`<li><a href="section${i}.xhtml">${xmlEscape(section.title)}</a></li>`).join('')}</ol></nav></body></html>`);
 if(entries['nav.xhtml'].length>524288)throw Error('Mục lục tài liệu vượt 512 KiB; hãy rút ngắn tiêu đề chương.');
 if(doc.sections.some((_,i)=>entries[`section${i}.xhtml`].length>1048576))throw Error('Bố cục một chương vượt 1 MiB; chưa nhập dữ liệu.');
 manifest.push('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>');
 entries['book.opf']=strToU8(`<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>${xmlEscape(title)}</dc:title></metadata><manifest>${manifest.join('')}</manifest><spine>${spine.join('')}</spine></package>`);
 if(Object.values(entries).reduce((n,v)=>n+v.length,0)>128*1048576)throw Error('Nội dung chuyển đổi vượt 128 MiB.');
 return new File([new Uint8Array(zipSync(entries,{level:0}))],`${title}.epub`,{type:'application/epub+zip'});
}
export async function importDocument(original:File,prepared:File,title:string,onProgress:(p:ImportStatus)=>void,signal:AbortSignal,options:{dedupe?:'none'}={}){
 const sha256=await hashBlob(original);throwIfImportAborted(signal);
 if(options.dedupe!=='none'&&await db.sources.where('sha256').equals(sha256).count())throw Error('Tài liệu này đã có trên thiết bị.');
 const result=await importEpub(prepared,title,onProgress,signal,{dedupe:'none'});
 try{throwIfImportAborted(signal);const id=uid();await db.transaction('rw',db.sources,async()=>{throwIfImportAborted(signal);await db.sources.add({id,bookId:result.id,name:original.name,relativePath:original.webkitRelativePath||original.name,encoding:/\.pdf$/i.test(original.name)?'pdf':'docx',sha256,bytes:original.size,blob:original});throwIfImportAborted(signal);});throwIfImportAborted(signal);return result;}catch(error){await deleteBook(result.id);throw error;}
}
