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
 it('advances only when the whole chapter is translated and fully spoken',()=>{
  expect(aiSpeechEndAction({aiReady:true,availableLength:1800,spokenEnd:1800,autoNext:true,hasNext:true})).toEqual({action:'advance'});
  expect(aiSpeechEndAction({aiReady:true,availableLength:1800,spokenEnd:1799,autoNext:true,hasNext:true})).toEqual({action:'advance'});
 });
 it('never advances when auto-next is off or there is no next chapter',()=>{
  expect(aiSpeechEndAction({aiReady:true,availableLength:1800,spokenEnd:1800,autoNext:false,hasNext:true})).toEqual({action:'wait'});
  expect(aiSpeechEndAction({aiReady:true,availableLength:1800,spokenEnd:1800,autoNext:true,hasNext:false})).toEqual({action:'wait'});
 });
});
