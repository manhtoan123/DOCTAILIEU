import 'fake-indexeddb/auto';
import {expect,it,vi} from 'vitest';
import {db} from '../src/core/db';
import {AI_DEFAULTS} from '../src/features/ai/services/ai-reading';
import {getPromptStock} from '../src/features/ai/prompt/prompt-stock';
import {syncPromptStock,getPromptSyncStatus} from '../src/features/ai/prompt/prompt-sync';
it('receives valid server capacity including Unicode IDs and all deletion metadata',async()=>{
 await db.settings.clear();await getPromptStock();
 const rows=Array.from({length:2000},(_,i)=>{const id=String(i).padStart(4,'0')+'中'.repeat(296);return {id,revision:i+1,profile:i<160?{id,title:'Synthetic capacity',settings:{...AI_DEFAULTS,systemPrompt:'文'.repeat(8000),userPromptTemplate:'{{text}}'+'字'.repeat(7992)},updatedAt:1}:null};});
 const storedBytes=new TextEncoder().encode(rows.filter(r=>r.profile).map(r=>JSON.stringify(r.profile)).join('')).length;
 const wire=JSON.stringify({revision:2000,rows});expect(storedBytes).toBeLessThan(8*1048576);expect(new TextEncoder().encode(wire).length).toBeGreaterThan(9*1048576);
 const fetcher=vi.fn().mockResolvedValue(new Response(wire,{headers:{'Content-Type':'application/json'}}));vi.stubGlobal('fetch',fetcher);
 try{await syncPromptStock();expect(getPromptSyncStatus().state).toBe('synced');expect((await getPromptStock()).profiles).toHaveLength(161);expect(fetcher).toHaveBeenCalledOnce();}finally{vi.unstubAllGlobals();}
},30000);
