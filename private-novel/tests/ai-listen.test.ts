import {describe,expect,it} from 'vitest';
import {aiSpeechEndAction,canStartPartialListen} from '../src/features/ai/services/ai-listen';

describe('AI partial TTS gating',()=>{
 it('listenable as soon as any translated prefix exists',()=>{
  expect(canStartPartialListen({text:'Một phần đã dịch.'})).toBe(true);
  expect(canStartPartialListen({text:'   '})).toBe(false);
 });
 it('continues from the last spoken boundary when more text already exists',()=>{
  expect(aiSpeechEndAction({aiReady:false,availableLength:900,spokenEnd:400,autoNext:true,hasNext:true})).toEqual({action:'continue',from:400});
  expect(aiSpeechEndAction({aiReady:true,availableLength:1800,spokenEnd:1200,autoNext:true,hasNext:true})).toEqual({action:'continue',from:1200});
 });
 it('waits instead of advancing a partially translated chapter',()=>{
  expect(aiSpeechEndAction({aiReady:false,availableLength:400,spokenEnd:400,autoNext:true,hasNext:true})).toEqual({action:'wait'});
 });
 it('continues after appended join whitespace at the new sentence boundary',()=>{
  const first='Giáp bước vào phòng.';
  for(const gap of ['\n','\r\n','\n\n  ']){
   const text=first+gap+'Ất ngồi cạnh cửa sổ.';
   expect(aiSpeechEndAction({aiReady:false,availableText:text,availableLength:text.length,spokenEnd:first.length,autoNext:false,hasNext:false})).toEqual({action:'continue',from:first.length+gap.lastIndexOf('\n')+1});
  }
 });
 it('advances only when the whole chapter is translated and fully spoken',()=>{
  expect(aiSpeechEndAction({aiReady:true,availableLength:1800,spokenEnd:1800,autoNext:true,hasNext:true})).toEqual({action:'advance'});
  expect(aiSpeechEndAction({aiReady:true,availableLength:1800,spokenEnd:1799,autoNext:true,hasNext:true})).toEqual({action:'advance'});
 });
 it('never advances when auto-next is off or there is no next chapter',()=>{
  expect(aiSpeechEndAction({aiReady:true,availableLength:1800,spokenEnd:1800,autoNext:false,hasNext:true})).toEqual({action:'wait'});
  expect(aiSpeechEndAction({aiReady:true,availableLength:1800,spokenEnd:1800,autoNext:true,hasNext:false})).toEqual({action:'wait'});
 });
 it('does not wait or replay audio for trailing chapter markers and whitespace',()=>{
  for(const tail of ['\n\n♾','   ♾\n',' ...！']){
   const text='Đã nghe.'+tail;
   expect(aiSpeechEndAction({aiReady:true,availableText:text,availableLength:text.length,spokenEnd:8,autoNext:true,hasNext:true})).toEqual({action:'advance'});
   expect(aiSpeechEndAction({aiReady:false,availableText:text,availableLength:text.length,spokenEnd:8,autoNext:true,hasNext:true})).toEqual({action:'wait'});
  }
 });
 it('still reads a single new spoken character rather than treating it as a marker',()=>{
  expect(aiSpeechEndAction({aiReady:true,availableText:'Đã nghe.A',availableLength:9,spokenEnd:8,autoNext:true,hasNext:true})).toEqual({action:'continue',from:8});
 });
});
