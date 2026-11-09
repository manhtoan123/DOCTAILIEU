/** Negotiated activity stream. Opt-in text is provisional; only the final result completes it. */
import {isGemmaModel} from '../types/ai-models';
export const AI_STREAM_TYPE='application/x-ndjson';
export const AI_STREAM_FIRST_MS=45_000;
/** Gemma cold starts can precede any answer text; both endpoints share this bound. */
export const aiFirstAnswerMs=(model:string)=>isGemmaModel(model)?90_000:AI_STREAM_FIRST_MS;
export const AI_STREAM_IDLE_MS=7_000;
export const AI_STREAM_TOTAL_MS=180_000;
export const AI_STREAM_CLIENT_GRACE_MS=10_000;
export const AI_STREAM_MAX_BYTES=1024*1024;
export const AI_STREAM_MAX_EVENTS=4096;
/** Safe lease evidence: hash/slot are derived identifiers, never credential material. */
export interface AiStreamLease {requestId:string;leaseIdHash:string;keySlot:number;keysAvailable?:number;freeKeys?:number}
