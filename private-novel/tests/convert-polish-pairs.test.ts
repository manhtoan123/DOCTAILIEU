import {it,expect,vi} from 'vitest';
import {pairPolishSource,formatPolishPairs,planPolishText,convertPolishSettings,convertPolishKey,polishPrompt,DEFAULT_POLISH_PROMPT,LEGACY_POLISH_PROMPT,assertPolishResult,acceptedPolishText,polishOriginalEnd,locatePolishFallback,rebasePolishResult,type PolishPair} from '../src/features/ai/services/convert-polish';
import {AiReadingSession,aiReadingKey,type AiReadingTranslate} from '../src/features/ai/services/ai-reading';
import {AiTranslateClientError,type AiTranslateClientResponse} from '../src/features/ai/services/ai-translate';
import type {Token} from '../src/features/names-convert/services/language';
import type {AiPartsProgress} from '../src/features/ai/services/ai-parts';
import {readPolishOutput} from '../src/features/ai/services/polish-output';
const model='gemini-2.5-flash';
const token=(source:string,targetText:string,sourceStart:number):Token=>({source,targetText,sourceStart,sourceEnd:sourceStart+source.length,type:'phrase',meanings:[],hanviet:''});
const response=(result='Bản tiếng Việt đã biên tập.'):AiTranslateClientResponse=>({result,model,finishReason:'STOP',inputTokens:2,outputTokens:3});
function fixture(count=8){let at=0;const pairs:PolishPair[]=Array.from({length:count},(_,i)=>{const converted=`Đoạn Convert ${i}. `+'Khu vườn buổi sáng yên tĩnh. '.repeat(25)+'\n',pair={start:at,end:at+converted.length,original:`清晨花园很安静，第${i}段。\n`,converted};at=pair.end;return pair;});return {bookId:'synthetic',id:'polish:chapter',revision:1,text:pairs.map(p=>p.converted).join(''),polishPairs:pairs};}

it('separates the prose and only returns terms evidenced in the same pair, longest first',()=>{
 const pairs=[{start:0,end:22,original:'清晨花园。',converted:'sáng sớm hoa viên'},{start:22,end:40,original:'很安静。',converted:'rất yên tĩnh'}];
 const output=readPolishOutput('<BAN_TU_DIEN>\n{sáng sớm}: $晨=sớm\n{hoa viên}: $花园=vườn hoa\n{rất yên tĩnh}: $花园=sai cặp\n{tự đặt}: $凭空=sai\n</BAN_TU_DIEN>\n<BAN_DICH>\nVườn hoa lúc sớm mai.\n</BAN_DICH>',pairs,true);
 expect(output.text.trim()).toBe('Vườn hoa lúc sớm mai.');
 expect(output.terms).toEqual([{convert:'hoa viên',source:'花园',meaning:'vườn hoa'},{convert:'sáng sớm',source:'晨',meaning:'sớm'}]);
 expect(()=>readPolishOutput('Văn bản thiếu hai khối.',pairs,true)).toThrow('định dạng');
});

it('accepts equivalent dictionary formatting while still rejecting unrelated pairs',()=>{
 const pairs=[{start:0,end:23,original:'清晨花园。',converted:'Sáng sớm, hoa  viên.'},{start:23,end:35,original:'门。',converted:'Cánh cửa.'}];
 const output=readPolishOutput([
  '```xml','<BAN_TU_DIEN>','- Hoa viên: $花园=vườn hoa',
  '1. **{Sáng sớm}：$清晨＝sớm mai**','{Cánh cửa}: $花园=sai cặp',
  '</BAN_TU_DIEN>','<BAN_DICH>Vườn hoa lúc sớm mai.</BAN_DICH>','```',
 ].join('\n'),pairs,true);
 expect(output.terms).toHaveLength(2);
 expect(output.terms).toContainEqual({convert:'Hoa viên',source:'花园',meaning:'vườn hoa'});
 expect(output.terms).toContainEqual({convert:'Sáng sớm',source:'清晨',meaning:'sớm mai'});
 expect(output.text).toBe('Vườn hoa lúc sớm mai.');
});

it('requires dictionary and prose blocks even when a custom prompt requests prose only',async()=>{
 const prompt='Giữ giọng văn cổ phong. Chỉ trả văn xuôi.';
 const settings=convertPolishSettings(model,prompt),source=fixture(1);
 expect(settings.systemPrompt).toContain(prompt);
 expect(settings.systemPrompt).toContain('<BAN_TU_DIEN>');
 const plain=new AiReadingSession(async()=>response('Chỉ có văn xuôi.'));
 await expect(plain.request(source,settings,[],undefined,undefined,undefined,{skipFailedPolishParts:true})).rejects.toThrow();
 const structured=new AiReadingSession(async()=>response('<BAN_TU_DIEN>\n{Khu vườn}: $花园=vườn hoa\n</BAN_TU_DIEN>\n<BAN_DICH>Vườn hoa yên tĩnh.</BAN_DICH>'));
 const result=await structured.request(source,settings,[],undefined,undefined,undefined,{skipFailedPolishParts:true});
 expect(result.polishTerms).toEqual([{convert:'Khu vườn',source:'花园',meaning:'vườn hoa'}]);
 expect(result.result.trim()).toBe('Vườn hoa yên tĩnh.');
});

it('keeps Convert at a failed root, applies the roots after it and retries only the missing root',async()=>{
 const source=fixture(30),settings=convertPolishSettings(model),plan=planPolishText(source.text,source.polishPairs,settings);
 expect(plan.parts.length).toBeGreaterThan(3);
 const bad=plan.parts[1];
 const badPair=source.polishPairs.find(pair=>pair.start===bad.start)!;
 let fail=true;
 const sent:string[]=[],states:AiPartsProgress[]=[];
 const session=new AiReadingSession(async input=>{
  sent.push(input.text);
  if(fail&&input.text.includes(badPair.original))return response('Không có cấu trúc.');
  return response('<BAN_TU_DIEN></BAN_TU_DIEN>\n<BAN_DICH>Bản tốt.</BAN_DICH>');
 });
 const first=await session.request(source,settings,[],undefined,undefined,state=>states.push(state),{skipFailedPolishParts:true});
 expect(first.polishSkipped?.map(row=>row.part)).toEqual([2]);
 expect(first.result).toContain(bad.text);
 expect(first.result.slice(first.result.indexOf(bad.text)+bad.text.length)).toContain('Bản tốt.');
 const targetStart=first.result.indexOf(bad.text),ranges=[{sourceStart:bad.start,sourceEnd:bad.end,targetStart,targetEnd:targetStart+bad.text.length}];
 expect(first.polishFallback).toEqual(ranges);
 expect(states[0].polishFallback).toBeUndefined();
 expect(states.at(-1)).toMatchObject({polishFallback:ranges,completedText:first.result});
 for(const state of states.filter(state=>state.polishFallback?.length)){
  expect(state.completedSourceEnd).toBeGreaterThanOrEqual(bad.end);
  expect(state.completedText?.slice(targetStart,targetStart+bad.text.length)).toBe(bad.text);
 }
 const before=sent.length;
 fail=false;
 const second=await session.request(source,settings,[],undefined,undefined,undefined,{skipFailedPolishParts:true});
 expect(second.polishSkipped).toEqual([]);
 expect(second.polishFallback).toBeUndefined();
 expect(second.result).not.toContain(bad.text);
 expect(sent.slice(before)).toHaveLength(1);
 expect(sent.at(-1)).toContain(badPair.original);
});
it('reassembles accepted polish after a model change without sending again when only saving remains',async()=>{
 const source=fixture(15),settings=convertPolishSettings(model);
 const switched=convertPolishSettings('gemini-3.8-flash');
 const send=vi.fn(async()=>response('<BAN_TU_DIEN></BAN_TU_DIEN>\n<BAN_DICH>Bản tốt.</BAN_DICH>'));
 const session=new AiReadingSession(send);
 const run=(active:typeof settings)=>session.request(source,active,[],undefined,undefined,undefined,{skipFailedPolishParts:true});
 expect(session.preparePolishRun(source,settings,false)).toBe(true);
 const first=await run(settings);
 expect(send.mock.calls.length).toBeGreaterThan(1);
 send.mockClear();
 expect(session.preparePolishRun(source,{...switched,systemPrompt:'Prompt mới'},true)).toBe(false);
 expect(session.preparePolishRun({...source,revision:2},switched,true)).toBe(false);
 expect(session.preparePolishRun(source,switched,true)).toBe(true);
 expect(await run(switched)).toMatchObject({model,result:first.result,polishSkipped:[]});
 expect(send).not.toHaveBeenCalled();
});
it('aligns changed punctuation through source tokens, never sentence indexes',()=>{
 const original='甲。乙！丙？',converted='An...Bình?Cường.';
 const tokens=[token('甲。','An...',0),token('乙！','Bình?',2),token('丙？','Cường.',4)];
 expect(pairPolishSource(original,converted,tokens).map(p=>[p.original,p.converted])).toEqual([['甲。','An...'],['乙！','Bình?'],['丙？','Cường.']]);
 expect(formatPolishPairs(pairPolishSource(original,converted,tokens))).toBe('[Nguyên văn 1]\n甲。\n[Convert 1]\nAn...\n[Nguyên văn 2]\n乙！\n[Convert 2]\nBình?\n[Nguyên văn 3]\n丙？\n[Convert 3]\nCường.');
});
it('keeps an indivisible dictionary phrase spanning multiple Chinese sentences intact',()=>{
 const pairs=pairPolishSource('甲。乙！丙？','An Bình!Cường.',[token('甲。乙！','An Bình!',0),token('丙？','Cường.',4)]);
 expect(pairs.map(p=>p.original)).toEqual(['甲。乙！','丙？']);expect(pairs.map(p=>p.converted)).toEqual(['An Bình!','Cường.']);
});
it.each(['missing','overlap','wrong output','wrong source'])('retains the whole corresponding block when mapping is %s',kind=>{
 const tokens=[token('甲。','An.',0),token('乙。','Bình.',2)];
 if(kind==='missing')tokens.pop();if(kind==='overlap')tokens[1].sourceStart=1;if(kind==='wrong output')tokens[0].targetText='Khác';if(kind==='wrong source')tokens[0].source='丙。';
 expect(pairPolishSource('甲。乙。','An.Bình.',tokens)).toEqual([{start:0,end:8,original:'甲。乙。',converted:'An.Bình.'}]);
});
it('uses proven EPUB nodes even when Convert punctuation and token clipping differ',()=>{
 const pairs=pairPolishSource('甲。乙。\n丙？','An... Bình.\nCường?',[],['甲。乙。','丙？'],['An... Bình.','Cường?']);
 expect(pairs).toEqual([{start:0,end:12,original:'甲。乙。\n',converted:'An... Bình.\n'},{start:12,end:18,original:'丙？',converted:'Cường?'}]);
});
it('coalesces removed/whitespace-only EPUB nodes without losing source or producing empty requests',()=>{
 const original=['删','甲','删后'],converted=['','An',''];
 const pairs=pairPolishSource(original.join('\n'),converted.join('\n'),[],original,converted);
 expect(pairs).toEqual([{start:0,end:4,original:original.join('\n'),converted:'\nAn\n'}]);
});
it('restores only outer Convert whitespace and rejects shifted internal EPUB lines',()=>{
 expect(acceptedPolishText('\nAn.\n\n',' Bình. ',true)).toBe('\nBình.\n\n');
 expect(()=>acceptedPolishText('An.\nBình.','Một dòng.',true)).toThrow('số dòng');
});
it('counts original, Convert, labels and prompts in each request, including serial mode',()=>{
 const source=fixture(100);
 for(const splitParts of [true,false])for(const prompt of ['Ngắn','p'.repeat(7000)]){
  const settings={...convertPolishSettings(model,prompt),splitParts},plan=planPolishText(source.text,source.polishPairs,settings);
  expect(plan.parts.map(p=>p.text).join('')).toBe(source.text);
  for(const part of plan.parts){const pairs=source.polishPairs.filter(p=>p.start>=part.start&&p.end<=part.end);expect(formatPolishPairs(pairs).length+settings.systemPrompt.length+settings.userPromptTemplate.replace('{{text}}','').length).toBeLessThanOrEqual(32000);}
 }
 const short=planPolishText(source.text,source.polishPairs,convertPolishSettings(model,'Ngắn'));
 const long=planPolishText(source.text,source.polishPairs,convertPolishSettings(model,'p'.repeat(7000)));
 expect(long.parts.length).toBeGreaterThan(short.parts.length);
});
it('refuses oversize unproven alignment rather than guessing source sentence pairs',()=>{
 const original='甲。'.repeat(18000),converted='Vườn. '.repeat(18000),pairs=pairPolishSource(original,converted,[]);
 expect(pairs).toHaveLength(1);expect(()=>planPolishText(converted,pairs,convertPolishSettings(model))).toThrow('vượt ngân sách');
});
it('invalidates result and running-session identities when only the original changes',async()=>{
 expect(await convertPolishKey('c',1,'An.','甲。')).not.toBe(await convertPolishKey('c',1,'An.','乙。'));
 expect(await convertPolishKey('c',1,'An.','甲。')).not.toBe(await convertPolishKey('c',1,'An.'));
 const source=fixture(),settings=convertPolishSettings(model);expect(aiReadingKey(source,settings,[])).not.toBe(aiReadingKey({...source,polishPairs:source.polishPairs.map(p=>({...p,original:'改。'}))},settings,[]));
});
it('keeps accepted prose identity across Name edits while new runs capture the new Convert',async()=>{
 expect(await convertPolishKey('c',1,'Tên cũ.','甲。')).toBe(await convertPolishKey('c',1,'Tên mới.','甲。'));
});
it('updates a skipped interior span after a dictionary edit and preserves polished prose',()=>{
 const old=[
  {start:0,end:3,original:'甲。',converted:'An.'},
  {start:3,end:6,original:'乙。',converted:'Ba.'},
  {start:6,end:9,original:'丙。',converted:'Ca.'},
 ];
 const head='Đã sửa.',tail='Đã xong.',first='An mở rộng.',second='Bản mới.',last='Ca.';
 const fallback=locatePolishFallback(old,[{sourceStart:3,sourceEnd:6,targetStart:head.length,targetEnd:head.length+3}]);
 const row={version:4,applied:true,baseConvert:'An.Ba.Ca.',text:head+'Ba.'+tail,fallback};
 const end=first.length+second.length;
 const fresh=[
  {start:0,end:first.length,original:'甲。',converted:first},
  {start:first.length,end,original:'乙。',converted:second},
  {start:end,end:end+last.length,original:'丙。',converted:last},
 ];
 const base=first+second+last;
 expect(rebasePolishResult(base,fresh,row)).toMatchObject({
  text:head+second+tail,baseConvert:base,
  fallback:[{sourceStart:first.length,sourceEnd:end,targetStart:head.length,targetEnd:head.length+second.length}],
 });
 expect(rebasePolishResult(base,[{start:0,end:base.length,original:'甲。乙。丙。',converted:base}],row)).toBe(row);
});

it('rebases only the untouched suffix by exact original coverage after a Name edit',()=>{
 const original='甲。乙。',old=pairPolishSource(original,'An.Bình.',[token('甲。','An.',0),token('乙。','Bình.',2)]),fresh=pairPolishSource(original,'Tên dài hơn.Bình mới.',[token('甲。','Tên dài hơn.',0),token('乙。','Bình mới.',2)]);
 const row={version:4,applied:true,partial:true,sourceEnd:3,originalEnd:polishOriginalEnd(old,3),prefix:'Đầu đã trau chuốt.',text:'Đầu đã trau chuốt.Bình.'};
 expect(rebasePolishResult('Tên dài hơn.Bình mới.',fresh,row)).toMatchObject({text:'Đầu đã trau chuốt.Bình mới.',sourceEnd:'Tên dài hơn.'.length});
 const uncertain=pairPolishSource(original,'Một cụm mới.',[token(original,'Một cụm mới.',0)]);
 expect(rebasePolishResult('Một cụm mới.',uncertain,row)).toMatchObject({text:row.text,sourceEnd:undefined});
 expect(rebasePolishResult('Convert mới.',fresh,{version:4,applied:true,text:'Đã trau chuốt cả chương.'})?.text).toBe('Đã trau chuốt cả chương.');
});
it('refreshes only the exact old built-in prompt, preserving user edits',()=>{
 expect(polishPrompt(LEGACY_POLISH_PROMPT)).toBe(DEFAULT_POLISH_PROMPT);expect(polishPrompt('Prompt của tôi')).toBe('Prompt của tôi');expect(polishPrompt(undefined)).toBe(DEFAULT_POLISH_PROMPT);
});
it.each(['[Nguyên văn 1]\n甲。','[Convert 1]\nAn.','甲。',' ','I cannot help with that request.','Xin lỗi, tôi không thể hỗ trợ yêu cầu này.','Tôi không thể hỗ trợ yêu cầu này.',"I'm sorry, but I can't assist with that request."])('rejects invalid output before accepting a part: %s',text=>expect(()=>assertPolishResult(text)).toThrow());
it.each([[1,1,true],[2,2,true],[3,3,true],[8,4,true],[8,2,false]])('uses %i eligible keys with at most %i overlapping paired requests',async(keysAvailable,limit,reportFreeKeys)=>{
 const source=fixture(36),states:AiPartsProgress[]=[];let active=0,maximum=0,sequence=0;
 const send=vi.fn<AiReadingTranslate>(async(input,signal,onLease)=>{
  const id=++sequence;maximum=Math.max(maximum,++active);onLease?.({requestId:'synthetic-'+id,leaseIdHash:String(id),keysAvailable,...(reportFreeKeys?{freeKeys:Math.max(0,keysAvailable-active)}:{})});
  try{
   await new Promise(r=>setTimeout(r,1));signal.throwIfAborted();
   expect(input.text).toMatch(/^\[Nguyên văn 1\]/);expect(input.text).toContain('[Convert 1]');expect(input.context).toBeUndefined();
   return {...response(),...(keysAvailable>=2?{parallel:2 as const}:{})};
  }finally{active--;}
 });
 const session=new AiReadingSession(send);await session.request(source,convertPolishSettings(model),[],undefined,undefined,p=>states.push(p));
 expect(send.mock.calls.length).toBeGreaterThan(4);expect(maximum).toBe(limit);expect(states.at(-1)?.completedSourceEnd).toBe(source.text.length);expect(states.at(-1)?.done).toBe(states.at(-1)?.total);
});
it('recovery splits only at complete mapped pairs and retains accepted children',async()=>{
 const source=fixture(4),calls:string[]=[],states:AiPartsProgress[]=[];let first=true;
 const send=vi.fn(async(input)=>{calls.push(input.text);if(first){first=false;throw new AiTranslateClientError('ai_incomplete_result','cut',502,'output_limit');}return response();});
 const session=new AiReadingSession(send);await session.request(source,{...convertPolishSettings(model),splitParts:false},[],undefined,undefined,p=>states.push(p));
 expect(calls).toHaveLength(3);
 for(const input of calls){for(const pair of source.polishPairs)if(input.includes(pair.original))expect(input).toContain(pair.converted);expect(input).toMatch(/^\[Nguyên văn 1\]/);}
 expect(calls[1]).not.toContain(source.polishPairs[2].original);expect(calls[2]).not.toContain(source.polishPairs[0].original);expect(states.at(-1)?.completedSourceEnd).toBe(source.text.length);
});
it('joins accepted editorial roots and recovery children without inventing extra lines',async()=>{
 const source=fixture(30);
 const send=vi.fn(async(input)=>response([...input.text.matchAll(/\[Convert \d+\]\n([\s\S]*?)(?=\n\[Nguyên văn \d+\]|$)/g)].map(m=>m[1]).join('').trim()));
 const session=new AiReadingSession(send);const result=await session.request({...source,polishPreserveLines:true},convertPolishSettings(model),[]);
 expect(send.mock.calls.length).toBeGreaterThan(1);expect(result.result).toBe(source.text);
});
it('rejects malformed EPUB layout before emitting a green part',async()=>{
 const source=fixture(10),states:AiPartsProgress[]=[];const session=new AiReadingSession(async()=>response('Một dòng.'));
 await expect(session.request({...source,polishPreserveLines:true},convertPolishSettings(model),[],undefined,undefined,p=>states.push(p))).rejects.toThrow('số dòng');
 expect(states.at(-1)?.done).toBe(0);expect(states.at(-1)?.completedSourceEnd).toBe(0);
});
it.each(['label','nonSTOP','refusal'])('keeps previous accepted prefix and leaves the failed part red: %s',async kind=>{
 const source=fixture(20),states:AiPartsProgress[]=[];let calls=0;
 const send=vi.fn(async()=>{if(++calls===1)return response('Đầu đã xong.');if(kind==='label')return response('[Convert 1]\nNhãn sai.');if(kind==='nonSTOP')return {...response('Bị cắt'),finishReason:'MAX_TOKENS'};throw new AiTranslateClientError('ai_incomplete_result','refused',502,'upstream_finish_reason');});
 const session=new AiReadingSession(send);await expect(session.request(source,convertPolishSettings(model),[],undefined,undefined,p=>states.push(p))).rejects.toThrow();
 expect(calls).toBe(2);expect(states.at(-1)?.done).toBe(1);expect(states.at(-1)?.completedText).toBe('Đầu đã xong. \n');expect(states.at(-1)?.completedSourceEnd).toBeLessThan(source.text.length);
});
