import {it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {TtsAudioCache,ttsAudioCacheKey} from '../src/features/tts/services/tts-audio-cache';
const mp3=(n=0)=>new Blob([new Uint8Array([255,243,228,196,n,2,3,4])],{type:'audio/mpeg'});
it('keeps exact text/voice/resource identities distinct and reuses audio after a new cache instance',async()=>{
 const factory=new IDBFactory(),first=new TtsAudioCache({factory,name:'reuse'});
 const key=await ttsAudioCacheKey('voice:a:resource1','Xin chào.');
 expect(key).not.toBe(await ttsAudioCacheKey('voice:a:resource1','Xin chào. '));expect(key).not.toBe(await ttsAudioCacheKey('voice:b:resource1','Xin chào.'));expect(key).not.toBe(await ttsAudioCacheKey('voice:a:resource2','Xin chào.'));
 await first.put(key,mp3());const fresh=new TtsAudioCache({factory,name:'reuse'});expect((await fresh.get(key))?.blob.size).toBe(8);
 await first.duration(key,2.5);expect((await fresh.get(key))?.duration).toBe(2.5);
});
it.each([{maxBytes:16,maxEntries:8},{maxBytes:1024,maxEntries:2}])('evicts under byte or count bounds %#',async bounds=>{
 let now=0;const cache=new TtsAudioCache({factory:new IDBFactory(),name:'lru',...bounds,now:()=>now});
 await cache.put('a',mp3());now++;await cache.put('b',mp3(1));now++;await cache.put('c',mp3(2));expect(await cache.get('a')).toBeUndefined();expect(await cache.get('b')).toBeDefined();expect(await cache.get('c')).toBeDefined();
 now++;await cache.put('d',mp3(3));expect(await cache.get('d')).toBeDefined();
});
it('expires audio and refuses malformed or oversized audio',async()=>{
 let now=0;const cache=new TtsAudioCache({factory:new IDBFactory(),name:'ttl',ttlMs:100,now:()=>now});
 await cache.put('old',mp3());now=100;expect(await cache.get('old')).toBeUndefined();
 await cache.put('bad',new Blob(['not mp3'],{type:'audio/mpeg'}));await cache.put('large',new Blob([new Uint8Array(1024*1024+1)],{type:'audio/mpeg'}));expect(await cache.get('bad')).toBeUndefined();expect(await cache.get('large')).toBeUndefined();await cache.clear();
});
it('invalidates only the exact failing audio, never a newer replacement',async()=>{
 const cache=new TtsAudioCache({factory:new IDBFactory(),name:'invalidate'});const bad=mp3(1),good=mp3(2);await cache.put('key',bad);await cache.put('key',good);await cache.invalidate('key',bad);expect(await cache.get('key')).toBeDefined();await cache.invalidate('key',good);expect(await cache.get('key')).toBeUndefined();
});
it('storage denial and aborted writes remain optional',async()=>{
 const missing=new TtsAudioCache({factory:null});expect(await missing.get('a')).toBeUndefined();await expect(missing.put('a',mp3())).resolves.toBeUndefined();
 const cache=new TtsAudioCache({factory:new IDBFactory(),name:'abort'}),controller=new AbortController();controller.abort();await cache.put('a',mp3(),controller.signal);expect(await cache.get('a')).toBeUndefined();
});
