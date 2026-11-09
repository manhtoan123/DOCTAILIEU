export const TEXT_ENCODINGS=['utf-8','gb18030','utf-16le','utf-16be'] as const;
export type TextEncoding=typeof TEXT_ENCODINGS[number];
export const isTextEncoding=(value:unknown):value is TextEncoding=>TEXT_ENCODINGS.some(encoding=>encoding===value);
const LABELS:Record<string,string>={'utf-8':'UTF-8',gb18030:'GB18030 / GBK','utf-16le':'UTF-16 LE','utf-16be':'UTF-16 BE'};
export const textEncodingLabel=(value:string)=>LABELS[value]??value;
export function textEncodingBom(bytes:Uint8Array):TextEncoding|undefined{
 if(bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf)return 'utf-8';
 if(bytes[0]===0xff&&bytes[1]===0xfe)return 'utf-16le';
 if(bytes[0]===0xfe&&bytes[1]===0xff)return 'utf-16be';
}
/** Only strong byte-order evidence. Pure CJK without a BOM can be ambiguous;
 * the manual choice remains available instead of pretending to know its codec. */
function utf16Hint(bytes:Uint8Array):TextEncoding|undefined{
 let le=0,be=0,leLines=0,beLines=0,evenZero=0,oddZero=0;
 const ascii=(value:number)=>value===9||value===10||value===13||value>=32&&value<=126;
 for(let i=0;i+1<bytes.length;i+=2){
  if(bytes[i]===0)evenZero++;if(bytes[i+1]===0)oddZero++;
  if(bytes[i+1]===0&&ascii(bytes[i])){le++;if(bytes[i]===10)leLines++;}
  if(bytes[i]===0&&ascii(bytes[i+1])){be++;if(bytes[i+1]===10)beLines++;}
 }
 const pairs=Math.floor(bytes.length/2);
 if(le>=4&&le>be*4&&(le>pairs*.2||leLines>=2&&oddZero>evenZero*8))return 'utf-16le';
 if(be>=4&&be>le*4&&(be>pairs*.2||beLines>=2&&evenZero>oddZero*8))return 'utf-16be';
}
type ScanProgress=(read:number,total:number)=>void;
async function validText(blob:Blob,encoding:TextEncoding,signal?:AbortSignal,onRead?:(read:number)=>void){
 const decoder=new TextDecoder(encoding,{fatal:true});
 const decode=(bytes?:ArrayBuffer,stream=false)=>{try{decoder.decode(bytes,{stream});return true;}catch(error){signal?.throwIfAborted();if(error instanceof TypeError)return false;throw error;}};
 for(let offset=0;offset<blob.size;offset+=262144){signal?.throwIfAborted();const bytes=await blob.slice(offset,offset+262144).arrayBuffer();signal?.throwIfAborted();if(!decode(bytes,true))return false;onRead?.(offset+bytes.byteLength);}
 signal?.throwIfAborted();return decode();
}
/** Resolve each file independently; validate every byte and the decoder tail
 * before consumers can publish chapters. The original Blob is never rewritten. */
export async function resolveTextEncoding(blob:Blob,selected='auto',signal?:AbortSignal,onProgress?:ScanProgress):Promise<TextEncoding>{
 signal?.throwIfAborted();let choice=selected.toLowerCase().trim();if(choice==='gbk')choice='gb18030';if(choice==='utf8')choice='utf-8';
 if(choice!=='auto'&&!isTextEncoding(choice))throw Error('Encoding không được hỗ trợ.');
 const prefix=new Uint8Array(await blob.slice(0,65536).arrayBuffer());signal?.throwIfAborted();
 const fixed=textEncodingBom(prefix)??(choice==='auto'?utf16Hint(prefix):choice as TextEncoding);
 if(fixed){if(await validText(blob,fixed,signal,read=>onProgress?.(read,blob.size)))return fixed;throw Error(`File không hợp lệ với ${textEncodingLabel(fixed)}. Hãy kiểm tra file hoặc chọn lại encoding; chưa có nội dung nào được chấp nhận.`);}
 const candidates=['utf-8','gb18030'] as const,total=blob.size*candidates.length;
 for(const [index,encoding] of candidates.entries()){
  if(await validText(blob,encoding,signal,read=>onProgress?.(index*blob.size+read,total))){
   onProgress?.(total,total);
   return encoding;
  }
 }
 throw Error('Chưa nhận diện được encoding hợp lệ. Hãy chọn UTF-8, GB18030 / GBK hoặc UTF-16 trong Cách đọc file.');
}
