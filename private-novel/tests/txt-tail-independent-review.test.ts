import {expect,it} from 'vitest';
import type {Chapter} from '../src/core/domain';
import {appendEligibleChapters,resolveAppendMatch,selectedAppendChapters,type AppendPreview} from '../src/features/import-export/services/chapter-append';
const c=(n:number,change:Partial<Chapter>={}):Chapter=>({id:`c${n}`,bookId:'book',sourceId:'source',order:n,title:`Chapter ${n}: Title`,text:`Chapter ${n}: Title\nBody ${n}.`,revision:1,...change});
const before=[c(1),c(2),c(3)];
const staged=(rows:Chapter[])=>rows.map((row,i)=>({...row,id:`staged-${i}`,bookId:'stage',order:i}));
it('review: exact tail accepts a changed prefix and excludes known duplicate suffixes',async()=>{
 const fresh=staged([c(0),c(1,{text:'Earlier corrected body'}),c(1),c(2),c(3),c(4),c(5,{title:before[0].title})]);
 const result=await resolveAppendMatch(before,fresh);expect(result).toMatchObject({start:5,match:'exact'});
 expect(result.blockedIds).toContain(fresh[6].id);
});
it('review: normalized title tail suggests only and never implicitly selects changed bodies',async()=>{
 const fresh=staged([...before.map(row=>({...row,title:row.title.toUpperCase().replace(':','：'),text:row.text+' corrected'})),c(4)]);
 const match=await resolveAppendMatch(before,fresh);expect(match).toMatchObject({start:3,match:'title'});
 const preview={before,staged:fresh,...match} as AppendPreview;
 expect(()=>selectedAppendChapters(preview)).toThrow('tích chọn');expect(selectedAppendChapters(preview,[fresh[3].id])).toEqual([fresh[3]]);
});
it('review: repeated exact/title tails remain manual instead of trusting the last occurrence',async()=>{
 const fresh=staged([...before,c(4),...before,c(5)]);const match=await resolveAppendMatch(before,fresh);
 expect(match).toMatchObject({start:0,match:'manual'});expect(appendEligibleChapters({before,staged:fresh,...match} as AppendPreview).map(row=>row.title)).toEqual([c(4).title,c(5).title]);
});
it('review: missing or blank title anchors cannot become a confident suggestion',async()=>{
 const fresh=staged([c(4),c(5)]);expect(await resolveAppendMatch(before,fresh)).toMatchObject({start:0,match:'manual'});
 const blankBefore=before.map(row=>({...row,title:'',text:'old '+row.text})),blankFresh=staged(blankBefore.map(row=>({...row,text:'changed '+row.text})).concat(c(4)));
 expect(await resolveAppendMatch(blankBefore,blankFresh)).toMatchObject({start:0,match:'manual'});
});
it('review: duplicated fresh title or body blocks both occurrences and service rejects the IDs',async()=>{
 const fresh=staged([c(4),c(5,{title:c(4).title}),c(6),c(7,{text:c(6).text}),c(8)]),match=await resolveAppendMatch(before,fresh),preview={before,staged:fresh,...match} as AppendPreview;
 expect(match.match).toBe('manual');expect(appendEligibleChapters(preview).map(row=>row.id)).toEqual([fresh[4].id]);
 for(const row of fresh.slice(0,4))expect(()=>selectedAppendChapters(preview,[row.id])).toThrow('Chọn ít nhất');
});
it('review: manual selection preserves source order even when chosen newest first',async()=>{
 const fresh=staged([c(4),c(5),c(6)]),match=await resolveAppendMatch(before,fresh),preview={before,staged:fresh,...match} as AppendPreview;
 expect(selectedAppendChapters(preview,[fresh[2].id,fresh[0].id])).toEqual([fresh[0],fresh[2]]);
});
it('review: exact complete input still reports no new chapter and aborted comparison never resolves',async()=>{
 await expect(resolveAppendMatch(before,staged(before))).rejects.toThrow('chưa có chương mới');
 const stop=new AbortController();stop.abort();await expect(resolveAppendMatch(before,staged([...before,c(4)]),stop.signal)).rejects.toMatchObject({name:'AbortError'});
});

