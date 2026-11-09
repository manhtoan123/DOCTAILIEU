import {expect,it,vi} from 'vitest';
import {translateComplete} from '../src/features/ai/services/ai-complete';
import {AiTranslateClientError} from '../src/features/ai/services/ai-translate';
const result={result:'Đủ.',model:'gemini-3.5-flash',finishReason:'STOP',inputTokens:1,outputTokens:2};
const truncated=()=>new AiTranslateClientError('ai_incomplete_result','cut',502,'output_limit');
it.each(['ai_timeout','ai_gateway_error','ai_network_error'])('splits exhausted %s without changing source, model or names',async code=>{
 const text='中'.repeat(800),send=vi.fn().mockRejectedValueOnce(new AiTranslateClientError(code,'transient',504)).mockResolvedValue(result);
 expect(await translateComplete({text,model:result.model,names:{中:'Trung'}},new AbortController().signal,send)).toMatchObject({result:'Đủ.\nĐủ.'});
 expect(send).toHaveBeenCalledTimes(3);expect(send.mock.calls[1][0].text+send.mock.calls[2][0].text).toBe(text);expect(send.mock.calls[2][0].names).toEqual({中:'Trung'});
});
it('does not split rate limits, credentials or invalid models',async()=>{
 for(const [code,status] of [['ai_rate_limited',429],['ai_auth_error',403],['ai_invalid_model',404]] as const){const send=vi.fn().mockRejectedValue(new AiTranslateClientError(code,'failure',status));await expect(translateComplete({text:'中'.repeat(800)},new AbortController().signal,send)).rejects.toThrow();expect(send).toHaveBeenCalledOnce();}
});
it('splits truncated output losslessly and publishes only complete children',async()=>{
 const text='中'.repeat(401)+'😀'+'文'.repeat(401),send=vi.fn().mockRejectedValueOnce(truncated()).mockResolvedValueOnce({...result,result:'A'}).mockResolvedValueOnce({...result,result:'B'});
 expect(await translateComplete({text,names:{中:'Trung'}},new AbortController().signal,send)).toEqual({...result,division:{version:1,parts:2,reasons:['output_limit']},result:'A\nB',inputTokens:2,outputTokens:4});
 expect(send.mock.calls[1][0].text+send.mock.calls[2][0].text).toBe(text);expect(send.mock.calls[1][0].names).toEqual({中:'Trung'});expect(send.mock.calls[1][0].text.endsWith('\uD83D')).toBe(false);
});
it('does not split safety refusals or unrecognized failures',async()=>{
 const error=new AiTranslateClientError('ai_incomplete_result','safety',502,'upstream_finish_reason'),send=vi.fn().mockRejectedValue(error);
 await expect(translateComplete({text:'中'.repeat(1000)},new AbortController().signal,send)).rejects.toBe(error);expect(send).toHaveBeenCalledOnce();
});
it('bounds repeated truncation, cancels between children and rejects mixed models',async()=>{
 const send=vi.fn().mockRejectedValue(truncated());await expect(translateComplete({text:'中'.repeat(32000)},new AbortController().signal,send)).rejects.toThrow();expect(send.mock.calls.length).toBeLessThanOrEqual(15);
 const controller=new AbortController(),cancel=vi.fn().mockRejectedValueOnce(truncated()).mockImplementation(async()=>{controller.abort();return result;});
 await expect(translateComplete({text:'中'.repeat(1000)},controller.signal,cancel)).rejects.toMatchObject({name:'AbortError'});expect(cancel).toHaveBeenCalledTimes(2);
 const mixed=vi.fn().mockRejectedValueOnce(truncated()).mockResolvedValueOnce(result).mockResolvedValueOnce({...result,model:'other'});
 await expect(translateComplete({text:'中'.repeat(1000)},new AbortController().signal,mixed)).rejects.toThrow('Model');
});
it('splits recursively beyond depth 3 without artificial limit',async()=>{
 const text='中'.repeat(6400),send=vi.fn(async(input:any,id?:string)=>{if(input.text.length>500)throw truncated();return {...result,result:`Part ${id}`};});
 const res=await translateComplete({text,model:result.model},new AbortController().signal,send);
 expect(res.finishReason).toBe('STOP');
 expect(send.mock.calls.some(([,id])=>(id?.split('/').length??0)>4)).toBe(true);
});
