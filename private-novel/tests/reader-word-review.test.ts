import 'fake-indexeddb/auto';
import {beforeEach,expect,it} from 'vitest';
import {db} from '../src/core/db';
import {CONVERT_NAMES_KEY,readConvertNames} from '../src/features/names-convert/services/convert-names';
import {LanguageEngine} from '../src/features/names-convert/services/language';
import {applyReaderWordEdits,saveReaderName} from '../src/features/reader/services/reader-word-edit';

beforeEach(async()=>{
  await db.delete();await db.open();
  await db.books.add({id:'review',title:'Synthetic review',author:'',status:'ready',createdAt:1,updatedAt:1,chapterCount:1,charCount:6});
  await db.chapters.add({id:'review-chapter',bookId:'review',order:0,title:'Synthetic',text:'山门。山门。',revision:1,sourceId:''});
});

it('independent review: competing book merges retain all keys and stable identity',async()=>{
  await db.names.add({id:'existing',bookId:'review',key:'山门',value:'Old'});
  await Promise.all(Array.from({length:12},(_,i)=>saveReaderName('review','review-chapter',1,`名${i}`,`Name ${i}`,'book')));
  await saveReaderName('review','review-chapter',1,'山门','New','book');
  expect(await db.names.count()).toBe(13);
  expect(await db.names.get('existing')).toMatchObject({value:'New'});
});

it.each(['book','global'] as const)('independent review: queued %s save sees preceding transaction revision commit',async scope=>{
  const update=db.transaction('rw',db.chapters,async()=>{await db.chapters.update('review-chapter',{revision:2});});
  const save=saveReaderName('review','review-chapter',1,'山门','Stale',scope);
  await update;
  await expect(save).rejects.toThrow('Chương đã thay đổi');
  expect(await db.names.count()).toBe(0);expect(await readConvertNames()).toEqual([]);
});

it('independent review: corrupt legacy global row remains byte-for-byte unchanged after rejected save',async()=>{
  const legacy={unsupported:[{key:'Old',value:'Preserve'}]};
  await db.settings.put({key:CONVERT_NAMES_KEY,value:legacy});
  await expect(saveReaderName('review','review-chapter',1,'山门','New','global')).rejects.toThrow();
  expect((await db.settings.get(CONVERT_NAMES_KEY))?.value).toEqual(legacy);
});

it('independent review: temporary edit of a later word keeps separating presentation whitespace',()=>{
  const engine=new LanguageEngine();engine.add('vp','山门=sơn môn');
  const source='山门。山门。';
  const tokens=engine.convert(source,[],{reference:true,standardizePunctuation:true,capitalize:true});
  const second=tokens.find(token=>token.source==='山门'&&token.sourceStart===3)!;
  expect(tokens.map(token=>token.targetText).join('')).toBe('Sơn môn. Sơn môn.');
  const result=applyReaderWordEdits(source,tokens,[{sourceStart:second.sourceStart,sourceEnd:second.sourceEnd,value:'Cổng Tạm'}]);
  expect(result.map(token=>token.targetText).join('')).toBe('Sơn môn. Cổng Tạm.');
});
