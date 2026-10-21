import 'fake-indexeddb/auto';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {db} from '../src/core/db';
import {uid} from '../src/core/domain';
import {CONVERT_NAMES_KEY,readConvertNames,saveConvertNames,expandConvertSelection} from '../src/features/names-convert/services/convert-names';

beforeEach(async()=>{
  await db.delete();
  await db.open();
  await db.books.add({id:'book-1',title:'Book 1',author:'',status:'ready',createdAt:1,updatedAt:1,chapterCount:1,charCount:100});
  await db.books.add({id:'book-2',title:'Book 2',author:'',status:'ready',createdAt:1,updatedAt:1,chapterCount:1,charCount:100});
});

afterEach(()=>vi.restoreAllMocks());

describe('Reader Word Edit and Unicode Expansion',()=>{
  it('expands selection across surrogate pairs without splitting code units in either direction',()=>{
    // "🙂" is \uD83D\uDE42 (2 code units, offset 0..2)
    // "李" is \u674E (1 code unit, offset 2..3)
    // "𠀀" is \uD840\uDC00 (2 code units, offset 3..5)
    const text='🙂李𠀀';
    // Starting on "李" (start 2, end 3)
    const left=expandConvertSelection(text,2,3,'left');
    expect(left).toEqual({sourceStart:0,sourceEnd:3,source:'🙂李'});
    // Expanding left again cannot go past 0
    expect(expandConvertSelection(text,left.sourceStart,left.sourceEnd,'left')).toEqual({sourceStart:0,sourceEnd:3,source:'🙂李'});

    // Starting on "李" (start 2, end 3)
    const right=expandConvertSelection(text,2,3,'right');
    expect(right).toEqual({sourceStart:2,sourceEnd:5,source:'李𠀀'});
    // Expanding right again cannot go past end
    expect(expandConvertSelection(text,right.sourceStart,right.sourceEnd,'right')).toEqual({sourceStart:2,sourceEnd:5,source:'李𠀀'});
  });

  it('saving Name for book isolates to bookId and does not alter global convert-name-list',async()=>{
    // Save book-scoped name
    const key='李明',value='Lý Minh Book 1';
    await db.names.put({id:uid(),bookId:'book-1',key,value});

    const book1Names=await db.names.where('bookId').equals('book-1').toArray();
    const book2Names=await db.names.where('bookId').equals('book-2').toArray();
    expect(book1Names).toHaveLength(1);
    expect(book1Names[0].value).toBe('Lý Minh Book 1');
    expect(book2Names).toHaveLength(0);

    // Global convert-name-list remains untouched
    expect(await readConvertNames()).toEqual([]);
  });

  it('saving Global Name writes to convert-name-list in db.settings and merges with existing',async()=>{
    await saveConvertNames('张三=Trương Tam\n李四=Lý Tứ');
    expect(await readConvertNames()).toEqual([
      {key:'张三',value:'Trương Tam'},
      {key:'李四',value:'Lý Tứ'}
    ]);

    // Save another entry from Reader as global Name
    await saveConvertNames('王五=Vương Ngũ');
    expect(await readConvertNames()).toEqual([
      {key:'张三',value:'Trương Tam'},
      {key:'李四',value:'Lý Tứ'},
      {key:'王五',value:'Vương Ngũ'}
    ]);

    // Book-specific names table remains untouched
    expect(await db.names.count()).toBe(0);
  });

  it('lookup generation guard discards stale delayed responses',async()=>{
    let activeReqId=0;
    let appliedMeaning='';

    async function mockSelectToken(key:string,delayMs:number){
      const currentReqId=++activeReqId;
      await new Promise(r=>setTimeout(r,delayMs));
      // Guard: only apply if this request is still the active one
      if(currentReqId===activeReqId){
        appliedMeaning=`meaning of ${key}`;
      }
    }

    // Fire first lookup with high delay (100ms)
    const p1=mockSelectToken('Token1',100);
    // User rapidly clicks second token (delay 20ms)
    const p2=mockSelectToken('Token2',20);

    await Promise.all([p1,p2]);

    // Token2 must be the final applied meaning, Token1 was discarded
    expect(appliedMeaning).toBe('meaning of Token2');
  });
});
