import 'fake-indexeddb/auto';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {db} from '../src/core/db';
import {CONVERT_NAMES_KEY,readConvertNames,readAiCommonNames,saveConvertNames,deleteConvertName,parseConvertNames,formatConvertNames,expandConvertSelection} from '../src/features/names-convert/services/convert-names';
import {prepareBackup,stageBackup,restoreBackup,hashBlob} from '../src/features/import-export/services/backup';
import {LanguageEngine} from '../src/features/names-convert/services/language';

beforeEach(async()=>{await db.delete();await db.open();});
afterEach(()=>vi.restoreAllMocks());
it('review: persistent Name List survives connection close/reopen and omissions merge only',async()=>{
  await saveConvertNames('甲=Giáp\n乙=Ất');db.close();await db.open();
  await saveConvertNames('甲=Giáp mới');
  expect(await readConvertNames()).toEqual([{key:'甲',value:'Giáp mới'},{key:'乙',value:'Ất'}]);
});
it('review: overlapping concurrent merges preserve all unrelated Names',async()=>{
  await saveConvertNames('甲=Giáp');
  await Promise.all(Array.from({length:12},(_,i)=>saveConvertNames(`名${i}=Name ${i}`)));
  expect(await readConvertNames()).toHaveLength(13);
});
it('uses only explicitly enabled Name List entries for AI and clears eligibility on deletion',async()=>{
  await saveConvertNames('甲=Giáp\n乙=Ất');
  expect(await readAiCommonNames()).toEqual([]);
  await saveConvertNames('$甲=Giáp mới',{forAi:true});
  expect(await readAiCommonNames()).toEqual([{key:'甲',value:'Giáp mới'}]);
  expect(await readConvertNames()).toHaveLength(2);
  await deleteConvertName('甲');
  await saveConvertNames('甲=Giáp khác');
  expect(await readAiCommonNames()).toEqual([]);
});
it('review: invalid draft never partially commits',async()=>{
  await saveConvertNames('甲=Giáp');
  await expect(saveConvertNames('甲=overwrite\ninvalid')).rejects.toThrow();
  expect(await readConvertNames()).toEqual([{key:'甲',value:'Giáp'}]);
});
it.each([{},'future-format',[{key:'甲',value:'Giáp'},{key:'甲',value:'duplicate'}],[{key:' 甲',value:'bad'}]])('review: rejects unknown or corrupt stored Names without replacing them (%j)',async value=>{
  await db.settings.put({key:CONVERT_NAMES_KEY,value});
  await expect(readConvertNames()).rejects.toThrow();
  await expect(saveConvertNames('乙=Ất')).rejects.toThrow();
  expect((await db.settings.get(CONVERT_NAMES_KEY))?.value).toEqual(value);
});
it('review: transaction abort after put preserves original row',async()=>{
  await saveConvertNames('甲=Giáp');const original=db.settings.put.bind(db.settings);
  vi.spyOn(db.settings,'put').mockImplementation((row:any)=>original(row).then(()=>{throw new Error('simulated quota failure');}) as any);
  await expect(saveConvertNames('乙=Ất')).rejects.toThrow('simulated quota failure');
  expect(await readConvertNames()).toEqual([{key:'甲',value:'Giáp'}]);
});
it('review: explicit delete preserves other entries and concurrent additions',async()=>{
  await saveConvertNames('甲=Giáp\n乙=Ất');
  await Promise.all([deleteConvertName('甲'),saveConvertNames('丙=Bính')]);
  expect(await readConvertNames()).toEqual([{key:'乙',value:'Ất'},{key:'丙',value:'Bính'}]);
});
it('review: Name text round-trip retains equals in values and UTF-16 selection expands whole code points',()=>{
  const names=parseConvertNames('\uFEFF甲=Giáp=x\r\n𠀀=Tên'),formatted=formatConvertNames(names),roundtrip=parseConvertNames(formatted);
  expect(formatted).toBe('$𠀀=Tên\n$甲=Giáp=x'); // One marker; longer UTF-16 source first.
  expect(roundtrip).toHaveLength(names.length);expect(roundtrip).toEqual(expect.arrayContaining(names));
  expect(expandConvertSelection('🙂甲𠀀',2,3,'left')).toEqual({sourceStart:0,sourceEnd:3,source:'🙂甲'});
  expect(expandConvertSelection('🙂甲𠀀',2,3,'right')).toEqual({sourceStart:2,sourceEnd:5,source:'甲𠀀'});
});
async function book(){await db.books.add({id:'book',title:'Review fixture',author:'',status:'ready',createdAt:1,updatedAt:1,chapterCount:1,charCount:1});await db.chapters.add({id:'chapter',bookId:'book',order:0,title:'One',text:'甲',revision:1,sourceId:''});}
it('review: added dictionary kinds portable round-trip through restore allowlist',async()=>{
  await book();for(const kind of ['chapter','number','pronouns','blacklist','english'] as const){const blob=new Blob(['甲=synthetic']);await db.dictionaries.put({kind,name:`${kind}.txt`,blob,sha256:await hashBlob(blob),updatedAt:1});}
  const part=await(await prepareBackup('book',{mode:'portable'})).part(0);await db.delete();await db.open();
  const [id]=await stageBackup([new File([part.blob],part.name)],()=>{});await restoreBackup(id);
  expect((await db.dictionaries.toArray()).map(d=>d.kind).sort()).toEqual(['blacklist','chapter','english','number','pronouns']);
});
it('portable backup retains global Names used by Reader on a clean restore',async()=>{
  await book();await saveConvertNames('甲=Giáp');const part=await(await prepareBackup('book',{mode:'portable'})).part(0);
  await db.delete();await db.open();const [id]=await stageBackup([new File([part.blob],part.name)],()=>{});await restoreBackup(id);
  expect(await readConvertNames()).toEqual([{key:'甲',value:'Giáp'}]);
});
it('review: default reference conversion remains usable for existing long Reader chapters',()=>{
  const engine=new LanguageEngine();const text='a'.repeat(64001);
  expect(engine.convert(text,[],{reference:true}).map(t=>t.source).join('')).toBe(text);
});
it('review: disabling punctuation presentation must not prevent a literal dictionary-key match',()=>{
  const engine=new LanguageEngine();engine.add('vp','甲。=literal phrase');
  expect(engine.convert('甲。',[],{reference:true,standardizePunctuation:false,capitalize:false}).map(t=>t.targetText).join('')).toBe('literal phrase');
});
it('review: normalized aliases must not overwrite a different raw dictionary key when normalization is disabled',()=>{
  const engine=new LanguageEngine();engine.add('vp','甲.=raw ASCII');engine.add('vp','甲。=raw Chinese');
  expect(engine.convert('甲.',[],{reference:true,standardizePunctuation:false,capitalize:false}).map(t=>t.targetText).join('')).toBe('raw ASCII');
});
it('review: persistent Names with punctuation remain usable when punctuation normalization is disabled',()=>{
  const engine=new LanguageEngine();
  expect(engine.convert('甲。',[{key:'甲。',value:'Name'}],{reference:true,standardizePunctuation:false,capitalize:false}).map(t=>t.targetText).join('')).toBe('Name');
});
it('review: raw punctuation in rules remains usable when punctuation normalization is disabled',()=>{
  const engine=new LanguageEngine();engine.add('rules','甲。{0}=rule {0}');engine.add('vp','乙=value');
  expect(engine.convert('甲。乙',[],{reference:true,standardizePunctuation:false,capitalize:false}).map(t=>t.targetText).join('')).toBe('rule value');
});
it('review: normalized collisions use latest entry in both orders while raw variants retain own values',()=>{
  for(const kind of ['vp','names','names2'] as const)for(const reverse of [false,true]){
    const engine=new LanguageEngine();const lines=['甲.=ASCII','甲。=Chinese'];if(reverse)lines.reverse();for(const line of lines)engine.add(kind,line);
    const output=(source:string,standardizePunctuation:boolean)=>engine.convert(source,[],{reference:true,standardizePunctuation,capitalize:false}).map(t=>t.targetText).join('');
    expect(output('甲.',false)).toBe('ASCII');expect(output('甲。',false)).toBe('Chinese');
    expect(output('甲.',true)).toBe(reverse?'ASCII':'Chinese');expect(output('甲。',true)).toBe(reverse?'ASCII':'Chinese');
  }
});
