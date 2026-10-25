import {it,expect} from 'vitest';
import {extractCapcutSession} from '../scripts/configure-capcut-session.mjs';
const owned={cookie:'sessionid=synthetic-owned-only',deviceId:'123',tdid:'456',region:'VN',appVersion:'5.8.0'};
it('imports only the selected CapCut request and drops other HAR data',()=>{
 const input={log:{entries:[{request:{url:'https://unrelated.invalid/',headers:[{name:'Cookie',value:'private-unrelated'}]}},{request:{url:'https://edit-api-sg.capcut.com/storyboard/v1/tts/multi_platform',headers:[{name:'Cookie',value:owned.cookie},{name:'did',value:'123'},{name:'tdid',value:'456'},{name:'appvr',value:'5.8.0'},{name:'store-country-code',value:'vn'}],postData:{text:'private story never forwarded'}}}]}};
 expect(extractCapcutSession(input)).toEqual(owned);expect(JSON.stringify(extractCapcutSession(input))).not.toContain('private story');
});
it('accepts a minimal owned session but never copies arbitrary fields',()=>{expect(extractCapcutSession({...owned,password:'private',upstream:'https://attacker.invalid'})).toEqual(owned);});
it.each([{...owned,cookie:'sessionid=private\r\nX:bad'},{...owned,deviceId:'fake id'},{...owned,region:'https://attacker.invalid'},{log:{entries:[]}},null])('rejects malformed input without printing values %#',value=>{let error;try{extractCapcutSession(value);}catch(e){error=e;}expect(error).toBeInstanceOf(Error);expect(error.message).not.toMatch(/synthetic-owned|private|attacker/);});

it('preserves the web tdid used by the current CapCut Web session',()=>{expect(extractCapcutSession({...owned,tdid:'web',appVersion:'15.4.0'})).toEqual({...owned,tdid:'web',appVersion:'15.4.0'});});
it.each(['WEB','web\r\nX:bad','other','web ','x'.repeat(33)])('rejects unrecognized tdid tokens %#',tdid=>{expect(()=>extractCapcutSession({...owned,tdid})).toThrow();});
