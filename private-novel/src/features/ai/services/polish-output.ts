import {AiTranslateClientError} from './ai-translate';
import {isTransientAiFailure} from './ai-recovery';
import type {PolishPair} from './convert-polish';

export interface PolishTerm {convert:string;source:string;meaning:string}
export interface SkippedPolishPart {part:number;message:string}
/** Half-open UTF-16 offsets in the base Convert and the assembled output. */
export interface PolishFallbackRange {sourceStart:number;sourceEnd:number;targetStart:number;targetEnd:number;originalStart?:number;originalEnd?:number}

export function combinePolishTerms(groups:(readonly PolishTerm[]|undefined)[]):PolishTerm[]{
  const unique = new Map<string,PolishTerm>();
  for (const terms of groups) for (const term of terms??[]) {
    const key = JSON.stringify([term.source,term.meaning]);
    if (!unique.has(key)) unique.set(key,term);
  }
  return [...unique.values()].sort((a,b)=>Array.from(b.source).length-Array.from(a.source).length || a.source.localeCompare(b.source));
}

export function readPolishOutput(answer:string,pairs:PolishPair[],requireSections=false){
  const framed=answer.trim().replace(/^```(?:text|xml|markdown)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/iu,'$1');
  // A custom prompt from an older version can still return plain prose.
  if (!requireSections&&!/<\/?BAN_(?:TU_DIEN|DICH)\b/i.test(framed)) return {text:answer,terms:[] as PolishTerm[]};
  const sections = /^\s*<BAN_TU_DIEN>[ \t]*\r?\n?([\s\S]*?)<\/BAN_TU_DIEN>\s*<BAN_DICH>[ \t]*\r?\n?([\s\S]*?)<\/BAN_DICH>\s*$/iu.exec(framed);
  if (!sections || /<\/?BAN_(?:TU_DIEN|DICH)\b/i.test(sections[2])) {
    throw new AiTranslateClientError('ai_invalid_response','Hai phần từ điển và bản dịch không đúng định dạng.',undefined,'polish_result');
  }
  const normalizeConvert=(value:string)=>value.normalize('NFC').toLowerCase().replace(/\s+/gu,' ');
  const evidence=pairs.map(pair=>({original:pair.original,converted:normalizeConvert(pair.converted)}));
  const terms:PolishTerm[] = [];
  for (const line of sections[1].split(/\r?\n/)) {
    const row=line.trim().replace(/^(?:[-*•]|\d+[.)])\s+/u,'').replace(/^\*\*(.+)\*\*$/u,'$1');
    const match = /^(.+?)\s*[:：]\s*\$\s*(\p{Script=Han}+)\s*[=＝]\s*(.+)$/u.exec(row);
    if (!match) continue;
    const convert=match[1].trim().replace(/^\{([^{}]+)\}$/u,'$1').trim(),source=match[2],meaning=match[3].trim();
    if (!convert || convert.length>256 || source.length>256 ||
        !meaning || meaning.length>2048 || /[\p{Script=Han}\x00-\x1f]/u.test(meaning)) continue;
    const snippet=normalizeConvert(convert);
    if (!evidence.some(pair=>pair.original.includes(source)&&pair.converted.includes(snippet))) continue;
    terms.push({convert,source,meaning});
    if (terms.length>=64) break;
  }
  return {text:sections[2],terms:combinePolishTerms([terms])};
}

/** A bad part can keep its original Convert. Quota, auth and config errors still pause the run. */
export function maySkipPolishPart(error:unknown):boolean{
  if (!(error instanceof AiTranslateClientError) || error.status===429 || error.code==='ai_rate_limited') return false;
  if (error.status!==undefined && error.status>=400 && error.status<500 && error.status!==408) return false;
  if (['ai_provider_unavailable','ai_gateway_error','ai_recovery_exhausted'].includes(error.code)) return false;
  return ['ai_invalid_response','ai_incomplete_result','ai_empty_result','ai_response_too_large','ai_untranslated_result'].includes(error.code)||isTransientAiFailure(error);
}
