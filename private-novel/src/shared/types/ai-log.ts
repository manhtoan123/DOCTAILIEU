import type {AiDivisionReason} from '../../features/ai/services/ai-division';
import type {AiExecution} from '../../features/ai/services/ai-execution';

export type AiLogPurpose='foreground'|'prewarm'|'trial';
/** Random UUIDs and structural paths only: never a book/chapter/content identifier. */
export interface AiLogTrace {
 workId:string;partPath:string;parentPartPath?:string;purpose:AiLogPurpose;initialPurpose:AiLogPurpose;
 fallbackIndex:number;retryOfWorkId?:string;fallbackCause?:'timeout'|'network'|'quota'|'upstream'|'validation'|'output_limit'|'unknown';
}
export interface AiLogContext {
 format?:'txt'|'epub';appVersion?:string;policyVersion?:string;validationVersion?:string;
 contextChars?:number;strategy?:'whole'|'split';splitDepth?:number;splitReason?:AiDivisionReason|'invalid_result'|'size_limit';
 trialGroupId?:string;trialVariant?:'A'|'B';
}
/** All durations use the same monotonic clock epoch; wall-clock UTC is informational. */
export interface AiLogClientTiming {
 epoch:string;sequence:number;foregroundAt?:number;foregroundMs?:number;previewVisibleMs?:number;
 acceptedContentVisibleMs?:number;workCompleteMs?:number;foregroundAcceptedMs?:number;foregroundCompleteMs?:number;
}
export interface AiLogClientFacts {
 timing:AiLogClientTiming;leafParts?:number;acceptedLeafParts?:number;retries?:number;modelSwitches?:number;
 validation?:'accepted'|'rejected'|'incomplete'|'unknown';recovery?:'none'|'retry'|'model'|'split'|'mixed';
 completeness?:'observed'|'partial';
 parts?:{partPath:string;parentPartPath?:string;requestId?:string;model?:string;splitReason?:AiDivisionReason;validationReason?:'mapping'|'untranslated'|'output_limit'|'invalid_response';validation:'accepted'|'rejected'|'incomplete'|'unknown'}[];
}
/** Confirmed at the server; client POST may never contain this object. */
export interface AiLogServerFacts {
 execution?:AiExecution;usage?:{inputTokens?:number;outputTokens?:number;thinkingTokens?:number;totalTokens?:number};
 timing:{clock:'server-monotonic';preparationMs?:number;firstSendMs?:number;admissionMs?:number;headersMs?:number;firstChunkMs?:number;completeMs:number};
 finishReason?:'STOP'|'MAX_TOKENS'|'SAFETY'|'RECITATION'|'OTHER'|'BLOCKLIST'|'PROHIBITED_CONTENT'|'SPII'|'MALFORMED_FUNCTION_CALL'|'LANGUAGE';
}
export interface AiLogTelemetry {metricVersion:1;trace?:AiLogTrace;context?:AiLogContext;client?:AiLogClientFacts;server?:AiLogServerFacts}
/** Optional request header JSON. Invalid/unsupported input is ignored and never reflected. */
export interface AiLogRequestContext {schemaVersion:2;trace:AiLogTrace;context?:AiLogContext}
export const AI_LOG_CONTEXT_HEADER='X-AI-Log-Context';
export const AI_LOG_CONTEXT_MAX_BYTES=2048;

/** Allowlisted diagnostics only. Never include text, prompts, Names or credentials. */
export interface AiLogEvent {
 id:string;kind:'request'|'chapter';startedAt:number;updatedAt:number;durationMs:number;
 status:'success'|'error'|'cancelled'|'cache';model:string;errorCode?:string;reason?:string;
 sourceChars:number;attempts:number;upstream?:{status:number;errorCode?:string;durationMs:number}[];
 schemaVersion?:2;telemetry?:AiLogTelemetry;
}
export interface AiLogResponse {
 rows:AiLogEvent[];serverNow:number;earliest:number|null;limit:number;retentionDays:number;
 schemaVersions?:number[];
}
