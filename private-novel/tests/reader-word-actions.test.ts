import 'fake-indexeddb/auto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {db,deleteBook} from '../src/core/db';
import {CONVERT_NAMES_KEY,readConvertNames} from '../src/features/names-convert/services/convert-names';
import type {Token} from '../src/features/names-convert/services/language';
import {applyCompatibleReaderWordEdits,applyReaderWordEdits,expandReaderSelection,saveReaderName} from '../src/features/reader/services/reader-word-edit';

const token=(source:string,start:number,end:number,targetText=source.slice(start,end)):Token=>({sourceStart:start,sourceEnd:end,source:source.slice(start,end),targetText,type:'vp',meanings:[targetText],hanviet:''});
beforeEach(async()=>{
  await db.delete();await db.open();
  await db.books.bulkAdd(['a','b'].map(id=>({id,title:id,author:'',status:'ready' as const,createdAt:1,updatedAt:1,chapterCount:1,charCount:10})));
  await db.chapters.bulkAdd(['a','b'].map(id=>({id:`${id}-ch`,bookId:id,order:0,title:'',text:'李明李明',revision:2,sourceId:''})));
  await db.names.bulkAdd([{id:'a-name',bookId:'a',key:'李明',value:'Old'},{id:'other',bookId:'a',key:'王',value:'Keep'},{id:'b-name',bookId:'b',key:'李明',value:'Book B'}]);
});
afterEach(()=>vi.restoreAllMocks());

describe('guarded Reader Name persistence',()=>{
  it('merges selected keys while retaining identities, other keys and book/global isolation after reload',async()=>{
    await saveReaderName('a','a-ch',2,' 李明 ',' New ','book');
    await saveReaderName('a','a-ch',2,'张','New key','book');
    await saveReaderName('a','a-ch',2,'Alice','Global Alice','global');
    await saveReaderName('a','a-ch',2,'Bob','Global Bob','global');
    await saveReaderName('a','a-ch',2,'Alice','Global updated','global');
    db.close();await db.open();
    expect(await db.names.get('a-name')).toMatchObject({id:'a-name',value:'New'});
    expect(await db.names.get('other')).toMatchObject({value:'Keep'});
    expect(await db.names.get('b-name')).toMatchObject({value:'Book B'});
    expect(await db.names.where('bookId').equals('a').count()).toBe(3);
    expect(await readConvertNames()).toEqual([{key:'Alice',value:'Global updated'},{key:'Bob',value:'Global Bob'}]);
  });
  it.each(['book','global'] as const)('rejects missing/staging books, missing/wrong/revised chapters without %s writes',async scope=>{
    const initial=await db.names.toArray();
    for(const [bookId,chapterId,revision] of [['missing','a-ch',2],['a','missing',2],['a','b-ch',2],['a','a-ch',1]] as const)await expect(saveReaderName(bookId,chapterId,revision,'New','value',scope)).rejects.toThrow();
    await db.books.update('a',{status:'staging'});
    await expect(saveReaderName('a','a-ch',2,'New','value',scope)).rejects.toThrow();
    expect(await db.names.toArray()).toEqual(initial);expect(await db.settings.get(CONVERT_NAMES_KEY)).toBeUndefined();
  });
  it.each(['book','global'] as const)('does not save a stale %s request after committed deletion or revision update',async scope=>{
    await db.transaction('rw',[db.books,db.chapters,db.names],async()=>{
      await db.chapters.update('a-ch',{revision:3});
    });
    await expect(saveReaderName('a','a-ch',2,'新','New',scope)).rejects.toThrow();
    await deleteBook('a');
    await expect(saveReaderName('a','a-ch',3,'新','New',scope)).rejects.toThrow();
    expect(await db.names.where('bookId').equals('a').count()).toBe(0);
    expect(await readConvertNames()).toEqual([]);
  });
  it.each(['book','global'] as const)('rolls back the nested %s writer when storage fails after its put',async scope=>{
    const before=await db.names.toArray();
    if(scope==='book'){
      const put=db.names.put.bind(db.names);
      vi.spyOn(db.names,'put').mockImplementation((...args:Parameters<typeof put>)=>put(...args).then(()=>{throw new Error('quota failure');}));
    }else{
      const put=db.settings.put.bind(db.settings);
      vi.spyOn(db.settings,'put').mockImplementation((...args:Parameters<typeof put>)=>put(...args).then(()=>{throw new Error('quota failure');}));
    }
    await expect(saveReaderName('a','a-ch',2,'李明','Changed',scope)).rejects.toThrow('quota failure');
    expect(await db.names.toArray()).toEqual(before);expect(await readConvertNames()).toEqual([]);
  });
  it('serializes concurrent global merges without dropping another key',async()=>{
    await Promise.all(Array.from({length:8},(_,index)=>saveReaderName('a','a-ch',2,`Name ${index}`,`Value ${index}`,'global')));
    expect(await readConvertNames()).toHaveLength(8);
  });
  it.each([['x=y','ok'],['x\ny','ok'],['x\ry','ok'],['x','line\nline'],['x','line\rline'],['','ok'],['#comment','ok'],['x',' '],['x'.repeat(257),'ok'],['x','x'.repeat(2049)]])('rejects invalid single entry %j before writing',async(key,value)=>{
    await expect(saveReaderName('a','a-ch',2,key,value,'book')).rejects.toThrow();
    expect(await db.names.count()).toBe(3);expect(await readConvertNames()).toEqual([]);
  });
  it('accepts values with literal = and exact size limits',async()=>{
    await saveReaderName('a','a-ch',2,'x'.repeat(256),'a='.padEnd(2048,'v'),'global');
    expect((await readConvertNames())[0].value).toHaveLength(2048);
  });
});

describe('Reader source token actions',()=>{
  it('edits only the chosen repeated phrase and leaves input token objects unchanged',()=>{
    const source='李明李明',tokens=[token(source,0,2,'First'),token(source,2,4,'Second')],snapshot=structuredClone(tokens);
    const result=applyReaderWordEdits(source,tokens,[{sourceStart:0,sourceEnd:2,value:'Edited'}]);
    expect(result.map(t=>t.targetText)).toEqual(['Edited','Second']);expect(result[0]).toMatchObject({type:'original',source:'李明',sourceStart:0,sourceEnd:2});
    expect(result[1]).toBe(tokens[1]);expect(tokens).toEqual(snapshot);
  });
  it('expands whole neighboring words across emoji and supplementary Han',()=>{
    const source='🙂李明𠀀文',tokens=[token(source,0,2),token(source,2,4),token(source,4,7)];
    expect(expandReaderSelection(source,tokens,2,4,'right')).toEqual({sourceStart:2,sourceEnd:7,source:'李明𠀀文'});
    expect(expandReaderSelection(source,tokens,2,4,'left')).toEqual({sourceStart:0,sourceEnd:4,source:'🙂李明'});
    expect(expandReaderSelection('🙂李𠀀',[],2,3,'right')).toEqual({sourceStart:2,sourceEnd:5,source:'李𠀀'});
    expect(expandReaderSelection(source,tokens,0,7,'left').source).toBe(source);
  });
  it('keeps zero-length decorations at edges and drops only interior ones across multiple edits',()=>{
    const source='甲乙丙丁',tokens=[token(source,0,0,'leading'),token(source,0,1),token(source,1,1,'inside'),token(source,1,2),token(source,2,2,'boundary'),token(source,2,3),token(source,3,3,'second edge'),token(source,3,4),token(source,4,4,'trailing')];
    const result=applyReaderWordEdits(source,tokens,[{sourceStart:0,sourceEnd:2,value:'AB'},{sourceStart:3,sourceEnd:4,value:'D'}]);
    expect(result.map(t=>t.targetText)).toEqual(['leading','AB','boundary','丙','second edge','D','trailing']);
    expect(expandReaderSelection(source,tokens,0,1,'right').source).toBe('甲乙');
  });
  it('rejects invalid bounds, split surrogate, partial tokens, gaps, overlapping edits and source mismatch',()=>{
    const source='🙂李明',tokens=[token(source,0,2),token(source,2,4)];
    for(const [start,end] of [[-1,2],[0,5],[1,2],[0,1],[2,3],[2,2],[NaN,4]])expect(()=>applyReaderWordEdits(source,tokens,[{sourceStart:start,sourceEnd:end,value:'x'}])).toThrow();
    expect(()=>applyReaderWordEdits(source,tokens,[{sourceStart:0,sourceEnd:4,value:'x'},{sourceStart:2,sourceEnd:4,value:'y'}])).toThrow('chồng lấn');
    expect(()=>applyReaderWordEdits('abc',[token('abc',0,1),token('abc',2,3)],[{sourceStart:0,sourceEnd:3,value:'x'}])).toThrow();
    expect(()=>applyReaderWordEdits(source,[{...tokens[0],source:'wrong'},tokens[1]],[{sourceStart:0,sourceEnd:2,value:'x'}])).toThrow();
    expect(()=>expandReaderSelection(source,tokens,1,2,'left')).toThrow();
  });
  it('keeps compatible temporary edits when a retokenized range is rejected',()=>{
    const source='abcdef',tokens=[token(source,0,3,'ABC'),token(source,3,6,'DEF')];
    const invalid={sourceStart:1,sourceEnd:2,value:'X'},valid={sourceStart:3,sourceEnd:6,value:'Y'};
    const result=applyCompatibleReaderWordEdits(source,tokens,[invalid,valid]);
    expect(result.tokens.map(item=>item.targetText).join('')).toBe('ABCY');
    expect(result.accepted).toEqual([valid]);
    expect(result.rejected).toEqual([invalid]);
  });
});
