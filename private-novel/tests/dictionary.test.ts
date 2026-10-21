import 'fake-indexeddb/auto';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {db} from '../src/core/db';
import {readDictionary} from '../src/features/names-convert/services/dictionary-reader';
import {installDictionaries} from '../src/features/names-convert/services/dictionary-import';
import {LanguageEngine} from '../src/features/names-convert/services/language';
beforeEach(async()=>{await db.delete();await db.open();});
afterEach(()=>vi.restoreAllMocks());
const file=(text:string,name='Vietphrase.txt')=>new File([text],name);
it('reports skipped malformed lines and preserves first equals',async()=>{
 const lines:string[]=[];expect(await readDictionary('vp',file('\uFEFF# note\n中国=Trung Quốc\nbad\n等于=bằng=x\n'), 'fixture',s=>lines.push(s))).toMatchObject({valid:2,invalid:1,ignored:1});expect(lines[1]).toBe('等于=bằng=x');
});
it('rejects malformed UTF8 and long terminated lines',async()=>{
 await expect(readDictionary('vp',new Blob([new Uint8Array([255])]),'bad')).rejects.toThrow();
 await expect(readDictionary('vp',file('中='+ 'x'.repeat(65536)+'\n'),'long')).rejects.toThrow('quá dài');
});
it('merges selected files in order without changing singleton bytes',async()=>{
 await installDictionaries([{kind:'vp',file:file('中国=cũ')},{kind:'vp',file:file('中国=mới','Vietphrase-extra.txt')}]);
 expect(await (await db.dictionaries.get('vp'))!.blob.text()).toBe('中国=cũ\n中国=mới');
 await installDictionaries([{kind:'names',file:file('李明=Lý Minh','Names.txt')}]);expect(await (await db.dictionaries.get('names'))!.blob.text()).toBe('李明=Lý Minh');
});
it('keeps existing data if any selected file has no valid entry',async()=>{
 await installDictionaries([{kind:'vp',file:file('中国=cũ')}]);
 await expect(installDictionaries([{kind:'vp',file:file('中国=mới')},{kind:'names',file:file('invalid','Names.txt')}])).rejects.toThrow('không có');
 expect(await (await db.dictionaries.get('vp'))!.blob.text()).toBe('中国=cũ');expect(await db.dictionaries.count()).toBe(1);
});
it('rolls back writes when bulkPut fails after writing inside transaction',async()=>{
 await installDictionaries([{kind:'vp',file:file('中国=cũ')}]);
 vi.spyOn(db.dictionaries,'bulkPut').mockImplementation((rows:any)=>db.dictionaries.put(rows[0]).then(()=>{throw new Error('write failed');}));
 await expect(installDictionaries([{kind:'vp',file:file('中国=mới')}])).rejects.toThrow('write failed');expect(await (await db.dictionaries.get('vp'))!.blob.text()).toBe('中国=cũ');
});
it('converts Chinese into explicit expected VP, multiple meanings and Han Viet',()=>{
 const e=new LanguageEngine();e.add('names','李明=Lý Minh');e.add('vp','来到=đi tới/đến');e.add('vp','山门=sơn môn/cổng núi');
 for(const line of ['李=lý','明=minh','来=lai','到=đáo','山=sơn','门=môn'])e.add('hanviet',line);
 const output=(options={})=>e.convert('李明来到山门。',[],options).map(t=>t.targetText).join('');
 expect(output()).toBe('Lý Minh đi tới sơn môn。');expect(output({multipleMeanings:true})).toBe('Lý Minh đi tới/đến sơn môn/cổng núi。');expect(output({mode:'hanviet'})).toBe('lý minh lai đáo sơn môn。');
 e.add('rules','不比{0}强=first {0}');e.add('rules','不比{0}强=last {0}');e.add('vp','他=hắn');expect(e.convert('不比他强',[])[0].targetText).toBe('last hắn');
});
it('accepts LuatNhan rules with start, middle, and end placeholders',async()=>{
 const content='{0}的父亲=phụ thân của {0}\n那些{0}=những {0} đó\n把{0}挡住=ngăn cản {0}\n{0}=invalid\nno_placeholder=bad\n';
 const lines:string[]=[];
 const stats=await readDictionary('rules',file(content,'!LuatNhan.txt'),'!LuatNhan.txt',l=>lines.push(l));
 expect(stats).toMatchObject({valid:3,invalid:2,ignored:0});
 expect(lines).toEqual(['{0}的父亲=phụ thân của {0}','那些{0}=những {0} đó','把{0}挡住=ngăn cản {0}']);
});

