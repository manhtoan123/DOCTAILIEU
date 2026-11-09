import {afterEach,it,expect,vi} from 'vitest';
import {ttsGateway,capcutSessionFailure} from '../src/features/tts/services/tts-gateway';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.resetModules();vi.useRealTimers();});
it('defaults to CapCut and only explicitly selects the legacy gateway',()=>{
  expect(ttsGateway('capcut-v2')).toBe('/api/tts');expect(ttsGateway(undefined)).toBe('/api/tts');expect(ttsGateway('https://attacker.invalid')).toBe('/api/tts');expect(ttsGateway('legacy-tiktok')).toBe('https://ottsy.weilbyte.dev/api/generation');expect(capcutSessionFailure('<script>')).toBeUndefined();
});
it.each([[503,'capcut_not_configured'],[422,'capcut_request_rejected']] as const)('does not keep retrying missing configuration or rejected voices (%i)',async(status,code)=>{
  vi.stubEnv('VITE_TTS_GATEWAY','capcut-v2');vi.resetModules();vi.useFakeTimers();
  const fetcher=vi.fn().mockResolvedValue(Response.json({error:code},{status}));vi.stubGlobal('fetch',fetcher);
  vi.stubGlobal('Audio',class{play=vi.fn().mockResolvedValue(undefined);pause(){}removeAttribute(){}load(){}});
  const {TikTokPlayer,tiktokVoices}=await import('../src/features/tts/services/tts');const states:string[]=[],messages:string[]=[];
  const player=new TikTokPlayer((state,_s,message)=>{states.push(state);if(message)messages.push(message);},()=>{});
  player.start('Xin chào.',tiktokVoices[0],{rate:1,pitch:1,flex:0});await vi.waitFor(()=>expect(states.at(-1)).toBe('error'));expect(messages.at(-1)).toContain('CapCut');await vi.advanceTimersByTimeAsync(60000);expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][0]).toBe('/api/tts');expect(fetcher.mock.calls[0][1].credentials).toBe('omit');player.stop();
});

it('offers the shared verified Vietnamese catalog only on CapCut while retaining legacy IDs',async()=>{
 vi.stubEnv('VITE_TTS_GATEWAY','');vi.resetModules();
 const {tiktokVoices}=await import('../src/features/tts/services/tts');
 const {capcutVietnameseVoices}=await import('../src/shared/constants/capcut-voices');
 expect(tiktokVoices.map(v=>({id:v.id,serverId:v.serverId,name:v.name}))).toEqual(capcutVietnameseVoices.map(({id,serverId,name})=>({id,serverId,name})));
 expect(tiktokVoices.every(v=>v.available)).toBe(true);expect(new Set(tiktokVoices.map(v=>v.id)).size).toBe(tiktokVoices.length);
 expect(tiktokVoices.slice(0,2).map(v=>v.id)).toEqual(['tiktok-female-1','tiktok-male-1']);
 vi.stubEnv('VITE_TTS_GATEWAY','legacy-tiktok');vi.resetModules();const legacy=await import('../src/features/tts/services/tts');
 expect(legacy.tiktokVoices.filter(v=>v.available).map(v=>v.serverId)).toEqual(['BV074_streaming','BV075_streaming']);
});
