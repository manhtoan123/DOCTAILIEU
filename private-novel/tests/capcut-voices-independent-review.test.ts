import {afterEach,expect,it,vi} from 'vitest';
import {handleCapcutTts,type CapcutTtsEnv} from '../server/capcut-tts';
import {mirrorTtsCursor,readTtsCursor,ttsCursorKey,type TtsCursor} from '../src/features/tts/services/tts-cursor';

afterEach(()=>vi.unstubAllGlobals());

it.each(['tiktok-female-1','tiktok-male-1','capcut-vi_female_huong','capcut-BV562_streaming','vi_unknown','BV074_streaming_extra','__proto__','constructor'])('rejects unsupported API speaker %s before quota admission',async voice=>{
 const fetcher=vi.fn(),prepare=vi.fn();vi.stubGlobal('fetch',fetcher);
 const env:CapcutTtsEnv={CAPCUT_SESSION_JSON:JSON.stringify({cookie:'sessionid=synthetic-owned-session',deviceId:'123'}),DB:{prepare} as unknown as NonNullable<CapcutTtsEnv['DB']>};
 const request=new Request('https://synthetic.invalid/api/tts',{method:'POST',headers:{Origin:'https://synthetic.invalid','Content-Type':'application/json'},body:JSON.stringify({text:'Xin chào.',voice})});
 const response=await handleCapcutTts(request,env);
 expect(response.status).toBe(400);expect(await response.json()).toEqual({success:false,error:'invalid_tts_input'});
 expect(prepare).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();
});

it('retains a new local voice checkpoint and removes forged server IDs from local cursors',()=>{
 const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value),removeItem:(key:string)=>data.delete(key)});
 const cursor:TtsCursor={version:1,bookId:'voice-review',chapterId:'chapter',revision:1,mode:'raw',sourceHash:'a'.repeat(64),semanticHash:'b'.repeat(64),renderedHash:'c'.repeat(64),voiceId:'capcut-BV562_streaming',rate:1.25,offset:42,audioTime:5.5,grouping:'natural',updatedAt:123};
 mirrorTtsCursor(cursor.bookId,cursor);expect(readTtsCursor(cursor.bookId)).toEqual(cursor);
 for(const voiceId of ['BV562_streaming','capcut-unknown','__proto__']){
  mirrorTtsCursor(cursor.bookId,{...cursor,voiceId});expect(readTtsCursor(cursor.bookId)).toBeUndefined();expect(data.has(ttsCursorKey(cursor.bookId))).toBe(false);
 }
});
