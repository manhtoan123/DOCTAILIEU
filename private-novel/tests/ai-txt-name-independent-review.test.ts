import 'fake-indexeddb/auto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {db} from '../src/core/db';
import {saveReaderName,deleteReaderName} from '../src/features/reader/services/reader-word-edit';
import {AiNameSnapshots} from '../src/features/reader/services/ai-name-snapshot';
import type {ReadingAiSettings} from '../src/features/ai/services/ai-reading';

beforeEach(async()=>{
 await db.delete();await db.open();
 await db.books.bulkAdd(['a','b'].map(id=>({id,title:id,author:'',status:'ready' as const,createdAt:1,updatedAt:1,chapterCount:1,charCount:6})));
 await db.chapters.add({id:'chapter',bookId:'a',order:0,title:'Source',text:'李明🙂李明',revision:2,sourceId:'source'});
 await db.names.bulkAdd([{id:'own',bookId:'a',key:'李明$',value:'Old'},{id:'other',bookId:'b',key:'李明$',value:'Other'},{id:'keep',bookId:'a',key:'王',value:'Keep'}]);
 await db.settings.put({key:'convert-name-list',value:'李明=Global'});
});
afterEach(()=>vi.restoreAllMocks());

describe('AI TXT Name writer independent regression',()=>{
 it('updates a literal dollar key in place while preserving unrelated data',async()=>{
  const chapter=await db.chapters.get('chapter'),book=await db.books.get('a'),settings=await db.settings.toArray();
  await saveReaderName('a','chapter',2,'李明$','New','book');
  expect(await db.names.get('own')).toEqual({id:'own',bookId:'a',key:'李明$',value:'New'});
  expect(await db.names.get('other')).toMatchObject({value:'Other'});expect(await db.names.get('keep')).toMatchObject({value:'Keep'});
  expect(await db.names.count()).toBe(3);expect(await db.chapters.get('chapter')).toEqual(chapter);expect(await db.books.get('a')).toEqual(book);expect(await db.settings.toArray()).toEqual(settings);
 });
 it.each(['save-book','save-global','delete'] as const)('rejects hidden chapter %s without Name or settings mutations',async action=>{
  await db.books.update('a',{hiddenChapterIds:['chapter']});const names=await db.names.toArray(),settings=await db.settings.toArray();
  const write=action==='delete'?deleteReaderName('a','chapter',2,'李明$'):saveReaderName('a','chapter',2,'李明$','Changed',action==='save-global'?'global':'book');
  await expect(write).rejects.toThrow();expect(await db.names.toArray()).toEqual(names);expect(await db.settings.toArray()).toEqual(settings);
 });
 it('serializes a committed hide before a queued save and rejects the stale operation',async()=>{
  const hiding=db.transaction('rw',db.books,()=>db.books.update('a',{hiddenChapterIds:['chapter']}));
  const saving=saveReaderName('a','chapter',2,'李明$','Stale','book'),rejected=expect(saving).rejects.toThrow();
  await hiding;await rejected;expect(await db.names.get('own')).toMatchObject({value:'Old'});
 });
});

describe('AI Name snapshot independent regression',()=>{
 const source={bookId:'a',id:'chapter',revision:2,text:'李明🙂李明'},settings={model:'gemini-2.5-flash',splitParts:true} as ReadingAiSettings;
 it('detaches from live Name mutations and reuses one snapshot for foreground, prewarm promotion and retry',()=>{
  const snapshots=new AiNameSnapshots(),names=[{key:'李明',value:'Old'}],first=snapshots.get(source,settings,names);
  names[0].value='New';names.push({key:'王',value:'Wang'});
  expect(first).toEqual([{key:'李明',value:'Old'}]);expect(snapshots.get({...source},{...settings},names)).toBe(first);
  expect(snapshots.get({...source,id:'next'},settings,names)).toEqual(names);
 });
 it('isolates book, revision, source text and settings identities',()=>{
  const snapshots=new AiNameSnapshots(),names=[{key:'李明',value:'Old'}];snapshots.get(source,settings,names);
  const fresh=[{key:'李明',value:'New'}];
  for(const changed of [{...source,bookId:'b'},{...source,revision:3},{...source,text:'Changed'}])expect(snapshots.get(changed,settings,fresh)).toEqual(fresh);
  expect(snapshots.get(source,{...settings,splitParts:false},fresh)).toEqual(fresh);
 });
 it('keeps the current snapshot hot while more than eight next settings are visited',()=>{
  const snapshots=new AiNameSnapshots(),old=[{key:'李明',value:'Old'}],fresh=[{key:'李明',value:'New'}];
  const current=snapshots.get(source,settings,old);
  for(let index=0;index<20;index++){
   expect(snapshots.get(source,settings,fresh)).toBe(current);
   snapshots.get({...source,id:'next'}, {...settings,model:`model-${index}`},fresh);
  }
  expect(snapshots.get(source,settings,fresh)).toBe(current);
 });
 it('cache probing does not create a snapshot before the translation begins',()=>{
  const snapshots=new AiNameSnapshots();snapshots.peek(source,settings,[{key:'李明',value:'Old'}]);
  expect(snapshots.get(source,settings,[{key:'李明',value:'New'}])).toEqual([{key:'李明',value:'New'}]);
 });
});
