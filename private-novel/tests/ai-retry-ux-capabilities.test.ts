import {afterEach,expect,it,vi} from 'vitest';
import {handleAiTranslate,resetAiKeyState} from '../server/ai-translate';
import {aiFailureAction} from '../src/features/ai/services/ai-translate';
afterEach(()=>{vi.restoreAllMocks();resetAiKeyState();});
it.each(['gemini-3.8-flash','gemini-3.7-flash','gemini-3.5-flash','gemini-2.5-flash'])('sends only supported sampling fields for %s while preserving prompts and output capacity',async model=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({candidates:[{content:{parts:[{text:'Bản dịch.'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:1,candidatesTokenCount:1}}));
 const response=await handleAiTranslate(new Request('https://reader.example/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'你好',model,temperature:0.25,systemPrompt:'Synthetic rule',userPromptTemplate:'{{name}} {{text}}'})}),{GEMINI_API_KEY:'synthetic-capability-key'});
 expect(response.status).toBe(200);expect(fetch).toHaveBeenCalledOnce();const body=JSON.parse(String(fetch.mock.calls[0][1]?.body));
 expect(body.systemInstruction.parts[0].text).toContain('Synthetic rule');expect(body.contents[0].parts[0].text).toContain('你好');expect(body.generationConfig.maxOutputTokens).toBe(8192);
 if(model==='gemini-3.8-flash'||model==='gemini-3.7-flash')expect(body.generationConfig).not.toHaveProperty('temperature');else expect(body.generationConfig.temperature).toBe(0.25);
});
it('gives permanent failure actions separately from transient retry actions',()=>{
 expect(aiFailureAction('ai_request_rejected')).toBe('settings');expect(aiFailureAction('invalid_prompt')).toBe('settings');expect(aiFailureAction('ai_auth_error')).toBe('keys');
 for(const code of ['ai_rate_limited','ai_timeout','ai_network_error','ai_gateway_error'])expect(aiFailureAction(code)).toBeUndefined();
});
it.each([false,true])('checks copied output at the server boundary while allowing explicit Han Names (%s)',async allowed=>{
 const text='甲'.repeat(40),fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({candidates:[{content:{parts:[{text}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:1,candidatesTokenCount:1}}));
 const response=await handleAiTranslate(new Request('https://reader.example/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,model:'gemini-2.5-flash',...(allowed?{names:{甲:text}}:{})})}),{GEMINI_API_KEY:'synthetic-coverage-key'});
 expect(fetch).toHaveBeenCalledOnce();expect(response.status).toBe(allowed?200:502);
 if(allowed)expect(await response.json()).toMatchObject({result:text});else{expect(await response.json()).toEqual({error:'ai_untranslated_result'});expect(response.headers.get('X-AI-Failure-Reason')).toBe('untranslated_source');}
});
