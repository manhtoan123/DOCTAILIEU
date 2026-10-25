import {expect,it,vi} from 'vitest';
import {AiReadingSession,AI_DEFAULTS} from '../src/features/ai/services/ai-reading';
import {AiTranslateClientError} from '../src/features/ai/services/ai-translate';
import {readAiDivision} from '../src/features/ai/services/ai-division';
import {translateComplete} from '../src/features/ai/services/ai-complete';
const source=(length:number)=>({bookId:'division-fixture',id:'one',revision:1,text:'甲'.repeat(length)});
const settings={...AI_DEFAULTS,splitParts:false,fallbackModels:[]};
const response={result:'Bản dịch ♾',model:settings.model,finishReason:'STOP',inputTokens:1,outputTokens:1};
const cut=()=>new AiTranslateClientError('ai_incomplete_result','synthetic',502,'output_limit');
it.each([[5400,true,3,'parallel'],[33000,false,2,'request_limit']] as const)('reports actual planned parts for length %i split=%s',async(length,splitParts,count,reason)=>{
 const calls:string[]=[];const session=new AiReadingSession(async input=>{calls.push(input.text);return response;},undefined,undefined,false);
 try{const result=await session.request(source(length),{...settings,splitParts},[]);expect(calls).toHaveLength(count);expect(calls.join('')).toBe(source(length).text);expect(result.division).toEqual({version:1,parts:count,reasons:[reason]});}finally{session.clear();}
});
it('split off reports nested recovery without adding sends or changing output',async()=>{
 const send=vi.fn().mockRejectedValueOnce(cut()).mockRejectedValueOnce(new AiTranslateClientError('ai_untranslated_result','synthetic',502,'untranslated_source')).mockResolvedValue(response);
 const splits:any[]=[];const result=await translateComplete({text:source(1600).text,model:settings.model},new AbortController().signal,send,true,{id:'0',completed:new Map(),save:async()=>{},onSplit:r=>splits.push(r)});
 expect(result.division).toEqual({version:1,parts:3,reasons:['output_limit','untranslated']});expect(send).toHaveBeenCalledTimes(5);expect(result.result).toBe(Array(3).fill(response.result).join('\n'));expect(splits).toEqual(['output_limit','untranslated']);
});
it('retains recovery cause through saved children and resuming without resending complete siblings',async()=>{
 const completed=new Map();let sends=0;
 await expect(translateComplete({text:source(800).text,model:settings.model},new AbortController().signal,async()=>{sends++;if(sends===1)throw cut();if(sends===3)throw Error('synthetic stop');return response;},true,{id:'0',completed,save:async(id,r)=>{completed.set(id,r);}})).rejects.toThrow('synthetic stop');
 const send=vi.fn().mockResolvedValue(response),result=await translateComplete({text:source(800).text,model:settings.model},new AbortController().signal,send,true,{id:'0',completed,save:async(id,r)=>{completed.set(id,r);}});
 expect(send).toHaveBeenCalledOnce();expect(result.division).toEqual({version:1,parts:2,reasons:['output_limit']});
});
it('keeps single successful result identity and treats unknown legacy information honestly',async()=>{
 const session=new AiReadingSession(async()=>response,undefined,undefined,false);try{expect(await session.request(source(200),settings,[])).toBe(response);}finally{session.clear();}
 expect(response).not.toHaveProperty('division');expect(readAiDivision(undefined)).toBeUndefined();
});
it('sanitizes optional facts and rejects bad counts/reasons without trusting unknown fields',()=>{
 expect(readAiDivision({version:1,parts:2,reasons:['timeout','timeout'],secret:'ignored'})).toEqual({version:1,parts:2,reasons:['timeout']});
 for(const value of [{version:1,parts:2,reasons:[]},{version:1,parts:0,reasons:['parallel']},{version:1,parts:1.5,reasons:[]},{version:1,parts:4097,reasons:['parallel']},{version:1,parts:2,reasons:['made up']}])expect(readAiDivision(value)).toBeUndefined();
});
