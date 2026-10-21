import {createSHA256} from 'hash-wasm';
import {sanitizeDownloadFilename} from '../../library/services/title-resolver';
import {parseOriginalDescriptor} from '../../sync-cloud/services/cloud-original-schema';

export interface AnthologyMarker {offset:number;line:number;title:string;number:string}
export interface AnthologyOutline {bytes:number;sha256:string;encoding:string;markers:AnthologyMarker[];starts:number[];warnings:string[]}
export interface AnthologyGroup {start:number;end:number;title:string;markerIndex:number;headingCount:number}
const MAX_BYTES=40*1024*1024,CHUNK=262144,MAX_MARKERS=2000;
const heading=/^\s*(?:#{1,6}\s*)?第\s*([0-9０-９零〇一二两兩三四五六七八九十百千]+)\s*[章部卷篇]\s*(.*)$/u;
const storyHeading=/^(?:(?:书名|作品)\s*[:：]\s*\S.*|文件\s*[0-9０-９]+\s*[:：]\s*.+\.txt\s*|《[^》]+》\s*作者\s*[:：]\s*\S.*)$/iu;
const encodingOf=(prefix:Uint8Array,fallback:string)=>prefix[0]===0xef&&prefix[1]===0xbb&&prefix[2]===0xbf?'utf-8':prefix[0]===0xff&&prefix[1]===0xfe?'utf-16le':prefix[0]===0xfe&&prefix[1]===0xff?'utf-16be':fallback==='gbk'?'gb18030':fallback;
function checkSize(file:Blob){if(!file.size||file.size>MAX_BYTES)throw Error('Tuyển tập TXT phải có dữ liệu và không vượt 40 MiB.');}
export async function hashAnthology(file:Blob,signal?:AbortSignal){
  checkSize(file);const hash=await createSHA256();hash.init();
  for(let offset=0;offset<file.size;offset+=CHUNK){signal?.throwIfAborted();hash.update(new Uint8Array(await file.slice(offset,offset+CHUNK).arrayBuffer()));}
  signal?.throwIfAborted();return hash.digest('hex');
}
function markerTitle(marker:AnthologyMarker){return marker.title.replace(heading,'$2').replace(/^(?:书名|作品)\s*[:：]\s*/u,'').replace(/^文件\s*[0-9０-９]+\s*[:：]\s*(.+)\.txt\s*$/iu,'$1').replace(/^《([^》]+)》\s*作者\s*[:：].*$/u,'$1').trim()||marker.title;}
function commonPrefix(values:string[]){let result=values[0]||'';for(const value of values.slice(1)){let index=0;while(index<result.length&&result[index]===value[index])index++;result=result.slice(0,index);}return result;}
function groupTitle(markers:AnthologyMarker[]){
  const values=markers.map(markerTitle),prefix=commonPrefix(values);
  const title=markers.length>1&&prefix.length>=2?prefix.replace(/[\s0-9０-９·:：第章节節【（(\[]+$/u,''):values[0].replace(/\s*[【（(]?\s*[上中下](?:篇|部)?\s*[】）)]?\s*$/u,'');
  return title.trim()||values[0];
}
export async function scanAnthology(file:Blob,fallbackEncoding:string,pattern='',signal?:AbortSignal):Promise<AnthologyOutline>{
  checkSize(file);const regex=pattern?new RegExp(pattern,'iu'):undefined;
  const encoding=encodingOf(new Uint8Array(await file.slice(0,3).arrayBuffer()),fallbackEncoding);
  if(!['utf-8','utf-16le','utf-16be','gb18030'].includes(encoding))throw Error('Encoding tuyển tập không được hỗ trợ.');
  const unit=encoding.startsWith('utf-16')?2:1;
  if(file.size%unit)throw Error('Dữ liệu UTF-16 bị thiếu byte.');
  const decoder=new TextDecoder(encoding,{fatal:true}),hash=await createSHA256();hash.init();
  let markers:AnthologyMarker[]=[];const storyMarkers:AnthologyMarker[]=[],buffer=new Uint8Array(2048);let markerCount=0,storyCount=0,length=0,lineStart=0,line=1,previousCR=false;
  const finish=(next:number)=>{
    if(length<=buffer.length){
      const title=decoder.decode(buffer.subarray(0,length)).trim();
      if(title&&title.length<=300){
        const match=heading.exec(title),named=storyHeading.test(title);
        if(regex?regex.test(title):!!match||named){
          const marker={offset:lineStart,line,title,number:match?.[1].replace(/[０-９]/gu,value=>String(value.charCodeAt(0)-0xff10))||''};
          markerCount++;if(markers.length<MAX_MARKERS)markers.push(marker);
          if(!regex&&named){storyCount++;if(storyMarkers.length<MAX_MARKERS)storyMarkers.push(marker);}
        }
      }
    }
    length=0;lineStart=next;line++;
  };
  for(let offset=0;offset<file.size;offset+=CHUNK){
    signal?.throwIfAborted();const bytes=new Uint8Array(await file.slice(offset,offset+CHUNK).arrayBuffer());hash.update(bytes);
    for(let index=0;index<bytes.length;index+=unit){
      const value=unit===1?bytes[index]:encoding==='utf-16le'?bytes[index]+bytes[index+1]*256:bytes[index]*256+bytes[index+1];
      if(value===10&&previousCR)lineStart=offset+index+unit;
      else if(value===10||value===13)finish(offset+index+unit);
      else{if(length+unit<=buffer.length)buffer.set(bytes.subarray(index,index+unit),length);length+=unit;}
      previousCR=value===13;
    }
  }
  if(length)finish(file.size);signal?.throwIfAborted();
  const preferStories=!regex&&storyCount>=2;
  if((preferStories?storyCount:markerCount)>MAX_MARKERS)throw Error(regex?'Regex khớp quá 2.000 mốc. Hãy giới hạn mẫu vào dòng tên truyện, không phải tiêu đề chương.':preferStories?'Có quá 2.000 dòng tên truyện. Dùng Regex cụ thể hơn để loại các dòng giới thiệu hoặc chọn tuyển tập nhỏ hơn. Không có dữ liệu nào được nhập.':'Có quá 2.000 tiêu đề nhưng chưa nhận diện đủ tên truyện riêng. Mở Regex mốc truyện và chọn mẫu khớp dòng tên truyện; không dùng mẫu tiêu đề chương. Không có dữ liệu nào được nhập.');
  if(preferStories)markers=storyMarkers;
  if(!markers.length)throw Error('Chưa tìm được mốc. Nhập Regex nhận diện tiêu đề truyện, hoặc dùng cách nhập thông thường.');
  const starts=[0],warnings:string[]=[];
  if(preferStories)warnings.push('Đang ưu tiên dòng tên truyện (书名/作品, 文件N: tên.txt hoặc 《tên》 作者: tác giả). Các tiêu đề chương nằm bên trong từng truyện; hãy kiểm tra đây là ranh giới nội dung, không phải danh sách giới thiệu.');
  const repeatedRuns=markers.filter((marker,index)=>index>0&&marker.number&&marker.number===markers[index-1].number).length;
  for(let index=1;index<markers.length;index++){
    const previous=markers[index-1],current=markers[index];
    if(regex||!current.number||!previous.number||(repeatedRuns>=2&&current.number!==previous.number))starts.push(index);
    const before=Number(previous.number),after=Number(current.number);
    if(Number.isInteger(before)&&Number.isInteger(after)&&after>before+1)warnings.push(`Số thứ tự ngoài nhảy từ ${before} sang ${after}; không tự tạo phần bị thiếu.`);
    if(current.number&&current.number===previous.number&&commonPrefix([markerTitle(previous),markerTitle(current)]).length<2)warnings.push(`Dòng ${current.line}: tên khác mốc trước dù cùng số; kiểm tra có phải truyện mới.`);
    if(current.number!==previous.number&&markerTitle(previous).replace(/[【（(]?[上中下](?:篇)?[】）)]?$/u,'')===markerTitle(current).replace(/[【（(]?[上中下](?:篇)?[】）)]?$/u,''))warnings.push(`Dòng ${current.line}: tên gần giống mốc trước; kiểm tra có bị đánh nhầm số.`);
  }
  if(starts.length===1)warnings.push('Chưa đủ dấu hiệu để tách tự động. Chọn các mốc bắt đầu truyện ở danh sách dưới.');
  return {bytes:file.size,sha256:hash.digest('hex'),encoding,markers,starts,warnings:[...new Set(warnings)]};
}
export function anthologyGroups(outline:AnthologyOutline,starts:readonly number[]):AnthologyGroup[]{
  if(!starts.length||starts.length>100||starts[0]!==0||starts.some((value,index)=>!Number.isInteger(value)||value<0||value>=outline.markers.length||(index>0&&value<=starts[index-1])))throw Error('Chọn từ 1 đến 100 mốc theo thứ tự, giữ mốc đầu tiên.');
  if(!Number.isSafeInteger(outline.bytes)||outline.bytes<=0||outline.bytes>MAX_BYTES||!['utf-8','utf-16le','utf-16be','gb18030'].includes(outline.encoding)||!outline.markers.length||outline.markers.length>MAX_MARKERS||outline.markers.some((marker,index)=>!Number.isSafeInteger(marker.offset)||marker.offset<0||marker.offset>=outline.bytes||(outline.encoding.startsWith('utf-16')&&marker.offset%2!==0)||(index>0&&marker.offset<=outline.markers[index-1].offset)))throw Error('Ranh giới tuyển tập không hợp lệ.');
  return starts.map((markerIndex,index)=>({markerIndex,start:index===0?0:outline.markers[markerIndex].offset,end:index+1<starts.length?outline.markers[starts[index+1]].offset:outline.bytes,title:groupTitle(outline.markers.slice(markerIndex,starts[index+1]??outline.markers.length)),headingCount:(starts[index+1]??outline.markers.length)-markerIndex}));
}
export async function deriveAnthologyFiles(file:File,outline:AnthologyOutline,starts:readonly number[],titles:readonly string[],signal?:AbortSignal){
  const groups=anthologyGroups(outline,starts);
  if(groups.length<2||titles.length!==groups.length||titles.some(title=>!title.trim()||title.length>300||/[\u0000-\u001f\u007f-\u009f]/u.test(title)||Array.from(title).some(character=>character.length===1&&/[\ud800-\udfff]/u.test(character))))throw Error('Cần ít nhất 2 truyện, mỗi truyện có tên hợp lệ tối đa 300 ký tự.');
  signal?.throwIfAborted();
  if(!/^[a-f0-9]{64}$/.test(outline.sha256)||file.size!==outline.bytes||encodingOf(new Uint8Array(await file.slice(0,3).arrayBuffer()),outline.encoding)!==outline.encoding||await hashAnthology(file,signal)!==outline.sha256)throw Error('File đã thay đổi từ lúc xem trước. Chọn lại file để phân tích.');
  const unit=outline.encoding.startsWith('utf-16')?2:1;
  for(const group of groups.slice(1)){
    signal?.throwIfAborted();const previous=new Uint8Array(await file.slice(group.start-unit,group.start).arrayBuffer());
    const value=unit===1?previous[0]:outline.encoding==='utf-16le'?previous[0]+previous[1]*256:previous[0]*256+previous[1];
    if(value!==10&&value!==13)throw Error('Mốc tách không nằm đầu dòng. Hãy phân tích lại file.');
  }
  const parent=sanitizeDownloadFilename(file.name);
  return groups.map((group,index)=>{
    signal?.throwIfAborted();const name=`${String(index+1).padStart(3,'0')} - ${sanitizeDownloadFilename(Array.from(titles[index]).slice(0,90).join(''))}`;
    const relativePath=`${parent}/${name}`;
    try{parseOriginalDescriptor({version:1,sourceId:crypto.randomUUID(),name,relativePath,encoding:outline.encoding,sha256:outline.sha256,bytes:group.end-group.start});}
    catch{throw Error('Tên file hoặc đường dẫn phần tách không hợp lệ. Đổi tên tuyển tập hoặc tên truyện.');}
    const derived=new File([file.slice(group.start,group.end)],name,{type:'text/plain',lastModified:file.lastModified});
    Object.defineProperty(derived,'webkitRelativePath',{value:relativePath});return derived;
  });
}
