import 'fake-indexeddb/auto';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {db} from '../src/core/db';
import {canonicalNameKey,displayNameKey,formatNameEntry,formatNameList,formatNameDraft,parseNameEntry,resolveNameKey,removeNameDraftKey} from '../src/features/names-convert/services/name-format';
import {saveBookNames} from '../src/features/names-convert/services/book-names';
import {saveScopedBookNames,readNameScope,deleteScopedBookName} from '../src/features/names-convert/services/scoped-names';
import {editCommonName,readCommonNames} from '../src/features/names-convert/services/common-names';
import {hashBlob} from '../src/features/import-export/services/backup';
import {CONVERT_NAMES_KEY,readConvertNames,saveConvertNames,formatConvertNames,parseConvertNames,deleteConvertName} from '../src/features/names-convert/services/convert-names';

beforeEach(async()=>{await db.delete();await db.open();await db.books.bulkAdd(['solo','album','sibling'].map(id=>({id,title:id,author:'',album:id==='solo'?undefined:'Author/Series',status:'ready' as const,createdAt:1,updatedAt:1,chapterCount:0,charCount:0})));});
afterEach(()=>vi.restoreAllMocks());

it('uses exactly one display marker, canonical input and long-first formatting, preserving values',()=>{
 expect(canonicalNameKey(' $$张三 ')).toBe('张三');expect(displayNameKey('$$张三')).toBe('$张三');
 expect(formatNameEntry('$张三','[i]https://example.org/a[/]Trương = Tam')).toBe('$张三=[i]https://example.org/a[/]Trương = Tam');
 expect(parseNameEntry('\uFEFF$$张三=Trương=Tam')).toEqual(['张三','Trương=Tam']);
 expect(parseNameEntry('$=Bad')).toBeNull();expect(parseNameEntry('#Note')).toBeNull();
 expect(formatNameList([{key:'甲',value:'A'},{key:'$$张三丰',value:'B'},{key:'$张三',value:'C'}])).toBe('$张三丰=B\n$张三=C\n$甲=A');
 expect(formatNameDraft('甲=A\n# keep\n$$张三=C\ninvalid')).toBe('$张三=C\n$甲=A\n# keep\ninvalid');
});

it('canonical edits match actual legacy keys without changing their identity or creating duplicates',async()=>{
 await db.names.put({id:'legacy',bookId:'solo',key:'$甲',value:'A'});
 await saveBookNames('solo','甲=Updated\n$乙=B\n$$乙=Last');
 expect(await db.names.get('legacy')).toEqual({id:'legacy',bookId:'solo',key:'$甲',value:'Updated'});
 const rows=await db.names.where('bookId').equals('solo').toArray();expect(rows).toHaveLength(2);expect(rows.map(({key,value})=>({key,value}))).toEqual(expect.arrayContaining([{key:'$甲',value:'Updated'},{key:'乙',value:'Last'}]));
});

it('conflicting legacy aliases reject the whole book batch and exact deletion preserves the other meaning',async()=>{
 const rows=[{id:'old',bookId:'solo',key:'$甲',value:'Old'},{id:'plain',bookId:'solo',key:'甲',value:'Different'}];await db.names.bulkAdd(rows);
 await expect(saveBookNames('solo','新=New\n$甲=Changed')).rejects.toThrow('khác nghĩa');
 expect(await db.names.toArray()).toEqual(rows);
 expect(()=>resolveNameKey('甲',rows)).toThrow('khác nghĩa');
 await deleteScopedBookName('solo','$甲',rows[0],null);
 expect(await db.names.toArray()).toEqual([rows[1]]);
 expect(removeNameDraftKey('$甲=Old\n$甲=Different\n$乙=B','$甲',rows)).toBe('$甲=Different\n$乙=B');
 expect(removeNameDraftKey('$甲=Same\n$甲=Same','$甲',[{key:'$甲',value:'Same'},{key:'甲',value:'Same'}])).toBe('$甲=Same');
});

it('Album import targets legacy alias but never rewrites private rows; conflicts roll back all settings',async()=>{
 await db.names.put({id:'legacy',bookId:'sibling',key:'$甲',value:'A'});
 await saveScopedBookNames('album','甲=Shared\n$$乙=B','Author');
 expect((await readNameScope('sibling')).rows.map(({key,value})=>({key,value}))).toEqual([{key:'$甲',value:'Shared'},{key:'乙',value:'B'}]);
 expect((await db.names.get('legacy'))?.value).toBe('A');
 await db.names.bulkAdd([{id:'x',bookId:'album',key:'$冲',value:'A'},{id:'y',bookId:'sibling',key:'冲',value:'B'}]);
 const before=await db.settings.toArray();
 await expect(saveScopedBookNames('album','新=New\n冲=Changed','Author')).rejects.toThrow('khác nghĩa');
 expect(await db.settings.toArray()).toEqual(before);
});

it('common edits match legacy actual key, store new canonical keys and delete only exact selected alias',async()=>{
 const blob=new Blob(['# keep\n$甲=A\n别=Other']);await db.dictionaries.put({kind:'names',name:'Names.txt',blob,sha256:await hashBlob(blob),updatedAt:1});
 await editCommonName('$$甲','Changed');await editCommonName('$乙','B');
 expect(await readCommonNames()).toEqual([{key:'$甲',value:'Changed'},{key:'别',value:'Other'},{key:'乙',value:'B'}]);
 expect(await (await db.dictionaries.get('names'))!.blob.text()).toBe('# keep\n$甲=Changed\n别=Other\n乙=B');
 await editCommonName('$甲',null);
 expect(await readCommonNames()).toEqual([{key:'别',value:'Other'},{key:'乙',value:'B'}]);
});

it('common alias conflicts preserve dictionary bytes and settings',async()=>{
 const blob=new Blob(['$甲=One\n甲=Two']);await db.dictionaries.put({kind:'names',name:'Names.txt',blob,sha256:await hashBlob(blob),updatedAt:1});
 await expect(editCommonName('甲','Changed')).rejects.toThrow('khác nghĩa');
 expect(await (await db.dictionaries.get('names'))!.blob.text()).toBe('$甲=One\n甲=Two');expect(await db.settings.count()).toBe(0);
 await editCommonName('$甲',null);expect(await readCommonNames()).toEqual([{key:'甲',value:'Two'}]);
});

it('Convert Name import stores new canonical keys and updates existing actual aliases without migration',async()=>{
 await db.settings.put({key:CONVERT_NAMES_KEY,value:[{key:'$甲',value:'A'},{key:'张三丰',value:'Long'}]});
 await saveConvertNames('$$甲=Changed\n$乙=B');
 expect(await readConvertNames()).toEqual([{key:'$甲',value:'Changed'},{key:'张三丰',value:'Long'},{key:'乙',value:'B'}]);
 expect(formatConvertNames(await readConvertNames())).toBe('$张三丰=Long\n$乙=B\n$甲=Changed');
 expect(parseConvertNames('$$甲=A\n乙=B')).toEqual([{key:'甲',value:'A'},{key:'乙',value:'B'}]);
});

it('Convert Name conflicting aliases reject atomically; deletion keeps exact other alias and old size limit reads',async()=>{
 const rows=[{key:'$甲',value:'A'},{key:'甲',value:'B'}];await db.settings.put({key:CONVERT_NAMES_KEY,value:rows});
 await expect(saveConvertNames('$乙=New\n甲=Changed')).rejects.toThrow('khác nghĩa');expect(await readConvertNames()).toEqual(rows);
 await deleteConvertName('$甲');expect(await readConvertNames()).toEqual([rows[1]]);
 const large=Array.from({length:2000},(_,i)=>({key:'名'+i.toString().padStart(4,'0'),value:'V'.repeat(24)}));
 expect(large.map(row=>`${row.key}=${row.value}`).join('\n').length).toBe(61999);
 await db.settings.put({key:CONVERT_NAMES_KEY,value:large});expect(await readConvertNames()).toEqual(large);
});

it('equal-value legacy aliases also reject edits atomically in every Name store',async()=>{
 await db.names.bulkAdd([
  {id:'s-dollar',bookId:'solo',key:'$甲',value:'A'},{id:'s-plain',bookId:'solo',key:'甲',value:'A'},
  {id:'a-dollar',bookId:'album',key:'$甲',value:'A'},{id:'a-plain',bookId:'sibling',key:'甲',value:'A'},
 ]);
 const namesBefore=await db.names.toArray();
 await expect(saveBookNames('solo','乙=New\n甲=B')).rejects.toThrow('khóa cũ trùng');
 await expect(saveScopedBookNames('album','乙=New\n甲=B','Author')).rejects.toThrow('khóa cũ trùng');
 expect(await db.names.toArray()).toEqual(namesBefore);expect(await db.settings.count()).toBe(0);
 const aliases=[{key:'$甲',value:'A'},{key:'甲',value:'A'}];await db.settings.put({key:CONVERT_NAMES_KEY,value:aliases});
 await expect(saveConvertNames('乙=New\n甲=B')).rejects.toThrow('khóa cũ trùng');expect(await readConvertNames()).toEqual(aliases);
 const blob=new Blob(['$甲=A\n甲=A']);await db.dictionaries.put({kind:'names',name:'Names.txt',blob,sha256:await hashBlob(blob),updatedAt:1});
 const settingsBefore=await db.settings.toArray();
 await expect(editCommonName('甲','B')).rejects.toThrow('khóa cũ trùng');
 expect(await (await db.dictionaries.get('names'))!.blob.text()).toBe('$甲=A\n甲=A');expect(await db.settings.toArray()).toEqual(settingsBefore);
});
