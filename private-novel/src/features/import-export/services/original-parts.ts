export const ORIGINAL_SINGLE_REQUEST_BYTES=64*1024*1024;
export const ORIGINAL_PART_BYTES=16*1024*1024;
export const originalPartCount=(bytes:number)=>Math.ceil(bytes/ORIGINAL_PART_BYTES);
export function originalPartBytes(bytes:number,part:number){if(!Number.isSafeInteger(part)||part<1||part>originalPartCount(bytes))throw Error('invalid_original_part');return Math.min(ORIGINAL_PART_BYTES,bytes-(part-1)*ORIGINAL_PART_BYTES);}
export const originalPartKey=(key:string,part:number,sha:string)=>`${key}.parts/${part}-${sha}`;
