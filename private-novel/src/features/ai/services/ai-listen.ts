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
export function aiSpeechEndAction(input:{aiReady:boolean;availableLength:number;availableText?:string;previousText?:string;spokenEnd:number;autoNext:boolean;hasNext:boolean}):AiSpeechEndAction{
 const {aiReady,availableLength,autoNext,hasNext}=input;let spokenEnd=input.spokenEnd;
 if(input.previousText&&input.availableText!==undefined&&!input.availableText.startsWith(input.previousText)){
  // A replacement draft has different character offsets. Finish the queued
  // audio, then continue at the same paragraph order in the new draft.
  // Ignore empty/punctuation-only lines that the TTS player never speaks.
  const rows=(text:string)=>[...text.matchAll(/[^\r\n]+/gu)].filter(row=>/[\p{L}\p{N}]/u.test(row[0]));
  // Closing quotes/punctuation may be outside the player's final spoken chunk.
  const heard=rows(input.previousText).filter(row=>row.index!+row[0].search(/[\p{L}\p{N}][^\p{L}\p{N}]*$/u)<Math.max(0,input.spokenEnd)).length;
  const next=rows(input.availableText)[heard];
  if(!next)return aiReady&&autoNext&&hasNext?{action:'advance'}:{action:'wait'};
  spokenEnd=next.index!;
 }
 const more=input.availableText===undefined?spokenEnd+1<availableLength:/[\p{L}\p{N}]/u.test(input.availableText.slice(Math.max(0,spokenEnd)));
 if(more){
  const end=Math.max(0,spokenEnd);
  // The join newline extends the previous strict sentence. Starting on that
  // newline can select its natural audio group and replay the heard prefix.
  const gap=input.availableText?.slice(end).match(/^[^\p{L}\p{N}]*/u)?.[0]??'';
  // Preserve indentation: the strict sentence starts just after the last
  // newline, before spaces/tabs that belong to its text.
  return {action:'continue',from:end+gap.lastIndexOf('\n')+1};
 }
 if(!aiReady)return {action:'wait'};
 if(autoNext&&hasNext)return {action:'advance'};
 return {action:'wait'};
}
