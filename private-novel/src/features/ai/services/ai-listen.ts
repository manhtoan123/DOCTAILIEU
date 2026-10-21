/** TTS gating for AI chapters: listenable as soon as a contiguous translated prefix exists. */
export function canStartPartialListen(input:{text:string}):boolean{
 return input.text.trim().length>0;
}
export type AiSpeechEndAction={action:'continue';from:number}|{action:'wait'}|{action:'advance'};
/**
 * Decide what happens when the TTS sentence list of the CURRENT text is exhausted.
 * - More translated text already exists -> continue from the last spoken boundary, never re-read.
 * - Chapter still translating -> wait; do not advance the chapter.
 * - Whole chapter translated and fully spoken -> only then may auto-next.
 */
export function aiSpeechEndAction(input:{aiReady:boolean;availableLength:number;spokenEnd:number;autoNext:boolean;hasNext:boolean}):AiSpeechEndAction{
 const {aiReady,availableLength,spokenEnd,autoNext,hasNext}=input;
 if(spokenEnd+1<availableLength)return {action:'continue',from:Math.max(0,spokenEnd)};
 if(!aiReady)return {action:'wait'};
 if(autoNext&&hasNext)return {action:'advance'};
 return {action:'wait'};
}
