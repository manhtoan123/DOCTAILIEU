/** Legacy JSON stays byte-identical. Oversized snapshots use a bounded JSON gzip envelope. */
export const MAX_CLOUD_BYTES=64*1048576;
export const MAX_CLOUD_DECODED_BYTES=256*1048576;
const MAX_GZIP_BYTES=48*1048576;
const format='thu-phong-cloud-compressed';
function abort(signal?:AbortSignal){if(signal?.aborted)throw new DOMException('Cancelled','AbortError');}
async function collect(stream:ReadableStream<Uint8Array>,limit:number,signal?:AbortSignal):Promise<Uint8Array>{
 const reader=stream.getReader(),chunks:Uint8Array[]=[];let size=0;const cancel=()=>{void reader.cancel().catch(()=>{});};signal?.addEventListener('abort',cancel,{once:true});
 try{abort(signal);for(;;){const part=await reader.read();abort(signal);if(part.done)break;size+=part.value.byteLength;if(size>limit)throw Error('Bản truyện cloud vượt giới hạn giải mã.');chunks.push(part.value);}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;}
 finally{signal?.removeEventListener('abort',cancel);await reader.cancel().catch(()=>{});reader.releaseLock();}
}
function base64(bytes:Uint8Array){const parts:string[]=[];for(let at=0;at<bytes.length;at+=32768)parts.push(String.fromCharCode(...bytes.subarray(at,at+32768)));return btoa(parts.join(''));}
export async function encodeCloudSnapshot(value:unknown,signal?:AbortSignal):Promise<Uint8Array>{
 abort(signal);const json=JSON.stringify(value);if(typeof json!=='string')throw Error('Bản cloud không hợp lệ.');if(json.length>MAX_CLOUD_DECODED_BYTES)throw Error('Bản truyện cloud vượt 256 MiB giải mã. Truyện local vẫn được giữ.');const bytes=new TextEncoder().encode(json);if(bytes.length>MAX_CLOUD_DECODED_BYTES)throw Error('Bản truyện cloud vượt 256 MiB giải mã. Truyện local vẫn được giữ.');if(bytes.length<=MAX_CLOUD_BYTES)return bytes;
 if(typeof CompressionStream==='undefined')throw Error('Trình duyệt chưa hỗ trợ nén bản truyện cloud lớn.');const compressed=await collect(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')),MAX_GZIP_BYTES,signal);abort(signal);const wire=new TextEncoder().encode(JSON.stringify({format,version:1,encoding:'gzip',decodedBytes:bytes.length,data:base64(compressed)}));if(wire.length>MAX_CLOUD_BYTES)throw Error('Bản truyện cloud vượt 64 MiB sau nén. Truyện local vẫn được giữ.');return wire;
}
export async function decodeCloudSnapshot(bytes:Uint8Array,signal?:AbortSignal):Promise<{value:unknown;decodedBytes:number}>{
 abort(signal);if(bytes.length>MAX_CLOUD_BYTES)throw Error('Bản cloud vượt 64 MiB.');const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(value?.format!==format)return {value,decodedBytes:bytes.length};
 if(Object.keys(value).length!==5||value.version!==1||value.encoding!=='gzip'||!Number.isSafeInteger(value.decodedBytes)||value.decodedBytes<1||value.decodedBytes>MAX_CLOUD_DECODED_BYTES||typeof value.data!=='string'||value.data.length>MAX_GZIP_BYTES/3*4||!value.data.length||value.data.length%4)throw Error('Bản cloud nén không hợp lệ.');
 let raw:string;try{raw=atob(value.data);}catch{throw Error('Bản cloud nén không hợp lệ.');}if(btoa(raw)!==value.data||raw.length>MAX_GZIP_BYTES||raw.charCodeAt(0)!==31||raw.charCodeAt(1)!==139)throw Error('Bản cloud nén không hợp lệ.');if(typeof DecompressionStream==='undefined')throw Error('Trình duyệt chưa hỗ trợ mở bản truyện cloud nén.');const compressed=Uint8Array.from(raw,c=>c.charCodeAt(0));abort(signal);const decoded=await collect(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')),value.decodedBytes,signal);if(decoded.length!==value.decodedBytes)throw Error('Bản cloud nén sai kích thước giải mã.');abort(signal);return {value:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decoded)),decodedBytes:decoded.length};
}
