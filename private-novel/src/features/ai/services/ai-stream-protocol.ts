/** Negotiated activity stream. Progress is not a translation or a completion. */
export const AI_STREAM_TYPE='application/x-ndjson';
export const AI_STREAM_FIRST_MS=60_000;
export const AI_STREAM_IDLE_MS=30_000;
export const AI_STREAM_TOTAL_MS=180_000;
export const AI_STREAM_CLIENT_GRACE_MS=10_000;
export const AI_STREAM_MAX_BYTES=1024*1024;
export const AI_STREAM_MAX_EVENTS=4096;
/** Safe lease evidence: hash/slot are derived identifiers, never credential material. */
export interface AiStreamLease {requestId:string;leaseIdHash:string;keySlot:number;keysAvailable?:number}
