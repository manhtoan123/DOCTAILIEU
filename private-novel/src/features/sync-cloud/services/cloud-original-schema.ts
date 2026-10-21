/** Pure STORAGE2 candidate contract. No storage, hashing, or upload is performed here. */
export const MAX_ORIGINAL_BYTES=40*1024*1024; // Existing batch-import MAX_BATCH_FILE_BYTES.
export const MAX_EPUB_ORIGINAL_BYTES=256*1024*1024;
export const originalByteLimit=(encoding:string)=>encoding==='epub'?MAX_EPUB_ORIGINAL_BYTES:MAX_ORIGINAL_BYTES;
export const MAX_ORIGINAL_DESCRIPTOR_BYTES=16*1024;
export const MAX_ORIGINAL_NAME_CHARS=1024;
export const MAX_ORIGINAL_PATH_CHARS=4096;
export const ORIGINAL_ENCODINGS=['utf-8','gb18030','utf-16le','utf-16be','epub'] as const;
export type OriginalEncoding=typeof ORIGINAL_ENCODINGS[number];
export interface OriginalDescriptor {
  version:1;sourceId:string;name:string;relativePath:string;encoding:OriginalEncoding;sha256:string;bytes:number;
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256=/^[0-9a-f]{64}$/;
const FIELDS=['version','sourceId','name','relativePath','encoding','sha256','bytes'];
const CONTROL_OR_LONE_SURROGATE=/[\u0000-\u001f\u007f-\u009f\uD800-\uDFFF]/u;
// Provenance remains literal; never decode it into an object key or local filesystem path.
function fail():never{throw new Error('invalid_original_descriptor');}
function uuid(value:unknown):string{if(typeof value!=='string'||!UUID.test(value))fail();return value as string;}
function text(value:unknown,max:number):string{
  if(typeof value!=='string'||!value.trim()||value.length>max||CONTROL_OR_LONE_SURROGATE.test(value))fail();
  return value as string;
}
function provenance(fileName:unknown,path:unknown):{name:string;relativePath:string}{
  const name=text(fileName,MAX_ORIGINAL_NAME_CHARS),relativePath=text(path,MAX_ORIGINAL_PATH_CHARS);
  if(/[\\/:]/.test(name)||name==='.'||name==='..'||/[\\:]/.test(relativePath))fail();
  const parts=relativePath.split('/');
  if(parts.some(part=>!part.trim()||part==='.'||part==='..')||parts.at(-1)!==name)fail();
  return {name,relativePath};
}
/** Exact own data fields: reject extensions instead of silently losing future protocol data. */
export function parseOriginalDescriptor(value:unknown):OriginalDescriptor{
  if(!value||typeof value!=='object'||Array.isArray(value))fail();
  const prototype=Object.getPrototypeOf(value);if(prototype!==Object.prototype&&prototype!==null)fail();
  const keys=Reflect.ownKeys(value);if(keys.length!==FIELDS.length||keys.some(key=>typeof key!=='string'||!FIELDS.includes(key)))fail();
  const row:Record<string,unknown>={};
  for(const field of FIELDS){const property=Object.getOwnPropertyDescriptor(value,field);if(!property||!('value'in property))fail();row[field]=property!.value;}
  if(row.version!==1||typeof row.sha256!=='string'||!SHA256.test(row.sha256)||typeof row.bytes!=='number'||!Number.isSafeInteger(row.bytes)||row.bytes<1||row.bytes>originalByteLimit(String(row.encoding))||!ORIGINAL_ENCODINGS.includes(row.encoding as OriginalEncoding)||row.encoding==='epub'&&(typeof row.name!=='string'||!/\.epub$/i.test(row.name)))fail();
  const descriptor:OriginalDescriptor={version:1,sourceId:uuid(row.sourceId),...provenance(row.name,row.relativePath),encoding:row.encoding as OriginalEncoding,sha256:row.sha256 as string,bytes:row.bytes as number};
  if(new TextEncoder().encode(JSON.stringify(descriptor)).byteLength>MAX_ORIGINAL_DESCRIPTOR_BYTES)fail();
  return descriptor;
}
/** Bound raw UTF8 JSON as well as parsed fields; no unbounded whitespace/extras payload. */
export function parseOriginalDescriptorJson(json:string):OriginalDescriptor{
  if(typeof json!=='string'||json.length>MAX_ORIGINAL_DESCRIPTOR_BYTES||new TextEncoder().encode(json).byteLength>MAX_ORIGINAL_DESCRIPTOR_BYTES)fail();
  let value:unknown;try{value=JSON.parse(json);}catch{fail();}return parseOriginalDescriptor(value);
}
/** Retry identity is book/source/whole SHA. Names and paths never enter the key. */
export function originalObjectKey(bookUuid:string,value:unknown):string{
  const bookId=uuid(bookUuid),descriptor=parseOriginalDescriptor(value);
  return `originals/v1/${bookId}/${descriptor.sourceId}/${descriptor.sha256}.bin`;
}
