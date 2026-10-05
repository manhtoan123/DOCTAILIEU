import {afterEach,it,expect,vi} from 'vitest';
import {TikTokPlayer,tiktokVoices,type SpeechState} from '../src/tts';
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
const options={rate:1,pitch:1,flex:0};
async function createPlayer(){
  let resolveResume!:()=>void;let rejectResume!:(reason:Error)=>void;
  const resume=new Promise<void>((resolve,reject)=>{resolveResume=resolve;rejectResume=reject;});
  const play=vi.fn().mockResolvedValueOnce(undefined).mockReturnValueOnce(resume);
  const states:SpeechState[]=[];
  vi.stubGlobal('location',{href:'http://localhost:5173/'});
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(new Blob(['synthetic'],{type:'audio/mpeg'}))));
  vi.stubGlobal('Audio',class{play=play;pause=vi.fn();playbackRate=1;});
  const player=new TikTokPlayer(state=>states.push(state),()=>{});player.start('Câu thử.',tiktokVoices[0],options);
  await vi.waitFor(()=>expect(states.at(-1)).toBe('playing'));player.pause();player.resume();player.stop();
  return {states,resolveResume,rejectResume};
}
it('ignores late resume success after Stop',async()=>{const p=await createPlayer();p.resolveResume();await Promise.resolve();await Promise.resolve();expect(p.states.at(-1)).toBe('idle');});
it('ignores late resume failure after Stop',async()=>{const p=await createPlayer();p.rejectResume(new Error('late'));await Promise.resolve();await Promise.resolve();expect(p.states.at(-1)).toBe('idle');});
it('reports a missing gateway when the server returns HTML instead of audio',async()=>{
  const errors:string[]=[];const audio=vi.fn();vi.stubGlobal('location',{href:'http://localhost:5173/'});vi.stubGlobal('Audio',audio);vi.stubGlobal('fetch',vi.fn().mockImplementation(async()=>new Response('<html>SPA fallback</html>',{headers:{'Content-Type':'text/html'}})));
  const player=new TikTokPlayer((_state,_sentence,message)=>{if(message)errors.push(message);},()=>{});player.start('Test.',tiktokVoices[0],options);
  await vi.waitFor(()=>expect(errors.length).toBe(1));expect(errors[0]).toContain('Gateway chưa trả dữ liệu âm thanh');expect(audio).not.toHaveBeenCalled();player.stop();
});
